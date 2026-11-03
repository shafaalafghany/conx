import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Search, Filter, Check } from 'lucide-react';
import type { RedisKeySummary } from '../../types';
import {
  formatKeyCount,
  middleTruncateKey,
  REDIS_TYPE_BADGE,
} from './redis-utils';

interface RedisKeyExplorerProps {
  isConnected: boolean;
  dbIndex: number;
  pattern: string;
  keyTypeFilter: string;
  keys: RedisKeySummary[];
  selectedKey: string | null;
  totalKeys: number;
  scannedCount: number;
  hasMore: boolean;
  isScanning: boolean;
  onChangeDbIndex: (db: number) => void;
  onChangePattern: (pattern: string) => void;
  onChangeTypeFilter: (type: string) => void;
  onRefreshScan: () => void;
  onScanMore: () => void;
  onSelectKey: (key: string) => void;
}

const KEY_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'hash', label: 'Hash' },
  { value: 'string', label: 'String' },
  { value: 'list', label: 'List' },
  { value: 'set', label: 'Set' },
  { value: 'zset', label: 'Sorted Set' },
];

export const RedisKeyExplorer: React.FC<RedisKeyExplorerProps> = ({
  isConnected,
  dbIndex,
  pattern,
  keyTypeFilter,
  keys,
  selectedKey,
  totalKeys,
  scannedCount,
  hasMore,
  isScanning,
  onChangeDbIndex,
  onChangePattern,
  onChangeTypeFilter,
  onRefreshScan,
  onScanMore,
  onSelectKey,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleRightClickCopy = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 1500);
  };

  const progressPct =
    totalKeys > 0
      ? Math.min(100, Math.max(4, Math.round((scannedCount / totalKeys) * 100)))
      : keys.length > 0
      ? 100
      : 0;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header Row: Keys + Database Index */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700/70 flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">
            Keys
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Database:
            </span>
            <select
              disabled={!isConnected}
              value={dbIndex}
              onChange={(e) => onChangeDbIndex(parseInt(e.target.value, 10) || 0)}
              className="px-2 py-0.5 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              {Array.from({ length: 16 }, (_, idx) => (
                <option key={idx} value={idx}>
                  {idx}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Input + Refresh + Filter */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              disabled={!isConnected}
              value={pattern}
              onChange={(e) => onChangePattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onRefreshScan();
                }
              }}
              placeholder="* or prefix:*"
              className="w-full pl-2.5 pr-7 py-1.5 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!isConnected}
              onClick={onRefreshScan}
              title="Search keys (Enter)"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Refresh Key List Button */}
          <button
            type="button"
            disabled={!isConnected || isScanning}
            onClick={onRefreshScan}
            title="Refresh key list (Re-scan)"
            className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-blue-500' : ''}`} />
          </button>

          {/* Filter by Type Dropdown */}
          <div ref={filterRef} className="relative flex-shrink-0">
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => setFilterOpen((prev) => !prev)}
              title="Filter by Redis data type"
              className={`p-1.5 rounded-md border transition-colors relative ${
                keyTypeFilter
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              } disabled:opacity-50`}
            >
              <Filter className="w-3.5 h-3.5" />
              {keyTypeFilter && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-600" />
              )}
            </button>

            {filterOpen && (
              <div className="absolute right-0 mt-1 w-36 rounded-md shadow-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 py-1 z-30">
                {KEY_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChangeTypeFilter(opt.value);
                      setFilterOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
                  >
                    <span>{opt.label}</span>
                    {keyTypeFilter === opt.value && (
                      <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keys List */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 min-h-0">
        {!isConnected ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8 px-3">
            Connect to a Redis server above to search and inspect keys.
          </p>
        ) : keys.length === 0 && !isScanning ? (
          <div className="text-center py-8 px-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No keys matched <code className="font-mono">{pattern || '*'}</code>
              {keyTypeFilter ? ` (${keyTypeFilter})` : ''}.
            </p>
            {hasMore && (
              <button
                type="button"
                onClick={onScanMore}
                className="mt-2 px-3 py-1 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white"
              >
                Scan More Keys
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {keys.map((item) => {
              const isSelected = item.key === selectedKey;
              const isCopied = copiedKey === item.key;
              const badgeCls =
                REDIS_TYPE_BADGE[item.type] ||
                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600';

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelectKey(item.key)}
                  onContextMenu={(e) => handleRightClickCopy(e, item.key)}
                  title={`${item.key} (${item.type})\nRight-click to copy key`}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors group ${
                    isSelected
                      ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100 font-medium'
                      : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <span className="text-xs font-mono truncate min-w-0">
                    {isCopied ? '✓ Copied key!' : middleTruncateKey(item.key, 34)}
                  </span>
                  <span
                    className={`text-[9px] uppercase font-mono font-semibold px-1.5 py-0.2 rounded border flex-shrink-0 ${badgeCls}`}
                  >
                    {item.type === 'string' ? 'str' : item.type}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Scan Footer (Matching ss.png) */}
      {isConnected && (
        <div className="px-3 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 flex-shrink-0 space-y-1.5">
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Right-click key to copy
          </p>
          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            <span>Matched {keys.length} keys.</span>
            <span className="text-gray-500 dark:text-gray-400 font-normal">
              Scanned {formatKeyCount(scannedCount)}/{formatKeyCount(totalKeys)} keys.
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 rounded-sm bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-sky-400 dark:bg-sky-500 transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {hasMore ? (
            <>
              <button
                type="button"
                disabled={isScanning}
                onClick={onScanMore}
                className="w-full py-1.5 text-xs font-semibold tracking-wide uppercase rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 transition-colors disabled:opacity-50"
              >
                {isScanning ? 'Scanning...' : 'SCAN MORE'}
              </button>
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                Scan paused
              </p>
            </>
          ) : (
            <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              {isScanning ? 'Scanning...' : 'Scan complete'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
