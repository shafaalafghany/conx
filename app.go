package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"conx/pkg/crypto"
	"conx/pkg/database"
	"conx/pkg/monitor"
	"conx/pkg/ssh"

	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	storage    *database.Storage
	vault      *crypto.Vault
	sshManager *ssh.Manager
	dbRunner   *database.Runner
	poller     *monitor.Poller
}

// SystemInfo represents basic host runtime info
type SystemInfo struct {
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Version   string `json:"version"`
	Timestamp string `json:"timestamp"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Locate data directory in user config directory
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "conx")
	_ = os.MkdirAll(appDir, 0755)

	dbPath := filepath.Join(appDir, "conx.db")
	storage, err := database.NewStorage(dbPath)
	if err != nil {
		fmt.Printf("[Conx] Warning: Failed to init storage: %v\n", err)
	} else {
		a.storage = storage
	}

	// Initialize local AES-256 vault
	a.vault = crypto.NewVault("conx-local-workstation-secret-seed")

	// Initialize Database Query Runner
	a.dbRunner = database.NewRunner()

	// Initialize SSH Session Manager with Wails Event streaming bridge
	a.sshManager = ssh.NewManager(func(sessionID string, chunk string) {
		wailsRuntime.EventsEmit(a.ctx, "terminal:output:"+sessionID, chunk)
	})

	// Initialize background VM health poller
	a.poller = monitor.NewPoller(a.ctx, a.storage, func(updates map[string]monitor.VMHealth) {
		wailsRuntime.EventsEmit(a.ctx, "vm:health:update", updates)
	})
	a.poller.Start()
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	if a.poller != nil {
		a.poller.Stop()
	}
	if a.sshManager != nil {
		a.sshManager.CloseAll()
	}
	if a.storage != nil {
		_ = a.storage.Close()
	}
}

// GetSystemInfo returns host platform details
func (a *App) GetSystemInfo() SystemInfo {
	return SystemInfo{
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		Version:   "0.1.0",
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

// Ping returns a simple pong for connection verification
func (a *App) Ping() string {
	return "pong"
}

// ListVMs retrieves all registered virtual machines
func (a *App) ListVMs() ([]database.VirtualMachine, error) {
	if a.storage == nil {
		return []database.VirtualMachine{}, nil
	}
	return a.storage.ListVMs()
}

// SaveVM saves or updates a virtual machine entry, encrypting sensitive fields
func (a *App) SaveVM(vm database.VirtualMachine, rawPassword string, rawKey string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}

	if vm.ID == "" {
		// Deduplicate: check if VM with same host, port, and username already exists
		existingVMs, _ := a.storage.ListVMs()
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

	if rawPassword != "" && a.vault != nil {
		encrypted, err := a.vault.Encrypt(rawPassword)
		if err != nil {
			return fmt.Errorf("failed to encrypt password: %w", err)
		}
		vm.EncryptedPassword = encrypted
	}

	if rawKey != "" && a.vault != nil {
		encrypted, err := a.vault.Encrypt(rawKey)
		if err != nil {
			return fmt.Errorf("failed to encrypt ssh key: %w", err)
		}
		vm.EncryptedKey = encrypted
	}

	return a.storage.SaveVM(vm)
}

// DeleteVM removes a virtual machine by ID
func (a *App) DeleteVM(id string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}
	return a.storage.DeleteVM(id)
}

// StartSSHSession establishes an interactive SSH terminal session for a VM
func (a *App) StartSSHSession(vmID string, cols int, rows int) (string, error) {
	if a.storage == nil || a.sshManager == nil || a.vault == nil {
		return "", fmt.Errorf("subsystems not fully initialized")
	}

	vms, err := a.storage.ListVMs()
	if err != nil {
		return "", fmt.Errorf("failed to lookup vms: %w", err)
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		return "", fmt.Errorf("vm with ID %s not found", vmID)
	}

	var password string
	if target.EncryptedPassword != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedPassword)
		if err == nil {
			password = decrypted
		}
	}

	var keyData string
	if target.EncryptedKey != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedKey)
		if err == nil {
			keyData = decrypted
		}
	}

	sessionID := uuid.NewString()
	err = a.sshManager.StartSession(ssh.ConnectOptions{
		SessionID: sessionID,
		Host:      target.Host,
		Port:      target.Port,
		Username:  target.Username,
		Password:  password,
		KeyData:   keyData,
		Cols:      cols,
		Rows:      rows,
	})

	if err != nil {
		return "", err
	}

	return sessionID, nil
}

// SendTerminalInput routes user keystrokes into the remote SSH session stdin
func (a *App) SendTerminalInput(sessionID string, data string) error {
	if a.sshManager == nil {
		return fmt.Errorf("ssh manager not ready")
	}
	return a.sshManager.WriteInput(sessionID, data)
}

// ResizeTerminal updates remote PTY rows and cols on window change
func (a *App) ResizeTerminal(sessionID string, cols int, rows int) error {
	if a.sshManager == nil {
		return fmt.Errorf("ssh manager not ready")
	}
	return a.sshManager.Resize(sessionID, cols, rows)
}

// CloseSSHSession terminates an interactive terminal session
func (a *App) CloseSSHSession(sessionID string) error {
	if a.sshManager == nil {
		return nil
	}
	return a.sshManager.CloseSession(sessionID)
}

// ListFiles lists directory contents on a target VM
func (a *App) ListFiles(vmID string, dir string) (ssh.FileListResult, error) {
	if a.storage == nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}}, fmt.Errorf("storage not initialized")
	}

	vms, err := a.storage.ListVMs()
	if err != nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}}, err
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}}, fmt.Errorf("VM not found")
	}

	var password, keyData string
	if target.EncryptedPassword != "" && a.vault != nil {
		dec, _ := a.vault.Decrypt(target.EncryptedPassword)
		password = dec
	}
	if target.EncryptedKey != "" && a.vault != nil {
		dec, _ := a.vault.Decrypt(target.EncryptedKey)
		keyData = dec
	}

	resolved, entries, err := ssh.ListRemoteFiles(target.Host, target.Port, target.Username, password, keyData, dir)
	if err != nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}, Error: err.Error()}, nil
	}

	return ssh.FileListResult{Directory: resolved, Entries: entries}, nil
}

// ListDatabases returns all configured database connection profiles
func (a *App) ListDatabases() ([]database.DatabaseConnection, error) {
	if a.storage == nil {
		return []database.DatabaseConnection{}, nil
	}
	return a.storage.ListDatabases()
}

// SaveDatabase creates or updates a database connection profile with encrypted credentials
func (a *App) SaveDatabase(conn database.DatabaseConnection, rawPassword string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}

	if conn.ID == "" {
		conn.ID = uuid.NewString()
	}

	if rawPassword != "" && a.vault != nil {
		encrypted, err := a.vault.Encrypt(rawPassword)
		if err != nil {
			return fmt.Errorf("failed to encrypt db password: %w", err)
		}
		conn.EncryptedPassword = encrypted
	}

	return a.storage.SaveDatabase(conn)
}

// DeleteDatabase removes a database connection profile by ID
func (a *App) DeleteDatabase(id string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}
	return a.storage.DeleteDatabase(id)
}

// TestDatabaseConnection verifies connectivity to a database host
func (a *App) TestDatabaseConnection(conn database.DatabaseConnection, rawPassword string) (string, error) {
	if a.dbRunner == nil {
		return "", fmt.Errorf("database runner not initialized")
	}

	password := rawPassword
	if password == "" && conn.EncryptedPassword != "" && a.vault != nil {
		decrypted, err := a.vault.Decrypt(conn.EncryptedPassword)
		if err == nil {
			password = decrypted
		}
	}

	if err := a.dbRunner.TestConnection(conn, password); err != nil {
		return "", err
	}

	return "Connection successful", nil
}

// ExecuteDatabaseQuery runs an SQL query against a configured database profile
func (a *App) ExecuteDatabaseQuery(connID string, query string) (*database.QueryResult, error) {
	if a.storage == nil || a.dbRunner == nil || a.vault == nil {
		return nil, fmt.Errorf("database subsystem not ready")
	}

	dbs, err := a.storage.ListDatabases()
	if err != nil {
		return nil, fmt.Errorf("failed to load databases: %w", err)
	}

	var target *database.DatabaseConnection
	for i := range dbs {
		if dbs[i].ID == connID {
			target = &dbs[i]
			break
		}
	}

	if target == nil {
		return nil, fmt.Errorf("database connection with ID %s not found", connID)
	}

	var password string
	if target.EncryptedPassword != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedPassword)
		if err == nil {
			password = decrypted
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	res, err := a.dbRunner.ExecuteQuery(ctx, *target, password, target.DatabaseName, query)
	status := "success"
	errMsg := ""
	var rowCount int64 = 0
	var execTime int64 = 0
	if res != nil {
		rowCount = int64(res.RowCount)
		execTime = res.ExecutionTimeMs
		if res.Error != "" {
			status = "error"
			errMsg = res.Error
		}
	}
	if err != nil {
		status = "error"
		errMsg = err.Error()
	}

	_ = a.storage.SaveQueryHistory(database.QueryHistoryEntry{
		ConnectionID:    connID,
		QueryText:       query,
		DatabaseName:    target.DatabaseName,
		Status:          status,
		ErrorMessage:    errMsg,
		ExecutionTimeMs: execTime,
		RowCount:        rowCount,
	})

	return res, err
}

// GetDatabaseDatabases returns database names for a given connection
func (a *App) GetDatabaseDatabases(connID string) ([]string, error) {
	if a.storage == nil || a.dbRunner == nil || a.vault == nil {
		return nil, fmt.Errorf("database subsystem not ready")
	}
	target, err := a.storage.GetDatabase(connID)
	if err != nil {
		return nil, err
	}
	var password string
	if target.EncryptedPassword != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedPassword)
		if err == nil {
			password = decrypted
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return a.dbRunner.GetDatabases(ctx, *target, password)
}

// GetDatabaseTables returns table names for a database within a connection
func (a *App) GetDatabaseTables(connID string, dbName string) ([]string, error) {
	if a.storage == nil || a.dbRunner == nil || a.vault == nil {
		return nil, fmt.Errorf("database subsystem not ready")
	}
	target, err := a.storage.GetDatabase(connID)
	if err != nil {
		return nil, err
	}
	var password string
	if target.EncryptedPassword != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedPassword)
		if err == nil {
			password = decrypted
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return a.dbRunner.GetTables(ctx, *target, password, dbName)
}

// GetDatabaseColumns returns columns metadata for a table
func (a *App) GetDatabaseColumns(connID string, dbName string, tableName string) ([]database.ColumnInfo, error) {
	if a.storage == nil || a.dbRunner == nil || a.vault == nil {
		return nil, fmt.Errorf("database subsystem not ready")
	}
	target, err := a.storage.GetDatabase(connID)
	if err != nil {
		return nil, err
	}
	var password string
	if target.EncryptedPassword != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedPassword)
		if err == nil {
			password = decrypted
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return a.dbRunner.GetTableStructure(ctx, *target, password, dbName, tableName)
}

// GetDatabaseHistory returns recent query execution history for a connection
func (a *App) GetDatabaseHistory(connID string) ([]database.QueryHistoryEntry, error) {
	if a.storage == nil {
		return nil, fmt.Errorf("database subsystem not ready")
	}
	return a.storage.ListQueryHistory(connID, 100)
}

// RefreshVMHealth triggers an immediate concurrent probe across all VMs
func (a *App) RefreshVMHealth() (map[string]monitor.VMHealth, error) {
	if a.poller == nil {
		return nil, fmt.Errorf("health poller not initialized")
	}
	return a.poller.ProbeAll(), nil
}

// GetFleetSummary retrieves aggregated fleet statistics
func (a *App) GetFleetSummary() monitor.FleetSummary {
	if a.poller == nil {
		return monitor.FleetSummary{}
	}
	return a.poller.GetSummary()
}
