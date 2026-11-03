import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../context/ThemeContext';
import { X, RefreshCw, Terminal as TerminalIcon, Search } from 'lucide-react';
import { isWails, api } from '../api/client';
import { TerminalSearchBar, DirEntry } from './TerminalSearchBar';

interface TerminalViewProps {
  sessionID: string;
  vmID: string;
  vmName: string;
  host: string;
  onClose: (sessionID: string) => void;
  onSendInput: (sessionID: string, data: string) => void;
  onResize: (sessionID: string, cols: number, rows: number) => void;
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
  onClose,
  onSendInput,
  onResize,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const outputBufferRef = useRef<string>('');
  const inputBufferRef = useRef<string>('');
  const lastDetectedPromptPathRef = useRef<string>('');
  const { theme } = useTheme();

  // Search Bar state
  const [showSearchBar, setShowSearchBar] = useState(true);
  const [dirEntries, setDirEntries] = useState<DirEntry[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);

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

  // Parse prompt to auto-detect current directory
  const checkPromptPath = useCallback(
    (chunk: string) => {
      // Append chunk to sliding buffer to handle split packets
      outputBufferRef.current += chunk;
      if (outputBufferRef.current.length > 4096) {
        outputBufferRef.current = outputBufferRef.current.slice(-2048);
      }
      const buffer = outputBufferRef.current;

      let detectedPath: string | null = null;

      // 1. Check OSC Title sequence (Ubuntu/Debian standard on every prompt)
      // e.g.: \x1b]0;user@host: ~/AppGolang/ladrillera-onboarding/logs\x07
      const oscMatch = buffer.match(/\x1b\]0;[^:]+:\s*([~\/][^\x07\x1b]*)(?:\x07|\x1b\\)/);
      if (oscMatch && oscMatch[1]) {
        detectedPath = oscMatch[1].trim();
      }

      // 2. If no OSC match, clean ANSI codes (including bracketed paste ?2004h) and test prompt patterns
      if (!detectedPath) {
        const cleanData = buffer
          .replace(/\x1b\[[0-9;?><=]*[a-zA-Z]/g, '')
          .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
          .replace(/\x1b[@-Z\\-_]/g, '')
          .replace(/[\r\n]+/g, '\n');

        const promptPatterns = [
          /[@\w.-]+:([~\/][^\$#\n\r]*?)[\$#]\s*$/m,
          /\[?[\w.-]+@[\w.-]+[\s:]+([~\/][^\]$#\n\r]*?)\]?[\$#]\s*$/m,
          /:([~\/][^\$#\n\r]*?)[\$#]\s*$/m,
        ];

        for (const pattern of promptPatterns) {
          const promptMatch = cleanData.match(pattern);
          if (promptMatch && promptMatch[1]) {
            detectedPath = promptMatch[1].trim();
            break;
          }
        }
      }

      if (detectedPath && detectedPath !== lastDetectedPromptPathRef.current) {
        lastDetectedPromptPathRef.current = detectedPath;
        listDirectory(detectedPath);
      }
    },
    [listDirectory]
  );

  // Execute command sent by TerminalSearchBar
  const handleExecuteCommand = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      const cmdToSend = trimmed + '\n';
      const isNative = isWails();
      if (isNative) {
        onSendInput(sessionID, cmdToSend);
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(cmdToSend);
      }
      termInstance.current?.focus();
    },
    [sessionID, onSendInput]
  );

  // Toggle search bar with automatic fit reflow
  const toggleSearchBar = useCallback(() => {
    setShowSearchBar((prev) => {
      const next = !prev;
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (e) {}
      }, 60);
      return next;
    });
  }, []);

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
    listDirectory();
  }, [listDirectory]);

  // Terminal lifecycle
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: theme === 'light' ? lightTheme : darkTheme,
      allowTransparency: false,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    termInstance.current = term;
    fitAddonRef.current = fitAddon;

    const isNative = isWails();

    // Initial sizing
    setTimeout(() => {
      try {
        fitAddon.fit();
        if (isNative) {
          onResize(sessionID, term.cols, term.rows);
        }
      } catch (e) {
        // ignore layout race
      }
    }, 100);

    // If running in browser mode (make dev-web), connect via WebSocket bridge
    if (!isNative) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/ssh?vmId=${encodeURIComponent(vmID)}&cols=80&rows=24`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        term.write('\r\n\x1b[32m[Connected via Go SSH Gateway]\x1b[0m\r\n\r\n');
        try {
          fitAddon.fit();
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        } catch (e) {}
      };

      ws.onmessage = (event) => {
        term.write(event.data);
        checkPromptPath(event.data);
      };

      ws.onerror = () => {
        term.write('\r\n\x1b[31m[SSH Connection Failed - check server or credentials]\x1b[0m\r\n');
      };

      ws.onclose = () => {
        term.write('\r\n\x1b[33m[SSH Session Terminated]\x1b[0m\r\n');
      };
    }

    // Keystroke handler
    const dataDisposable = term.onData((data) => {
      if (isNative) {
        onSendInput(sessionID, data);
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }

      // Track typed input to immediately trigger directory re-check on Enter / cd
      if (data === '\r' || data === '\n') {
        const typed = inputBufferRef.current.trim();
        if (typed.startsWith('cd ') || typed === 'cd') {
          setTimeout(() => {
            checkPromptPath(outputBufferRef.current);
          }, 350);
        }
        inputBufferRef.current = '';
      } else if (data === '\x7f' || data === '\b') {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
      } else if (data.length === 1 && data >= ' ') {
        inputBufferRef.current += data;
      }
    });

    // Wails runtime event listener (if in native desktop)
    const wailsRuntime = (window as any).runtime;
    if (isNative && wailsRuntime && wailsRuntime.EventsOn) {
      wailsRuntime.EventsOn(`terminal:output:${sessionID}`, (chunk: string) => {
        term.write(chunk);
        checkPromptPath(chunk);
      });
    }

    // Window resize handler
    const handleWindowResize = () => {
      if (fitAddonRef.current && termInstance.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = termInstance.current;
          if (isNative) {
            onResize(sessionID, cols, rows);
          } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        } catch (e) {}
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      dataDisposable.dispose();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (wailsRuntime && wailsRuntime.EventsOff) {
        wailsRuntime.EventsOff(`terminal:output:${sessionID}`);
      }
      term.dispose();
    };
  }, [sessionID, vmID, onResize, onSendInput, checkPromptPath]);

  // Dynamically update terminal theme on Light/Dark switch
  useEffect(() => {
    if (termInstance.current) {
      termInstance.current.options.theme = theme === 'light' ? lightTheme : darkTheme;
    }
  }, [theme]);

  const handleClear = () => {
    termInstance.current?.clear();
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm dark:bg-slate-900 dark:border-slate-800">
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
            onClick={() => onClose(sessionID)}
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
        dirEntries={dirEntries}
        currentDir={currentDir}
        loadingLogs={loadingLogs}
        onNavigate={listDirectory}
      />

      {/* Terminal Viewport */}
      <div
        ref={terminalRef}
        className="flex-1 w-full p-2 overflow-hidden bg-white dark:bg-slate-950"
      />
    </div>
  );
};
