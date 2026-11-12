package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"conx/pkg/database"
	conxssh "conx/pkg/ssh"

	"github.com/google/uuid"
)

// VM Endpoints
func (s *Server) handleVMs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	pathID := strings.TrimPrefix(r.URL.Path, "/api/vms/")
	pathID = strings.Trim(pathID, "/")

	switch r.Method {
	case http.MethodGet:
		vms, err := s.storage.ListVMs()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if vms == nil {
			vms = []database.VirtualMachine{}
		}
		_ = json.NewEncoder(w).Encode(vms)

	case http.MethodPost, http.MethodPut:
		var req struct {
			database.VirtualMachine
			Label    string `json:"label"`
			Password string `json:"password"`
			KeyData  string `json:"keyData"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		vm := req.VirtualMachine
		if vm.Name == "" && req.Label != "" {
			vm.Name = req.Label
		}

		if vm.ID == "" && pathID != "" && pathID != "api/vms" {
			vm.ID = pathID
		}

		if vm.ID == "" {
			// Deduplicate: check if VM with same host, port, and username already exists
			existingVMs, _ := s.storage.ListVMs()
			for _, existing := range existingVMs {
				if strings.EqualFold(existing.Host, vm.Host) && existing.Port == vm.Port && existing.Username == vm.Username {
					vm.ID = existing.ID
					break
				}
			}
			if vm.ID == "" {
				vm.ID = uuid.NewString()
			}
		}

		if req.Password != "" {
			encrypted, err := s.vault.Encrypt(req.Password)
			if err != nil {
				http.Error(w, "Failed to encrypt password: "+err.Error(), http.StatusInternalServerError)
				return
			}
			vm.EncryptedPassword = encrypted
		}

		if req.KeyData != "" {
			encrypted, err := s.vault.Encrypt(req.KeyData)
			if err != nil {
				http.Error(w, "Failed to encrypt key: "+err.Error(), http.StatusInternalServerError)
				return
			}
			vm.EncryptedKey = encrypted
		}

		if err := s.storage.SaveVM(vm); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(vm)

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" && pathID != "" && pathID != "api/vms" {
			id = pathID
		}
		if id == "" {
			http.Error(w, "Missing id parameter", http.StatusBadRequest)
			return
		}
		if err := s.storage.DeleteVM(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleVMHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	results := s.poller.ProbeAll()
	_ = json.NewEncoder(w).Encode(results)
}

func (s *Server) handleVMFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vmID := r.URL.Query().Get("vmId")
	dir := r.URL.Query().Get("dir")

	if vmID == "" {
		http.Error(w, "Missing vmId parameter", http.StatusBadRequest)
		return
	}

	vms, err := s.storage.ListVMs()
	if err != nil {
		http.Error(w, "Failed to list VMs: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		http.Error(w, "VM not found", http.StatusNotFound)
		return
	}

	var password, keyData string
	if target.EncryptedPassword != "" {
		dec, _ := s.vault.Decrypt(target.EncryptedPassword)
		password = dec
	}
	if target.EncryptedKey != "" {
		dec, _ := s.vault.Decrypt(target.EncryptedKey)
		keyData = dec
	}

	resolved, entries, err := conxssh.ListRemoteFiles(target.Host, target.Port, target.Username, password, keyData, dir)
	if err != nil {
		_ = json.NewEncoder(w).Encode(conxssh.FileListResult{
			Directory: dir,
			Entries:   []conxssh.DirEntry{},
			Error:     err.Error(),
		})
		return
	}

	_ = json.NewEncoder(w).Encode(conxssh.FileListResult{
		Directory: resolved,
		Entries:   entries,
	})
}

// handleVMPassword allows getting or updating the password for a VM
func (s *Server) handleVMPassword(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vmID := r.URL.Query().Get("vmId")
	if vmID == "" {
		http.Error(w, "Missing vmId parameter", http.StatusBadRequest)
		return
	}

	vms, err := s.storage.ListVMs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		http.Error(w, "VM not found", http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodGet:
		var password string
		if target.EncryptedPassword != "" {
			dec, _ := s.vault.Decrypt(target.EncryptedPassword)
			password = dec
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"hasPassword": target.EncryptedPassword != "",
			"password":    password,
		})

	case http.MethodPost, http.MethodPut:
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		encrypted, err := s.vault.Encrypt(req.Password)
		if err != nil {
			http.Error(w, "Failed to encrypt password: "+err.Error(), http.StatusInternalServerError)
			return
		}
		target.EncryptedPassword = encrypted
		if err := s.storage.SaveVM(*target); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
