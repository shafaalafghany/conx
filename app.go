package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"conx/pkg/crypto"
	"conx/pkg/database"
	"conx/pkg/monitor"
	"conx/pkg/ssh"

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
