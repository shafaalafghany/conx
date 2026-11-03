package database

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

// ListRedisConnections returns all configured Redis connection profiles
func (s *Storage) ListRedisConnections() ([]RedisConnection, error) {
	rows, err := s.db.Query(`
		SELECT id, name, host, port, COALESCE(username, ''), COALESCE(encrypted_password, ''), default_db, use_tls, created_at
		FROM redis_connections
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conns []RedisConnection
	for rows.Next() {
		var c RedisConnection
		var useTLS int
		var createdAt string
		if err := rows.Scan(&c.ID, &c.Name, &c.Host, &c.Port, &c.Username, &c.EncryptedPassword, &c.DefaultDB, &useTLS, &createdAt); err != nil {
			return nil, err
		}
		c.UseTLS = useTLS == 1
		c.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		c.HasPassword = strings.TrimSpace(c.EncryptedPassword) != ""
		conns = append(conns, c)
	}
	return conns, nil
}

// GetRedisConnection retrieves a single Redis connection profile by ID
func (s *Storage) GetRedisConnection(id string) (*RedisConnection, error) {
	row := s.db.QueryRow(`
		SELECT id, name, host, port, COALESCE(username, ''), COALESCE(encrypted_password, ''), default_db, use_tls, created_at
		FROM redis_connections
		WHERE id = ?
	`, id)

	var c RedisConnection
	var useTLS int
	var createdAt string
	if err := row.Scan(&c.ID, &c.Name, &c.Host, &c.Port, &c.Username, &c.EncryptedPassword, &c.DefaultDB, &useTLS, &createdAt); err != nil {
		return nil, err
	}
	c.UseTLS = useTLS == 1
	c.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	c.HasPassword = strings.TrimSpace(c.EncryptedPassword) != ""
	return &c, nil
}

// SaveRedisConnection inserts or updates a Redis connection profile
func (s *Storage) SaveRedisConnection(conn RedisConnection) error {
	useTLS := 0
	if conn.UseTLS {
		useTLS = 1
	}
	query := `
	INSERT INTO redis_connections (id, name, host, port, username, encrypted_password, default_db, use_tls, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		host = excluded.host,
		port = excluded.port,
		username = excluded.username,
		encrypted_password = CASE WHEN excluded.encrypted_password != '' THEN excluded.encrypted_password ELSE redis_connections.encrypted_password END,
		default_db = excluded.default_db,
		use_tls = excluded.use_tls;
	`
	_, err := s.db.Exec(query, conn.ID, conn.Name, conn.Host, conn.Port, conn.Username, conn.EncryptedPassword, conn.DefaultDB, useTLS)
	return err
}

// DeleteRedisConnection removes a Redis connection profile by ID
func (s *Storage) DeleteRedisConnection(id string) error {
	_, err := s.db.Exec(`DELETE FROM redis_connections WHERE id = ?`, id)
	return err
}

// SaveRedisCommandHistory records an executed Redis command and caps history to 100 entries per connection
func (s *Storage) SaveRedisCommandHistory(entry RedisCommandHistoryEntry) error {
	if entry.ID == "" {
		entry.ID = uuid.NewString()
	}
	query := `
	INSERT INTO redis_command_history (id, connection_id, db_index, command_text, status, error_message, execution_time_ms, executed_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
	`
	if _, err := s.db.Exec(query, entry.ID, entry.ConnectionID, entry.DBIndex, entry.CommandText, entry.Status, entry.ErrorMessage, entry.ExecutionTimeMs); err != nil {
		return err
	}

	pruneQuery := `
	DELETE FROM redis_command_history WHERE id NOT IN (
		SELECT id FROM redis_command_history WHERE connection_id = ? ORDER BY executed_at DESC LIMIT 100
	) AND connection_id = ?;
	`
	_, _ = s.db.Exec(pruneQuery, entry.ConnectionID, entry.ConnectionID)
	return nil
}

// ListRedisCommandHistory returns recent Redis CLI command history entries for a connection
func (s *Storage) ListRedisCommandHistory(connectionID string, limit int) ([]RedisCommandHistoryEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	rows, err := s.db.Query(`
		SELECT id, connection_id, db_index, command_text, status, COALESCE(error_message, ''), execution_time_ms, executed_at
		FROM redis_command_history
		WHERE connection_id = ?
		ORDER BY executed_at DESC
		LIMIT ?
	`, connectionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []RedisCommandHistoryEntry
	for rows.Next() {
		var e RedisCommandHistoryEntry
		if err := rows.Scan(&e.ID, &e.ConnectionID, &e.DBIndex, &e.CommandText, &e.Status, &e.ErrorMessage, &e.ExecutionTimeMs, &e.ExecutedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}
