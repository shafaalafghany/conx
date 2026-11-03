package database

import "time"

// VirtualMachine represents a managed remote VM node
type VirtualMachine struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	Host              string    `json:"host"`
	Port              int       `json:"port"`
	Username          string    `json:"username"`
	EncryptedPassword string    `json:"encryptedPassword,omitempty"`
	EncryptedKey      string    `json:"encryptedKey,omitempty"`
	Tags              string    `json:"tags"`
	Status            string    `json:"status"` // online, offline, degraded
	LastLatencyMs     int64     `json:"lastLatencyMs"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// DatabaseConnection represents a target database connection profile
type DatabaseConnection struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	Type              string    `json:"type"` // postgres, mysql, sqlite
	Host              string    `json:"host"`
	Port              int       `json:"port"`
	DatabaseName      string    `json:"databaseName"`
	Username          string    `json:"username"`
	EncryptedPassword string    `json:"encryptedPassword,omitempty"`
	SSLMode           string    `json:"sslMode"`
	CreatedAt         time.Time `json:"createdAt"`
}

// QueryResult represents tabular results returned from a database query
type QueryResult struct {
	Columns         []string                 `json:"columns"`
	Rows            []map[string]interface{} `json:"rows"`
	RowCount        int                      `json:"rowCount"`
	TotalRows       int                      `json:"totalRows,omitempty"`
	Truncated       bool                     `json:"truncated"`
	AffectedRows    int64                    `json:"affectedRows"`
	ExecutionTimeMs int64                    `json:"executionTimeMs"`
	ExecutionMs     int64                    `json:"executionMs"`
	Error           string                   `json:"error,omitempty"`
}

// ColumnInfo represents metadata for a table column
type ColumnInfo struct {
	Name         string `json:"name"`
	Type         string `json:"type"`
	Nullable     bool   `json:"nullable"`
	PrimaryKey   bool   `json:"primaryKey"`
	DefaultValue string `json:"defaultValue,omitempty"`
}

// QueryHistoryEntry represents a recorded query execution in the history
type QueryHistoryEntry struct {
	ID              string `json:"id"`
	ConnectionID    string `json:"connectionId"`
	QueryText       string `json:"queryText"`
	DatabaseName    string `json:"databaseName,omitempty"`
	Status          string `json:"status"` // "success" or "error"
	ErrorMessage    string `json:"errorMessage,omitempty"`
	ExecutionTimeMs int64  `json:"executionTimeMs"`
	RowCount        int64  `json:"rowCount"`
	ExecutedAt      string `json:"executedAt"`
}

// SavedQuery represents a reusable SQL snippet
type SavedQuery struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	SQL          string    `json:"sql"`
	ConnectionID string    `json:"connectionId"`
	CreatedAt    time.Time `json:"createdAt"`
}
