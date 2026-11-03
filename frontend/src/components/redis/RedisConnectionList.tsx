import React, { useState } from 'react';
import type { RedisConnectionItem } from '../../types';

interface RedisConnectionListProps {
  connections: RedisConnectionItem[];
  activeConnectionId: string | null;
  onSelect: (id: string) => void;
  onConnect: (id: string) => Promise<void> | void;
  onDisconnect: (id: string) => Promise<void> | void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void> | void;
}

export const RedisConnectionList: React.FC<RedisConnectionListProps> = ({
  connections,
  activeConnectionId,
  onSelect,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (connections.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
        No Redis connections yet. Click &quot;Add Connection&quot; to add one.
      </p>
    );
  }

  const handleToggleConnect = async (e: React.MouseEvent, conn: RedisConnectionItem) => {
    e.stopPropagation();
    setLoadingId(conn.id);
    try {
      if (conn.status === 'connected') {
        await onDisconnect(conn.id);
      } else {
        await onConnect(conn.id);
      }
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {connections.map((conn) => {
        const isActive = conn.id === activeConnectionId;
        const isConnected = conn.status === 'connected';
        const isBusy = loadingId === conn.id || conn.status === 'connecting';

        return (
          <div
            key={conn.id}
            onClick={() => onSelect(conn.id)}
            className={`group rounded-md border p-2.5 cursor-pointer transition-all ${
              isActive
                ? 'border-rose-500/70 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-500/60'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isConnected
                      ? 'bg-emerald-500'
                      : isBusy
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-gray-400 dark:bg-gray-500'
                  }`}
                />
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {conn.name}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleToggleConnect(e, conn)}
                  disabled={isBusy}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    isConnected
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isBusy ? '...' : isConnected ? 'Disconnect' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(conn.id);
                  }}
                  title="Edit connection"
                  className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(conn.id);
                  }}
                  title="Delete connection"
                  className="p-1 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-gray-500 dark:text-gray-400">
              <span className="truncate">
                {conn.host}:{conn.port}
              </span>
              <span className="px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-700 text-[10px] text-gray-600 dark:text-gray-300">
                DB {conn.defaultDb || 0}
              </span>
              {conn.useTls && (
                <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-[10px] text-amber-700 dark:text-amber-300">
                  TLS
                </span>
              )}
            </div>

            {confirmDeleteId === conn.id && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs"
              >
                <span className="text-rose-600 dark:text-rose-400 font-medium">Delete profile?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setConfirmDeleteId(null);
                      await onDelete(conn.id);
                    }}
                    className="px-2 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
