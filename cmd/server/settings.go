package main

import (
	"encoding/json"
	"net/http"

	"conx/pkg/database"
)

func (s *Server) handleSettingsExport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	opts := database.DefaultExportOptions()
	if r.Method == http.MethodPost {
		_ = json.NewDecoder(r.Body).Decode(&opts)
	} else if r.Method == http.MethodGet {
		q := r.URL.Query()
		if q.Get("vms") != "" {
			opts.IncludeVMs = q.Get("vms") == "true"
		}
		if q.Get("databases") != "" {
			opts.IncludeDatabases = q.Get("databases") == "true"
		}
		if q.Get("redis") != "" {
			opts.IncludeRedis = q.Get("redis") == "true"
		}
	} else {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rawJSON, err := s.storage.ExportSettingsJSON(opts)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, _ = w.Write([]byte(rawJSON))
}

func (s *Server) handleSettingsImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		RawJSON string                         `json:"rawJson"`
		Options database.SettingsImportOptions `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var encryptFn database.EncryptFunc
	if s.vault != nil {
		encryptFn = s.vault.Encrypt
	}

	result, err := s.storage.ImportSettingsJSON(req.RawJSON, req.Options, encryptFn)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_ = json.NewEncoder(w).Encode(result)
}
