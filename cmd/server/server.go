package main

import (
	"net/http"
	"sync"

	"conx/pkg/crypto"
	"conx/pkg/database"
	"conx/pkg/monitor"
	"conx/pkg/redisclient"

	"github.com/gorilla/websocket"
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
	redisRunner    *redisclient.Runner
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
