import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';
import { X, RefreshCw, Terminal as TerminalIcon, Search, Sparkles } from 'lucide-react';
import { isWails, api } from '../api/client';
import { TerminalSearchBar, DirEntry } from './TerminalSearchBar';
import { PrettifyModal } from './terminal/PrettifyModal';

interface TerminalViewProps {
  sessionID: string;
  vmID: string;
  vmName: string;
  host: string;
  isActive?: boolean;
  onClose: (sessionID: string) => void;
  onSendInput?: (sessionID: string, data: string) => void;
  onResize?: (sessionID: string, cols: number, rows: number) => void;
}

// Light theme tokens (Default)
const lightTheme = {
  background: '#ffffff',
  foreground: '#1e293b', // slate-800
  cursor: '#2563eb',     // blue-600
  cursorAccent: '#ffffff',
  selectionBackground: '#bfdbfe', // blue-200
  black: '#0f172a',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#64748b',
  brightBlack: '#475569',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#0f172a',
};

// Dark theme tokens
const darkTheme = {
  background: '#0f172a', // slate-950
  foreground: '#f8fafc', // slate-100
  cursor: '#60a5fa',     // blue-400
  cursorAccent: '#0f172a',
  selectionBackground: '#1e3a8a', // blue-900
  black: '#020617',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#f1f5f9',
  brightBlack: '#64748b',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
};

export const TerminalView: React.FC<TerminalViewProps> = ({
  sessionID,
  vmID,
  vmName,
  host,
  isActive = true,
  onClose,
  onSendInput,
  onResize,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wailsSessionIdRef = useRef<string>('');
  const outputBufferRef = useRef<string>('');
  const lastDirRef = useRef<string>(
    typeof window !== 'undefined'
      ? localStorage.getItem(`terminal-lastdir-${vmID}`) || ''
      : ''
  );
  const { theme } = useTheme();

  // Search Bar state
  const [showSearchBar, setShowSearchBar] = useState(true);
  const [dirEntries, setDirEntries] = useState<DirEntry[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Prettify Log / Selection state
  const [selectedText, setSelectedText] = useState<string>('');
  const [showPrettify, setShowPrettify] = useState<boolean>(false);
  const lastSelectedTextRef = useRef<string>('');

  // Fetch directory listing via Go backend (dual-mode Wails/REST)
  const listDirectory = useCallback(
    async (dir?: string) => {
      setLoadingLogs(true);
      try {
        const res = await api.listFiles(vmID, dir || '');
        if (res) {
          if (res.entries) {
            setDirEntries(res.entries);
          }
          if (res.directory) {
            setCurrentDir(res.directory);
            lastDirRef.current = res.directory;
            try {
              localStorage.setItem(`terminal-lastdir-${vmID}`, res.directory);
            } catch {}
          }
        }
      } catch (err) {
        console.warn('[TerminalView] Failed to list files:', err);
      } finally {
        setLoadingLogs(false);
      }
    },
    [vmID]
  );

  // Parse prompt to detect current working directory
  const checkPromptPath = useCallback(
    (chunk: string) => {
      outputBufferRef.current += chunk;
      if (outputBufferRef.current.length > 4096) {
        outputBufferRef.current = outputBufferRef.current.slice(-2048);
      }

      // Check both the incoming chunk and the sliding buffer
      const candidates = [chunk, outputBufferRef.current];

      const promptPatterns = [
        /[@\w.-]+:([~\/][^\$#\n\r]*?)[\$#]\s*$/m,
        /\[?[\w.-]+@[\w.-]+[\s:]+([~\/][^\]$#\n\r]*?)\]?[\$#]\s*$/m,
        /:([~\/][^\$#\n\r]*?)[\$#]\s*$/m,
      ];

      for (const text of candidates) {
        // Strip ANSI escape codes
        const cleanData = text
          .replace(/\x1b\[[0-9;?><=]*[a-zA-Z]/g, '')
          .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
          .replace(/\x1b[@-Z\\-_]/g, '');

        for (const pattern of promptPatterns) {
          const promptMatch = cleanData.match(pattern);
          if (promptMatch && promptMatch[1]) {
            const detectedPath = promptMatch[1].trim();
            if (detectedPath && detectedPath !== lastDirRef.current) {
              lastDirRef.current = detectedPath;
              try {
                localStorage.setItem(`terminal-lastdir-${vmID}`, detectedPath);
              } catch {}
              listDirectory(detectedPath);
              return;
            }
          }
        }
      }
    },
    [vmID, listDirectory]
  );

  // Send Ctrl+C to interrupt active foreground process
  const handleInterrupt = useCallback(() => {
    const isNative = isWails();
    const targetId = wailsSessionIdRef.current || sessionID;
    if (isNative && targetId) {
      api.sendTerminalInput(targetId, '\x03').catch(() => {});
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('\x03');
    }
    termInstance.current?.focus();
  }, [sessionID]);

  // Execute command sent by TerminalSearchBar
  const handleExecuteCommand = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      const isNative = isWails();
      const targetId = wailsSessionIdRef.current || sessionID;

      // 1. Send Ctrl+C (\x03) first to interrupt any active foreground process (like tail -f)
      if (isNative && targetId) {
        api.sendTerminalInput(targetId, '\x03').catch(() => {});
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('\x03');
      }

      // 2. Wait 150ms for shell prompt to return before executing the new command
      setTimeout(() => {
        const cmdToSend = trimmed + '\n';
        if (isNative) {
          if (targetId) {
            api.sendTerminalInput(targetId, cmdToSend).catch(() => {});
          }
          if (onSendInput) onSendInput(sessionID, cmdToSend);
        } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(cmdToSend);
        }
        termInstance.current?.focus();
      }, 150);
    },
    [sessionID, onSendInput]
  );

  // Toggle search bar with automatic fit reflow
  const toggleSearchBar = useCallback(() => {
    setShowSearchBar((prev) => {
      const next = !prev;
      if (next) {
        const cwd = currentDir || lastDirRef.current || undefined;
        if (dirEntries.length === 0 || (cwd && cwd !== currentDir)) {
          setTimeout(() => listDirectory(cwd), 100);
        }
      }
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (e) {}
      }, 60);
      return next;
    });
  }, [currentDir, dirEntries.length, listDirectory]);

  // Keyboard shortcut Ctrl+Shift+F to toggle search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        toggleSearchBar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearchBar]);

  // Initial directory load
  useEffect(() => {
    const initialDir = lastDirRef.current || undefined;
    listDirectory(initialDir);
  }, [listDirectory]);

  // Re-fit on tab activation
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          const term = termInstance.current;
          if (term && term.cols > 0 && term.rows > 0) {
            if (isWails() && wailsSessionIdRef.current) {
              api.resizeTerminal(wailsSessionIdRef.current, term.cols, term.rows).catch(() => {});
            } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
            }
          }
          term?.focus();
        } catch (e) {}
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  // Terminal lifecycle
  useEffect(() => {
    if (!terminalRef.current) return;

    let isDisposed = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: theme === 'light' ? lightTheme : darkTheme,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    termInstance.current = term;
    fitAddonRef.current = fitAddon;

    const isNative = isWails();

    // Sync PTY dimensions helper
    const syncPtySize = (cols: number, rows: number) => {
      if (isDisposed || cols <= 0 || rows <= 0) return;
      if (isNative) {
        if (wailsSessionIdRef.current) {
          api.resizeTerminal(wailsSessionIdRef.current, cols, rows).catch(() => {});
        }
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
      if (onResize) onResize(sessionID, cols, rows);
    };

    // Fit terminal to container with direct DOM clientWidth/clientHeight fallback
    const fitTerminal = (): { cols: number; rows: number } => {
      const container = terminalRef.current;
      if (!container || !termInstance.current || !fitAddonRef.current) {
        return { cols: term.cols || 80, rows: term.rows || 24 };
      }

      try {
        fitAddonRef.current.fit();
      } catch (e) {}

      // Fallback if proposeDimensions failed because computed style was 'auto' or cell width was 0
      const rect = container.getBoundingClientRect();
      const width = container.clientWidth || rect.width;
      const height = container.clientHeight || rect.height;
      if (width > 100 && height > 50) {
        const core = (term as any)._core;
        const cellW = core?._renderService?.dimensions?.css?.cell?.width || 7.83;
        const cellH = core?._renderService?.dimensions?.css?.cell?.height || 16;
        const scrollBarW = 15;
        const computedCols = Math.max(2, Math.floor((width - scrollBarW) / cellW));
        const computedRows = Math.max(1, Math.floor(height / cellH));

        if (
          (term.cols === 80 && computedCols !== 80) ||
          Math.abs(term.cols - computedCols) > 2 ||
          Math.abs(term.rows - computedRows) > 1
        ) {
          try {
            const proposed = fitAddonRef.current.proposeDimensions();
            if (proposed && proposed.cols > 0 && proposed.rows > 0 && !isNaN(proposed.cols) && !isNaN(proposed.rows)) {
              if (term.cols !== proposed.cols || term.rows !== proposed.rows) {
                term.resize(proposed.cols, proposed.rows);
              }
            } else {
              term.resize(computedCols, computedRows);
            }
          } catch {
            try {
              term.resize(computedCols, computedRows);
            } catch {}
          }
        }
      }

      return {
        cols: term.cols > 0 ? term.cols : 80,
        rows: term.rows > 0 ? term.rows : 24,
      };
    };

    // Responsive fit & remote PTY resize handler
    const doFitAndResize = () => {
      if (isDisposed) return;
      const { cols, rows } = fitTerminal();
      syncPtySize(cols, rows);
    };

    // Automatically notify remote PTY whenever xterm dimensions change
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      syncPtySize(cols, rows);
    });

    // Wait one animation frame + layout tick so container dimensions are painted before requesting SSH PTY
    const connectTimer = setTimeout(() => {
      if (isDisposed) return;
      const { cols: initialCols, rows: initialRows } = fitTerminal();
      let firstPromptSynced = false;

      if (isNative) {
        term.write(`\r\n\x1b[36m[Connecting to ${host} via SSH...]\x1b[0m\r\n`);

        api.startSSHSession(vmID, initialCols, initialRows)
          .then((realSessionID) => {
            if (isDisposed) {
              api.closeSSHSession(realSessionID).catch(() => {});
              return;
            }
            wailsSessionIdRef.current = realSessionID;

            const wailsRuntime = (window as any).runtime;
            if (wailsRuntime && wailsRuntime.EventsOn) {
              wailsRuntime.EventsOn(`terminal:output:${realSessionID}`, (chunk: string) => {
                term.write(chunk);
                checkPromptPath(chunk);

                // As soon as the remote shell outputs its first prompt ($ or #),
                // bash/readline is initialized and ready for SIGWINCH window-change.
                if (!firstPromptSynced && (chunk.includes('$') || chunk.includes('#'))) {
                  firstPromptSynced = true;
                  doFitAndResize();
                  timers.push(setTimeout(doFitAndResize, 150));
                }
              });
            }

            term.write(`\x1b[32m[Connected to ${host}]\x1b[0m\r\n\r\n`);

            // Sync terminal dimensions across shell startup stages
            doFitAndResize();
            timers.push(setTimeout(doFitAndResize, 150));
            timers.push(setTimeout(doFitAndResize, 500));
            timers.push(setTimeout(doFitAndResize, 1000));
            timers.push(setTimeout(doFitAndResize, 2000));
          })
          .catch((err) => {
            if (isDisposed) return;
            console.error('[TerminalView] Native SSH start error:', err);
            term.write(`\r\n\x1b[31m[SSH Connection Failed: ${err?.message || err}]\x1b[0m\r\n`);
          });
      } else {
        // Browser mode (make dev-web): connect via WebSocket bridge
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/ws/ssh?vmId=${encodeURIComponent(vmID)}&cols=${initialCols}&rows=${initialRows}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          term.write('\r\n\x1b[32m[Connected via Go SSH Gateway]\x1b[0m\r\n\r\n');
          doFitAndResize();
          timers.push(setTimeout(doFitAndResize, 150));
          timers.push(setTimeout(doFitAndResize, 500));
          timers.push(setTimeout(doFitAndResize, 1000));
        };

        ws.onmessage = (event) => {
          const chunk = String(event.data || '');
          term.write(chunk);
          checkPromptPath(chunk);
          if (!firstPromptSynced && (chunk.includes('$') || chunk.includes('#'))) {
            firstPromptSynced = true;
            doFitAndResize();
            timers.push(setTimeout(doFitAndResize, 150));
          }
        };

        ws.onerror = () => {
          term.write('\r\n\x1b[31m[SSH Connection Failed - check server or credentials]\x1b[0m\r\n');
        };

        ws.onclose = () => {
          term.write('\r\n\x1b[33m[SSH Session Terminated]\x1b[0m\r\n');
        };
      }
    }, 50);
    timers.push(connectTimer);

    // Keystroke handler (forward raw data directly to remote shell)
    const dataDisposable = term.onData((data) => {
      if (isNative) {
        const targetId = wailsSessionIdRef.current;
        if (targetId) {
          api.sendTerminalInput(targetId, data).catch(() => {});
        }
        if (onSendInput) onSendInput(sessionID, data);
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // Detect text selection for Prettify Log feature
    const selectionDisposable = term.onSelectionChange(() => {
      const selection = term.getSelection() || '';
      setSelectedText(selection);
      if (selection.trim()) {
        lastSelectedTextRef.current = selection;
      }
    });

    window.addEventListener('resize', doFitAndResize);

    // Observe container size changes (e.g. sidebar collapse, search bar toggle, fullscreen toggle)
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && terminalRef.current) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(doFitAndResize);
      });
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      isDisposed = true;
      timers.forEach((t) => clearTimeout(t));
      window.removeEventListener('resize', doFitAndResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      resizeDisposable.dispose();
      dataDisposable.dispose();
      selectionDisposable.dispose();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (isNative) {
        const targetId = wailsSessionIdRef.current;
        const wailsRuntime = (window as any).runtime;
        if (wailsRuntime && wailsRuntime.EventsOff && targetId) {
          wailsRuntime.EventsOff(`terminal:output:${targetId}`);
        }
        if (targetId) {
          api.closeSSHSession(targetId).catch(() => {});
        }
      }
      term.dispose();
    };
  }, [sessionID, vmID, host, onResize, onSendInput, checkPromptPath]);

  // Dynamically update terminal theme on Light/Dark switch
  useEffect(() => {
    if (termInstance.current) {
      termInstance.current.options.theme = theme === 'light' ? lightTheme : darkTheme;
    }
  }, [theme]);

  // Re-fit terminal whenever tab becomes active (e.g. switching back from Database/Redis or between terminal tabs)
  useEffect(() => {
    if (isActive && termInstance.current) {
      const timer = setTimeout(() => {
        try {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit();
          }
          const term = termInstance.current;
          const targetId = wailsSessionIdRef.current;
          if (term && targetId && isWails()) {
            api.resizeTerminal(targetId, term.cols, term.rows).catch(() => {});
          }
        } catch {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const handleClear = () => {
    termInstance.current?.clear();
  };

  const handleClose = () => {
    const targetId = wailsSessionIdRef.current;
    if (isWails() && targetId) {
      api.closeSSHSession(targetId).catch(() => {});
    }
    onClose(sessionID);
  };

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm dark:bg-slate-900 dark:border-slate-800">
      {/* Session Header */}
      <div className="h-10 px-4 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between dark:bg-slate-950 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {vmName}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            ({host})
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Connected
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Prettify Button (quick header action when text is selected) */}
          {selectedText && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPrettify(true)}
              title="Prettify selected text (JSON / Logs)"
              className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1 transition-all active:scale-95 cursor-pointer mr-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Prettify</span>
            </button>
          )}

          {/* Toggle Search Bar Button */}
          <button
            onClick={toggleSearchBar}
            title={showSearchBar ? 'Hide Command Builder (Ctrl+Shift+F)' : 'Show Command Builder (Ctrl+Shift+F)'}
            className={`p-1.5 rounded transition-colors flex items-center gap-1 text-xs font-medium ${
              showSearchBar
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'hover:bg-slate-200 text-slate-500 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden sm:inline">Search</span>
          </button>

          {/* Clear Buffer */}
          <button
            onClick={handleClear}
            title="Clear buffer"
            className="p-1.5 rounded hover:bg-slate-200 text-slate-500 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Close Session */}
          <button
            onClick={handleClose}
            title="Disconnect & Close Session"
            className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Search Bar (Jenis Search...) */}
      <TerminalSearchBar
        visible={showSearchBar}
        onToggle={toggleSearchBar}
        onExecute={handleExecuteCommand}
        onInterrupt={handleInterrupt}
        dirEntries={dirEntries}
        currentDir={currentDir}
        loadingLogs={loadingLogs}
        onNavigate={listDirectory}
      />

      {/* Selection Action Bar (Toolbar that appears whenever text is blocked/selected) */}
      {selectedText && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100/95 border-b border-slate-200 dark:bg-slate-900/95 dark:border-slate-800 transition-all z-20">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPrettify(true)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md shadow-sm transition-all bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 cursor-pointer"
              title="Format & prettify selected text"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Prettify</span>
            </button>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              ({selectedText.length} characters selected)
            </span>
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              termInstance.current?.clearSelection();
              setSelectedText('');
            }}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Terminal Viewport */}
      <div className="flex-1 w-full min-h-0 overflow-hidden relative flex flex-col px-3.5 py-2.5 bg-white dark:bg-slate-950">
        {selectedText && (
          <div className="absolute top-3 right-5 z-20">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPrettify(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all transform hover:scale-105 active:scale-95 border border-emerald-400/30 cursor-pointer"
              title="Format & prettify selected text"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Prettify</span>
            </button>
          </div>
        )}

        <div
          ref={terminalRef}
          className="flex-1 w-full h-full min-h-0 overflow-hidden"
        />
      </div>

      {/* Prettify Log Modal */}
      <PrettifyModal
        isOpen={showPrettify}
        onClose={() => setShowPrettify(false)}
        rawText={selectedText || lastSelectedTextRef.current}
      />
    </div>
  );
};
