.DEFAULT_GOAL := help

.PHONY: help install install-frontend install-wails dev dev-web build build-frontend build-dmg build-dmg-universal clean check

# Colors for terminal output
BLUE  := \033[36m
GREEN := \033[32m
RESET := \033[0m

help:
	@printf '%b\n' '${BLUE}Conx Desktop Workstation — Makefile Targets${RESET}'
	@printf '%s\n' ''
	@printf '%b\n' '${GREEN}Development:${RESET}'
	@printf '  %-25s %s\n' 'make dev-web' 'Start web frontend dev server (runs in browser at :5173)'
	@printf '  %-25s %s\n' 'make dev' 'Start native Wails desktop app with live reload'
	@printf '%s\n' ''
	@printf '%b\n' '${GREEN}Installation & Dependencies:${RESET}'
	@printf '  %-25s %s\n' 'make install' 'Install all dependencies (Go modules + npm packages)'
	@printf '  %-25s %s\n' 'make install-frontend' 'Install npm packages in frontend/'
	@printf '  %-25s %s\n' 'make install-wails' 'Install or update Wails v2 CLI'
	@printf '%s\n' ''
	@printf '%b\n' '${GREEN}Building & Packaging:${RESET}'
	@printf '  %-25s %s\n' 'make build-frontend' 'Typecheck and compile frontend to frontend/dist/'
	@printf '  %-25s %s\n' 'make build' 'Compile native desktop executable'
	@printf '  %-25s %s\n' 'make build-dmg' 'Build macOS DMG installer (Apple Silicon darwin/arm64)'
	@printf '  %-25s %s\n' 'make build-dmg-universal' 'Build universal macOS DMG installer (arm64 + x64)'
	@printf '%s\n' ''
	@printf '%b\n' '${GREEN}Quality & Maintenance:${RESET}'
	@printf '  %-25s %s\n' 'make check' 'Run TypeScript typecheck and Go vet'
	@printf '  %-25s %s\n' 'make clean' 'Remove build artifacts and compiled assets'
	@printf '%s\n' ''

# Dependencies
install: install-frontend
	go mod download
	go mod tidy

install-frontend:
	cd frontend && npm install

install-wails:
	go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Development
dev-web:
	@printf '%b\n' '${GREEN}Starting Conx Go API & SSH Gateway (:3333) + Vite Frontend (:5173)...${RESET}'
	@go run ./cmd/server/main.go & SERVER_PID=$$!; \
	trap 'kill $$SERVER_PID 2>/dev/null' EXIT INT TERM; \
	cd frontend && npm run dev

dev:
	wails dev

# Build
build-frontend:
	cd frontend && npm run build

build: build-frontend
	wails build

build-dmg: build-frontend
	wails build -platform darwin/arm64

build-dmg-universal: build-frontend
	wails build -platform darwin/universal

# Quality & Maintenance
check:
	cd frontend && npm run build
	go vet ./...

clean:
	rm -rf build/bin
	rm -rf frontend/dist
	rm -rf *.db *.db-wal *.db-shm
