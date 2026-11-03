import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Terminal as TerminalIcon, Plus, X } from 'lucide-react';
import { api } from '../api/client';
import type {
  RedisConnectionItem,
  RedisConnectionFormData,
  RedisKeySummary,
  RedisKeyTab,
  RedisSetKeyRequest,
  RedisCommandHistoryEntry,
  RedisCommandResult,
} from '../types';
import { RedisConnectionList } from './redis/RedisConnectionList';
import { RedisConnectionForm } from './redis/RedisConnectionForm';
import { RedisKeyExplorer } from './redis/RedisKeyExplorer';
import { RedisKeyInspector } from './redis/RedisKeyInspector';
import { RedisCliDrawer } from './redis/RedisCliDrawer';
import { AddKeyModal } from './redis/RedisModals';

interface ExplorerState {
  dbIndex: number;
  pattern: string;
  keyTypeFilter: string;
  keys: RedisKeySummary[];
  nextCursor: number;
  totalKeys: number;
  scannedCount: number;
  hasMore: boolean;
  isScanning: boolean;
}

const createDefaultExplorerState = (defaultDb = 0): ExplorerState => ({
  dbIndex: defaultDb,
  pattern: '*',
  keyTypeFilter: '',
  keys: [],
  nextCursor: 0,
  totalKeys: 0,
  scannedCount: 0,
  hasMore: false,
  isScanning: false,
});

export const RedisManagementPage: React.FC = () => {
  // Connections state
  const [connections, setConnections] = useState<RedisConnectionItem[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);

  // Connection modal state
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [editConnectionId, setEditConnectionId] = useState<string | null>(null);

  // Add Key modal state
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);

  // Layout & CLI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCli, setShowCli] = useState(false);
  const [commandHistory, setCommandHistory] = useState<RedisCommandHistoryEntry[]>([]);

  // Per-connection Key Explorer state
  const [explorerByConn, setExplorerByConn] = useState<Record<string, ExplorerState>>({});

  // Multi-key Inspector Tabs
  const [keyTabs, setKeyTabs] = useState<RedisKeyTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Global error banner
  const [apiError, setApiError] = useState<string | null>(null);

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeConnectionId) || null,
    [connections, activeConnectionId]
  );

  const isActiveConnected = activeConnection?.status === 'connected';

  const activeExplorer: ExplorerState = useMemo(() => {
    if (!activeConnectionId) return createDefaultExplorerState(0);
    return (
      explorerByConn[activeConnectionId] ||
      createDefaultExplorerState(activeConnection?.defaultDb || 0)
    );
  }, [activeConnectionId, explorerByConn, activeConnection?.defaultDb]);

  const activeSelectedKey = useMemo(() => {
    const tab = keyTabs.find((t) => t.id === activeTabId);
    if (
      tab &&
      tab.connectionId === activeConnectionId &&
      tab.dbIndex === activeExplorer.dbIndex
    ) {
      return tab.key;
    }
    return null;
  }, [keyTabs, activeTabId, activeConnectionId, activeExplorer.dbIndex]);

  // Load saved Redis connections
  const fetchConnections = useCallback(async () => {
    setIsLoadingConnections(true);
    try {
      const data = await api.listRedisConnections();
      setConnections((prev) => {
        const prevStatusMap = new Map(prev.map((p) => [p.id, p.status]));
        const loaded: RedisConnectionItem[] = (data || []).map((c: any) => {
          const serverStatus = c.status as RedisConnectionItem['status'] | undefined;
          const prevStatus = prevStatusMap.get(c.id);
          const resolvedStatus: RedisConnectionItem['status'] =
            serverStatus === 'connected' || prevStatus === 'connected'
              ? 'connected'
              : 'disconnected';

          return {
            id: c.id,
            name: c.name || `${c.host}:${c.port}`,
            host: c.host,
            port: c.port || 6379,
            username: c.username || '',
            defaultDb: c.defaultDb ?? 0,
            useTls: Boolean(c.useTls),
            hasPassword:
              c.hasPassword !== undefined
                ? Boolean(c.hasPassword)
                : Boolean(c.encryptedPassword && c.encryptedPassword.length > 0),
            status: resolvedStatus,
            createdAt: c.createdAt,
          };
        });

        setActiveConnectionId((curr) => {
          if (curr && loaded.some((item) => item.id === curr)) return curr;
          const firstConnected = loaded.find((item) => item.status === 'connected');
          if (firstConnected) return firstConnected.id;
          return loaded.length > 0 ? loaded[0].id : null;
        });

        return loaded;
      });
    } catch (err: any) {
      setApiError(err?.message || String(err) || 'Failed to load Redis connections');
    } finally {
      setIsLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Fetch CLI command history for active connection
  const fetchCommandHistory = useCallback(async (connId: string) => {
    try {
      const list = await api.getRedisCommandHistory(connId);
      setCommandHistory(list || []);
    } catch {
      // Ignore history load errors silently
    }
  }, []);

  useEffect(() => {
    if (activeConnectionId) {
      fetchCommandHistory(activeConnectionId);
    } else {
      setCommandHistory([]);
    }
  }, [activeConnectionId, fetchCommandHistory]);

  // Core SCAN runner
  const runScan = useCallback(
    async (
      connId: string,
      dbIndex: number,
      pattern: string,
      keyTypeFilter: string,
      cursor: number,
      append: boolean
    ) => {
      setExplorerByConn((prev) => {
        const base = prev[connId] || createDefaultExplorerState(dbIndex);
        return {
          ...prev,
          [connId]: {
            ...base,
            dbIndex,
            pattern,
            keyTypeFilter,
            isScanning: true,
          },
        };
      });

      try {
        const res = await api.scanRedisKeys(
          connId,
          dbIndex,
          cursor,
          pattern.trim() || '*',
          keyTypeFilter,
          250
        );

        setExplorerByConn((prev) => {
          const base = prev[connId] || createDefaultExplorerState(dbIndex);
          const incomingKeys: RedisKeySummary[] = res?.keys || [];
          let mergedKeys: RedisKeySummary[];

          if (append) {
            const seen = new Set(base.keys.map((k) => k.key));
            mergedKeys = [...base.keys];
            for (const item of incomingKeys) {
              if (!seen.has(item.key)) {
                seen.add(item.key);
                mergedKeys.push(item);
              }
            }
          } else {
            mergedKeys = incomingKeys;
          }

          const totalKeys = res?.totalKeys ?? base.totalKeys ?? 0;
          const batchScanned = res?.scannedCount ?? incomingKeys.length;
          const nextScanned = append
            ? totalKeys > 0
              ? Math.min(totalKeys, base.scannedCount + batchScanned)
              : base.scannedCount + batchScanned
            : totalKeys > 0 && !res?.hasMore
            ? totalKeys
            : Math.min(totalKeys || batchScanned, batchScanned);

          return {
            ...prev,
            [connId]: {
              ...base,
              dbIndex,
              pattern,
              keyTypeFilter,
              keys: mergedKeys,
              nextCursor: res?.nextCursor ?? 0,
              totalKeys,
              scannedCount: nextScanned,
              hasMore: Boolean(res?.hasMore),
              isScanning: false,
            },
          };
        });
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to scan Redis keys');
        setExplorerByConn((prev) => {
          const base = prev[connId] || createDefaultExplorerState(dbIndex);
          return {
            ...prev,
            [connId]: {
              ...base,
              isScanning: false,
            },
          };
        });
      }
    },
    []
  );

  // Connect / Disconnect / Save / Delete Connection handlers
  const handleConnect = useCallback(
    async (id: string) => {
      setApiError(null);
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'connecting' } : c))
      );
      try {
        await api.connectRedis(id);
        const target = connections.find((c) => c.id === id);
        const initialDb = explorerByConn[id]?.dbIndex ?? target?.defaultDb ?? 0;
        const initialPattern = explorerByConn[id]?.pattern ?? '*';
        const initialType = explorerByConn[id]?.keyTypeFilter ?? '';

        setConnections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'connected' } : c))
        );
        setActiveConnectionId(id);
        await runScan(id, initialDb, initialPattern, initialType, 0, false);
      } catch (err: any) {
        setConnections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'error' } : c))
        );
        setApiError(err?.message || String(err) || 'Failed to connect to Redis');
      }
    },
    [connections, explorerByConn, runScan]
  );

  const handleDisconnect = useCallback(async (id: string) => {
    try {
      await api.disconnectRedis(id);
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'disconnected' } : c))
      );
    } catch (err: any) {
      setApiError(err?.message || String(err) || 'Failed to disconnect');
    }
  }, []);

  const handleConnectionFormSubmit = useCallback(
    async (formData: RedisConnectionFormData) => {
      const payload = {
        id: editConnectionId || '',
        name: formData.name,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        defaultDb: formData.defaultDb,
        useTls: formData.useTls,
      };
      await api.saveRedisConnection(payload, formData.password);
      setShowConnectionForm(false);
      setEditConnectionId(null);
      await fetchConnections();
    },
    [editConnectionId, fetchConnections]
  );

  const handleDeleteConnection = useCallback(
    async (id: string) => {
      try {
        await api.deleteRedisConnection(id);
        setConnections((prev) => prev.filter((c) => c.id !== id));
        setKeyTabs((prev) => {
          const remaining = prev.filter((t) => t.connectionId !== id);
          if (activeTabId && !remaining.some((t) => t.id === activeTabId)) {
            setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
          }
          return remaining;
        });
        if (activeConnectionId === id) {
          setActiveConnectionId(null);
        }
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to delete Redis connection');
      }
    },
    [activeConnectionId, activeTabId]
  );

  // Explorer controls
  const handleChangeDbIndex = useCallback(
    (newDb: number) => {
      if (!activeConnectionId || !isActiveConnected) return;
      runScan(
        activeConnectionId,
        newDb,
        activeExplorer.pattern,
        activeExplorer.keyTypeFilter,
        0,
        false
      );
    },
    [activeConnectionId, isActiveConnected, activeExplorer, runScan]
  );

  const handleChangePattern = useCallback(
    (newPattern: string) => {
      if (!activeConnectionId) return;
      setExplorerByConn((prev) => {
        const base =
          prev[activeConnectionId] ||
          createDefaultExplorerState(activeConnection?.defaultDb || 0);
        return {
          ...prev,
          [activeConnectionId]: {
            ...base,
            pattern: newPattern,
          },
        };
      });
    },
    [activeConnectionId, activeConnection?.defaultDb]
  );

  const handleChangeTypeFilter = useCallback(
    (newType: string) => {
      if (!activeConnectionId || !isActiveConnected) return;
      runScan(
        activeConnectionId,
        activeExplorer.dbIndex,
        activeExplorer.pattern,
        newType,
        0,
        false
      );
    },
    [activeConnectionId, isActiveConnected, activeExplorer, runScan]
  );

  const handleRefreshScan = useCallback(() => {
    if (!activeConnectionId || !isActiveConnected) return;
    runScan(
      activeConnectionId,
      activeExplorer.dbIndex,
      activeExplorer.pattern,
      activeExplorer.keyTypeFilter,
      0,
      false
    );
  }, [activeConnectionId, isActiveConnected, activeExplorer, runScan]);

  const handleScanMore = useCallback(() => {
    if (!activeConnectionId || !isActiveConnected || !activeExplorer.hasMore) return;
    runScan(
      activeConnectionId,
      activeExplorer.dbIndex,
      activeExplorer.pattern,
      activeExplorer.keyTypeFilter,
      activeExplorer.nextCursor,
      true
    );
  }, [activeConnectionId, isActiveConnected, activeExplorer, runScan]);

  // Open or refresh a key tab in the Key Inspector
  const openOrLoadKeyTab = useCallback(
    async (connId: string, connName: string, dbIndex: number, key: string) => {
      const tabId = `${connId}:${dbIndex}:${key}`;
      setActiveTabId(tabId);

      setKeyTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) {
          return prev.map((t) =>
            t.id === tabId ? { ...t, isLoading: true, error: null } : t
          );
        }
        return [
          ...prev,
          {
            id: tabId,
            connectionId: connId,
            connectionName: connName,
            dbIndex,
            key,
            detail: null,
            isLoading: true,
            error: null,
          },
        ];
      });

      try {
        const detail = await api.getRedisKeyDetail(connId, dbIndex, key);
        setKeyTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, detail, isLoading: false, error: null } : t
          )
        );
      } catch (err: any) {
        setKeyTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  isLoading: false,
                  error: err?.message || String(err) || 'Failed to load key',
                }
              : t
          )
        );
      }
    },
    []
  );

  const handleSelectKey = useCallback(
    (key: string) => {
      if (!activeConnection) return;
      openOrLoadKeyTab(
        activeConnection.id,
        activeConnection.name,
        activeExplorer.dbIndex,
        key
      );
    },
    [activeConnection, activeExplorer.dbIndex, openOrLoadKeyTab]
  );

  const handleRefreshTab = useCallback(
    async (tab: RedisKeyTab) => {
      await openOrLoadKeyTab(
        tab.connectionId,
        tab.connectionName,
        tab.dbIndex,
        tab.key
      );
    },
    [openOrLoadKeyTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setKeyTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        const remaining = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          if (remaining.length === 0) {
            setActiveTabId(null);
          } else {
            const nextIdx = Math.min(idx, remaining.length - 1);
            setActiveTabId(remaining[nextIdx].id);
          }
        }
        return remaining;
      });
    },
    [activeTabId]
  );

  // Key CRUD handlers
  const handleCreateKey = useCallback(
    async (payload: RedisSetKeyRequest) => {
      if (!activeConnection || !isActiveConnected) {
        throw new Error('Please connect to a Redis server first');
      }
      await api.setRedisKey(activeConnection.id, activeExplorer.dbIndex, payload);
      await runScan(
        activeConnection.id,
        activeExplorer.dbIndex,
        activeExplorer.pattern,
        activeExplorer.keyTypeFilter,
        0,
        false
      );
      await openOrLoadKeyTab(
        activeConnection.id,
        activeConnection.name,
        activeExplorer.dbIndex,
        payload.key
      );
    },
    [activeConnection, isActiveConnected, activeExplorer, runScan, openOrLoadKeyTab]
  );

  const handleDeleteKey = useCallback(
    async (tab: RedisKeyTab) => {
      try {
        await api.deleteRedisKey(tab.connectionId, tab.dbIndex, tab.key);
        handleCloseTab(tab.id);
        setExplorerByConn((prev) => {
          const connState = prev[tab.connectionId];
          if (!connState || connState.dbIndex !== tab.dbIndex) return prev;
          return {
            ...prev,
            [tab.connectionId]: {
              ...connState,
              keys: connState.keys.filter((k) => k.key !== tab.key),
              totalKeys: Math.max(0, connState.totalKeys - 1),
            },
          };
        });
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to delete key');
      }
    },
    [handleCloseTab]
  );

  const handleUpdateTTL = useCallback(
    async (tab: RedisKeyTab, ttlSeconds: number) => {
      try {
        await api.updateRedisKeyTTL(tab.connectionId, tab.dbIndex, tab.key, ttlSeconds);
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to update TTL');
      }
    },
    [handleRefreshTab]
  );

  const handleUpdateString = useCallback(
    async (tab: RedisKeyTab, newValue: string) => {
      try {
        await api.updateRedisString(tab.connectionId, tab.dbIndex, tab.key, newValue);
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to update string value');
      }
    },
    [handleRefreshTab]
  );

  const handleSaveHashField = useCallback(
    async (tab: RedisKeyTab, oldField: string, field: string, value: string) => {
      await api.setRedisHashField(
        tab.connectionId,
        tab.dbIndex,
        tab.key,
        oldField,
        field,
        value
      );
      await handleRefreshTab(tab);
    },
    [handleRefreshTab]
  );

  const handleDeleteHashField = useCallback(
    async (tab: RedisKeyTab, field: string) => {
      try {
        await api.deleteRedisHashField(tab.connectionId, tab.dbIndex, tab.key, field);
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to delete hash field');
      }
    },
    [handleRefreshTab]
  );

  const handlePushListValue = useCallback(
    async (tab: RedisKeyTab, value: string, position: 'head' | 'tail') => {
      try {
        await api.pushRedisListValue(
          tab.connectionId,
          tab.dbIndex,
          tab.key,
          value,
          position
        );
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to push list item');
      }
    },
    [handleRefreshTab]
  );

  const handleUpdateListValue = useCallback(
    async (tab: RedisKeyTab, index: number, value: string) => {
      try {
        await api.updateRedisListValue(
          tab.connectionId,
          tab.dbIndex,
          tab.key,
          index,
          value
        );
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to update list item');
      }
    },
    [handleRefreshTab]
  );

  const handleDeleteListIndex = useCallback(
    async (tab: RedisKeyTab, index: number) => {
      try {
        await api.deleteRedisListIndex(tab.connectionId, tab.dbIndex, tab.key, index);
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to delete list item');
      }
    },
    [handleRefreshTab]
  );

  const handleAddSetMember = useCallback(
    async (tab: RedisKeyTab, member: string) => {
      try {
        await api.addRedisSetMember(tab.connectionId, tab.dbIndex, tab.key, member);
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to add set member');
      }
    },
    [handleRefreshTab]
  );

  const handleRemoveSetMember = useCallback(
    async (tab: RedisKeyTab, member: string) => {
      try {
        await api.removeRedisSetMember(tab.connectionId, tab.dbIndex, tab.key, member);
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to remove set member');
      }
    },
    [handleRefreshTab]
  );

  const handleSaveZSetMember = useCallback(
    async (tab: RedisKeyTab, member: string, score: number) => {
      try {
        await api.addRedisZSetMember(
          tab.connectionId,
          tab.dbIndex,
          tab.key,
          member,
          score
        );
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to save sorted set member');
      }
    },
    [handleRefreshTab]
  );

  const handleRemoveZSetMember = useCallback(
    async (tab: RedisKeyTab, member: string) => {
      try {
        await api.removeRedisZSetMember(tab.connectionId, tab.dbIndex, tab.key, member);
        await handleRefreshTab(tab);
      } catch (err: any) {
        setApiError(err?.message || String(err) || 'Failed to remove sorted set member');
      }
    },
    [handleRefreshTab]
  );

  // CLI Command Execution
  const handleExecuteCliCommand = useCallback(
    async (command: string): Promise<RedisCommandResult> => {
      if (!activeConnectionId) {
        throw new Error('No active Redis connection');
      }
      const result = await api.executeRedisCommand(
        activeConnectionId,
        activeExplorer.dbIndex,
        command
      );
      fetchCommandHistory(activeConnectionId);
      return result;
    },
    [activeConnectionId, activeExplorer.dbIndex, fetchCommandHistory]
  );

  const editingConnection = useMemo(
    () => connections.find((c) => c.id === editConnectionId) || null,
    [connections, editConnectionId]
  );

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden p-4">
      {/* Page Header (Matches DatabaseManagementPage) */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Redis Management
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Key explorer, multi-tab value inspector, JSON prettifier, and Redis CLI console
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCli((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
              showCli
                ? 'bg-rose-600 border-rose-600 text-white shadow-2xs'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>CLI Console</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditConnectionId(null);
              setShowConnectionForm(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Connection</span>
          </button>
        </div>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="mb-4 flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-center justify-between">
          <p className="text-xs text-red-700 dark:text-red-400">{apiError}</p>
          <button
            type="button"
            onClick={() => setApiError(null)}
            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 ml-2"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Split Workspace: Left Explorer + Right Inspector */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Collapsed Sidebar Expand Strip */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="flex-shrink-0 flex flex-col items-center justify-start pt-3 w-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Open Redis Explorer"
          >
            <svg
              className="w-4 h-4 text-gray-500 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span
              className="mt-2 text-[10px] text-gray-500 dark:text-gray-400"
              style={{ writingMode: 'vertical-rl' }}
            >
              Keys Explorer
            </span>
          </button>
        )}

        {/* Left Sidebar: Connections + Key Explorer */}
        {!sidebarCollapsed && (
          <aside className="w-[310px] flex-shrink-0 flex flex-col gap-3 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Explorer
              </span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                title="Collapse sidebar"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            </div>

            {/* Connections Card */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex-shrink-0 max-h-[210px] overflow-y-auto">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Connections
              </h2>
              {isLoadingConnections ? (
                <div className="flex items-center justify-center py-6 text-xs text-gray-500">
                  Loading connections...
                </div>
              ) : (
                <RedisConnectionList
                  connections={connections}
                  activeConnectionId={activeConnectionId}
                  onSelect={(id) => setActiveConnectionId(id)}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onEdit={(id) => {
                    setEditConnectionId(id);
                    setShowConnectionForm(true);
                  }}
                  onDelete={handleDeleteConnection}
                />
              )}
            </div>

            {/* Search Keys Explorer (Replaces Database Explorer, matching ss.png) */}
            <RedisKeyExplorer
              isConnected={Boolean(isActiveConnected)}
              dbIndex={activeExplorer.dbIndex}
              pattern={activeExplorer.pattern}
              keyTypeFilter={activeExplorer.keyTypeFilter}
              keys={activeExplorer.keys}
              selectedKey={activeSelectedKey}
              totalKeys={activeExplorer.totalKeys}
              scannedCount={activeExplorer.scannedCount}
              hasMore={activeExplorer.hasMore}
              isScanning={activeExplorer.isScanning}
              onChangeDbIndex={handleChangeDbIndex}
              onChangePattern={handleChangePattern}
              onChangeTypeFilter={handleChangeTypeFilter}
              onRefreshScan={handleRefreshScan}
              onScanMore={handleScanMore}
              onSelectKey={handleSelectKey}
            />
          </aside>
        )}

        {/* Right Main Content: Optional CLI Drawer + Full-Height Key Inspector */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {showCli && (
            <RedisCliDrawer
              dbIndex={activeExplorer.dbIndex}
              isConnected={Boolean(isActiveConnected)}
              history={commandHistory}
              onExecute={handleExecuteCliCommand}
            />
          )}

          <RedisKeyInspector
            tabs={keyTabs}
            activeTabId={activeTabId}
            hasActiveConnection={Boolean(isActiveConnected)}
            onSelectTab={setActiveTabId}
            onCloseTab={handleCloseTab}
            onRefreshTab={handleRefreshTab}
            onOpenAddKey={() => setShowAddKeyModal(true)}
            onDeleteKey={handleDeleteKey}
            onUpdateTTL={handleUpdateTTL}
            onUpdateString={handleUpdateString}
            onSaveHashField={handleSaveHashField}
            onDeleteHashField={handleDeleteHashField}
            onPushListValue={handlePushListValue}
            onUpdateListValue={handleUpdateListValue}
            onDeleteListIndex={handleDeleteListIndex}
            onAddSetMember={handleAddSetMember}
            onRemoveSetMember={handleRemoveSetMember}
            onSaveZSetMember={handleSaveZSetMember}
            onRemoveZSetMember={handleRemoveZSetMember}
          />
        </div>
      </div>

      {/* Add / Edit Redis Connection Modal */}
      {showConnectionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => {
              setShowConnectionForm(false);
              setEditConnectionId(null);
            }}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editConnectionId ? 'Edit Redis Connection' : 'Add Redis Connection'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowConnectionForm(false);
                  setEditConnectionId(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <RedisConnectionForm
              initialData={editingConnection}
              onSubmit={handleConnectionFormSubmit}
              onCancel={() => {
                setShowConnectionForm(false);
                setEditConnectionId(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Add New Key Modal */}
      <AddKeyModal
        isOpen={showAddKeyModal}
        dbIndex={activeExplorer.dbIndex}
        onClose={() => setShowAddKeyModal(false)}
        onSubmit={handleCreateKey}
      />
    </div>
  );
};

export default RedisManagementPage;
