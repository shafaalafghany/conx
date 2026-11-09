# Conx Desktop Workstation

> **High-Performance Systems, Terminal & Database Workstation for Engineers.**

Conx is a modern, lightweight, cross-platform desktop application built with **Go** and **Wails v2** on the backend and **React 18**, **TypeScript**, **Tailwind CSS**, and **xterm.js** on the frontend. It is designed to be an all-in-one workstation for infrastructure operations, remote server access, database querying, and in-memory cache management.

---

## Key Features

### 🖥️ Virtual Machine & Host Manager
- Manage remote server inventories (hostname, IP, port, credentials, SSH key authentication).
- Real-time host availability probing and health checks.
- One-click live SSH terminal launching.

### ⚡ SSH Terminal & Session Hub
- Powered by `@xterm/xterm` with full ANSI / truecolor support.
- **Persistent Sessions**: Background SSH sessions, running processes, and remote shell states persist seamlessly across navigation switches between tabs.
- Accurate dynamic PTY resizing (`SIGWINCH` synchronization) with automatic layout recalculations to prevent line-wrapping overflows or prompt jumping.
- Multi-tab terminal workflows with session naming and remote status indicators.
- **Log Prettifier**: Select raw or escaped log text directly in the terminal to inspect formatted, highlighted JSON, traces, and timestamps in a dedicated modal.

### 🗄️ Database Management
- Supported engines: **MySQL**, **PostgreSQL**, **SQLite**, and **Oracle**.
- Database explorer: browse schemas, tables, and column structures.
- Multi-tab SQL query console with execution metrics, timing, and error diagnostic banners.
- Result table with pagination, CSV/JSON export, and column-level primary key tagging.
- **Inline Result Editing**: Double-click any cell to edit values directly, preview diffs, and apply `UPDATE` queries safely with primary key identification.

### 🔴 Redis Management
- Connect to standalone Redis instances (with optional DB index, username, and password).
- Real-time Redis server health metrics, memory usage, connected clients, and key counts.
- Key browser with wildcard search/filter, TTL inspection, and deletion.
- Comprehensive data-type support: **String**, **List**, **Set**, **ZSet (Sorted Set)**, and **Hash**.
- Direct value editor with inline item insertion, updates, and removals.

### 🔒 Encrypted Credential Vault
- Local credential storage secured using AES-256-GCM encryption.
- Host credentials, database connection strings, and Redis passwords are kept safely on the local machine.

---

## Tech Stack

- **Backend / Core**: Go (Golang), [Wails v2](https://wails.io/), `golang.org/x/crypto/ssh`, `go-redis/redis/v8`, `go-sql-driver/mysql`, `lib/pq`, `go-sqlite3`, `godror`
- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Terminal**: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- **Desktop Runtime**: Wails Native WebKit (macOS) / WebView2 (Windows)

---

## Prerequisites

- **Go**: 1.21+ installed and configured in your `PATH`
- **Node.js**: 18+ and `npm`
- **Wails CLI v2**:
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

---

## Getting Started

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/shafaalafghany/conx.git
cd conx

# Install Go modules and frontend npm packages
make install
```

### 2. Run in Development Mode

#### Desktop App (Wails Live Reload)
```bash
make dev
```

#### Web Dev Server Mode (Browser at `http://localhost:5173`)
Starts the standalone Go API / SSH WebSocket gateway (`:3333`) and the Vite dev server concurrently:
```bash
make dev-web
```

---

## Building & Packaging

| Target | Command | Output |
| :--- | :--- | :--- |
| **macOS Native Binary** | `make build` | `build/bin/conx.app` |
| **macOS DMG (Apple Silicon arm64)** | `make build-dmg` | `build/bin/conx.dmg` (Ad-hoc signed) |
| **macOS DMG (Universal arm64+x64)** | `make build-dmg-universal` | `build/bin/conx-universal.dmg` |
| **Windows Portable (.exe)** | `make build-win` | `build/bin/conx.exe` (amd64) |
| **Windows ARM64 (.exe)** | `make build-win-arm64` | `build/bin/conx-arm64.exe` |
| **Windows NSIS Installer** | `make build-win-installer` | `build/bin/conx-installer.exe` |

---

## Project Structure

```
conx/
├── cmd/
│   └── server/          # Standalone HTTP/WebSocket server for web dev mode
├── frontend/            # React + TypeScript + Tailwind CSS UI
│   ├── src/
│   │   ├── api/         # Dual Wails/Web API client abstraction
│   │   ├── components/  # VM Grid, Terminal, DB Console, Redis UI, Modals
│   │   └── types/       # TypeScript interfaces
├── pkg/
│   ├── crypto/          # AES-256-GCM vault encryption
│   ├── database/        # Multi-engine SQL drivers & SQLite storage
│   ├── monitor/         # Host ping & health checker
│   ├── redisclient/     # Redis commands & metadata inspector
│   └── ssh/             # SSH client, PTY session manager, stream handlers
├── app.go               # Wails application lifecycle & state
├── app_*.go             # Wails-bound Go controller methods
├── main.go              # Desktop application entrypoint
└── Makefile             # Task automation & build scripts
```

---

## License

Copyright © 2026 Shafa Alafghany. All rights reserved.
