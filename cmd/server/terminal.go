package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"conx/pkg/database"

	"encoding/json"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

// WebSocket SSH Terminal Bridge
func (s *Server) handleSSHWebSocket(w http.ResponseWriter, r *http.Request) {
	vmID := r.URL.Query().Get("vmId")
	colsStr := r.URL.Query().Get("cols")
	rowsStr := r.URL.Query().Get("rows")

	cols := 80
	if c, err := strconv.Atoi(colsStr); err == nil && c > 0 {
		cols = c
	}
	rows := 24
	if rw, err := strconv.Atoi(rowsStr); err == nil && rw > 0 {
		rows = rw
	}

	vms, err := s.storage.ListVMs()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
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

	var authMethods []ssh.AuthMethod
	if password != "" {
		authMethods = append(authMethods, ssh.Password(password))
	}
	if keyData != "" {
		signer, err := ssh.ParsePrivateKey([]byte(keyData))
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	}

	if len(authMethods) == 0 {
		http.Error(w, "No credentials for VM", http.StatusBadRequest)
		return
	}

	sshConfig := &ssh.ClientConfig{
		User:            target.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}

	port := target.Port
	if port == 0 {
		port = 22
	}
	addr := net.JoinHostPort(target.Host, fmt.Sprintf("%d", port))

	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		http.Error(w, fmt.Sprintf("SSH connection failed to %s: %v", addr, err), http.StatusBadGateway)
		return
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		http.Error(w, "Failed to create SSH session: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer session.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		http.Error(w, "PTY request failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	stdinPipe, err := session.StdinPipe()
	if err != nil {
		http.Error(w, "Stdin pipe failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer stdinPipe.Close()

	stdoutPipe, err := session.StdoutPipe()
	if err != nil {
		http.Error(w, "Stdout pipe failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := session.Shell(); err != nil {
		http.Error(w, "Shell failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Upgrade HTTP connection to WebSocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}
	defer ws.Close()

	// Goroutine: SSH stdout -> WebSocket write
	go func() {
		buf := make([]byte, 2048)
		for {
			n, err := stdoutPipe.Read(buf)
			if n > 0 {
				if werr := ws.WriteMessage(websocket.TextMessage, buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					_ = ws.WriteMessage(websocket.TextMessage, fmt.Appendf(nil, "\r\n[SSH Disconnected: %v]\r\n", err))
				}
				_ = ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "EOF"))
				return
			}
		}
	}()

	// WebSocket read -> SSH stdin write & resize
	for {
		msgType, msgBytes, err := ws.ReadMessage()
		if err != nil {
			break
		}

		if msgType == websocket.TextMessage {
			// Check if message is a resize command JSON: {"type":"resize","cols":80,"rows":24}
			if strings.HasPrefix(string(msgBytes), `{"type":"resize"`) {
				var resizeCmd struct {
					Type string `json:"type"`
					Cols int    `json:"cols"`
					Rows int    `json:"rows"`
				}
				if jerr := json.Unmarshal(msgBytes, &resizeCmd); jerr == nil && resizeCmd.Cols > 0 && resizeCmd.Rows > 0 {
					_ = session.WindowChange(resizeCmd.Rows, resizeCmd.Cols)
					continue
				}
			}

			// Otherwise, pipe raw text/keystrokes into SSH stdin
			_, _ = stdinPipe.Write(msgBytes)
		}
	}
}
