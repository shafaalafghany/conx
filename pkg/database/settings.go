package database

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// EncryptFunc encrypts a plaintext credential into an encrypted token.
type EncryptFunc func(plaintext string) (string, error)

// SettingsExportOptions controls which sections to include when exporting settings.
type SettingsExportOptions struct {
	IncludeVMs       bool `json:"includeVMs"`
	IncludeDatabases bool `json:"includeDatabases"`
	IncludeRedis     bool `json:"includeRedis"`
}

// DefaultExportOptions returns options with all categories enabled.
func DefaultExportOptions() SettingsExportOptions {
	return SettingsExportOptions{
		IncludeVMs:       true,
		IncludeDatabases: true,
		IncludeRedis:     true,
	}
}

// SettingsImportOptions controls which sections to import and whether to replace existing entries.
type SettingsImportOptions struct {
	IncludeVMs       bool `json:"includeVMs"`
	IncludeDatabases bool `json:"includeDatabases"`
	IncludeRedis     bool `json:"includeRedis"`
	ReplaceExisting  bool `json:"replaceExisting"`
}

// DefaultImportOptions returns import options with all categories enabled in merge mode.
func DefaultImportOptions() SettingsImportOptions {
	return SettingsImportOptions{
		IncludeVMs:       true,
		IncludeDatabases: true,
		IncludeRedis:     true,
		ReplaceExisting:  false,
	}
}

// VMSettingItem represents a VM connection profile in exported/imported JSON.
type VMSettingItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	Username          string `json:"username"`
	Password          string `json:"password,omitempty"`
	EncryptedPassword string `json:"encryptedPassword,omitempty"`
	PrivateKey        string `json:"privateKey,omitempty"`
	EncryptedKey      string `json:"encryptedKey,omitempty"`
	Tags              string `json:"tags"`
}

// DatabaseSettingItem represents a Database connection profile in exported/imported JSON.
type DatabaseSettingItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Type              string `json:"type"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	DatabaseName      string `json:"databaseName"`
	Username          string `json:"username"`
	Password          string `json:"password,omitempty"`
	EncryptedPassword string `json:"encryptedPassword,omitempty"`
	SSLMode           string `json:"sslMode"`
}

// RedisSettingItem represents a Redis connection profile in exported/imported JSON.
type RedisSettingItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	Username          string `json:"username"`
	Password          string `json:"password,omitempty"`
	EncryptedPassword string `json:"encryptedPassword,omitempty"`
	DefaultDB         int    `json:"defaultDb"`
	UseTLS            bool   `json:"useTls"`
}

// SettingsBundle represents the complete JSON payload for Conx settings export/import.
type SettingsBundle struct {
	Version    string                `json:"version"`
	ExportedAt string                `json:"exportedAt"`
	VMs        []VMSettingItem       `json:"vms"`
	Databases  []DatabaseSettingItem `json:"databases"`
	Redis      []RedisSettingItem    `json:"redis"`
}

// SettingsImportResult summarizes counts of imported profiles across all categories.
type SettingsImportResult struct {
	VMsImported       int `json:"vmsImported"`
	DatabasesImported int `json:"databasesImported"`
	RedisImported     int `json:"redisImported"`
}

// ExportSettings collects VM, Database, and Redis settings from storage based on options.
func (s *Storage) ExportSettings(opts SettingsExportOptions) (*SettingsBundle, error) {
	bundle := &SettingsBundle{
		Version:    "1.0",
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		VMs:        []VMSettingItem{},
		Databases:  []DatabaseSettingItem{},
		Redis:      []RedisSettingItem{},
	}

	if opts.IncludeVMs {
		vms, err := s.ListVMs()
		if err != nil {
			return nil, fmt.Errorf("failed to export VMs: %w", err)
		}
		for _, v := range vms {
			bundle.VMs = append(bundle.VMs, VMSettingItem{
				ID:                v.ID,
				Name:              v.Name,
				Host:              v.Host,
				Port:              v.Port,
				Username:          v.Username,
				EncryptedPassword: v.EncryptedPassword,
				EncryptedKey:      v.EncryptedKey,
				Tags:              v.Tags,
			})
		}
	}

	if opts.IncludeDatabases {
		dbs, err := s.ListDatabases()
		if err != nil {
			return nil, fmt.Errorf("failed to export databases: %w", err)
		}
		for _, d := range dbs {
			bundle.Databases = append(bundle.Databases, DatabaseSettingItem{
				ID:                d.ID,
				Name:              d.Name,
				Type:              d.Type,
				Host:              d.Host,
				Port:              d.Port,
				DatabaseName:      d.DatabaseName,
				Username:          d.Username,
				EncryptedPassword: d.EncryptedPassword,
				SSLMode:           d.SSLMode,
			})
		}
	}

	if opts.IncludeRedis {
		redisConns, err := s.ListRedisConnections()
		if err != nil {
			return nil, fmt.Errorf("failed to export redis connections: %w", err)
		}
		for _, r := range redisConns {
			bundle.Redis = append(bundle.Redis, RedisSettingItem{
				ID:                r.ID,
				Name:              r.Name,
				Host:              r.Host,
				Port:              r.Port,
				Username:          r.Username,
				EncryptedPassword: r.EncryptedPassword,
				DefaultDB:         r.DefaultDB,
				UseTLS:            r.UseTLS,
			})
		}
	}

	return bundle, nil
}

// ExportSettingsJSON serializes the exported settings bundle as formatted JSON.
func (s *Storage) ExportSettingsJSON(opts SettingsExportOptions) (string, error) {
	bundle, err := s.ExportSettings(opts)
	if err != nil {
		return "", err
	}
	raw, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal settings JSON: %w", err)
	}
	return string(raw), nil
}

// ImportSettingsJSON parses a JSON string and imports VM, Database, and Redis settings.
func (s *Storage) ImportSettingsJSON(rawJSON string, opts SettingsImportOptions, encrypt EncryptFunc) (*SettingsImportResult, error) {
	trimmed := strings.TrimSpace(rawJSON)
	if trimmed == "" {
		return nil, fmt.Errorf("empty settings JSON payload")
	}

	var bundle SettingsBundle
	if err := json.Unmarshal([]byte(trimmed), &bundle); err != nil {
		return nil, fmt.Errorf("invalid settings JSON format: %w", err)
	}

	return s.ImportSettings(bundle, opts, encrypt)
}

// ImportSettings imports a parsed SettingsBundle into SQLite storage.
func (s *Storage) ImportSettings(bundle SettingsBundle, opts SettingsImportOptions, encrypt EncryptFunc) (*SettingsImportResult, error) {
	res := &SettingsImportResult{}

	if opts.IncludeVMs {
		count, err := s.importVMs(bundle.VMs, opts.ReplaceExisting, encrypt)
		if err != nil {
			return nil, err
		}
		res.VMsImported = count
	}

	if opts.IncludeDatabases {
		count, err := s.importDatabases(bundle.Databases, opts.ReplaceExisting, encrypt)
		if err != nil {
			return nil, err
		}
		res.DatabasesImported = count
	}

	if opts.IncludeRedis {
		count, err := s.importRedis(bundle.Redis, opts.ReplaceExisting, encrypt)
		if err != nil {
			return nil, err
		}
		res.RedisImported = count
	}

	return res, nil
}

func resolveSecret(rawPlaintext, encryptedValue, fallbackEncrypted string, encrypt EncryptFunc) (string, error) {
	if rawPlaintext != "" && encrypt != nil {
		enc, err := encrypt(rawPlaintext)
		if err != nil {
			return "", err
		}
		return enc, nil
	}
	if encryptedValue != "" {
		return encryptedValue, nil
	}
	return fallbackEncrypted, nil
}

func defaultConnectionName(name, host string, port int) string {
	trimmed := strings.TrimSpace(name)
	if trimmed != "" {
		return trimmed
	}
	return fmt.Sprintf("%s:%d", host, port)
}

func (s *Storage) importVMs(items []VMSettingItem, replace bool, encrypt EncryptFunc) (int, error) {
	if replace {
		if _, err := s.db.Exec(`DELETE FROM vms`); err != nil {
			return 0, fmt.Errorf("failed to clear existing VMs: %w", err)
		}
	}

	existingVMs, err := s.ListVMs()
	if err != nil {
		return 0, fmt.Errorf("failed to list existing VMs: %w", err)
	}

	imported := 0
	for _, item := range items {
		host := strings.TrimSpace(item.Host)
		if host == "" {
			continue
		}
		port := item.Port
		if port <= 0 {
			port = 22
		}
		username := strings.TrimSpace(item.Username)
		id := strings.TrimSpace(item.ID)
		var fallbackPass, fallbackKey string

		for _, ex := range existingVMs {
			if (id != "" && ex.ID == id) || (strings.EqualFold(ex.Host, host) && ex.Port == port && ex.Username == username) {
				id = ex.ID
				fallbackPass = ex.EncryptedPassword
				fallbackKey = ex.EncryptedKey
				break
			}
		}
		if id == "" {
			id = uuid.NewString()
		}

		encPass, err := resolveSecret(item.Password, item.EncryptedPassword, fallbackPass, encrypt)
		if err != nil {
			return imported, fmt.Errorf("failed to encrypt password for VM %s: %w", host, err)
		}
		encKey, err := resolveSecret(item.PrivateKey, item.EncryptedKey, fallbackKey, encrypt)
		if err != nil {
			return imported, fmt.Errorf("failed to encrypt key for VM %s: %w", host, err)
		}

		vm := VirtualMachine{
			ID:                id,
			Name:              defaultConnectionName(item.Name, host, port),
			Host:              host,
			Port:              port,
			Username:          username,
			EncryptedPassword: encPass,
			EncryptedKey:      encKey,
			Tags:              strings.TrimSpace(item.Tags),
			Status:            "offline",
		}
		if err := s.SaveVM(vm); err != nil {
			return imported, fmt.Errorf("failed to save VM %s: %w", vm.Name, err)
		}
		imported++
	}
	return imported, nil
}

func (s *Storage) importDatabases(items []DatabaseSettingItem, replace bool, encrypt EncryptFunc) (int, error) {
	if replace {
		if _, err := s.db.Exec(`DELETE FROM databases`); err != nil {
			return 0, fmt.Errorf("failed to clear existing databases: %w", err)
		}
	}

	existingDBs, err := s.ListDatabases()
	if err != nil {
		return 0, fmt.Errorf("failed to list existing databases: %w", err)
	}

	imported := 0
	for _, item := range items {
		host := strings.TrimSpace(item.Host)
		dbType := strings.ToLower(strings.TrimSpace(item.Type))
		if host == "" && dbType != "sqlite" && dbType != "sqlite3" {
			continue
		}
		if dbType == "" {
			dbType = "postgres"
		}
		port := item.Port
		if port <= 0 {
			if dbType == "mysql" {
				port = 3306
			} else {
				port = 5432
			}
		}
		sslMode := strings.TrimSpace(item.SSLMode)
		if sslMode == "" {
			sslMode = "disable"
		}

		id := strings.TrimSpace(item.ID)
		var fallbackPass string
		for _, ex := range existingDBs {
			sameTarget := strings.EqualFold(ex.Type, dbType) &&
				strings.EqualFold(ex.Host, host) &&
				ex.Port == port &&
				ex.DatabaseName == item.DatabaseName &&
				ex.Username == item.Username
			if (id != "" && ex.ID == id) || sameTarget {
				id = ex.ID
				fallbackPass = ex.EncryptedPassword
				break
			}
		}
		if id == "" {
			id = uuid.NewString()
		}

		encPass, err := resolveSecret(item.Password, item.EncryptedPassword, fallbackPass, encrypt)
		if err != nil {
			return imported, fmt.Errorf("failed to encrypt password for database %s: %w", item.Name, err)
		}

		conn := DatabaseConnection{
			ID:                id,
			Name:              defaultConnectionName(item.Name, host, port),
			Type:              dbType,
			Host:              host,
			Port:              port,
			DatabaseName:      strings.TrimSpace(item.DatabaseName),
			Username:          strings.TrimSpace(item.Username),
			EncryptedPassword: encPass,
			SSLMode:           sslMode,
		}
		if err := s.SaveDatabase(conn); err != nil {
			return imported, fmt.Errorf("failed to save database %s: %w", conn.Name, err)
		}
		imported++
	}
	return imported, nil
}

func (s *Storage) importRedis(items []RedisSettingItem, replace bool, encrypt EncryptFunc) (int, error) {
	if replace {
		if _, err := s.db.Exec(`DELETE FROM redis_connections`); err != nil {
			return 0, fmt.Errorf("failed to clear existing redis connections: %w", err)
		}
	}

	existingRedis, err := s.ListRedisConnections()
	if err != nil {
		return 0, fmt.Errorf("failed to list existing redis connections: %w", err)
	}

	imported := 0
	for _, item := range items {
		host := strings.TrimSpace(item.Host)
		if host == "" {
			continue
		}
		port := item.Port
		if port <= 0 {
			port = 6379
		}
		id := strings.TrimSpace(item.ID)
		var fallbackPass string
		for _, ex := range existingRedis {
			sameTarget := strings.EqualFold(ex.Host, host) &&
				ex.Port == port &&
				ex.DefaultDB == item.DefaultDB &&
				ex.Username == item.Username
			if (id != "" && ex.ID == id) || sameTarget {
				id = ex.ID
				fallbackPass = ex.EncryptedPassword
				break
			}
		}
		if id == "" {
			id = uuid.NewString()
		}

		encPass, err := resolveSecret(item.Password, item.EncryptedPassword, fallbackPass, encrypt)
		if err != nil {
			return imported, fmt.Errorf("failed to encrypt password for redis %s: %w", host, err)
		}

		conn := RedisConnection{
			ID:                id,
			Name:              defaultConnectionName(item.Name, host, port),
			Host:              host,
			Port:              port,
			Username:          strings.TrimSpace(item.Username),
			EncryptedPassword: encPass,
			DefaultDB:         item.DefaultDB,
			UseTLS:            item.UseTLS,
		}
		if err := s.SaveRedisConnection(conn); err != nil {
			return imported, fmt.Errorf("failed to save redis connection %s: %w", conn.Name, err)
		}
		imported++
	}
	return imported, nil
}
