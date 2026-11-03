package main

import (
	"context"
	"fmt"
	"time"

	"conx/pkg/database"
	"conx/pkg/redisclient"

	"github.com/google/uuid"
)

func (a *App) resolveRedisTarget(connID string) (*database.RedisConnection, string, error) {
	if a.storage == nil || a.redisRunner == nil || a.vault == nil {
		return nil, "", fmt.Errorf("redis subsystem not ready")
	}

	target, err := a.storage.GetRedisConnection(connID)
	if err != nil || target == nil {
		return nil, "", fmt.Errorf("redis connection %s not found", connID)
	}

	var password string
	if target.EncryptedPassword != "" {
		if decrypted, decErr := a.vault.Decrypt(target.EncryptedPassword); decErr == nil {
			password = decrypted
		}
	}
	return target, password, nil
}

// ListRedisConnections returns all configured Redis connection profiles
func (a *App) ListRedisConnections() ([]database.RedisConnection, error) {
	if a.storage == nil {
		return []database.RedisConnection{}, nil
	}
	conns, err := a.storage.ListRedisConnections()
	if err != nil {
		return nil, err
	}
	if conns == nil {
		return []database.RedisConnection{}, nil
	}
	return conns, nil
}

// SaveRedisConnection creates or updates a Redis connection profile with encrypted credentials
func (a *App) SaveRedisConnection(conn database.RedisConnection, rawPassword string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}

	if conn.ID == "" {
		conn.ID = uuid.NewString()
	} else {
		existing, err := a.storage.GetRedisConnection(conn.ID)
		if err == nil && existing != nil {
			if rawPassword == "" && conn.EncryptedPassword == "" {
				conn.EncryptedPassword = existing.EncryptedPassword
			}
		}
	}

	if rawPassword != "" && a.vault != nil {
		encrypted, err := a.vault.Encrypt(rawPassword)
		if err != nil {
			return fmt.Errorf("failed to encrypt redis password: %w", err)
		}
		conn.EncryptedPassword = encrypted
	}

	if conn.Port <= 0 {
		conn.Port = 6379
	}
	if conn.Name == "" {
		conn.Name = fmt.Sprintf("%s:%d", conn.Host, conn.Port)
	}

	return a.storage.SaveRedisConnection(conn)
}

// DeleteRedisConnection removes a Redis connection profile by ID
func (a *App) DeleteRedisConnection(id string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}
	return a.storage.DeleteRedisConnection(id)
}

// TestRedisConnection verifies connectivity to a Redis server
func (a *App) TestRedisConnection(conn database.RedisConnection, rawPassword string) (string, error) {
	if a.redisRunner == nil {
		return "", fmt.Errorf("redis runner not initialized")
	}

	password := rawPassword
	if password == "" {
		encPass := conn.EncryptedPassword
		if encPass == "" && conn.ID != "" && a.storage != nil {
			if existing, err := a.storage.GetRedisConnection(conn.ID); err == nil && existing != nil {
				encPass = existing.EncryptedPassword
			}
		}
		if encPass != "" && a.vault != nil {
			if decrypted, err := a.vault.Decrypt(encPass); err == nil {
				password = decrypted
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	return a.redisRunner.TestConnection(ctx, conn, password)
}

// ScanRedisKeys performs paginated non-blocking SCAN on the selected Redis DB
func (a *App) ScanRedisKeys(
	connID string,
	dbIndex int,
	cursor uint64,
	pattern string,
	keyType string,
	count int64,
) (*redisclient.RedisScanResult, error) {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	return a.redisRunner.ScanKeys(ctx, *target, password, dbIndex, cursor, pattern, keyType, count)
}

// GetRedisKeyDetail returns full value, metadata, size, and TTL of a Redis key
func (a *App) GetRedisKeyDetail(connID string, dbIndex int, key string) (*redisclient.RedisKeyDetail, error) {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	return a.redisRunner.GetKeyDetail(ctx, *target, password, dbIndex, key)
}

// SetRedisKey creates a new Redis key of any supported data type
func (a *App) SetRedisKey(connID string, dbIndex int, req redisclient.RedisSetKeyRequest) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	return a.redisRunner.SetKey(ctx, *target, password, dbIndex, req)
}

// UpdateRedisString updates a string value while preserving its remaining TTL
func (a *App) UpdateRedisString(connID string, dbIndex int, key string, value string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.UpdateStringValue(ctx, *target, password, dbIndex, key, value)
}

// SetRedisHashField adds, updates, or renames a field inside a Redis Hash
func (a *App) SetRedisHashField(connID string, dbIndex int, key string, oldField string, field string, value string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.SetHashField(ctx, *target, password, dbIndex, key, oldField, field, value)
}

// DeleteRedisHashField deletes a field from a Redis Hash
func (a *App) DeleteRedisHashField(connID string, dbIndex int, key string, field string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.DeleteHashField(ctx, *target, password, dbIndex, key, field)
}

// PushRedisListValue pushes a new item to the head or tail of a Redis List
func (a *App) PushRedisListValue(connID string, dbIndex int, key string, value string, position string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.PushListValue(ctx, *target, password, dbIndex, key, value, position)
}

// UpdateRedisListValue updates an element at a specific index in a Redis List
func (a *App) UpdateRedisListValue(connID string, dbIndex int, key string, index int64, value string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.UpdateListValue(ctx, *target, password, dbIndex, key, index, value)
}

// DeleteRedisListIndex removes an element at a specific index in a Redis List
func (a *App) DeleteRedisListIndex(connID string, dbIndex int, key string, index int64) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.DeleteListIndex(ctx, *target, password, dbIndex, key, index)
}

// AddRedisSetMember adds a member to a Redis Set
func (a *App) AddRedisSetMember(connID string, dbIndex int, key string, member string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.AddSetMember(ctx, *target, password, dbIndex, key, member)
}

// RemoveRedisSetMember removes a member from a Redis Set
func (a *App) RemoveRedisSetMember(connID string, dbIndex int, key string, member string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.RemoveSetMember(ctx, *target, password, dbIndex, key, member)
}

// AddRedisZSetMember adds or updates a scored member in a Redis Sorted Set
func (a *App) AddRedisZSetMember(connID string, dbIndex int, key string, member string, score float64) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.AddZSetMember(ctx, *target, password, dbIndex, key, member, score)
}

// RemoveRedisZSetMember removes a member from a Redis Sorted Set
func (a *App) RemoveRedisZSetMember(connID string, dbIndex int, key string, member string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.RemoveZSetMember(ctx, *target, password, dbIndex, key, member)
}

// UpdateRedisKeyTTL sets or clears expiration (-1 for PERSIST) on a Redis key
func (a *App) UpdateRedisKeyTTL(connID string, dbIndex int, key string, ttlSeconds int64) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.UpdateKeyTTL(ctx, *target, password, dbIndex, key, ttlSeconds)
}

// DeleteRedisKey deletes a key from Redis
func (a *App) DeleteRedisKey(connID string, dbIndex int, key string) error {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.redisRunner.DeleteKey(ctx, *target, password, dbIndex, key)
}

// ExecuteRedisCommand runs a raw Redis CLI command and records history
func (a *App) ExecuteRedisCommand(connID string, dbIndex int, command string) (*redisclient.RedisCommandResult, error) {
	target, password, err := a.resolveRedisTarget(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	res, cmdErr := a.redisRunner.ExecuteCommand(ctx, *target, password, dbIndex, command)

	status := "success"
	errMsg := ""
	var execTime int64
	if res != nil {
		execTime = res.ExecutionTimeMs
		if res.Error != "" {
			status = "error"
			errMsg = res.Error
		}
	}
	if cmdErr != nil {
		status = "error"
		errMsg = cmdErr.Error()
	}

	_ = a.storage.SaveRedisCommandHistory(database.RedisCommandHistoryEntry{
		ConnectionID:    connID,
		DBIndex:         dbIndex,
		CommandText:     command,
		Status:          status,
		ErrorMessage:    errMsg,
		ExecutionTimeMs: execTime,
	})

	return res, nil
}

// GetRedisCommandHistory returns recent Redis CLI command history for a connection
func (a *App) GetRedisCommandHistory(connID string) ([]database.RedisCommandHistoryEntry, error) {
	if a.storage == nil {
		return []database.RedisCommandHistoryEntry{}, nil
	}
	entries, err := a.storage.ListRedisCommandHistory(connID, 100)
	if err != nil {
		return nil, err
	}
	if entries == nil {
		return []database.RedisCommandHistoryEntry{}, nil
	}
	return entries, nil
}
