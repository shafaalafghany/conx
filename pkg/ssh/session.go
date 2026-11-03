package ssh

import (
	"context"
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// Session represents an active interactive SSH terminal session
type Session struct {
	ID        string
	Client    *ssh.Client
	Session   *ssh.Session
	Stdin     io.WriteCloser
	Stdout    io.Reader
	cancel    context.CancelFunc
	closeOnce sync.Once
}

// Manager coordinates all active SSH terminal connections
type Manager struct {
	mu           sync.RWMutex
	sessions     map[string]*Session
	outputSender func(sessionID string, chunk string)
}

// NewManager creates a new SSH session manager
func NewManager(outputSender func(sessionID string, chunk string)) *Manager {
	return &Manager{
		sessions:     make(map[string]*Session),
		outputSender: outputSender,
	}
}

// ConnectOptions contains connection parameters for establishing SSH
type ConnectOptions struct {
	SessionID string
	Host      string
	Port      int
	Username  string
	Password  string
	KeyData   string
	Cols      int
	Rows      int
}

// StartSession initiates an SSH connection, requests a PTY, and spawns the remote shell
func (m *Manager) StartSession(opts ConnectOptions) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[opts.SessionID]; exists {
		return fmt.Errorf("session %s is already active", opts.SessionID)
	}

	var authMethods []ssh.AuthMethod
	if opts.Password != "" {
		authMethods = append(authMethods, ssh.Password(opts.Password))
	}
	if opts.KeyData != "" {
		signer, err := ssh.ParsePrivateKey([]byte(opts.KeyData))
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	}

	if len(authMethods) == 0 {
		return fmt.Errorf("no authentication method provided (password or private key required)")
	}

	config := &ssh.ClientConfig{
		User:            opts.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // Dev & internal workstation default
		Timeout:         10 * time.Second,
	}

	addr := net.JoinHostPort(opts.Host, fmt.Sprintf("%d", opts.Port))
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return fmt.Errorf("failed to dial ssh host %s: %w", addr, err)
	}

	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return fmt.Errorf("failed to create session: %w", err)
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	cols := opts.Cols
	if cols <= 0 {
		cols = 80
	}
	rows := opts.Rows
	if rows <= 0 {
		rows = 24
	}

	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		session.Close()
		client.Close()
		return fmt.Errorf("failed to request pty: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return fmt.Errorf("failed to get stdin pipe: %w", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		client.Close()
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	if err := session.Shell(); err != nil {
		session.Close()
		client.Close()
		return fmt.Errorf("failed to spawn remote shell: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	sess := &Session{
		ID:      opts.SessionID,
		Client:  client,
		Session: session,
		Stdin:   stdin,
		Stdout:  stdout,
		cancel:  cancel,
	}

	m.sessions[opts.SessionID] = sess

	// Background worker reading stdout/stderr and streaming chunks to frontend
	go m.streamStdout(ctx, sess)

	return nil
}

// streamStdout reads from the SSH stdout pipe and pushes to the Wails event bus
func (m *Manager) streamStdout(ctx context.Context, s *Session) {
	buf := make([]byte, 4096)
	for {
		select {
		case <-ctx.Done():
			return
		default:
			n, err := s.Stdout.Read(buf)
			if n > 0 && m.outputSender != nil {
				m.outputSender(s.ID, string(buf[:n]))
			}
			if err != nil {
				// EOF or session closed
				return
			}
		}
	}
}

// WriteInput sends keystrokes or text from the frontend into the remote SSH stdin pipe
func (m *Manager) WriteInput(sessionID string, data string) error {
	m.mu.RLock()
	sess, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
	}

	_, err := sess.Stdin.Write([]byte(data))
	return err
}

// Resize updates the remote PTY dimensions when the frontend terminal window changes size
func (m *Manager) Resize(sessionID string, cols int, rows int) error {
	m.mu.RLock()
	sess, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
	}

	return sess.Session.WindowChange(rows, cols)
}

// CloseSession terminates an active SSH session and frees its sockets
func (m *Manager) CloseSession(sessionID string) error {
	m.mu.Lock()
	sess, exists := m.sessions[sessionID]
	if exists {
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()

	if !exists {
		return nil
	}

	sess.closeOnce.Do(func() {
		sess.cancel()
		if sess.Stdin != nil {
			_ = sess.Stdin.Close()
		}
		if sess.Session != nil {
			_ = sess.Session.Close()
		}
		if sess.Client != nil {
			_ = sess.Client.Close()
		}
	})

	return nil
}

// CloseAll cleanly terminates all active sessions (called during application shutdown)
func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, sess := range m.sessions {
		sess.closeOnce.Do(func() {
			sess.cancel()
			if sess.Stdin != nil {
				_ = sess.Stdin.Close()
			}
			if sess.Session != nil {
				_ = sess.Session.Close()
			}
			if sess.Client != nil {
				_ = sess.Client.Close()
			}
		})
		delete(m.sessions, id)
	}
}
