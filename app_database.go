package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"conx/pkg/database"

	"github.com/google/uuid"
)

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
	} else {
		// If editing an existing profile and no new password provided, preserve existing encrypted password
		existing, err := a.storage.GetDatabase(conn.ID)
		if err == nil && existing != nil {
			if rawPassword == "" && conn.EncryptedPassword == "" {
				conn.EncryptedPassword = existing.EncryptedPassword
			}
			if conn.DatabaseName == "" && existing.DatabaseName != "" {
				conn.DatabaseName = existing.DatabaseName
			}
		}
	}

	if rawPassword != "" && a.vault != nil {
		encrypted, err := a.vault.Encrypt(rawPassword)
		if err != nil {
			return fmt.Errorf("failed to encrypt db password: %w", err)
		}
		conn.EncryptedPassword = encrypted
	}

	if conn.Name == "" {
		conn.Name = fmt.Sprintf("%s:%d", conn.Host, conn.Port)
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
	if password == "" {
		encPass := conn.EncryptedPassword
		if encPass == "" && conn.ID != "" && a.storage != nil {
			existing, err := a.storage.GetDatabase(conn.ID)
			if err == nil && existing != nil {
				encPass = existing.EncryptedPassword
			}
		}
		if encPass != "" && a.vault != nil {
			decrypted, err := a.vault.Decrypt(encPass)
			if err == nil {
				password = decrypted
			}
		}
	}

	dbType := strings.ToLower(conn.Type)
	if dbType != "sqlite" && dbType != "sqlite3" && strings.TrimSpace(password) == "" {
		return "", fmt.Errorf("no password saved or provided for user '%s'. Please click 'Edit' to enter your password", conn.Username)
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

	dbType := strings.ToLower(target.Type)
	if dbType != "sqlite" && dbType != "sqlite3" && strings.TrimSpace(password) == "" {
		return nil, fmt.Errorf("no password saved for user '%s'. Please click 'Edit' to enter your password", target.Username)
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
	dbType := strings.ToLower(target.Type)
	if dbType != "sqlite" && dbType != "sqlite3" && strings.TrimSpace(password) == "" {
		return nil, fmt.Errorf("no password saved for user '%s'. Please click 'Edit' to enter your password", target.Username)
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
	dbType := strings.ToLower(target.Type)
	if dbType != "sqlite" && dbType != "sqlite3" && strings.TrimSpace(password) == "" {
		return nil, fmt.Errorf("no password saved for user '%s'. Please click 'Edit' to enter your password", target.Username)
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
	dbType := strings.ToLower(target.Type)
	if dbType != "sqlite" && dbType != "sqlite3" && strings.TrimSpace(password) == "" {
		return nil, fmt.Errorf("no password saved for user '%s'. Please click 'Edit' to enter your password", target.Username)
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
