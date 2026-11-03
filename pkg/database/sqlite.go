package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// Storage manages the local SQLite database
type Storage struct {
	db *sql.DB
}

// NewStorage initializes local SQLite database in WAL mode and runs migrations
func NewStorage(dbPath string) (*Storage, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database at %s: %w", dbPath, err)
	}

	// Enable WAL mode and foreign keys for high performance and safety
	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA busy_timeout = 5000;",
	}
	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to execute %s: %w", pragma, err)
		}
	}

	s := &Storage{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to run database migrations: %w", err)
	}

	return s, nil
}

// Close closes the underlying SQLite database
func (s *Storage) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

// migrate creates required tables if they don't exist
func (s *Storage) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS vms (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		host TEXT NOT NULL,
		port INTEGER NOT NULL DEFAULT 22,
		username TEXT NOT NULL,
		encrypted_password TEXT,
		encrypted_key TEXT,
		tags TEXT,
		status TEXT DEFAULT 'offline',
		last_latency_ms INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS databases (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		host TEXT NOT NULL,
		port INTEGER NOT NULL,
		database_name TEXT NOT NULL,
		username TEXT,
		encrypted_password TEXT,
		ssl_mode TEXT DEFAULT 'disable',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS saved_queries (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		sql TEXT NOT NULL,
		connection_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (connection_id) REFERENCES databases(id) ON DELETE SET NULL
	);

	CREATE TABLE IF NOT EXISTS query_history (
		id TEXT PRIMARY KEY,
		connection_id TEXT NOT NULL,
		query_text TEXT NOT NULL,
		database_name TEXT,
		status TEXT NOT NULL,
		error_message TEXT,
		execution_time_ms INTEGER DEFAULT 0,
		row_count INTEGER DEFAULT 0,
		executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (connection_id) REFERENCES databases(id) ON DELETE CASCADE
	);
	`
	_, err := s.db.Exec(schema)
	return err
}

// ListVMs returns all stored virtual machines
func (s *Storage) ListVMs() ([]VirtualMachine, error) {
	rows, err := s.db.Query(`SELECT id, name, host, port, username, COALESCE(encrypted_password, ''), COALESCE(encrypted_key, ''), COALESCE(tags, ''), status, last_latency_ms, created_at, updated_at FROM vms ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vms []VirtualMachine
	for rows.Next() {
		var vm VirtualMachine
		var createdAt, updatedAt string
		if err := rows.Scan(&vm.ID, &vm.Name, &vm.Host, &vm.Port, &vm.Username, &vm.EncryptedPassword, &vm.EncryptedKey, &vm.Tags, &vm.Status, &vm.LastLatencyMs, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		vm.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		vm.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
		vms = append(vms, vm)
	}
	return vms, nil
}

// SaveVM inserts or updates a virtual machine entry
func (s *Storage) SaveVM(vm VirtualMachine) error {
	query := `
	INSERT INTO vms (id, name, host, port, username, encrypted_password, encrypted_key, tags, status, last_latency_ms, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		host = excluded.host,
		port = excluded.port,
		username = excluded.username,
		encrypted_password = CASE WHEN excluded.encrypted_password != '' THEN excluded.encrypted_password ELSE vms.encrypted_password END,
		encrypted_key = CASE WHEN excluded.encrypted_key != '' THEN excluded.encrypted_key ELSE vms.encrypted_key END,
		tags = excluded.tags,
		status = excluded.status,
		last_latency_ms = excluded.last_latency_ms,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err := s.db.Exec(query, vm.ID, vm.Name, vm.Host, vm.Port, vm.Username, vm.EncryptedPassword, vm.EncryptedKey, vm.Tags, vm.Status, vm.LastLatencyMs)
	return err
}

// DeleteVM removes a virtual machine entry by ID
func (s *Storage) DeleteVM(id string) error {
	_, err := s.db.Exec(`DELETE FROM vms WHERE id = ?`, id)
	return err
}

// ListDatabases returns all configured database connection profiles
func (s *Storage) ListDatabases() ([]DatabaseConnection, error) {
	rows, err := s.db.Query(`SELECT id, name, type, host, port, database_name, COALESCE(username, ''), COALESCE(encrypted_password, ''), COALESCE(ssl_mode, 'disable'), created_at FROM databases ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dbs []DatabaseConnection
	for rows.Next() {
		var db DatabaseConnection
		var createdAt string
		if err := rows.Scan(&db.ID, &db.Name, &db.Type, &db.Host, &db.Port, &db.DatabaseName, &db.Username, &db.EncryptedPassword, &db.SSLMode, &createdAt); err != nil {
			return nil, err
		}
		db.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		db.HasPassword = strings.TrimSpace(db.EncryptedPassword) != ""
		dbs = append(dbs, db)
	}
	return dbs, nil
}

// SaveDatabase inserts or updates a database connection profile
func (s *Storage) SaveDatabase(conn DatabaseConnection) error {
	query := `
	INSERT INTO databases (id, name, type, host, port, database_name, username, encrypted_password, ssl_mode, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		type = excluded.type,
		host = excluded.host,
		port = excluded.port,
		database_name = excluded.database_name,
		username = excluded.username,
		encrypted_password = excluded.encrypted_password,
		ssl_mode = excluded.ssl_mode;
	`
	_, err := s.db.Exec(query, conn.ID, conn.Name, conn.Type, conn.Host, conn.Port, conn.DatabaseName, conn.Username, conn.EncryptedPassword, conn.SSLMode)
	return err
}

// DeleteDatabase removes a database connection profile by ID
func (s *Storage) DeleteDatabase(id string) error {
	_, err := s.db.Exec(`DELETE FROM databases WHERE id = ?`, id)
	return err
}

// GetDatabase retrieves a single database connection by ID
func (s *Storage) GetDatabase(id string) (*DatabaseConnection, error) {
	row := s.db.QueryRow(`SELECT id, name, type, host, port, database_name, COALESCE(username, ''), COALESCE(encrypted_password, ''), COALESCE(ssl_mode, 'disable'), created_at FROM databases WHERE id = ?`, id)
	var db DatabaseConnection
	var createdAt string
	if err := row.Scan(&db.ID, &db.Name, &db.Type, &db.Host, &db.Port, &db.DatabaseName, &db.Username, &db.EncryptedPassword, &db.SSLMode, &createdAt); err != nil {
		return nil, err
	}
	db.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	db.HasPassword = strings.TrimSpace(db.EncryptedPassword) != ""
	return &db, nil
}

// SaveQueryHistory inserts an executed query record and caps history to 100 entries per connection
func (s *Storage) SaveQueryHistory(entry QueryHistoryEntry) error {
	if entry.ID == "" {
		entry.ID = uuid.NewString()
	}
	query := `
	INSERT INTO query_history (id, connection_id, query_text, database_name, status, error_message, execution_time_ms, row_count, executed_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
	`
	_, err := s.db.Exec(query, entry.ID, entry.ConnectionID, entry.QueryText, entry.DatabaseName, entry.Status, entry.ErrorMessage, entry.ExecutionTimeMs, entry.RowCount)
	if err != nil {
		return err
	}

	// Prune older than 100 entries
	pruneQuery := `
	DELETE FROM query_history WHERE id NOT IN (
		SELECT id FROM query_history WHERE connection_id = ? ORDER BY executed_at DESC LIMIT 100
	) AND connection_id = ?;
	`
	_, _ = s.db.Exec(pruneQuery, entry.ConnectionID, entry.ConnectionID)
	return nil
}

// ListQueryHistory returns recent history entries for a database connection
func (s *Storage) ListQueryHistory(connectionID string, limit int) ([]QueryHistoryEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	rows, err := s.db.Query(`
		SELECT id, connection_id, query_text, COALESCE(database_name, ''), status, COALESCE(error_message, ''), execution_time_ms, row_count, executed_at
		FROM query_history
		WHERE connection_id = ?
		ORDER BY executed_at DESC
		LIMIT ?
	`, connectionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []QueryHistoryEntry
	for rows.Next() {
		var e QueryHistoryEntry
		if err := rows.Scan(&e.ID, &e.ConnectionID, &e.QueryText, &e.DatabaseName, &e.Status, &e.ErrorMessage, &e.ExecutionTimeMs, &e.RowCount, &e.ExecutedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}
