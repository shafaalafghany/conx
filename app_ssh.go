package main

import (
	"fmt"

	"conx/pkg/database"
	"conx/pkg/ssh"

	"github.com/google/uuid"
)

// StartSSHSession establishes an interactive SSH terminal session for a VM
func (a *App) StartSSHSession(vmID string, cols int, rows int) (string, error) {
	if a.storage == nil || a.sshManager == nil || a.vault == nil {
		return "", fmt.Errorf("subsystems not fully initialized")
	}

	vms, err := a.storage.ListVMs()
	if err != nil {
		return "", fmt.Errorf("failed to lookup vms: %w", err)
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		return "", fmt.Errorf("vm with ID %s not found", vmID)
	}

	var password string
	if target.EncryptedPassword != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedPassword)
		if err == nil {
			password = decrypted
		}
	}

	var keyData string
	if target.EncryptedKey != "" {
		decrypted, err := a.vault.Decrypt(target.EncryptedKey)
		if err == nil {
			keyData = decrypted
		}
	}

	sessionID := uuid.NewString()
	err = a.sshManager.StartSession(ssh.ConnectOptions{
		SessionID: sessionID,
		Host:      target.Host,
		Port:      target.Port,
		Username:  target.Username,
		Password:  password,
		KeyData:   keyData,
		Cols:      cols,
		Rows:      rows,
	})

	if err != nil {
		return "", err
	}

	return sessionID, nil
}

// SendTerminalInput routes user keystrokes into the remote SSH session stdin
func (a *App) SendTerminalInput(sessionID string, data string) error {
	if a.sshManager == nil {
		return fmt.Errorf("ssh manager not ready")
	}
	return a.sshManager.WriteInput(sessionID, data)
}

// ResizeTerminal updates remote PTY rows and cols on window change
func (a *App) ResizeTerminal(sessionID string, cols int, rows int) error {
	if a.sshManager == nil {
		return fmt.Errorf("ssh manager not ready")
	}
	return a.sshManager.Resize(sessionID, cols, rows)
}

// CloseSSHSession terminates an interactive terminal session
func (a *App) CloseSSHSession(sessionID string) error {
	if a.sshManager == nil {
		return nil
	}
	return a.sshManager.CloseSession(sessionID)
}

// ListFiles lists directory contents on a target VM
func (a *App) ListFiles(vmID string, dir string) (ssh.FileListResult, error) {
	if a.storage == nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}}, fmt.Errorf("storage not initialized")
	}

	vms, err := a.storage.ListVMs()
	if err != nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}}, err
	}

	var target *database.VirtualMachine
	for i := range vms {
		if vms[i].ID == vmID {
			target = &vms[i]
			break
		}
	}

	if target == nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}}, fmt.Errorf("VM not found")
	}

	var password, keyData string
	if target.EncryptedPassword != "" && a.vault != nil {
		dec, _ := a.vault.Decrypt(target.EncryptedPassword)
		password = dec
	}
	if target.EncryptedKey != "" && a.vault != nil {
		dec, _ := a.vault.Decrypt(target.EncryptedKey)
		keyData = dec
	}

	resolved, entries, err := ssh.ListRemoteFiles(target.Host, target.Port, target.Username, password, keyData, dir)
	if err != nil {
		return ssh.FileListResult{Directory: dir, Entries: []ssh.DirEntry{}, Error: err.Error()}, nil
	}

	return ssh.FileListResult{Directory: resolved, Entries: entries}, nil
}

// GetVMPassword retrieves the decrypted password for a VM if set
func (a *App) GetVMPassword(vmID string) (string, error) {
	if a.storage == nil || a.vault == nil {
		return "", fmt.Errorf("subsystems not initialized")
	}

	vms, err := a.storage.ListVMs()
	if err != nil {
		return "", err
	}

	for _, vm := range vms {
		if vm.ID == vmID {
			if vm.EncryptedPassword == "" {
				return "", nil
			}
			return a.vault.Decrypt(vm.EncryptedPassword)
		}
	}

	return "", fmt.Errorf("VM not found")
}

// SetVMPassword encrypts and updates the password for an existing VM
func (a *App) SetVMPassword(vmID string, newPassword string) error {
	if a.storage == nil || a.vault == nil {
		return fmt.Errorf("subsystems not initialized")
	}

	vms, err := a.storage.ListVMs()
	if err != nil {
		return err
	}

	for _, vm := range vms {
		if vm.ID == vmID {
			encrypted, err := a.vault.Encrypt(newPassword)
			if err != nil {
				return fmt.Errorf("failed to encrypt password: %w", err)
			}
			vm.EncryptedPassword = encrypted
			return a.storage.SaveVM(vm)
		}
	}

	return fmt.Errorf("VM not found")
}
