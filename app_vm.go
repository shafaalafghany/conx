package main

import (
	"fmt"
	"strings"

	"conx/pkg/database"
	"conx/pkg/monitor"

	"github.com/google/uuid"
)

// ListVMs retrieves all registered virtual machines
func (a *App) ListVMs() ([]database.VirtualMachine, error) {
	if a.storage == nil {
		return []database.VirtualMachine{}, nil
	}
	return a.storage.ListVMs()
}

// SaveVM saves or updates a virtual machine entry, encrypting sensitive fields
func (a *App) SaveVM(vm database.VirtualMachine, rawPassword string, rawKey string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}

	if vm.ID == "" {
		// Deduplicate: check if VM with same host, port, and username already exists
		existingVMs, _ := a.storage.ListVMs()
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

	if rawPassword != "" && a.vault != nil {
		encrypted, err := a.vault.Encrypt(rawPassword)
		if err != nil {
			return fmt.Errorf("failed to encrypt password: %w", err)
		}
		vm.EncryptedPassword = encrypted
	}

	if rawKey != "" && a.vault != nil {
		encrypted, err := a.vault.Encrypt(rawKey)
		if err != nil {
			return fmt.Errorf("failed to encrypt ssh key: %w", err)
		}
		vm.EncryptedKey = encrypted
	}

	return a.storage.SaveVM(vm)
}

// DeleteVM removes a virtual machine by ID
func (a *App) DeleteVM(id string) error {
	if a.storage == nil {
		return fmt.Errorf("storage not initialized")
	}
	return a.storage.DeleteVM(id)
}

// RefreshVMHealth triggers an immediate concurrent probe across all VMs
func (a *App) RefreshVMHealth() (map[string]monitor.VMHealth, error) {
	if a.poller == nil {
		return nil, fmt.Errorf("health poller not initialized")
	}
	return a.poller.ProbeAll(), nil
}

// GetFleetSummary retrieves aggregated fleet statistics
func (a *App) GetFleetSummary() monitor.FleetSummary {
	if a.poller == nil {
		return monitor.FleetSummary{}
	}
	return a.poller.GetSummary()
}
