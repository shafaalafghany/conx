package ssh

import (
	"fmt"
	"net"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// DirEntry represents a file or directory on the remote system
type DirEntry struct {
	Name  string `json:"name"`
	IsDir bool   `json:"isDir"`
	Path  string `json:"path"`
}

// FileListResult represents the response for directory listing
type FileListResult struct {
	Directory string     `json:"directory"`
	Entries   []DirEntry `json:"entries"`
	Error     string     `json:"error,omitempty"`
}

// ListRemoteFiles connects via SSH to the remote host and inspects the specified directory
// Matches manager-system-internal implementation
func ListRemoteFiles(host string, port int, user string, password string, keyData string, targetDir string) (string, []DirEntry, error) {
	if port <= 0 {
		port = 22
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
		return "", nil, fmt.Errorf("no authentication method provided")
	}

	config := &ssh.ClientConfig{
		User:            user,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}

	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return "", nil, fmt.Errorf("ssh dial failed: %w", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", nil, fmt.Errorf("failed to create ssh session: %w", err)
	}
	defer session.Close()

	marker := fmt.Sprintf("__LS_START_%d__", time.Now().UnixNano())
	endMarker := fmt.Sprintf("__LS_END_%d__", time.Now().UnixNano())

	// Use eval to expand ~ properly, fallback to direct cd (exactly like manager-system-internal)
	cdCmd := `eval cd ~`
	if targetDir != "" {
		if strings.HasPrefix(targetDir, "~") {
			cdCmd = fmt.Sprintf("eval cd %s", targetDir)
		} else {
			cdCmd = fmt.Sprintf(`cd "%s"`, targetDir)
		}
	}

	cmd := fmt.Sprintf(`echo '%s' && %s 2>/dev/null && pwd && echo "---" && ls -1tp 2>/dev/null && echo '%s'`, marker, cdCmd, endMarker)

	outputBytes, err := session.CombinedOutput(cmd)
	if err != nil && len(outputBytes) == 0 {
		return "", nil, fmt.Errorf("command execution failed: %w", err)
	}

	output := string(outputBytes)
	startIdx := strings.Index(output, marker)
	endIdx := strings.Index(output, endMarker)

	var clean string
	if startIdx >= 0 && endIdx >= 0 && endIdx > startIdx {
		clean = strings.TrimSpace(output[startIdx+len(marker) : endIdx])
	} else {
		clean = strings.TrimSpace(output)
	}

	lines := strings.Split(clean, "\n")
	resolvedDir := "/"
	if len(lines) > 0 && strings.TrimSpace(lines[0]) != "" {
		firstLine := strings.TrimSpace(lines[0])
		if strings.HasPrefix(firstLine, "/") || strings.HasPrefix(firstLine, "~") {
			resolvedDir = firstLine
		}
	}
	if resolvedDir == "/" && targetDir != "" {
		resolvedDir = targetDir
	}

	sepIdx := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == "---" {
			sepIdx = i
			break
		}
	}

	var rawEntries []string
	if sepIdx >= 0 && sepIdx+1 < len(lines) {
		rawEntries = lines[sepIdx+1:]
	} else if len(lines) > 1 {
		rawEntries = lines[1:]
	}

	var entries []DirEntry
	for _, raw := range rawEntries {
		name := strings.TrimSpace(raw)
		if name == "" || name == "---" {
			continue
		}
		isDir := strings.HasSuffix(name, "/")
		cleanName := strings.TrimSuffix(name, "/")
		if cleanName == "." || cleanName == ".." {
			continue
		}

		fullPath := strings.TrimRight(resolvedDir, "/") + "/" + cleanName

		entries = append(entries, DirEntry{
			Name:  cleanName,
			IsDir: isDir,
			Path:  fullPath,
		})
	}

	return resolvedDir, entries, nil
}
