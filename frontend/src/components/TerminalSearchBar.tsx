import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  FileText,
  Folder,
  ArrowUp,
  Play,
  X,
  ChevronDown,
  Loader2,
  Terminal as TerminalIcon,
  FolderOpen,
} from 'lucide-react';

export interface SearchPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  buildCommand: (keyword: string, logFile: string) => string;
  placeholder: string;
  needsKeyword: boolean;
}

export const SEARCH_PRESETS: SearchPreset[] = [
  {
    id: 'grep-keyword',
    label: 'Search Keyword',
    description: 'Cari keyword dengan highlight warna',
    icon: '🔍',
    buildCommand: (keyword, logFile) =>
      `grep --color=always -in "${keyword}" "${logFile}"`,
    placeholder: 'error|warning|timeout',
    needsKeyword: true,
  },
  {
    id: 'tail-grep',
    label: 'Live Tail + Search',
    description: 'Monitor real-time + filter (Ctrl+C stop)',
    icon: '📡',
    buildCommand: (keyword, logFile) =>
      `tail -n 50 -f "${logFile}" | grep --color=always --line-buffered -i "${keyword}"`,
    placeholder: 'error|fatal|panic',
    needsKeyword: true,
  },
  {
    id: 'grep-context',
    label: 'Search + Context (±5 lines)',
    description: 'Keyword + 5 baris sebelum & sesudah',
    icon: '📋',
    buildCommand: (keyword, logFile) =>
      `grep --color=always -in -B5 -A5 "${keyword}" "${logFile}"`,
    placeholder: 'exception|stack|trace',
    needsKeyword: true,
  },
  {
    id: 'grep-count',
    label: 'Count Occurrences',
    description: 'Hitung jumlah kemunculan',
    icon: '🔢',
    buildCommand: (keyword, logFile) =>
      `grep -ic "${keyword}" "${logFile}"`,
    placeholder: 'error|404|500',
    needsKeyword: true,
  },
  {
    id: 'grep-multi',
    label: 'Multiple Keywords (OR)',
    description: 'Cari beberapa keyword sekaligus',
    icon: '🎯',
    buildCommand: (keyword, logFile) =>
      `grep --color=always -inE "${keyword}" "${logFile}"`,
    placeholder: 'error|warning|fatal (pisah |)',
    needsKeyword: true,
  },
  {
    id: 'grep-exclude',
    label: 'Exclude Keyword',
    description: 'Tampilkan semua KECUALI keyword',
    icon: '🚫',
    buildCommand: (keyword, logFile) =>
      `grep --color=always -inv "${keyword}" "${logFile}"`,
    placeholder: 'DEBUG|INFO|health_check',
    needsKeyword: true,
  },
  {
    id: 'grep-timestamp',
    label: 'Search by Time',
    description: 'Filter berdasarkan waktu',
    icon: '🕐',
    buildCommand: (keyword, logFile) =>
      `grep --color=always -in "${keyword}" "${logFile}"`,
    placeholder: '2026-05-07 10:|15:30',
    needsKeyword: true,
  },
  {
    id: 'grep-errors',
    label: 'Errors Only',
    description: 'Filter ERROR/FATAL/PANIC/CRITICAL',
    icon: '🔴',
    buildCommand: (_keyword, logFile) =>
      `grep --color=always -inE "(error|fatal|panic|critical)" "${logFile}"`,
    placeholder: '(otomatis)',
    needsKeyword: false,
  },
  {
    id: 'grep-warnings',
    label: 'Warnings Only',
    description: 'Filter WARNING/WARN',
    icon: '🟡',
    buildCommand: (_keyword, logFile) =>
      `grep --color=always -inE "(warn|warning)" "${logFile}"`,
    placeholder: '(otomatis)',
    needsKeyword: false,
  },
  {
    id: 'tail-lines',
    label: 'Last N Lines',
    description: 'Tampilkan N baris terakhir',
    icon: '📄',
    buildCommand: (keyword, logFile) =>
      `tail -n ${keyword || '100'} "${logFile}"`,
    placeholder: '100',
    needsKeyword: false,
  },
  {
    id: 'tail-live',
    label: 'Live Tail (All)',
    description: 'Monitor semua output (Ctrl+C stop)',
    icon: '🔄',
    buildCommand: (_keyword, logFile) =>
      `tail -n 50 -f "${logFile}"`,
    placeholder: '(otomatis)',
    needsKeyword: false,
  },
  {
    id: 'top-errors',
    label: 'Top Errors (Ranking)',
    description: 'Error paling sering muncul',
    icon: '🏆',
    buildCommand: (keyword, logFile) =>
      `grep -i "${keyword || 'error'}" "${logFile}" | sort | uniq -c | sort -rn | head -20`,
    placeholder: 'error|fatal',
    needsKeyword: false,
  },
  {
    id: 'grep-http',
    label: 'HTTP Status Codes',
    description: 'Cari 4xx, 5xx response codes',
    icon: '🌐',
    buildCommand: (keyword, logFile) =>
      `grep --color=always -inE "\\b(${keyword || '500|502|503|404'})\\b" "${logFile}"`,
    placeholder: '500|502|503|404',
    needsKeyword: false,
  },
  {
    id: 'cat-file',
    label: 'View File (cat)',
    description: 'Lihat seluruh isi file',
    icon: '👁️',
    buildCommand: (_keyword, logFile) =>
      `cat "${logFile}"`,
    placeholder: '(otomatis)',
    needsKeyword: false,
  },
  {
    id: 'head-file',
    label: 'Head (First N lines)',
    description: 'Lihat N baris pertama file',
    icon: '⬆️',
    buildCommand: (keyword, logFile) =>
      `head -n ${keyword || '50'} "${logFile}"`,
    placeholder: '50',
    needsKeyword: false,
  },
  {
    id: 'less-file',
    label: 'Less (Scrollable)',
    description: 'Buka file dengan scroll (q untuk keluar)',
    icon: '📖',
    buildCommand: (_keyword, logFile) =>
      `less -R "${logFile}"`,
    placeholder: '(otomatis)',
    needsKeyword: false,
  },
  {
    id: 'cd-dir',
    label: 'CD (Pindah Folder)',
    description: 'Pindah ke folder yang sedang dibuka di file browser',
    icon: '📂',
    buildCommand: (_keyword, logFile) =>
      `cd "${logFile}"`,
    placeholder: '(pilih folder dari file browser)',
    needsKeyword: false,
  },
];

export interface DirEntry {
  name: string;
  isDir: boolean;
  path: string;
}

export interface TerminalSearchBarProps {
  onExecute: (command: string) => void;
  visible: boolean;
  onToggle: () => void;
  dirEntries: DirEntry[];
  currentDir: string;
  loadingLogs: boolean;
  onNavigate: (dir?: string) => void;
}

export const TerminalSearchBar: React.FC<TerminalSearchBarProps> = ({
  onExecute,
  visible,
  onToggle,
  dirEntries,
  currentDir,
  loadingLogs,
  onNavigate,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<SearchPreset | null>(null);
  const [keyword, setKeyword] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [isManualInput, setIsManualInput] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [filter, setFilter] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileDropdownRef = useRef<HTMLDivElement>(null);
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const prevCurrentDirRef = useRef(currentDir);

  // When currentDir changes, reset selected file so it reflects the new directory
  useEffect(() => {
    if (prevCurrentDirRef.current && currentDir !== prevCurrentDirRef.current) {
      if (!isManualInput) {
        setSelectedFile('');
      }
    }
    prevCurrentDirRef.current = currentDir;
  }, [currentDir, isManualInput]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPresets(false);
      }
      if (fileDropdownRef.current && !fileDropdownRef.current.contains(event.target as Node)) {
        setShowFileBrowser(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus keyword input when a preset needing keyword is picked
  useEffect(() => {
    if (selectedPreset?.needsKeyword && keywordInputRef.current) {
      keywordInputRef.current.focus();
    }
  }, [selectedPreset]);

  const handleSelectPreset = (preset: SearchPreset) => {
    setSelectedPreset(preset);
    setShowPresets(false);
    setKeyword('');
  };

  const handleSelectFile = (entry: DirEntry) => {
    if (entry.isDir) {
      onNavigate(entry.path);
      setFilter('');
    } else {
      setSelectedFile(entry.path);
      setCustomPath(entry.path);
      setIsManualInput(false);
      setShowFileBrowser(false);
      setFilter('');
    }
  };

  const handleGoUp = () => {
    const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
    onNavigate(parent);
    setFilter('');
  };

  const activeFilePath = isManualInput ? customPath.trim() : (selectedFile || customPath.trim());

  const handleExecute = () => {
    if (!selectedPreset) {
      setShowPresets(true);
      return;
    }

    if (selectedPreset.id === 'cd-dir') {
      const target = currentDir || activeFilePath;
      if (!target) {
        setShowFileBrowser(true);
        return;
      }
      onExecute(`cd "${target}"`);
      return;
    }

    if (!activeFilePath) {
      setShowFileBrowser(true);
      return;
    }

    if (selectedPreset.needsKeyword && !keyword.trim()) {
      keywordInputRef.current?.focus();
      return;
    }

    const command = selectedPreset.buildCommand(keyword.trim(), activeFilePath);
    onExecute(command);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleExecute();
    }
    if (e.key === 'Escape') {
      onToggle();
    }
  };

  const filteredEntries = filter
    ? dirEntries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : dirEntries;

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  const getFileName = (path: string) => path.split('/').pop() || path;

  const canExecute = Boolean(
    selectedPreset &&
      (selectedPreset.id === 'cd-dir'
        ? !!(currentDir || activeFilePath)
        : activeFilePath && (selectedPreset.needsKeyword ? keyword.trim().length > 0 : true))
  );

  if (!visible) return null;

  return (
    <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 transition-colors">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Preset Selector Dropdown ("Jenis Search...") */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm transition-all min-w-[190px]"
          >
            <Search className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="truncate flex-1 text-left font-sans">
              {selectedPreset ? `${selectedPreset.icon} ${selectedPreset.label}` : 'Jenis Search...'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          </button>

          {showPresets && (
            <div className="absolute top-full left-0 mt-1.5 w-[320px] max-h-[380px] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 divide-y divide-slate-100 dark:divide-slate-700/50 py-1">
              {SEARCH_PRESETS.map((preset) => {
                const isSelected = selectedPreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50/70 dark:hover:bg-slate-700/60 transition-colors flex items-start gap-2.5 ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="text-base select-none mt-0.5">{preset.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{preset.label}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-400 line-clamp-1 font-normal">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* File Browser / Path Selector ("Pilih File...") */}
        <div className="relative" ref={fileDropdownRef}>
          <button
            type="button"
            onClick={() => {
              const next = !showFileBrowser;
              setShowFileBrowser(next);
              if (next) {
                onNavigate(currentDir || undefined);
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 rounded-lg border shadow-sm transition-all min-w-[190px] max-w-[280px] ${
              !activeFilePath && selectedPreset && selectedPreset.id !== 'cd-dir'
                ? 'border-amber-400 dark:border-amber-500'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="truncate flex-1 text-left font-mono">
              {activeFilePath ? getFileName(activeFilePath) : 'Pilih File...'}
            </span>
            {loadingLogs ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            )}
          </button>

          {showFileBrowser && (
            <div className="absolute top-full left-0 mt-1.5 w-[380px] max-h-[420px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
              {/* Header: Current Dir + Up Button + Quick Shortcuts */}
              <div className="p-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  <span className="truncate font-semibold text-slate-700 dark:text-slate-300">
                    📂 {currentDir || '/'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate(currentDir || undefined)}
                    title="Reload Directory"
                    className="hover:text-blue-500 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    Refresh
                  </button>
                </div>

                {/* Filter and Up Navigation */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleGoUp}
                    disabled={!currentDir || currentDir === '/'}
                    className="px-2 py-1 text-xs bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-md transition-colors flex items-center gap-1"
                  >
                    <ArrowUp className="w-3 h-3" />
                    Up
                  </button>
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter file / folder..."
                    className="flex-1 px-2.5 py-1 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    autoFocus
                  />
                </div>

                {/* Common Presets Shortcuts */}
                <div className="flex items-center gap-1 overflow-x-auto text-[10px] pt-1 text-slate-600 dark:text-slate-400">
                  <span className="text-slate-400 select-none">Quick:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile('/var/log/syslog');
                      setCustomPath('/var/log/syslog');
                      setIsManualInput(false);
                      setShowFileBrowser(false);
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 font-mono"
                  >
                    syslog
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile('/var/log/messages');
                      setCustomPath('/var/log/messages');
                      setIsManualInput(false);
                      setShowFileBrowser(false);
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 font-mono"
                  >
                    messages
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/var/log')}
                    className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 font-mono"
                  >
                    /var/log
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('~')}
                    className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 font-mono"
                  >
                    ~ home
                  </button>
                </div>
              </div>

              {/* Entries list */}
              <div className="overflow-y-auto max-h-[240px] divide-y divide-slate-100 dark:divide-slate-700/40">
                {loadingLogs ? (
                  <div className="p-4 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    <span>Loading directory...</span>
                  </div>
                ) : sortedEntries.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    Directory is empty or inaccessible
                  </div>
                ) : (
                  sortedEntries.map((entry) => {
                    const isSelected = activeFilePath === entry.path;
                    return (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => handleSelectFile(entry)}
                        className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2 text-xs font-mono ${
                          isSelected ? 'bg-blue-50 dark:bg-blue-950/40 font-semibold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {entry.isDir ? (
                          <Folder className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        )}
                        <span className={`truncate flex-1 ${entry.isDir ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
                          {entry.name}{entry.isDir ? '/' : ''}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Direct Path Input Bar at bottom */}
              <div className="p-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-1.5">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => {
                    setCustomPath(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSelectedFile(customPath.trim());
                      setIsManualInput(true);
                      setShowFileBrowser(false);
                    }
                  }}
                  placeholder="Or enter path: /var/log/app.log"
                  className="flex-1 px-2.5 py-1 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(customPath.trim());
                    setIsManualInput(true);
                    setShowFileBrowser(false);
                  }}
                  className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Keyword Input (if preset requires a keyword or optional keyword) */}
        {(selectedPreset?.needsKeyword ||
          ['tail-lines', 'head-file', 'top-errors', 'grep-http'].includes(selectedPreset?.id || '')) && (
          <input
            ref={keywordInputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedPreset?.placeholder}
            className="flex-1 min-w-[140px] px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono shadow-sm"
          />
        )}

        {/* Execute Run Button */}
        <button
          type="button"
          onClick={handleExecute}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all ${
            canExecute
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95'
              : 'bg-emerald-600/70 hover:bg-emerald-600 text-white/90 cursor-pointer'
          }`}
          title={
            !selectedPreset
              ? 'Pilih Jenis Search terlebih dahulu'
              : !activeFilePath && selectedPreset.id !== 'cd-dir'
              ? 'Pilih File terlebih dahulu'
              : selectedPreset.needsKeyword && !keyword.trim()
              ? 'Ketik keyword pencarian'
              : 'Klik untuk jalankan perintah di terminal'
          }
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Run
        </button>

        {/* Close / Hide Search Bar */}
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors ml-auto"
          aria-label="Close search bar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Generated Command Preview */}
      {selectedPreset && (activeFilePath || selectedPreset.id === 'cd-dir') && (
        <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 overflow-hidden shadow-sm">
          <TerminalIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="text-slate-400 select-none">$</span>
          <span className="truncate">
            {selectedPreset.id === 'cd-dir'
              ? `cd "${currentDir || activeFilePath}"`
              : selectedPreset.buildCommand(keyword.trim(), activeFilePath)}
          </span>
        </div>
      )}
    </div>
  );
};
