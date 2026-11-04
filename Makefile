.DEFAULT_GOAL := help

.PHONY: help install install-frontend install-wails dev dev-web build build-frontend build-dmg build-dmg-universal build-win build-win-arm64 build-win-installer clean check

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
	@printf '  %-25s %s\n' 'make build-win' 'Cross-compile Windows portable executable (windows/amd64 .exe)'
	@printf '  %-25s %s\n' 'make build-win-arm64' 'Cross-compile Windows ARM64 executable (windows/arm64 .exe)'
	@printf '  %-25s %s\n' 'make build-win-installer' 'Build Windows NSIS installer (requires brew install makensis)'
	@printf '%s\n' ''
	@printf '%b\n' '${GREEN}Quality & Maintenance:${RESET}'
	@printf '  %-25s %s\n' 'make check' 'Run TypeScript typecheck and Go vet'
	@printf '  %-25s %s\n' 'make clean' 'Remove build artifacts and compiled assets'
	@printf '%s\n' ''

GOPATH ?= $(shell go env GOPATH)
WAILS  ?= $(shell which wails 2>/dev/null || echo $(GOPATH)/bin/wails)

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
	@mkdir -p build/bin
	@go build -o build/bin/conx-server ./cmd/server
	@./build/bin/conx-server & SERVER_PID=$$!; \
	trap 'kill $$SERVER_PID 2>/dev/null' EXIT INT TERM; \
	sleep 0.5; \
	cd frontend && npm run dev

dev:
	$(WAILS) dev

# Build
build-frontend:
	cd frontend && npm run build

build: build-frontend
	$(WAILS) build

build-app: build-frontend
	$(WAILS) build -platform darwin/arm64

build-dmg: build-app
	@printf '%b\n' '${GREEN}Packaging macOS DMG installer...${RESET}'
	@rm -rf build/dmg-stage build/bin/conx.dmg
	@mkdir -p build/dmg-stage
	@cp -r build/bin/conx.app build/dmg-stage/
	@ln -s /Applications build/dmg-stage/Applications
	@hdiutil create -volname "Conx" -srcfolder build/dmg-stage -ov -format UDZO build/bin/conx.dmg
	@rm -rf build/dmg-stage
	@printf '%b\n' '${GREEN}DMG built successfully: build/bin/conx.dmg${RESET}'

build-dmg-universal: build-frontend
	$(WAILS) build -platform darwin/universal
	@printf '%b\n' '${GREEN}Packaging Universal macOS DMG installer...${RESET}'
	@rm -rf build/dmg-stage build/bin/conx-universal.dmg
	@mkdir -p build/dmg-stage
	@cp -r build/bin/conx.app build/dmg-stage/
	@ln -s /Applications build/dmg-stage/Applications
	@hdiutil create -volname "Conx" -srcfolder build/dmg-stage -ov -format UDZO build/bin/conx-universal.dmg
	@rm -rf build/dmg-stage
	@printf '%b\n' '${GREEN}Universal DMG built successfully: build/bin/conx-universal.dmg${RESET}'

build-win: build-frontend
	@printf '%b\n' '${GREEN}Cross-compiling Windows x64 executable (windows/amd64)...${RESET}'
	$(WAILS) build -platform windows/amd64 -o conx.exe
	@printf '%b\n' '${GREEN}Windows executable built successfully: build/bin/conx.exe${RESET}'

build-win-arm64: build-frontend
	@printf '%b\n' '${GREEN}Cross-compiling Windows ARM64 executable (windows/arm64)...${RESET}'
	$(WAILS) build -platform windows/arm64 -o conx-arm64.exe
	@printf '%b\n' '${GREEN}Windows ARM64 executable built successfully: build/bin/conx-arm64.exe${RESET}'

build-win-installer: build-frontend
	@if ! command -v makensis >/dev/null 2>&1; then \
		printf '%s\n' 'Error: makensis not found. Install it first on macOS via: brew install makensis'; \
		exit 1; \
	fi
	@printf '%b\n' '${GREEN}Building Windows NSIS installer (windows/amd64)...${RESET}'
	$(WAILS) build -platform windows/amd64 -nsis
	@printf '%b\n' '${GREEN}Windows installer built in: build/bin/${RESET}'

# Quality & Maintenance
check:
	cd frontend && npm run build
	go vet ./...

clean:
	rm -rf build/bin
	rm -rf frontend/dist
	rm -rf *.db *.db-wal *.db-shm
