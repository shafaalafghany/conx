import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ConnectionList from './db/ConnectionList';
import QueryHistory from './db/QueryHistory';
import ConnectionForm from './db/ConnectionForm';
import TableTabs from './db/TableTabs';
import SQLEditor from './db/SQLEditor';
import { ConnectionTreeView } from './db/ConnectionTreeView';
import { FilterToolbar } from './db/FilterToolbar';
import {
  TableActionPickerModal,
  DDLModal,
  ConfirmExecutionModal,
} from './db/modals/TableModals';
import { parseSqlClauses, buildSqlWithClauses } from './db/sql-editor-utils';
import { api } from '../api/client';
import type {
  TableTab,
  ConnectionItem,
  ColumnInfo,
  QueryResult,
  QueryHistoryEntry,
  ConnectionFormData,
  DatabaseType,
  MainPanel,
} from '../types';

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
  const [sqlValue, setSqlValue] = useState(
    'SELECT 1 AS status, "Ready to query" AS message, CURRENT_TIMESTAMP AS time;'
  );
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

  // Splitter resizer state
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

  // Modals state
  const [confirmQuery, setConfirmQuery] = useState<{ sql: string; selectedText?: string } | null>(null);
  const [tableActionPicker, setTableActionPicker] = useState<{ connId: string; dbName: string; tableName: string } | null>(null);
  const [ddlContent, setDdlContent] = useState<{ tableName: string; ddl: string } | null>(null);
  const [ddlLoading, setDdlLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Build schema for SQL autocomplete
  const editorSchema = useMemo(() => {
    const schema: Record<string, Record<string, readonly string[]>> = {};

    for (const [key, columns] of Object.entries(tableStructure)) {
      const colNames = columns.map((col) => col.name);
      for (const connId of Object.keys(connectionDatabases)) {
        if (key.startsWith(`${connId}.`)) {
          const rest = key.slice(connId.length + 1);
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

  // Load all connections
  const fetchConnections = useCallback(async () => {
    setIsLoadingConnections(true);
    setApiError(null);
    try {
      const data = await api.listDatabases();
      const loadedConnections: ConnectionItem[] = (data || []).map((c: any) => ({
        id: c.id,
        label: c.label || c.name,
        dbType: c.dbType || c.type,
        host: c.host,
        port: c.port,
        username: c.username,
        databaseName: c.databaseName || '',
        hasPassword: c.hasPassword !== undefined ? !!c.hasPassword : (c.encryptedPassword ? c.encryptedPassword.length > 0 : false),
        status: (c.status as any) || 'disconnected',
      }));
      setConnections(loadedConnections);
      setActiveConnectionId((curr) => {
        if (curr) return curr;
        const connected = loadedConnections.find((c) => c.status === 'connected');
        if (connected) return connected.id;
        if (loadedConnections.length > 0) return loadedConnections[0].id;
        return null;
      });
    } catch (err: any) {
      setApiError(err.message || 'Failed to load connections');
    } finally {
      setIsLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    const onImported = () => fetchConnections();
    window.addEventListener('conx:settings-imported', onImported);
    return () => window.removeEventListener('conx:settings-imported', onImported);
  }, [fetchConnections]);

  // Load schema for a connection
  const handleExpandConnection = useCallback(async (connId: string) => {
    if (connectionDatabases[connId]) return;
    setTreeLoading((prev) => ({ ...prev, [connId]: true }));
    try {
      const dbs = await api.getDatabases(connId);
      setConnectionDatabases((prev) => ({ ...prev, [connId]: dbs }));
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : 'Failed to list databases');
      setApiError(msg);
    } finally {
      setTreeLoading((prev) => ({ ...prev, [connId]: false }));
    }
  }, [connectionDatabases]);

  // Load tables for a database
  const handleExpandDatabaseForConn = useCallback(async (connId: string, dbName: string) => {
    const key = `${connId}.${dbName}`;
    if (tables[key]) return;
    setTreeLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const tableList = await api.getTables(connId, dbName);
      setTables((prev) => ({ ...prev, [key]: tableList }));
    } catch (err: any) {
      setAccessDenied((prev) => [...prev, key]);
      const msg = err?.message || (typeof err === 'string' ? err : `Failed to load tables for ${dbName}`);
      setApiError(msg);
    } finally {
      setTreeLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [tables]);

  // Load table structure
  const handleExpandTableForConn = useCallback(async (connId: string, dbName: string, tableName: string) => {
    const key = `${connId}.${dbName}.${tableName}`;
    if (tableStructure[key]) return;
    setTreeLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const cols = await api.getTableColumns(connId, dbName, tableName);
      setTableStructure((prev) => ({ ...prev, [key]: cols }));
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : `Failed to load columns for ${tableName}`);
      setApiError(msg);
    } finally {
      setTreeLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [tableStructure]);

  // Fetch query history
  const fetchHistory = useCallback(async () => {
    if (!activeConnectionId) return;
    setIsLoadingHistory(true);
    try {
      const data = await api.getQueryHistory(activeConnectionId);
      setQueryHistory(data || []);
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

  // Connect handler
  const handleConnect = useCallback(async (id: string) => {
    setApiError(null);
    try {
      await api.connectDatabase(id);
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'connected' } : c))
      );
      setActiveConnectionId(id);
      handleExpandConnection(id);
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : 'Failed to connect');
      setApiError(msg);
    }
  }, [handleExpandConnection]);

  // Disconnect handler
  const handleDisconnect = useCallback(async (id: string) => {
    try {
      await api.disconnectDatabase(id);
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'disconnected' } : c))
      );
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : 'Failed to disconnect');
      setApiError(msg);
    }
  }, []);

  // Delete connection handler
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this connection?')) return;
    try {
      await api.deleteDatabase(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      if (activeConnectionId === id) {
        setActiveConnectionId(null);
      }
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : 'Failed to delete connection');
      setApiError(msg);
    }
  }, [activeConnectionId]);

  // Edit connection handler
  const handleEdit = useCallback((id: string) => {
    setEditConnectionId(id);
    setShowConnectionForm(true);
  }, []);

  // Connection form submit
  const handleConnectionFormSubmit = useCallback(async (formData: ConnectionFormData) => {
    setApiError(null);
    try {
      const payload = {
        id: editConnectionId || '',
        name: formData.label || `${formData.host}:${formData.port}`,
        type: formData.dbType,
        host: formData.host,
        port: formData.port,
        databaseName: formData.databaseName || '',
        username: formData.username,
        sslMode: 'disable',
      };
      await api.saveDatabase(payload, formData.password);
      setShowConnectionForm(false);
      setEditConnectionId(null);
      await fetchConnections();
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : 'Failed to save connection');
      setApiError(msg);
    }
  }, [editConnectionId, fetchConnections]);

  // Preview table action picker
  const handlePreviewTable = useCallback((connId: string, dbName: string, tableName: string) => {
    const tabId = `${connId}.${dbName}.${tableName}`;
    const existingTab = tableTabs.find((t) => t.id === tabId);
    if (existingTab) {
      setActiveTabId(tabId);
      setActivePanel('results');
      return;
    }
    setTableActionPicker({ connId, dbName, tableName });
  }, [tableTabs]);

  // View table data
  const handleViewTableData = useCallback(async () => {
    if (!tableActionPicker) return;
    const { connId, dbName, tableName } = tableActionPicker;
    setTableActionPicker(null);

    const targetConn = connections.find((c) => c.id === connId);
    const isPgOrSqlite =
      targetConn?.dbType === 'sqlite' ||
      targetConn?.dbType === 'postgres' ||
      targetConn?.dbType === 'postgresql';
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
      const rawResult = await api.executeQuery(connId, sql, dbName);
      const result: QueryResult = {
        ...rawResult,
        truncated: rawResult?.truncated ?? false,
        columns: rawResult?.columns || [],
        rows: rawResult?.rows || [],
        rowCount: rawResult?.rowCount ?? rawResult?.rows?.length ?? 0,
        executionTimeMs: rawResult?.executionTimeMs || 0,
      };
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

  // View DDL
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
      const result = await api.executeQuery(connId, sql, dbName);
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

  // Refresh tab
  const handleRefreshTab = useCallback(async (tab: TableTab) => {
    const { id: tabId, connId, dbName, tableName, sql: tabSql } = tab;

    setTableTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isLoading: true, error: null } : t))
    );

    const targetConn = connections.find((c) => c.id === connId);
    const isPgOrSqlite =
      targetConn?.dbType === 'sqlite' ||
      targetConn?.dbType === 'postgres' ||
      targetConn?.dbType === 'postgresql';
    const defaultSql = isPgOrSqlite
      ? `SELECT * FROM "${tableName}" LIMIT 300`
      : `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 300`;

    const sqlToRun = tabSql || defaultSql;

    try {
      const rawResult = await api.executeQuery(connId, sqlToRun, dbName !== 'Query' ? dbName : '');
      const result: QueryResult = {
        ...rawResult,
        truncated: rawResult?.truncated ?? false,
        columns: rawResult?.columns || [],
        rows: rawResult?.rows || [],
        rowCount: rawResult?.rowCount ?? rawResult?.rows?.length ?? 0,
        executionTimeMs: rawResult?.executionTimeMs || 0,
      };
      setTableTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, result, error: null, isLoading: false, sql: sqlToRun } : t))
      );
    } catch (err: any) {
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, error: err.message || 'Query failed', isLoading: false } : t
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
      await api.exportCSV(tab.connId, tab.dbName, tab.result.columns, tab.result.rows);
    } catch (err: any) {
      setApiError(err.message || 'Export failed');
    }
  }, []);

  // Execute SQL Query
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
      const rawResult = await api.executeQuery(activeConnectionId, queryToRun);
      const result: QueryResult = {
        ...rawResult,
        truncated: rawResult?.truncated ?? false,
        columns: rawResult?.columns || [],
        rows: rawResult?.rows || [],
        rowCount: rawResult?.rowCount ?? rawResult?.rows?.length ?? 0,
        executionTimeMs: rawResult?.executionTimeMs || 0,
      };
      setTableTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, result, isLoading: false, sql: queryToRun } : t))
      );
    } catch (err: any) {
      setTableTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, error: err.message || 'Query failed', isLoading: false } : t
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
    const isDangerous =
      upperQuery.startsWith('INSERT') ||
      upperQuery.startsWith('UPDATE') ||
      upperQuery.startsWith('DELETE') ||
      upperQuery.startsWith('DROP') ||
      upperQuery.startsWith('ALTER') ||
      upperQuery.startsWith('TRUNCATE');

    if (isDangerous) {
      setConfirmQuery({ sql: queryToRun, selectedText });
      return;
    }

    await executeQuery(queryToRun);
  }, [sqlValue, activeConnectionId, queryTabCounter, executeQuery]);

  // Sync SQL value to WHERE / ORDER BY
  useEffect(() => {
    if (isInternalFilterUpdate.current) {
      isInternalFilterUpdate.current = false;
      return;
    }
    const parsed = parseSqlClauses(sqlValue);
    setWhereInput(parsed.where);
    setOrderByInput(parsed.orderBy);
  }, [sqlValue]);

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    const target = tableTabs.find((t) => t.id === tabId);
    if (target) {
      if (target.sql) {
        setSqlValue(target.sql);
        const parsed = parseSqlClauses(target.sql);
        setWhereInput(parsed.where);
        setOrderByInput(parsed.orderBy);
      }
    }
  }, [tableTabs]);

  const handleWhereChange = useCallback((val: string) => {
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
    setSqlValue(buildSqlWithClauses(base, val, parsed.orderBy, limit));
  }, [sqlValue, activeTab, connections]);

  const handleOrderByChange = useCallback((val: string) => {
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
    setSqlValue(buildSqlWithClauses(base, parsed.where, val, limit));
  }, [sqlValue, activeTab, connections]);

  const handleClearFilters = useCallback(() => {
    setWhereInput('');
    setOrderByInput('');
    isInternalFilterUpdate.current = true;
    const parsed = parseSqlClauses(sqlValue);
    setSqlValue(buildSqlWithClauses(parsed.base, '', '', parsed.limit));
  }, [sqlValue]);

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
      const rawResult = await api.executeQuery(
        activeTab.connId,
        queryToRun,
        activeTab.dbName !== 'Query' ? activeTab.dbName : ''
      );
      const result: QueryResult = {
        ...rawResult,
        truncated: rawResult?.truncated ?? false,
        columns: rawResult?.columns || [],
        rows: rawResult?.rows || [],
        rowCount: rawResult?.rowCount ?? rawResult?.rows?.length ?? 0,
        executionTimeMs: rawResult?.executionTimeMs || 0,
      };
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
          t.id === activeTab.id ? { ...t, error: err.message || 'Query failed', isLoading: false } : t
        )
      );
    }
  }, [activeTab, hasActiveResult, sqlValue, whereInput, orderByInput, connections]);

  const editingConn = connections.find((c) => c.id === editConnectionId);
  const initialFormData = editingConn
    ? {
        id: editingConn.id,
        dbType: (editingConn.dbType === 'postgres' ? 'postgresql' : editingConn.dbType as DatabaseType) || 'mysql',
        label: editingConn.label || '',
        host: editingConn.host,
        port: editingConn.port,
        username: editingConn.username,
        databaseName: (editingConn as any).databaseName || '',
        hasPassword: editingConn.hasPassword,
      }
    : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden p-4">
      {/* Header */}
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

      {/* API Error Banner */}
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

      {/* Main Layout: Sidebar + Query Console */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Collapsed Sidebar Toggle */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="flex-shrink-0 flex flex-col items-center justify-start pt-3 w-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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

        {/* Left Sidebar */}
        {!sidebarCollapsed && (
          <aside className="w-[300px] flex-shrink-0 flex flex-col gap-4 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Explorer
              </span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
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
                <div className="flex items-center justify-center py-6 text-xs text-gray-500">
                  Loading connections...
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

            {/* Database Tree View */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-3 pb-2 flex-shrink-0">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Database Explorer
                </h2>
                {connections.filter((c) => c.status === 'connected').length > 0 && (
                  <div className="relative">
                    <input
                      type="text"
                      value={treeSearchQuery}
                      onChange={(e) => setTreeSearchQuery(e.target.value)}
                      placeholder="Search databases, tables..."
                      className="w-full pl-2.5 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {treeSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setTreeSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
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

        {/* Main Content: SQL Editor + Results */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
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

          {/* Resizer Splitter */}
          <div
            onMouseDown={handleSplitterMouseDown}
            onDoubleClick={handleResetEditorHeight}
            title="Drag to resize SQL Editor and Results panel (Double-click to reset)"
            data-testid="db-vertical-splitter"
            className="group relative flex items-center justify-center h-2.5 my-1 cursor-row-resize select-none hover:bg-blue-500/10 active:bg-blue-500/20 rounded transition-colors flex-shrink-0"
          >
            <div className="w-12 h-1 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-500 transition-colors" />
          </div>

          {/* Results / History Panel */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActivePanel('results')}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                  activePanel === 'results'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                History
              </button>
            </div>

            {/* Filter Toolbar */}
            <FilterToolbar
              hasActiveResult={hasActiveResult}
              isLoading={Boolean(activeTab?.isLoading)}
              whereInput={whereInput}
              orderByInput={orderByInput}
              onRefresh={() => activeTab && handleRefreshTab(activeTab)}
              onWhereChange={handleWhereChange}
              onOrderByChange={handleOrderByChange}
              onClearFilters={handleClearFilters}
              onApplyFilter={handleApplyFilter}
            />

            {/* Tab Body */}
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
                  onExecuteUpdate={(sql) => executeQuery(sql)}
                />
              )}
              {activePanel === 'history' && (
                <QueryHistory
                  entries={queryHistory}
                  onSelectQuery={(q) => setSqlValue(q)}
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
            onClick={() => {
              setShowConnectionForm(false);
              setEditConnectionId(null);
            }}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editConnectionId ? 'Edit Connection' : 'Add Connection'}
              </h2>
              <button
                onClick={() => {
                  setShowConnectionForm(false);
                  setEditConnectionId(null);
                }}
                className="text-gray-500 hover:text-gray-700"
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
              onCancel={() => {
                setShowConnectionForm(false);
                setEditConnectionId(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Table Action Picker Modal */}
      <TableActionPickerModal
        data={tableActionPicker}
        onClose={() => setTableActionPicker(null)}
        onViewData={handleViewTableData}
        onViewDDL={handleViewTableDDL}
      />

      {/* DDL Modal */}
      <DDLModal
        content={ddlContent}
        isLoading={ddlLoading}
        onClose={() => setDdlContent(null)}
        onCopy={handleCopyDDL}
      />

      {/* Confirmation Modal */}
      <ConfirmExecutionModal
        confirmQuery={confirmQuery}
        onCancel={() => setConfirmQuery(null)}
        onConfirm={() => {
          if (confirmQuery) {
            executeQuery(confirmQuery.sql);
            setConfirmQuery(null);
          }
        }}
      />
    </div>
  );
}

export default DatabaseManagementPage;
