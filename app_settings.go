package main

import (
	"fmt"
	"os"
	"time"

	"conx/pkg/database"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ExportSettings returns all selected settings (VMs, Databases, Redis) as a formatted JSON string.
func (a *App) ExportSettings(opts database.SettingsExportOptions) (string, error) {
	if a.storage == nil {
		return "", fmt.Errorf("storage not initialized")
	}
	return a.storage.ExportSettingsJSON(opts)
}

// ExportSettingsToFile opens a native Save File dialog and writes the exported JSON to disk.
// Returns the saved file path, or an empty string if the user canceled the dialog.
func (a *App) ExportSettingsToFile(opts database.SettingsExportOptions) (string, error) {
	rawJSON, err := a.ExportSettings(opts)
	if err != nil {
		return "", err
	}

	if a.ctx == nil {
		return "", fmt.Errorf("application context not initialized")
	}

	defaultName := fmt.Sprintf("conx-settings-%s.json", time.Now().Format("2006-01-02"))
	savePath, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: defaultName,
		Title:           "Export Conx Settings",
		Filters: []wailsRuntime.FileFilter{
			{
				DisplayName: "JSON Files (*.json)",
				Pattern:     "*.json",
			},
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to open save dialog: %w", err)
	}
	if savePath == "" {
		return "", nil
	}

	if err := os.WriteFile(savePath, []byte(rawJSON), 0600); err != nil {
		return "", fmt.Errorf("failed to write settings file: %w", err)
	}
	return savePath, nil
}

// ImportSettings imports VM, Database, and Redis settings from a JSON string.
func (a *App) ImportSettings(rawJSON string, opts database.SettingsImportOptions) (*database.SettingsImportResult, error) {
	if a.storage == nil {
		return nil, fmt.Errorf("storage not initialized")
	}

	var encryptFn database.EncryptFunc
	if a.vault != nil {
		encryptFn = a.vault.Encrypt
	}

	return a.storage.ImportSettingsJSON(rawJSON, opts, encryptFn)
}
