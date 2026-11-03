import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ConnectionList from './db/ConnectionList';
import QueryHistory from './db/QueryHistory';
import ConnectionForm from './db/ConnectionForm';
import TableTabs from './db/TableTabs';
import SQLEditor from './db/SQLEditor';
import { parseSqlClauses, buildSqlWithClauses } from './db/sql-editor-utils';
import type { TableTab } from './db/TableTabs';
import type { ConnectionItem } from './db/ConnectionList';
import type { ColumnInfo } from './db/database-tree-utils';
import type { QueryHistoryEntry } from './db/QueryHistory';
import type { ConnectionFormData, DatabaseType } from './db/ConnectionForm';

/** State for the active panel in the main area */
type MainPanel = 'results' | 'history';

export function DatabaseManagementPage() {
  // Connection state
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);

  // Connection form state
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [editConnectionId, setEditConnectionId] = useState<string | null>(null);

  // Database tree state — grouped by connection ID
  const [connectionDatabases, setConnectionDatabases] = useState<Record<string, string[]>>({});
  const [tables, setTables] = useState<Record<string, string[]>>({});
  const [tableStructure, setTableStructure] = useState<Record<string, ColumnInfo[]>>({});
  const [accessDenied, setAccessDenied] = useState<string[]>([]);
  const [treeLoading, setTreeLoading] = useState<Record<string, boolean>>({});

  // Query state
  const [sqlValue, setSqlValue] = useState('SELECT 1 AS status, "Ready to query" AS message, CURRENT_TIMESTAMP AS time;');
  const [whereInput, setWhereInput] = useState('');
  const [orderByInput, setOrderByInput] = useState('');
  const isInternalFilterUpdate = useRef(false);
  const [queryTabCounter, setQueryTabCounter] = useState(0);

  // History state
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // UI state
  const [activePanel, setActivePanel] = useState<MainPanel>('results');
  const [treeSearchQuery, setTreeSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Splitter resizer state between SQL editor and Result box
  const DEFAULT_EDITOR_HEIGHT = 180;
  const MIN_EDITOR_HEIGHT = 90;

  const [editorHeight, setEditorHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('conx-db-editor-height');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_EDITOR_HEIGHT) {
          return parsed;
        }
      }
    }
    return DEFAULT_EDITOR_HEIGHT;
  });

  const isDraggingSplitterRef = useRef(false);

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitterRef.current = true;
    const startY = e.clientY;
    const startHeight = editorHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSplitterRef.current) return;
      const deltaY = moveEvent.clientY - startY;
      const maxEditorHeight = Math.max(MIN_EDITOR_HEIGHT + 100, window.innerHeight - 280);
      const newHeight = Math.min(Math.max(MIN_EDITOR_HEIGHT, startHeight + deltaY), maxEditorHeight);
      setEditorHeight(newHeight);
    };

    const onMouseUp = () => {
      if (isDraggingSplitterRef.current) {
        isDraggingSplitterRef.current = false;
        setEditorHeight((current) => {
          localStorage.setItem('conx-db-editor-height', String(current));
          return current;
        });
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [editorHeight]);

  const handleResetEditorHeight = useCallback(() => {
    setEditorHeight(DEFAULT_EDITOR_HEIGHT);
    localStorage.setItem('conx-db-editor-height', String(DEFAULT_EDITOR_HEIGHT));
  }, []);

  // Table tabs state
  const [tableTabs, setTableTabs] = useState<TableTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Active tab and active result indicators
  const activeTab = useMemo(
    () => tableTabs.find((t) => t.id === activeTabId) || null,
    [tableTabs, activeTabId]
  );

  const hasActiveResult = useMemo(
    () =>
      activePanel === 'results' &&
      activeTab !== null &&
      (activeTab.result !== null || activeTab.isLoading || activeTab.error !== null),
    [activePanel, activeTab]
  );

  // Confirmation modal state
  const [confirmQuery, setConfirmQuery] = useState<{ sql: string; selectedText?: string } | null>(null);

  // Table action picker state
  const [tableActionPicker, setTableActionPicker] = useState<{ connId: string; dbName: string; tableName: string } | null>(null);

  // Error state
  const [apiError, setApiError] = useState<string | null>(null);

  // Build schema for SQL autocomplete from loaded table structures
  const editorSchema = useMemo(() => {
    const schema: Record<string, Record<string, readonly string[]>> = {};

    for (const [key, columns] of Object.entries(tableStructure)) {
      const colNames = columns.map((col) => col.name);

      for (const connId of Object.keys(connectionDatabases)) {
        if (key.startsWith(`${connId}.`)) {
          const rest = key.slice(connId.length + 1); // "dbName.tableName"
          const dotIdx = rest.indexOf('.');
          if (dotIdx !== -1) {
            const dbName = rest.slice(0, dotIdx);
            const tableName = rest.slice(dotIdx + 1);

            if (!schema[dbName]) schema[dbName] = {};
            schema[dbName][tableName] = colNames;
          }
          break;
        }
      }
    }

    for (const [key, tableList] of Object.entries(tables)) {
      for (const connId of Object.keys(connectionDatabases)) {
        if (key.startsWith(`${connId}.`)) {
          const dbName = key.slice(connId.length + 1);
          if (!schema[dbName]) schema[dbName] = {};
          for (const tableName of tableList) {
            if (!schema[dbName][tableName]) {
              schema[dbName][tableName] = [];
            }
          }
          break;
        }
      }
    }

    return schema;
  }, [tableStructure, tables, connectionDatabases]);

  // --- Fetch status for a single connection ---
  const fetchConnectionStatus = useCallback(async (id: string): Promise<ConnectionItem['status']> => {
    try {
      const res = await fetch(`/api/databases/${id}/status`);
      if (!res.ok) return 'disconnected';
      const data = await res.json();
      return data.status || 'disconnected';
    } catch {
      return 'disconnected';
    }
  }, []);

  // --- Fetch statuses for all connections and update state ---
  const fetchAllStatuses = useCallback(async (conns: ConnectionItem[]) => {
    if (conns.length === 0) return;

    const statusResults = await Promise.allSettled(
      conns.map(async (conn) => ({
        id: conn.id,
        status: await fetchConnectionStatus(conn.id),
      }))
    );

    setConnections((prev) =>
      prev.map((conn) => {
        const result = statusResults.find(
          (r) => r.status === 'fulfilled' && r.value.id === conn.id
        );
        if (result && result.status === 'fulfilled') {
          return { ...conn, status: result.value.status };
        }
        return conn;
      })
    );
  }, [fetchConnectionStatus]);

  // --- Load connections on mount ---
  const fetchConnections = useCallback(async () => {
    setIsLoadingConnections(true);
    setApiError(null);
    try {
      const res = await fetch('/api/databases');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load connections');
      }
      const data = await res.json();
      const loadedConnections: ConnectionItem[] = data.map((c: any) => ({
        id: c.id,
        label: c.label || c.name,
        dbType: c.dbType || c.type,
        host: c.host,
        port: c.port,
        username: c.username,
        status: c.status || 'disconnected',
      }));
      setConnections(loadedConnections);
      setActiveConnectionId((curr) => {
        if (curr) return curr;
        const connected = loadedConnections.find((c) => c.status === 'connected');
        if (connected) return connected.id;
        if (loadedConnections.length > 0) return loadedConnections[0].id;
        return null;
      });
      fetchAllStatuses(loadedConnections);
    } catch (err: any) {
      setApiError(err.message || 'Failed to load connections');
    } finally {
      setIsLoadingConnections(false);
    }
  }, [fetchAllStatuses]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // --- Connection handlers ---
  const handleConnect = useCallback(async (id: string) => {
    setApiError(null);
    setActiveConnectionId(id);
    try {
      const res = await fetch(`/api/databases/${id}/connect`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to connect');
      }
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'connected' as const } : c))
      );
      try {
        const schemaRes = await fetch(`/api/databases/${id}/schema`);
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json();
          setConnectionDatabases((prev) => ({ ...prev, [id]: schemaData.databases || [] }));
        }
      } catch {
        // Silently continue
      }
    } catch (err: any) {
      setApiError(err.message || 'Failed to connect');
      setActiveConnectionId(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (id: string) => {
    setApiError(null);
    try {
      const res = await fetch(`/api/databases/${id}/disconnect`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to disconnect');
      }
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'disconnected' as const } : c))
      );
      if (activeConnectionId === id) {
        setActiveConnectionId(null);
      }
      setConnectionDatabases((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err: any) {
      setApiError(err.message || 'Failed to disconnect');
    }
  }, [activeConnectionId]);

  const handleEdit = useCallback((id: string) => {
    setEditConnectionId(id);
    setShowConnectionForm(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setApiError(null);
    try {
      const res = await fetch(`/api/databases/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete connection');
      }
      setConnections((prev) => prev.filter((c) => c.id !== id));
      if (activeConnectionId === id) {
        setActiveConnectionId(null);
      }
      setConnectionDatabases((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err: any) {
      setApiError(err.message || 'Failed to delete connection');
    }
  }, [activeConnectionId]);

  const handleConnectionFormSubmit = useCallback(async (data: ConnectionFormData) => {
    setApiError(null);
    try {
      const isEdit = !!editConnectionId;
      const url = isEdit ? `/api/databases/${editConnectionId}` : '/api/databases';
      const method = isEdit ? 'PUT' : 'POST';

      const body: Record<string, any> = {
        dbType: data.dbType,
        label: data.label,
        name: data.label,
        host: data.host,
        port: data.port,
        username: data.username,
      };
      if (data.password) {
        body.password = data.password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to ${isEdit ? 'update' : 'create'} connection`);
      }

      setShowConnectionForm(false);
      setEditConnectionId(null);
      await fetchConnections();
    } catch (err: any) {
      setApiError(err.message || 'Failed to save connection');
    }
  }, [editConnectionId, fetchConnections]);

  const handleConnectionFormCancel = useCallback(() => {
    setShowConnectionForm(false);
    setEditConnectionId(null);
  }, []);

  // --- Tree view handlers ---
  const handleExpandConnection = useCallback(async (connId: string) => {
    if (connectionDatabases[connId]) return;
    setTreeLoading((prev) => ({ ...prev, [connId]: true }));
    try {
      const res = await fetch(`/api/databases/${connId}/schema`);
      if (res.ok) {
        const data = await res.json();
        setConnectionDatabases((prev) => ({ ...prev, [connId]: data.databases || [] }));
      }
    } catch {
      // Silently fail
    } finally {
      setTreeLoading((prev) => ({ ...prev, [connId]: false }));
    }
  }, [connectionDatabases]);

  const handleExpandDatabaseForConn = useCallback(async (connId: string, dbName: string) => {
    setActiveConnectionId(connId);
    const key = `${connId}.${dbName}`;
    setTreeLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/databases/${connId}/schema/${encodeURIComponent(dbName)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error?.toLowerCase().includes('access denied')) {
          setAccessDenied((prev) => [...prev, key]);
        } else {
          setApiError(data.error || 'Failed to load tables');
        }
        return;
      }
      setTables((prev) => ({ ...prev, [key]: data.tables || [] }));
    } catch (err: any) {
      setApiError(err.message || 'Failed to load tables');
    } finally {
      setTreeLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const handleExpandTableForConn = useCallback(async (connId: string, dbName: string, tableName: string) => {
    setActiveConnectionId(connId);
    const key = `${connId}.${dbName}.${tableName}`;
    setTreeLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(
        `/api/databases/${connId}/schema/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setApiError(data.error || 'Failed to load columns');
        return;
      }
      const data = await res.json();
      setTableStructure((prev) => ({ ...prev, [key]: data.columns || [] }));
    } catch (err: any) {
      setApiError(err.message || 'Failed to load columns');
    } finally {
      setTreeLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  // --- Fetch query history ---
  const fetchHistory = useCallback(async () => {
    if (!activeConnectionId) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/databases/${activeConnectionId}/history`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load history');
      }
      const data = await res.json();
      setQueryHistory(data);
    } catch {
      // Silently fail
    } finally {
      setIsLoadingHistory(false);
    }
  }, [activeConnectionId]);

  useEffect(() => {
    if (activeConnectionId) {
      fetchHistory();
    } else {
      setQueryHistory([]);
    }
  }, [activeConnectionId, fetchHistory]);

  // --- Query handlers ---
  const handlePreviewTable = useCallback(async (connId: string, dbName: string, tableName: string) => {
    const tabId = `${connId}.${dbName}.${tableName}`;
    const existingTab = tableTabs.find((t) => t.id === tabId);
    if (existingTab) {
      setActiveTabId(tabId);
      setActivePanel('results');
      return;
    }
    setTableActionPicker({ connId, dbName, tableName });
  }, [tableTabs]);

  const handleViewTableData = useCallback(async () => {
    if (!tableActionPicker) return;
    const { connId, dbName, tableName } = tableActionPicker;
    setTableActionPicker(null);

    const targetConn = connections.find((c) => c.id === connId);
    const isPgOrSqlite = targetConn?.dbType === 'sqlite' || targetConn?.dbType === 'postgres' || targetConn?.dbType === 'postgresql';
    const sql = isPgOrSqlite
      ? `SELECT * FROM "${tableName}" LIMIT 300`
      : `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 300`;

    const tabId = `${connId}.${dbName}.${tableName}`;
    const newTab: TableTab = {
      id: tabId,
      connId,
      dbName,
      tableName,
      sql,
      result: null,
      error: null,
      isLoading: true,
    };

    setTableTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setActivePanel('results');
    setActiveConnectionId(connId);
    setSqlValue(sql);
    setWhereInput('');
    setOrderByInput('');

    try {
      const res = await fetch(`/api/databases/${connId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, database: dbName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Query execution failed');
      }

      const result = await res.json();
      setTableTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, result, isLoading: false } : t))
      );
    } catch (err: any) {
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, error: err.message || 'Query execution failed', isLoading: false } : t
        )
      );
    } finally {
      fetchHistory();
    }
  }, [tableActionPicker, connections, fetchHistory]);

  // DDL modal state
  const [ddlContent, setDdlContent] = useState<{ tableName: string; ddl: string } | null>(null);
  const [ddlLoading, setDdlLoading] = useState(false);

  const handleViewTableDDL = useCallback(async () => {
    if (!tableActionPicker) return;
    const { connId, dbName, tableName } = tableActionPicker;
    setTableActionPicker(null);
    setDdlLoading(true);
    setDdlContent({ tableName: `${dbName}.${tableName}`, ddl: '' });

    const targetConn = connections.find((c) => c.id === connId);
    let sql = `SHOW CREATE TABLE \`${dbName}\`.\`${tableName}\``;
    if (targetConn?.dbType === 'sqlite') {
      sql = `SELECT sql FROM sqlite_master WHERE name = '${tableName}'`;
    } else if (targetConn?.dbType === 'postgres' || targetConn?.dbType === 'postgresql') {
      sql = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${tableName}'`;
    }

    try {
      const res = await fetch(`/api/databases/${connId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, database: dbName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Query execution failed');
      }

      const result = await res.json();
      let ddlText = '';
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        ddlText = row['Create Table'] || row['Create View'] || row['sql'] || JSON.stringify(row, null, 2);
      }
      setDdlContent({ tableName: `${dbName}.${tableName}`, ddl: ddlText });
    } catch (err: any) {
      setDdlContent({ tableName: `${dbName}.${tableName}`, ddl: `-- Error: ${err.message}` });
    } finally {
      setDdlLoading(false);
    }
  }, [tableActionPicker, connections]);

  const handleCopyDDL = useCallback(() => {
    if (ddlContent?.ddl) {
      navigator.clipboard.writeText(ddlContent.ddl);
    }
  }, [ddlContent]);

  const handleRefreshTab = useCallback(async (tab: TableTab) => {
    const { id: tabId, connId, dbName, tableName, sql: tabSql } = tab;

    setTableTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isLoading: true, error: null } : t))
    );

    const targetConn = connections.find((c) => c.id === connId);
    const isPgOrSqlite = targetConn?.dbType === 'sqlite' || targetConn?.dbType === 'postgres' || targetConn?.dbType === 'postgresql';
    const defaultSql = isPgOrSqlite
      ? `SELECT * FROM "${tableName}" LIMIT 300`
      : `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 300`;

    const sqlToRun = tabSql || defaultSql;

    try {
      const res = await fetch(`/api/databases/${connId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sqlToRun,
          database: dbName !== 'Query' ? dbName : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Query execution failed');
      }

      const result = await res.json();
      setTableTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, result, error: null, isLoading: false, sql: sqlToRun } : t))
      );
    } catch (err: any) {
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, error: err.message || 'Query execution failed', isLoading: false } : t
        )
      );
    }
  }, [connections]);

  const handleCloseTab = useCallback((tabId: string) => {
    setTableTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const lastTab = newTabs[newTabs.length - 1];
        setActiveTabId(lastTab ? lastTab.id : null);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const handleExportTab = useCallback(async (tab: TableTab) => {
    if (!tab.result) return;
    try {
      const res = await fetch(`/api/databases/${tab.connId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: tab.result.columns,
          rows: tab.result.rows,
          database: tab.dbName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }

      const disposition = res.headers.get('Content-Disposition');
      let filename = 'export.csv';
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setApiError(err.message || 'Export failed');
    }
  }, []);

  const executeQuery = useCallback(async (queryToRun: string) => {
    if (!activeConnectionId) return;

    const counter = queryTabCounter + 1;
    setQueryTabCounter(counter);
    const tabId = `query.${counter}`;

    const queryLabel = queryToRun.length > 30 ? queryToRun.substring(0, 30) + '...' : queryToRun;
    const newTab: TableTab = {
      id: tabId,
      connId: activeConnectionId,
      dbName: 'Query',
      tableName: queryLabel,
      sql: queryToRun,
      result: null,
      error: null,
      isLoading: true,
    };

    setTableTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setActivePanel('results');

    try {
      const res = await fetch(`/api/databases/${activeConnectionId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: queryToRun }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Query execution failed');
      }

      const result = await res.json();
      setTableTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, result, isLoading: false, sql: queryToRun } : t))
      );
    } catch (err: any) {
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, error: err.message || 'Query execution failed', isLoading: false } : t
        )
      );
    } finally {
      fetchHistory();
    }
  }, [activeConnectionId, fetchHistory, queryTabCounter]);

  const handleRunQuery = useCallback(async (selectedText?: string) => {
    if (selectedText !== undefined && selectedText.trim() === '') {
      const counter = queryTabCounter + 1;
      setQueryTabCounter(counter);
      const tabId = `query.${counter}`;
      const newTab: TableTab = {
        id: tabId,
        connId: activeConnectionId || '',
        dbName: 'Query',
        tableName: `Result #${counter}`,
        result: null,
        error: 'Blok/select query yang ingin dijalankan terlebih dahulu',
        isLoading: false,
      };
      setTableTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
      setActivePanel('results');
      return;
    }

    if (!activeConnectionId) {
      const counter = queryTabCounter + 1;
      setQueryTabCounter(counter);
      const tabId = `query.${counter}`;
      const newTab: TableTab = {
        id: tabId,
        connId: '',
        dbName: 'Query',
        tableName: `Result #${counter}`,
        result: null,
        error: 'Pilih koneksi database di panel Explorer terlebih dahulu.',
        isLoading: false,
      };
      setTableTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
      setActivePanel('results');
      return;
    }

    const queryToRun = selectedText ? selectedText.trim() : sqlValue.trim();
    if (!queryToRun) return;

    const upperQuery = queryToRun.toUpperCase().trimStart();
    const isDangerous = upperQuery.startsWith('INSERT') || upperQuery.startsWith('UPDATE') || upperQuery.startsWith('DELETE') || upperQuery.startsWith('DROP') || upperQuery.startsWith('ALTER') || upperQuery.startsWith('TRUNCATE');

    if (isDangerous) {
      setConfirmQuery({ sql: queryToRun, selectedText });
      return;
    }

    await executeQuery(queryToRun);
  }, [sqlValue, activeConnectionId, queryTabCounter, executeQuery]);

  const handleConfirmExecute = useCallback(() => {
    if (confirmQuery) {
      executeQuery(confirmQuery.sql);
      setConfirmQuery(null);
    }
  }, [confirmQuery, executeQuery]);

  const handleCancelExecute = useCallback(() => {
    setConfirmQuery(null);
  }, []);

  const handleSelectHistoryQuery = useCallback((queryText: string) => {
    setSqlValue(queryText);
  }, []);

  const handleExecuteUpdate = useCallback(async (sql: string) => {
    if (!activeConnectionId) return;
    setSqlValue(sql);
    await executeQuery(sql);
  }, [activeConnectionId, executeQuery]);

  // Synchronize SQL Editor text to WHERE and ORDER BY input fields
  useEffect(() => {
    if (isInternalFilterUpdate.current) {
      isInternalFilterUpdate.current = false;
      return;
    }
    const parsed = parseSqlClauses(sqlValue);
    setWhereInput(parsed.where);
    setOrderByInput(parsed.orderBy);
  }, [sqlValue]);

  // Tab selection handler that also synchronizes query & filter state
  const handleSelectTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      const target = tableTabs.find((t) => t.id === tabId);
      if (target) {
        if (target.sql) {
          setSqlValue(target.sql);
          const parsed = parseSqlClauses(target.sql);
          setWhereInput(parsed.where);
          setOrderByInput(parsed.orderBy);
        } else if (target.dbName !== 'Query') {
          const targetConn = connections.find((c) => c.id === target.connId);
          const isPgOrSqlite =
            targetConn?.dbType === 'sqlite' ||
            targetConn?.dbType === 'postgres' ||
            targetConn?.dbType === 'postgresql';
          const defaultSql = isPgOrSqlite
            ? `SELECT * FROM "${target.tableName}" LIMIT 300`
            : `SELECT * FROM \`${target.dbName}\`.\`${target.tableName}\` LIMIT 300`;
          setSqlValue(defaultSql);
          setWhereInput('');
          setOrderByInput('');
        }
      }
    },
    [tableTabs, connections]
  );

  // Real-time synchronization from WHERE input to SQL editor
  const handleWhereChange = useCallback(
    (val: string) => {
      setWhereInput(val);
      isInternalFilterUpdate.current = true;
      const parsed = parseSqlClauses(sqlValue);
      let base = parsed.base;
      if (!base && activeTab) {
        const targetConn = connections.find((c) => c.id === activeTab.connId);
        const isPgOrSqlite =
          targetConn?.dbType === 'sqlite' ||
          targetConn?.dbType === 'postgres' ||
          targetConn?.dbType === 'postgresql';
        base = isPgOrSqlite
          ? `SELECT * FROM "${activeTab.tableName}"`
          : `SELECT * FROM \`${activeTab.dbName}\`.\`${activeTab.tableName}\``;
      }
      const limit = parsed.limit || 'LIMIT 300';
      const newSql = buildSqlWithClauses(base, val, parsed.orderBy, limit);
      setSqlValue(newSql);
    },
    [sqlValue, activeTab, connections]
  );

  // Real-time synchronization from ORDER BY input to SQL editor
  const handleOrderByChange = useCallback(
    (val: string) => {
      setOrderByInput(val);
      isInternalFilterUpdate.current = true;
      const parsed = parseSqlClauses(sqlValue);
      let base = parsed.base;
      if (!base && activeTab) {
        const targetConn = connections.find((c) => c.id === activeTab.connId);
        const isPgOrSqlite =
          targetConn?.dbType === 'sqlite' ||
          targetConn?.dbType === 'postgres' ||
          targetConn?.dbType === 'postgresql';
        base = isPgOrSqlite
          ? `SELECT * FROM "${activeTab.tableName}"`
          : `SELECT * FROM \`${activeTab.dbName}\`.\`${activeTab.tableName}\``;
      }
      const limit = parsed.limit || 'LIMIT 300';
      const newSql = buildSqlWithClauses(base, parsed.where, val, limit);
      setSqlValue(newSql);
    },
    [sqlValue, activeTab, connections]
  );

  // Clear WHERE and ORDER BY clauses
  const handleClearFilters = useCallback(() => {
    setWhereInput('');
    setOrderByInput('');
    isInternalFilterUpdate.current = true;
    const parsed = parseSqlClauses(sqlValue);
    const newSql = buildSqlWithClauses(parsed.base, '', '', parsed.limit);
    setSqlValue(newSql);
  }, [sqlValue]);

  // Apply WHERE and ORDER BY filter to the current active result tab
  const handleApplyFilter = useCallback(async () => {
    if (!activeTab || !hasActiveResult) return;

    const parsed = parseSqlClauses(sqlValue);
    let base = parsed.base;
    if (!base && activeTab) {
      const targetConn = connections.find((c) => c.id === activeTab.connId);
      const isPgOrSqlite =
        targetConn?.dbType === 'sqlite' ||
        targetConn?.dbType === 'postgres' ||
        targetConn?.dbType === 'postgresql';
      base = isPgOrSqlite
        ? `SELECT * FROM "${activeTab.tableName}"`
        : `SELECT * FROM \`${activeTab.dbName}\`.\`${activeTab.tableName}\``;
    }
    const limit = parsed.limit || 'LIMIT 300';
    const queryToRun = buildSqlWithClauses(base, whereInput, orderByInput, limit);
    setSqlValue(queryToRun);

    setTableTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id ? { ...t, sql: queryToRun, isLoading: true, error: null } : t
      )
    );

    try {
      const res = await fetch(`/api/databases/${activeTab.connId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: queryToRun,
          database: activeTab.dbName !== 'Query' ? activeTab.dbName : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Query execution failed');
      }

      const result = await res.json();
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? { ...t, result, error: null, isLoading: false, sql: queryToRun }
            : t
        )
      );
    } catch (err: any) {
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? { ...t, error: err.message || 'Query execution failed', isLoading: false }
            : t
        )
      );
    } finally {
      fetchHistory();
    }
  }, [activeTab, hasActiveResult, sqlValue, whereInput, orderByInput, connections, fetchHistory]);

  // Refresh active tab query
  const handleRefreshActiveTab = useCallback(async () => {
    if (!activeTab || !hasActiveResult) return;
    const queryToRun = activeTab.sql || sqlValue;

    setTableTabs((prev) =>
      prev.map((t) => (t.id === activeTab.id ? { ...t, isLoading: true, error: null } : t))
    );

    try {
      const res = await fetch(`/api/databases/${activeTab.connId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: queryToRun,
          database: activeTab.dbName !== 'Query' ? activeTab.dbName : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Query execution failed');
      }

      const result = await res.json();
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id ? { ...t, result, error: null, isLoading: false } : t
        )
      );
    } catch (err: any) {
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? { ...t, error: err.message || 'Query execution failed', isLoading: false }
            : t
        )
      );
    } finally {
      fetchHistory();
    }
  }, [activeTab, hasActiveResult, sqlValue, fetchHistory]);

  const editingConn = connections.find((c) => c.id === editConnectionId);
  const initialFormData = editingConn
    ? {
        dbType: (editingConn.dbType as DatabaseType) || 'mysql',
        label: editingConn.label || '',
        host: editingConn.host,
        port: editingConn.port,
        username: editingConn.username,
      }
    : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden p-4">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Database Management
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Query console, schema explorer, and multi-tab results
          </p>
        </div>
        <button
          onClick={() => {
            setEditConnectionId(null);
            setShowConnectionForm(true);
          }}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Connection
        </button>
      </div>

      {/* API Error display */}
      {apiError && (
        <div className="mb-4 flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-center justify-between">
          <p className="text-xs text-red-700 dark:text-red-400">{apiError}</p>
          <button
            onClick={() => setApiError(null)}
            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 ml-2"
            aria-label="Dismiss error"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main layout: sidebar + content */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Sidebar toggle button (visible when collapsed) */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="flex-shrink-0 flex flex-col items-center justify-start pt-3 w-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="mt-2 text-[10px] text-gray-500 dark:text-gray-400" style={{ writingMode: 'vertical-rl' }}>
              Explorer
            </span>
          </button>
        )}

        {/* Left sidebar */}
        {!sidebarCollapsed && (
          <aside className="w-[300px] flex-shrink-0 flex flex-col gap-4 min-h-0 overflow-hidden">
            {/* Collapse button */}
            <div className="flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Explorer
              </span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                aria-label="Close sidebar"
                title="Close sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Connection List */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex-shrink-0 max-h-[220px] overflow-y-auto">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Connections
              </h2>
              {isLoadingConnections ? (
                <div className="flex items-center justify-center py-6">
                  <LoadingSpinner />
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    Loading connections...
                  </span>
                </div>
              ) : (
                <ConnectionList
                  connections={connections}
                  activeConnectionId={activeConnectionId}
                  onSelect={(id) => setActiveConnectionId(id)}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}
            </div>

            {/* Database Tree View - grouped by connection */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-3 pb-2 flex-shrink-0">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Database Explorer
                </h2>
                {/* Search input */}
                {connections.filter((c) => c.status === 'connected').length > 0 && (
                  <input
                    type="text"
                    value={treeSearchQuery}
                    onChange={(e) => setTreeSearchQuery(e.target.value)}
                    placeholder="Search databases, tables..."
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                {connections.filter((c) => c.status === 'connected').length > 0 ? (
                  <ConnectionTreeView
                    connections={connections.filter((c) => c.status === 'connected')}
                    connectionDatabases={connectionDatabases}
                    tables={tables}
                    tableStructure={tableStructure}
                    accessDenied={accessDenied}
                    treeLoading={treeLoading}
                    activeConnectionId={activeConnectionId}
                    searchQuery={treeSearchQuery}
                    onExpandConnection={handleExpandConnection}
                    onExpandDatabase={handleExpandDatabaseForConn}
                    onExpandTable={handleExpandTableForConn}
                    onPreviewTable={handlePreviewTable}
                    onSelectConnection={(connId) => setActiveConnectionId(connId)}
                  />
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">
                    Connect to a database to browse its schema.
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* SQL Editor */}
          <div style={{ height: `${editorHeight}px` }} className="flex-shrink-0">
            <SQLEditor
              height={editorHeight}
              value={sqlValue}
              onChange={setSqlValue}
              onRun={handleRunQuery}
              schema={editorSchema}
              placeholder={
                activeConnectionId
                  ? 'Enter SQL query (⌘+Enter or Ctrl+Enter to run)...'
                  : 'Pilih koneksi database di panel kiri untuk menjalankan query...'
              }
            />
          </div>

          {/* Resizer Splitter Bar between SQL Editor and Result Box */}
          <div
            onMouseDown={handleSplitterMouseDown}
            onDoubleClick={handleResetEditorHeight}
            title="Drag to resize SQL Editor and Results panel (Double-click to reset)"
            data-testid="db-vertical-splitter"
            className="group relative flex items-center justify-center h-2.5 my-1 cursor-row-resize select-none hover:bg-blue-500/10 active:bg-blue-500/20 rounded transition-colors flex-shrink-0"
          >
            <div className="w-12 h-1 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-500 dark:group-hover:bg-blue-400 group-active:bg-blue-600 transition-colors" />
          </div>

          {/* Results / History panel tabs */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActivePanel('results')}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                  activePanel === 'results'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Results
                {tableTabs.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full font-mono">
                    {tableTabs.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActivePanel('history')}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                  activePanel === 'history'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                History
              </button>
            </div>

            {/* Filter & Refresh Toolbar */}
            <div
              data-testid="db-filter-toolbar"
              className={`flex items-center gap-2 mb-2 p-2 rounded-lg border transition-all ${
                hasActiveResult
                  ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs'
                  : 'bg-gray-50/80 dark:bg-gray-800/40 border-gray-200/60 dark:border-gray-700/60'
              }`}
            >
              {/* Refresh Button */}
              <button
                type="button"
                onClick={handleRefreshActiveTab}
                disabled={!hasActiveResult || activeTab?.isLoading}
                title={hasActiveResult ? 'Refresh active table query' : 'Open a result tab to refresh'}
                data-testid="filter-toolbar-refresh-btn"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all flex-shrink-0 ${
                  hasActiveResult && !activeTab?.isLoading
                    ? 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95'
                    : 'text-gray-400 dark:text-gray-500 bg-gray-100/50 dark:bg-gray-700/50 cursor-not-allowed opacity-60'
                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 ${activeTab?.isLoading ? 'animate-spin text-blue-500' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>Refresh</span>
              </button>

              <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

              {/* WHERE Clause Input */}
              <div className="flex-1 min-w-0">
                <div className="relative flex items-center w-full">
                  <span
                    className={`absolute left-2 text-[10px] font-bold font-mono uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none select-none transition-colors ${
                      hasActiveResult
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40'
                        : 'text-gray-400 dark:text-gray-500 bg-gray-200/50 dark:bg-gray-700/50'
                    }`}
                  >
                    WHERE
                  </span>
                  <input
                    type="text"
                    value={whereInput}
                    onChange={(e) => handleWhereChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyFilter();
                      }
                    }}
                    disabled={!hasActiveResult}
                    placeholder={
                      hasActiveResult
                        ? "condition (e.g. status = 'active' AND id > 100)..."
                        : 'Open a result tab to filter with WHERE clause...'
                    }
                    data-testid="filter-toolbar-where-input"
                    className={`w-full pl-16 pr-3 py-1.5 text-xs font-mono rounded-md border transition-colors focus:outline-none ${
                      hasActiveResult
                        ? 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
                        : 'bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 placeholder-gray-400/60 cursor-not-allowed opacity-60'
                    }`}
                  />
                </div>
              </div>

              {/* ORDER BY Clause Input */}
              <div className="w-56 sm:w-64 md:w-72 flex-shrink-0 min-w-0">
                <div className="relative flex items-center w-full">
                  <span
                    className={`absolute left-2 text-[10px] font-bold font-mono uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none select-none transition-colors ${
                      hasActiveResult
                        ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/40'
                        : 'text-gray-400 dark:text-gray-500 bg-gray-200/50 dark:bg-gray-700/50'
                    }`}
                  >
                    ORDER BY
                  </span>
                  <input
                    type="text"
                    value={orderByInput}
                    onChange={(e) => handleOrderByChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyFilter();
                      }
                    }}
                    disabled={!hasActiveResult}
                    placeholder={hasActiveResult ? 'e.g. created_at DESC' : 'ORDER BY...'}
                    data-testid="filter-toolbar-order-input"
                    className={`w-full pl-20 pr-3 py-1.5 text-xs font-mono rounded-md border transition-colors focus:outline-none ${
                      hasActiveResult
                        ? 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-purple-500 focus:border-purple-500'
                        : 'bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 placeholder-gray-400/60 cursor-not-allowed opacity-60'
                    }`}
                  />
                </div>
              </div>

              {/* Clear clauses button (shown when there's text) */}
              {hasActiveResult && (whereInput || orderByInput) && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  title="Clear WHERE and ORDER BY clauses"
                  data-testid="filter-toolbar-clear-btn"
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* Apply Filter Button */}
              <button
                type="button"
                onClick={handleApplyFilter}
                disabled={!hasActiveResult || activeTab?.isLoading}
                title={hasActiveResult ? 'Apply WHERE and ORDER BY filter (Enter)' : 'Open a result tab to filter'}
                data-testid="filter-toolbar-apply-btn"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md shadow-xs transition-all flex-shrink-0 ${
                  hasActiveResult && !activeTab?.isLoading
                    ? 'text-white bg-blue-600 hover:bg-blue-700 active:scale-95'
                    : 'text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 cursor-not-allowed opacity-60'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                <span>Filter</span>
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-auto min-h-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              {activePanel === 'results' && (
                <TableTabs
                  tabs={tableTabs}
                  activeTabId={activeTabId}
                  onSelectTab={handleSelectTab}
                  onCloseTab={handleCloseTab}
                  onRefreshTab={handleRefreshTab}
                  onExport={handleExportTab}
                  onCopyQuery={setSqlValue}
                  onExecuteUpdate={handleExecuteUpdate}
                />
              )}
              {activePanel === 'history' && (
                <QueryHistory
                  entries={queryHistory}
                  onSelectQuery={handleSelectHistoryQuery}
                  isLoading={isLoadingHistory}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Connection Form Modal */}
      {showConnectionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={handleConnectionFormCancel}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editConnectionId ? 'Edit Connection' : 'Add Connection'}
              </h2>
              <button
                onClick={handleConnectionFormCancel}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ConnectionForm
              initialData={initialFormData}
              onSubmit={handleConnectionFormSubmit}
              onCancel={handleConnectionFormCancel}
            />
          </div>
        </div>
      )}

      {/* Table Action Picker Modal */}
      {tableActionPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setTableActionPicker(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {tableActionPicker.tableName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-mono">
              {tableActionPicker.dbName}
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleViewTableData}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 transition-colors"
              >
                <span className="text-lg">📊</span>
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">View Data</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">SELECT * FROM table LIMIT 300</div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleViewTableDDL}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-gray-700 transition-colors"
              >
                <span className="text-lg">🏗️</span>
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">View DDL</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">SHOW CREATE TABLE</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DDL Popup Modal */}
      {ddlContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setDdlContent(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  DDL — {ddlContent.tableName}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">CREATE TABLE statement</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDDL}
                  disabled={ddlLoading || !ddlContent.ddl}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded transition-colors"
                >
                  Copy DDL
                </button>
                <button
                  type="button"
                  onClick={() => setDdlContent(null)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {ddlLoading ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Loading DDL...</span>
                </div>
              ) : (
                <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto">
                  {ddlContent.ddl}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dangerous Query Confirmation Modal */}
      {confirmQuery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={handleCancelExecute}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Confirm Execution
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This query will modify data in the database.
                </p>
              </div>
            </div>
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-auto max-h-[150px]">
              <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap break-all">
                {confirmQuery.sql}
              </pre>
            </div>
            <p className="text-xs text-orange-700 dark:text-orange-300 mb-4">
              ⚠️ Are you sure you want to execute this query? This action may not be reversible.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelExecute}
                className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExecute}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors"
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Connection-grouped tree view for Database Explorer */
interface ConnectionTreeViewProps {
  connections: ConnectionItem[];
  connectionDatabases: Record<string, string[]>;
  tables: Record<string, string[]>;
  tableStructure: Record<string, ColumnInfo[]>;
  accessDenied: string[];
  treeLoading: Record<string, boolean>;
  activeConnectionId: string | null;
  searchQuery: string;
  onExpandConnection: (connId: string) => void;
  onExpandDatabase: (connId: string, dbName: string) => void;
  onExpandTable: (connId: string, dbName: string, tableName: string) => void;
  onPreviewTable: (connId: string, dbName: string, tableName: string) => void;
  onSelectConnection: (connId: string) => void;
}

function ConnectionTreeView({
  connections,
  connectionDatabases,
  tables,
  tableStructure,
  accessDenied,
  treeLoading,
  activeConnectionId,
  searchQuery,
  onExpandConnection,
  onExpandDatabase,
  onExpandTable,
  onPreviewTable,
  onSelectConnection,
}: ConnectionTreeViewProps) {
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  function handleToggleConnection(connId: string) {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(connId)) {
        next.delete(connId);
      } else {
        next.add(connId);
        onExpandConnection(connId);
        onSelectConnection(connId);
      }
      return next;
    });
  }

  function handleToggleDatabase(connId: string, dbName: string) {
    const key = `${connId}.${dbName}`;
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        onExpandDatabase(connId, dbName);
      }
      return next;
    });
  }

  function handleToggleTable(connId: string, dbName: string, tableName: string) {
    const key = `${connId}.${dbName}.${tableName}`;
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        onExpandTable(connId, dbName, tableName);
      }
      return next;
    });
  }

  const query = searchQuery.toLowerCase().trim();

  return (
    <div className="text-xs" role="tree">
      <ul className="space-y-0.5" role="group">
        {connections.map((conn) => {
          const isConnExpanded = expandedConnections.has(conn.id);
          const isConnLoading = treeLoading[conn.id] ?? false;
          const isActive = activeConnectionId === conn.id;
          const allDbs = connectionDatabases[conn.id] ?? [];
          const connLabel = conn.label || `${conn.host}:${conn.port}`;

          let dbs = allDbs;
          if (query) {
            dbs = allDbs.filter((dbName) => {
              if (dbName.toLowerCase().includes(query)) return true;
              const dbKey = `${conn.id}.${dbName}`;
              const dbTables = tables[dbKey] ?? [];
              return dbTables.some((t) => t.toLowerCase().includes(query));
            });
            if (dbs.length === 0 && !connLabel.toLowerCase().includes(query)) {
              return null;
            }
          }

          return (
            <li key={conn.id} role="treeitem" aria-expanded={isConnExpanded}>
              <button
                type="button"
                onClick={() => handleToggleConnection(conn.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors text-left ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-[10px] text-gray-400 dark:text-gray-500 w-3 flex-shrink-0">
                  {isConnExpanded ? '▼' : '▶'}
                </span>
                <span className="flex-shrink-0">🔌</span>
                <span className="text-gray-900 dark:text-gray-100 truncate font-medium text-xs">
                  {connLabel}
                </span>
                <span className="text-[10px] px-1 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded flex-shrink-0 ml-auto font-mono">
                  {conn.dbType.toUpperCase()}
                </span>
                {isConnLoading && (
                  <span className="flex-shrink-0">
                    <LoadingSpinner />
                  </span>
                )}
              </button>

              {isConnExpanded && (
                <ul className="ml-4 mt-0.5 space-y-0.5" role="group">
                  {dbs.length === 0 && !isConnLoading && (
                    <li className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                      No databases found
                    </li>
                  )}
                  {dbs.map((dbName) => {
                    const dbKey = `${conn.id}.${dbName}`;
                    const isDbExpanded = expandedDatabases.has(dbKey);
                    const isDbLoading = treeLoading[dbKey] ?? false;
                    const isDbAccessDenied = accessDenied.includes(dbKey);
                    const allDbTables = tables[dbKey] ?? [];
                    const dbTables = query
                      ? allDbTables.filter((t) => t.toLowerCase().includes(query) || dbName.toLowerCase().includes(query))
                      : allDbTables;

                    return (
                      <li key={dbKey} role="treeitem" aria-expanded={isDbExpanded}>
                        <button
                          type="button"
                          onClick={() => handleToggleDatabase(conn.id, dbName)}
                          disabled={isDbAccessDenied}
                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          {!isDbAccessDenied && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 w-3 flex-shrink-0">
                              {isDbExpanded ? '▼' : '▶'}
                            </span>
                          )}
                          {isDbAccessDenied && (
                            <span className="text-[10px] w-3 flex-shrink-0">🔒</span>
                          )}
                          <span className="flex-shrink-0">
                            {isDbExpanded ? '📂' : '📁'}
                          </span>
                          <span className={`truncate ${isDbAccessDenied ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {dbName}
                          </span>
                          {isDbAccessDenied && (
                            <span className="ml-auto text-xs text-red-500 dark:text-red-400 flex-shrink-0">
                              Access denied
                            </span>
                          )}
                          {isDbLoading && (
                            <span className="ml-auto flex-shrink-0"><LoadingSpinner /></span>
                          )}
                        </button>

                        {isDbExpanded && !isDbAccessDenied && (
                          <ul className="ml-4 mt-0.5 space-y-0.5" role="group">
                            {dbTables.length === 0 && !isDbLoading && (
                              <li className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                                No tables found
                              </li>
                            )}
                            {dbTables.map((tableName) => {
                              const tableKey = `${conn.id}.${dbName}.${tableName}`;
                              const isTableExpanded = expandedTables.has(tableKey);
                              const isTableLoading = treeLoading[tableKey] ?? false;
                              const columns = tableStructure[tableKey] ?? [];

                              return (
                                <li key={tableKey} role="treeitem" aria-expanded={isTableExpanded}>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTable(conn.id, dbName, tableName)}
                                    onDoubleClick={(e) => {
                                      e.preventDefault();
                                      onPreviewTable(conn.id, dbName, tableName);
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      onPreviewTable(conn.id, dbName, tableName);
                                    }}
                                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                                  >
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 w-3 flex-shrink-0">
                                      {isTableExpanded ? '▼' : '▶'}
                                    </span>
                                    <span className="flex-shrink-0">
                                      {isTableExpanded ? '📋' : '📄'}
                                    </span>
                                    <span className="text-gray-900 dark:text-gray-100 truncate">
                                      {tableName}
                                    </span>
                                    {isTableLoading && (
                                      <span className="ml-auto flex-shrink-0"><LoadingSpinner /></span>
                                    )}
                                  </button>

                                  {isTableExpanded && (
                                    <ul className="ml-4 mt-0.5 space-y-0.5" role="group">
                                      {columns.length === 0 && !isTableLoading && (
                                        <li className="px-2 py-0.5 text-xs text-gray-400 dark:text-gray-500 italic">
                                          No columns found
                                        </li>
                                      )}
                                      {columns.map((col) => (
                                        <li
                                          key={`${tableKey}.${col.name}`}
                                          className="flex items-center gap-1.5 px-2 py-0.5 text-xs"
                                          role="treeitem"
                                        >
                                          <span className="flex-shrink-0">
                                            {col.primaryKey ? '🔑' : '🔹'}
                                          </span>
                                          <span className="font-medium text-gray-800 dark:text-gray-200">
                                            {col.name}
                                          </span>
                                          <span className="text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                                            {col.type}
                                          </span>
                                          {col.nullable && (
                                            <span className="text-gray-400 dark:text-gray-500 text-[10px]">
                                              NULL
                                            </span>
                                          )}
                                          {!col.nullable && (
                                            <span className="text-orange-500 dark:text-orange-400 text-[10px]">
                                              NOT NULL
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5 text-gray-400 dark:text-gray-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default DatabaseManagementPage;
