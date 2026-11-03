package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"conx/pkg/database"
	"conx/pkg/redisclient"

	"github.com/google/uuid"
)

type RedisConnectionResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Host        string    `json:"host"`
	Port        int       `json:"port"`
	Username    string    `json:"username"`
	DefaultDB   int       `json:"defaultDb"`
	UseTLS      bool      `json:"useTls"`
	HasPassword bool      `json:"hasPassword"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (s *Server) resolveRedisTarget(connID string) (*database.RedisConnection, string, error) {
	target, err := s.storage.GetRedisConnection(connID)
	if err != nil || target == nil {
		return nil, "", fmt.Errorf("redis connection %s not found", connID)
	}

	var password string
	if target.EncryptedPassword != "" && s.vault != nil {
		if dec, decErr := s.vault.Decrypt(target.EncryptedPassword); decErr == nil {
			password = dec
		}
	}
	return target, password, nil
}

func (s *Server) handleRedisConnections(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		conns, err := s.storage.ListRedisConnections()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var resp []RedisConnectionResponse
		for _, c := range conns {
			status := "disconnected"
			if s.isConnected("redis:" + c.ID) {
				status = "connected"
			}
			name := c.Name
			if name == "" {
				name = fmt.Sprintf("%s:%d", c.Host, c.Port)
			}
			resp = append(resp, RedisConnectionResponse{
				ID:          c.ID,
				Name:        name,
				Host:        c.Host,
				Port:        c.Port,
				Username:    c.Username,
				DefaultDB:   c.DefaultDB,
				UseTLS:      c.UseTLS,
				HasPassword: c.HasPassword,
				Status:      status,
				CreatedAt:   c.CreatedAt,
			})
		}
		if resp == nil {
			resp = []RedisConnectionResponse{}
		}
		_ = json.NewEncoder(w).Encode(resp)

	case http.MethodPost:
		var req struct {
			database.RedisConnection
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		conn := req.RedisConnection
		if conn.ID == "" {
			conn.ID = uuid.NewString()
		} else {
			if existing, err := s.storage.GetRedisConnection(conn.ID); err == nil && existing != nil {
				if req.Password == "" && conn.EncryptedPassword == "" {
					conn.EncryptedPassword = existing.EncryptedPassword
				}
			}
		}

		if req.Password != "" && s.vault != nil {
			encrypted, err := s.vault.Encrypt(req.Password)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			conn.EncryptedPassword = encrypted
		}

		if conn.Port <= 0 {
			conn.Port = 6379
		}
		if conn.Name == "" {
			conn.Name = fmt.Sprintf("%s:%d", conn.Host, conn.Port)
		}

		if err := s.storage.SaveRedisConnection(conn); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id": conn.ID, "status": "saved"})

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "missing id parameter", http.StatusBadRequest)
			return
		}
		if err := s.storage.DeleteRedisConnection(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		s.setConnected("redis:"+id, false)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleRedisSubroutes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/redis/")
	path = strings.TrimSuffix(path, "/")

	switch path {
	case "test":
		s.handleRedisTest(w, r)
		return
	case "scan":
		s.handleRedisScan(w, r)
		return
	case "key":
		s.handleRedisKey(w, r)
		return
	case "key/string":
		s.handleRedisKeyString(w, r)
		return
	case "key/hash":
		s.handleRedisKeyHash(w, r)
		return
	case "key/list":
		s.handleRedisKeyList(w, r)
		return
	case "key/set":
		s.handleRedisKeySet(w, r)
		return
	case "key/zset":
		s.handleRedisKeyZSet(w, r)
		return
	case "key/ttl":
		s.handleRedisKeyTTL(w, r)
		return
	case "command":
		s.handleRedisCommand(w, r)
		return
	}

	parts := strings.Split(path, "/")
	if len(parts) == 2 {
		id := parts[0]
		action := parts[1]
		switch action {
		case "connect":
			target, password, err := s.resolveRedisTarget(id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
			defer cancel()
			if _, err := s.redisRunner.TestConnection(ctx, *target, password); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			s.setConnected("redis:"+id, true)
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "connected"})
			return

		case "disconnect":
			s.setConnected("redis:"+id, false)
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "disconnected"})
			return

		case "history":
			entries, err := s.storage.ListRedisCommandHistory(id, 100)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if entries == nil {
				entries = []database.RedisCommandHistoryEntry{}
			}
			_ = json.NewEncoder(w).Encode(entries)
			return
		}
	}

	http.Error(w, "unknown redis endpoint", http.StatusNotFound)
}

func (s *Server) handleRedisTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		database.RedisConnection
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	password := req.Password
	if password == "" {
		encPass := req.EncryptedPassword
		if encPass == "" && req.ID != "" {
			if existing, err := s.storage.GetRedisConnection(req.ID); err == nil && existing != nil {
				encPass = existing.EncryptedPassword
			}
		}
		if encPass != "" && s.vault != nil {
			if decrypted, err := s.vault.Decrypt(encPass); err == nil {
				password = decrypted
			}
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	msg, err := s.redisRunner.TestConnection(ctx, req.RedisConnection, password)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": msg,
	})
}

func (s *Server) handleRedisScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ConnectionID string `json:"connectionId"`
		DBIndex      int    `json:"dbIndex"`
		Cursor       uint64 `json:"cursor"`
		Pattern      string `json:"pattern"`
		KeyType      string `json:"keyType"`
		Count        int64  `json:"count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	target, password, err := s.resolveRedisTarget(req.ConnectionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	res, err := s.redisRunner.ScanKeys(ctx, *target, password, req.DBIndex, req.Cursor, req.Pattern, req.KeyType, req.Count)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(res)
}

func (s *Server) handleRedisKey(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		connID := r.URL.Query().Get("connectionId")
		dbIndex, _ := strconv.Atoi(r.URL.Query().Get("dbIndex"))
		key := r.URL.Query().Get("key")

		target, password, err := s.resolveRedisTarget(connID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()

		detail, err := s.redisRunner.GetKeyDetail(ctx, *target, password, dbIndex, key)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(detail)

	case http.MethodPost:
		var req struct {
			ConnectionID string                         `json:"connectionId"`
			DBIndex      int                            `json:"dbIndex"`
			Payload      redisclient.RedisSetKeyRequest `json:"payload"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		target, password, err := s.resolveRedisTarget(req.ConnectionID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()

		if err := s.redisRunner.SetKey(ctx, *target, password, req.DBIndex, req.Payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	case http.MethodDelete:
		connID := r.URL.Query().Get("connectionId")
		dbIndex, _ := strconv.Atoi(r.URL.Query().Get("dbIndex"))
		key := r.URL.Query().Get("key")

		target, password, err := s.resolveRedisTarget(connID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		if err := s.redisRunner.DeleteKey(ctx, *target, password, dbIndex, key); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleRedisKeyString(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ConnectionID string `json:"connectionId"`
		DBIndex      int    `json:"dbIndex"`
		Key          string `json:"key"`
		Value        string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	target, password, err := s.resolveRedisTarget(req.ConnectionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if err := s.redisRunner.UpdateStringValue(ctx, *target, password, req.DBIndex, req.Key, req.Value); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleRedisKeyHash(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var req struct {
			ConnectionID string `json:"connectionId"`
			DBIndex      int    `json:"dbIndex"`
			Key          string `json:"key"`
			OldField     string `json:"oldField"`
			Field        string `json:"field"`
			Value        string `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		target, password, err := s.resolveRedisTarget(req.ConnectionID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		if err := s.redisRunner.SetHashField(ctx, *target, password, req.DBIndex, req.Key, req.OldField, req.Field, req.Value); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	case http.MethodDelete:
		var req struct {
			ConnectionID string `json:"connectionId"`
			DBIndex      int    `json:"dbIndex"`
			Key          string `json:"key"`
			Field        string `json:"field"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		target, password, err := s.resolveRedisTarget(req.ConnectionID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		if err := s.redisRunner.DeleteHashField(ctx, *target, password, req.DBIndex, req.Key, req.Field); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleRedisKeyList(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Action       string `json:"action"` // "push" | "update" | "delete"
		ConnectionID string `json:"connectionId"`
		DBIndex      int    `json:"dbIndex"`
		Key          string `json:"key"`
		Index        int64  `json:"index"`
		Value        string `json:"value"`
		Position     string `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	target, password, err := s.resolveRedisTarget(req.ConnectionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	switch req.Action {
	case "push":
		err = s.redisRunner.PushListValue(ctx, *target, password, req.DBIndex, req.Key, req.Value, req.Position)
	case "update":
		err = s.redisRunner.UpdateListValue(ctx, *target, password, req.DBIndex, req.Key, req.Index, req.Value)
	case "delete":
		err = s.redisRunner.DeleteListIndex(ctx, *target, password, req.DBIndex, req.Key, req.Index)
	default:
		http.Error(w, "invalid list action", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleRedisKeySet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Action       string `json:"action"` // "add" | "remove"
		ConnectionID string `json:"connectionId"`
		DBIndex      int    `json:"dbIndex"`
		Key          string `json:"key"`
		Member       string `json:"member"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	target, password, err := s.resolveRedisTarget(req.ConnectionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if req.Action == "remove" {
		err = s.redisRunner.RemoveSetMember(ctx, *target, password, req.DBIndex, req.Key, req.Member)
	} else {
		err = s.redisRunner.AddSetMember(ctx, *target, password, req.DBIndex, req.Key, req.Member)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleRedisKeyZSet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Action       string  `json:"action"` // "add" | "remove"
		ConnectionID string  `json:"connectionId"`
		DBIndex      int     `json:"dbIndex"`
		Key          string  `json:"key"`
		Member       string  `json:"member"`
		Score        float64 `json:"score"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	target, password, err := s.resolveRedisTarget(req.ConnectionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if req.Action == "remove" {
		err = s.redisRunner.RemoveZSetMember(ctx, *target, password, req.DBIndex, req.Key, req.Member)
	} else {
		err = s.redisRunner.AddZSetMember(ctx, *target, password, req.DBIndex, req.Key, req.Member, req.Score)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleRedisKeyTTL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ConnectionID string `json:"connectionId"`
		DBIndex      int    `json:"dbIndex"`
		Key          string `json:"key"`
		TTLSeconds   int64  `json:"ttlSeconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	target, password, err := s.resolveRedisTarget(req.ConnectionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if err := s.redisRunner.UpdateKeyTTL(ctx, *target, password, req.DBIndex, req.Key, req.TTLSeconds); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleRedisCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ConnectionID string `json:"connectionId"`
		DBIndex      int    `json:"dbIndex"`
		Command      string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	target, password, err := s.resolveRedisTarget(req.ConnectionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	res, cmdErr := s.redisRunner.ExecuteCommand(ctx, *target, password, req.DBIndex, req.Command)
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

	_ = s.storage.SaveRedisCommandHistory(database.RedisCommandHistoryEntry{
		ConnectionID:    req.ConnectionID,
		DBIndex:         req.DBIndex,
		CommandText:     req.Command,
		Status:          status,
		ErrorMessage:    errMsg,
		ExecutionTimeMs: execTime,
	})

	if res == nil && cmdErr != nil {
		http.Error(w, cmdErr.Error(), http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(res)
}
