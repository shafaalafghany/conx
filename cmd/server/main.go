package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"conx/pkg/crypto"
	"conx/pkg/database"
	"conx/pkg/monitor"
	conxssh "conx/pkg/ssh"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for local dev
	},
}

type Server struct {
	storage        *database.Storage
	vault          *crypto.Vault
	runner         *database.Runner
	poller         *monitor.Poller
	connectedMu    sync.RWMutex
	connectedConns map[string]bool
}

func (s *Server) isConnected(id string) bool {
	s.connectedMu.RLock()
	defer s.connectedMu.RUnlock()
	if s.connectedConns == nil {
		return false
	}
	return s.connectedConns[id]
}

func (s *Server) setConnected(id string, connected bool) {
	s.connectedMu.Lock()
	defer s.connectedMu.Unlock()
	if s.connectedConns == nil {
		s.connectedConns = make(map[string]bool)
	}
	s.connectedConns[id] = connected
}

func main() {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "conx")
	_ = os.MkdirAll(appDir, 0755)

	dbPath := filepath.Join(appDir, "conx.db")
	storage, err := database.NewStorage(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer storage.Close()

	vault := crypto.NewVault("conx-local-workstation-secret-seed")
	runner := database.NewRunner()
	poller := monitor.NewPoller(context.Background(), storage, nil)
	poller.Start()
	defer poller.Stop()

	srv := &Server{
		storage:        storage,
		vault:          vault,
		runner:         runner,
		poller:         poller,
		connectedConns: make(map[string]bool),
	}

	mux := http.NewServeMux()

	// REST Endpoints
	mux.HandleFunc("/api/vms", srv.handleVMs)
	mux.HandleFunc("/api/vms/", srv.handleVMs)
	mux.HandleFunc("/api/vms/health", srv.handleVMHealth)
	mux.HandleFunc("/api/vms/files", srv.handleVMFiles)
	mux.HandleFunc("/api/databases", srv.handleDatabases)
	mux.HandleFunc("/api/databases/", srv.handleDatabaseSubroutes)
	mux.HandleFunc("/api/databases/test", srv.handleDatabaseTest)
	mux.HandleFunc("/api/databases/query", srv.handleDatabaseQuery)

	// WebSocket Terminal Bridge
	mux.HandleFunc("/ws/ssh", srv.handleSSHWebSocket)

	port := 3333
	fmt.Printf("\n🚀 Conx Go Web Bridge Server running on http://localhost:%d\n", port)
	fmt.Printf("   • REST Endpoints: /api/vms, /api/databases, /api/databases/query\n")
	fmt.Printf("   • Interactive SSH WebSocket: /ws/ssh?vmId=...\n\n")

	handler := srv.corsMiddleware(mux)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), handler); err != nil {
		log.Fatalf("Server exited: %v", err)
	}
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// VM Endpoints
func (s *Server) handleVMs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	pathID := strings.TrimPrefix(r.URL.Path, "/api/vms/")
	pathID = strings.Trim(pathID, "/")

	switch r.Method {
	case http.MethodGet:
		vms, err := s.storage.ListVMs()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if vms == nil {
			vms = []database.VirtualMachine{}
		}
		_ = json.NewEncoder(w).Encode(vms)

	case http.MethodPost, http.MethodPut:
		var req struct {
			database.VirtualMachine
			Label    string `json:"label"`
			Password string `json:"password"`
			KeyData  string `json:"keyData"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		vm := req.VirtualMachine
		if vm.Name == "" && req.Label != "" {
			vm.Name = req.Label
		}

		if vm.ID == "" && pathID != "" && pathID != "api/vms" {
			vm.ID = pathID
		}

		if vm.ID == "" {
			// Deduplicate: check if VM with same host, port, and username already exists
			existingVMs, _ := s.storage.ListVMs()
			for _, existing := range existingVMs {
				if strings.EqualFold(existing.Host, vm.Host) && existing.Port == vm.Port && existing.Username == vm.Username {
					vm.ID = existing.ID
					break
				}
			}
			if vm.ID == "" {
				vm.ID = uuid.NewString()
			}
		}

		if req.Password != "" {
			encrypted, err := s.vault.Encrypt(req.Password)
			if err != nil {
				http.Error(w, "Failed to encrypt password: "+err.Error(), http.StatusInternalServerError)
				return
			}
			vm.EncryptedPassword = encrypted
		}

		if req.KeyData != "" {
			encrypted, err := s.vault.Encrypt(req.KeyData)
			if err != nil {
				http.Error(w, "Failed to encrypt key: "+err.Error(), http.StatusInternalServerError)
				return
			}
			vm.EncryptedKey = encrypted
		}

		if err := s.storage.SaveVM(vm); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(vm)

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" && pathID != "" && pathID != "api/vms" {
			id = pathID
		}
		if id == "" {
			http.Error(w, "Missing id parameter", http.StatusBadRequest)
			return
		}
		if err := s.storage.DeleteVM(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleVMHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	results := s.poller.ProbeAll()
	_ = json.NewEncoder(w).Encode(results)
}

func (s *Server) handleVMFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vmID := r.URL.Query().Get("vmId")
	dir := r.URL.Query().Get("dir")

	if vmID == "" {
		http.Error(w, "Missing vmId parameter", http.StatusBadRequest)
		return
	}

	vms, err := s.storage.ListVMs()
	if err != nil {
		http.Error(w, "Failed to list VMs: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		http.Error(w, "VM not found", http.StatusNotFound)
		return
	}

	var password, keyData string
	if target.EncryptedPassword != "" {
		dec, _ := s.vault.Decrypt(target.EncryptedPassword)
		password = dec
	}
	if target.EncryptedKey != "" {
		dec, _ := s.vault.Decrypt(target.EncryptedKey)
		keyData = dec
	}

	resolved, entries, err := conxssh.ListRemoteFiles(target.Host, target.Port, target.Username, password, keyData, dir)
	if err != nil {
		_ = json.NewEncoder(w).Encode(conxssh.FileListResult{
			Directory: dir,
			Entries:   []conxssh.DirEntry{},
			Error:     err.Error(),
		})
		return
	}

	_ = json.NewEncoder(w).Encode(conxssh.FileListResult{
		Directory: resolved,
		Entries:   entries,
	})
}

// Database Endpoints
type ConnectionResponse struct {
	ID           string    `json:"id"`
	Label        string    `json:"label"`
	Name         string    `json:"name"`
	DbType       string    `json:"dbType"`
	Type         string    `json:"type"`
	Host         string    `json:"host"`
	Port         int       `json:"port"`
	DatabaseName string    `json:"databaseName"`
	Username     string    `json:"username"`
	SSLMode      string    `json:"sslMode"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"createdAt"`
}

func (s *Server) handleDatabases(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		dbs, err := s.storage.ListDatabases()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var resp []ConnectionResponse
		for _, c := range dbs {
			status := "disconnected"
			if s.isConnected(c.ID) {
				status = "connected"
			}
			label := c.Name
			if label == "" {
				label = fmt.Sprintf("%s:%d", c.Host, c.Port)
			}
			resp = append(resp, ConnectionResponse{
				ID:           c.ID,
				Label:        label,
				Name:         c.Name,
				DbType:       c.Type,
				Type:         c.Type,
				Host:         c.Host,
				Port:         c.Port,
				DatabaseName: c.DatabaseName,
				Username:     c.Username,
				SSLMode:      c.SSLMode,
				Status:       status,
				CreatedAt:    c.CreatedAt,
			})
		}
		if resp == nil {
			resp = []ConnectionResponse{}
		}
		_ = json.NewEncoder(w).Encode(resp)

	case http.MethodPost:
		var req struct {
			database.DatabaseConnection
			Label    string `json:"label"`
			DbType   string `json:"dbType"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		conn := req.DatabaseConnection
		if conn.ID == "" {
			conn.ID = uuid.NewString()
		}
		if conn.Name == "" && req.Label != "" {
			conn.Name = req.Label
		}
		if conn.Type == "" && req.DbType != "" {
			conn.Type = req.DbType
		}
		if conn.Name == "" {
			conn.Name = fmt.Sprintf("%s:%d", conn.Host, conn.Port)
		}
		if conn.SSLMode == "" {
			conn.SSLMode = "disable"
		}

		if req.Password != "" {
			encrypted, err := s.vault.Encrypt(req.Password)
			if err != nil {
				http.Error(w, "Failed to encrypt password: "+err.Error(), http.StatusInternalServerError)
				return
			}
			conn.EncryptedPassword = encrypted
		}

		if err := s.storage.SaveDatabase(conn); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(conn)

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "Missing id parameter", http.StatusBadRequest)
			return
		}
		s.setConnected(id, false)
		if err := s.storage.DeleteDatabase(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleDatabaseSubroutes(w http.ResponseWriter, r *http.Request) {
	subpath := strings.TrimPrefix(r.URL.Path, "/api/databases/")
	subpath = strings.Trim(subpath, "/")
	if subpath == "" {
		s.handleDatabases(w, r)
		return
	}

	parts := strings.Split(subpath, "/")
	id := parts[0]

	// Handle /api/databases/{id} directly
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodDelete:
			s.setConnected(id, false)
			if err := s.storage.DeleteDatabase(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return

		case http.MethodPut:
			var req struct {
				database.DatabaseConnection
				Label    string `json:"label"`
				DbType   string `json:"dbType"`
				Password string `json:"password"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			existing, err := s.storage.GetDatabase(id)
			if err != nil {
				http.Error(w, "Database connection not found: "+err.Error(), http.StatusNotFound)
				return
			}
			conn := req.DatabaseConnection
			conn.ID = id
			if conn.Name == "" {
				if req.Label != "" {
					conn.Name = req.Label
				} else {
					conn.Name = existing.Name
				}
			}
			if conn.Type == "" {
				if req.DbType != "" {
					conn.Type = req.DbType
				} else {
					conn.Type = existing.Type
				}
			}
			if conn.Host == "" {
				conn.Host = existing.Host
			}
			if conn.Port == 0 {
				conn.Port = existing.Port
			}
			if conn.Username == "" {
				conn.Username = existing.Username
			}
			if conn.DatabaseName == "" {
				conn.DatabaseName = existing.DatabaseName
			}
			if conn.SSLMode == "" {
				conn.SSLMode = existing.SSLMode
			}
			if req.Password != "" {
				encrypted, err := s.vault.Encrypt(req.Password)
				if err != nil {
					http.Error(w, "Failed to encrypt password: "+err.Error(), http.StatusInternalServerError)
					return
				}
				conn.EncryptedPassword = encrypted
			} else {
				conn.EncryptedPassword = existing.EncryptedPassword
			}

			if err := s.storage.SaveDatabase(conn); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(conn)
			return

		case http.MethodGet:
			existing, err := s.storage.GetDatabase(id)
			if err != nil {
				http.Error(w, "Database not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(existing)
			return
		}
	}

	action := parts[1]
	switch action {
	case "status":
		w.Header().Set("Content-Type", "application/json")
		conn, err := s.storage.GetDatabase(id)
		if err != nil {
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "disconnected"})
			return
		}
		if !s.isConnected(id) {
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "disconnected"})
			return
		}
		var password string
		if conn.EncryptedPassword != "" {
			dec, _ := s.vault.Decrypt(conn.EncryptedPassword)
			password = dec
		}
		if err := s.runner.TestConnection(*conn, password); err != nil {
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "unreachable"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "connected"})

	case "connect":
		w.Header().Set("Content-Type", "application/json")
		conn, err := s.storage.GetDatabase(id)
		if err != nil {
			http.Error(w, "Database not found: "+err.Error(), http.StatusNotFound)
			return
		}
		var password string
		if conn.EncryptedPassword != "" {
			dec, _ := s.vault.Decrypt(conn.EncryptedPassword)
			password = dec
		}
		if err := s.runner.TestConnection(*conn, password); err != nil {
			s.setConnected(id, false)
			http.Error(w, "Failed to connect: "+err.Error(), http.StatusBadRequest)
			return
		}
		s.setConnected(id, true)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "connected"})

	case "disconnect":
		w.Header().Set("Content-Type", "application/json")
		s.setConnected(id, false)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "disconnected"})

	case "schema":
		w.Header().Set("Content-Type", "application/json")
		conn, err := s.storage.GetDatabase(id)
		if err != nil {
			http.Error(w, "Database not found", http.StatusNotFound)
			return
		}
		var password string
		if conn.EncryptedPassword != "" {
			dec, _ := s.vault.Decrypt(conn.EncryptedPassword)
			password = dec
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if len(parts) == 2 {
			// GET /api/databases/{id}/schema -> list databases
			dbs, err := s.runner.GetDatabases(ctx, *conn, password)
			if err != nil {
				_ = json.NewEncoder(w).Encode(map[string]interface{}{"databases": []string{}, "error": err.Error()})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"databases": dbs})
			return
		} else if len(parts) == 3 {
			// GET /api/databases/{id}/schema/{db} -> list tables
			dbName := parts[2]
			tables, err := s.runner.GetTables(ctx, *conn, password, dbName)
			if err != nil {
				_ = json.NewEncoder(w).Encode(map[string]interface{}{"tables": []string{}, "error": err.Error()})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"tables": tables})
			return
		} else if len(parts) >= 4 {
			// GET /api/databases/{id}/schema/{db}/{table} -> list columns
			dbName := parts[2]
			tableName := parts[3]
			cols, err := s.runner.GetTableStructure(ctx, *conn, password, dbName, tableName)
			if err != nil {
				_ = json.NewEncoder(w).Encode(map[string]interface{}{"columns": []interface{}{}, "error": err.Error()})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"columns": cols})
			return
		}

	case "query":
		w.Header().Set("Content-Type", "application/json")
		var req struct {
			SQL      string `json:"sql"`
			Query    string `json:"query"`
			Database string `json:"database"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		sqlToRun := req.SQL
		if sqlToRun == "" {
			sqlToRun = req.Query
		}

		conn, err := s.storage.GetDatabase(id)
		if err != nil {
			http.Error(w, "Database connection not found", http.StatusNotFound)
			return
		}

		var password string
		if conn.EncryptedPassword != "" {
			dec, _ := s.vault.Decrypt(conn.EncryptedPassword)
			password = dec
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		result, err := s.runner.ExecuteQuery(ctx, *conn, password, req.Database, sqlToRun)
		status := "success"
		errMsg := ""
		var rowCount int64 = 0
		var execTime int64 = 0
		if result != nil {
			rowCount = int64(result.RowCount)
			execTime = result.ExecutionTimeMs
			if result.Error != "" {
				status = "error"
				errMsg = result.Error
			}
		}
		if err != nil {
			status = "error"
			errMsg = err.Error()
			_ = json.NewEncoder(w).Encode(&database.QueryResult{Error: err.Error()})
			return
		}

		_ = s.storage.SaveQueryHistory(database.QueryHistoryEntry{
			ConnectionID:    id,
			QueryText:       sqlToRun,
			DatabaseName:    req.Database,
			Status:          status,
			ErrorMessage:    errMsg,
			ExecutionTimeMs: execTime,
			RowCount:        rowCount,
		})

		_ = json.NewEncoder(w).Encode(result)

	case "history":
		w.Header().Set("Content-Type", "application/json")
		history, err := s.storage.ListQueryHistory(id, 100)
		if err != nil {
			_ = json.NewEncoder(w).Encode([]database.QueryHistoryEntry{})
			return
		}
		if history == nil {
			history = []database.QueryHistoryEntry{}
		}
		_ = json.NewEncoder(w).Encode(history)

	case "export":
		var req struct {
			Columns  []string                 `json:"columns"`
			Rows     []map[string]interface{} `json:"rows"`
			Database string                   `json:"database"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		filename := req.Database
		if filename == "" {
			filename = "export"
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s_%d.csv"`, filename, time.Now().Unix()))

		writer := csv.NewWriter(w)
		_ = writer.Write(req.Columns)
		for _, row := range req.Rows {
			record := make([]string, len(req.Columns))
			for i, col := range req.Columns {
				v := row[col]
				if v == nil {
					record[i] = ""
				} else {
					record[i] = fmt.Sprintf("%v", v)
				}
			}
			_ = writer.Write(record)
		}
		writer.Flush()

	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

func (s *Server) handleDatabaseTest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req struct {
		database.DatabaseConnection
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	password := req.Password
	if password == "" && req.EncryptedPassword != "" {
		dec, _ := s.vault.Decrypt(req.EncryptedPassword)
		password = dec
	}

	if err := s.runner.TestConnection(req.DatabaseConnection, password); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Connection verified successfully!"})
}

func (s *Server) handleDatabaseQuery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req struct {
		ConnectionID string `json:"connectionId"`
		Query        string `json:"query"`
		SQL          string `json:"sql"`
		Database     string `json:"database"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	sqlToRun := req.SQL
	if sqlToRun == "" {
		sqlToRun = req.Query
	}

	target, err := s.storage.GetDatabase(req.ConnectionID)
	if err != nil {
		http.Error(w, "Database connection not found", http.StatusNotFound)
		return
	}

	var password string
	if target.EncryptedPassword != "" {
		dec, _ := s.vault.Decrypt(target.EncryptedPassword)
		password = dec
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := s.runner.ExecuteQuery(ctx, *target, password, req.Database, sqlToRun)
	if err != nil {
		_ = json.NewEncoder(w).Encode(&database.QueryResult{Error: err.Error()})
		return
	}

	_ = json.NewEncoder(w).Encode(result)
}

// WebSocket SSH Terminal Bridge
func (s *Server) handleSSHWebSocket(w http.ResponseWriter, r *http.Request) {
	vmID := r.URL.Query().Get("vmId")
	colsStr := r.URL.Query().Get("cols")
	rowsStr := r.URL.Query().Get("rows")

	cols := 80
	if c, err := strconv.Atoi(colsStr); err == nil && c > 0 {
		cols = c
	}
	rows := 24
	if rw, err := strconv.Atoi(rowsStr); err == nil && rw > 0 {
		rows = rw
	}

	vms, err := s.storage.ListVMs()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		http.Error(w, "VM not found", http.StatusNotFound)
		return
	}

	var password, keyData string
	if target.EncryptedPassword != "" {
		dec, _ := s.vault.Decrypt(target.EncryptedPassword)
		password = dec
	}
	if target.EncryptedKey != "" {
		dec, _ := s.vault.Decrypt(target.EncryptedKey)
		keyData = dec
	}

	var authMethods []ssh.AuthMethod
	if password != "" {
		authMethods = append(authMethods, ssh.Password(password))
	}
	if keyData != "" {
		signer, err := ssh.ParsePrivateKey([]byte(keyData))
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	}

	if len(authMethods) == 0 {
		http.Error(w, "No credentials for VM", http.StatusBadRequest)
		return
	}

	sshConfig := &ssh.ClientConfig{
		User:            target.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}

	port := target.Port
	if port == 0 {
		port = 22
	}
	addr := net.JoinHostPort(target.Host, fmt.Sprintf("%d", port))

	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		http.Error(w, fmt.Sprintf("SSH connection failed to %s: %v", addr, err), http.StatusBadGateway)
		return
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		http.Error(w, "Failed to create SSH session: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer session.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		http.Error(w, "PTY request failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	stdinPipe, err := session.StdinPipe()
	if err != nil {
		http.Error(w, "Stdin pipe failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer stdinPipe.Close()

	stdoutPipe, err := session.StdoutPipe()
	if err != nil {
		http.Error(w, "Stdout pipe failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := session.Shell(); err != nil {
		http.Error(w, "Shell failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Upgrade HTTP connection to WebSocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}
	defer ws.Close()

	// Goroutine: SSH stdout -> WebSocket write
	go func() {
		buf := make([]byte, 2048)
		for {
			n, err := stdoutPipe.Read(buf)
			if n > 0 {
				if werr := ws.WriteMessage(websocket.TextMessage, buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					_ = ws.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\n[SSH Disconnected: %v]\r\n", err)))
				}
				_ = ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "EOF"))
				return
			}
		}
	}()

	// WebSocket read -> SSH stdin write & resize
	for {
		msgType, msgBytes, err := ws.ReadMessage()
		if err != nil {
			break
		}

		if msgType == websocket.TextMessage {
			// Check if message is a resize command JSON: {"type":"resize","cols":80,"rows":24}
			if strings.HasPrefix(string(msgBytes), `{"type":"resize"`) {
				var resizeCmd struct {
					Type string `json:"type"`
					Cols int    `json:"cols"`
					Rows int    `json:"rows"`
				}
				if jerr := json.Unmarshal(msgBytes, &resizeCmd); jerr == nil && resizeCmd.Cols > 0 && resizeCmd.Rows > 0 {
					_ = session.WindowChange(resizeCmd.Rows, resizeCmd.Cols)
					continue
				}
			}

			// Otherwise, pipe raw text/keystrokes into SSH stdin
			_, _ = stdinPipe.Write(msgBytes)
		}
	}
}
