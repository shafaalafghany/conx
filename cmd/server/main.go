package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"conx/pkg/crypto"
	"conx/pkg/database"
	"conx/pkg/monitor"
)

func main() {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "conx")
	_ = os.MkdirAll(appDir, 0755)

	dbPath := filepath.Join(appDir, "conx.db")
	storage, err := database.NewStorage(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer storage.Close()

	vault := crypto.NewVault("conx-local-workstation-secret-seed")
	runner := database.NewRunner()
	poller := monitor.NewPoller(context.Background(), storage, nil)
	poller.Start()
	defer poller.Stop()

	srv := &Server{
		storage:        storage,
		vault:          vault,
		runner:         runner,
		poller:         poller,
		connectedConns: make(map[string]bool),
	}

	mux := http.NewServeMux()

	// REST Endpoints
	mux.HandleFunc("/api/vms", srv.handleVMs)
	mux.HandleFunc("/api/vms/", srv.handleVMs)
	mux.HandleFunc("/api/vms/health", srv.handleVMHealth)
	mux.HandleFunc("/api/vms/files", srv.handleVMFiles)
	mux.HandleFunc("/api/databases", srv.handleDatabases)
	mux.HandleFunc("/api/databases/", srv.handleDatabaseSubroutes)
	mux.HandleFunc("/api/databases/test", srv.handleDatabaseTest)
	mux.HandleFunc("/api/databases/query", srv.handleDatabaseQuery)

	// WebSocket Terminal Bridge
	mux.HandleFunc("/ws/ssh", srv.handleSSHWebSocket)

	port := 3333
	fmt.Printf("\n🚀 Conx Go Web Bridge Server running on http://localhost:%d\n", port)
	fmt.Printf("   • REST Endpoints: /api/vms, /api/databases, /api/databases/query\n")
	fmt.Printf("   • Interactive SSH WebSocket: /ws/ssh?vmId=...\n\n")

	handler := srv.corsMiddleware(mux)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), handler); err != nil {
		log.Fatalf("Server exited: %v", err)
	}
}
