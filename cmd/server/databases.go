package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"conx/pkg/database"

	"github.com/google/uuid"
)

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
