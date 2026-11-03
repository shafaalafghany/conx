import { useState, useEffect, useRef } from 'react';
import type { ConnectionItem, ColumnInfo } from '../../types';

export interface ConnectionTreeViewProps {
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

export function ConnectionTreeView({
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
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeConnectionId) {
      initial.add(activeConnectionId);
    }
    return initial;
  });
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const lastActiveConnIdRef = useRef<string | null>(null);
  const lastSearchQueryRef = useRef(searchQuery);

  // Auto-expand active connection when connection changes
  useEffect(() => {
    if (activeConnectionId && activeConnectionId !== lastActiveConnIdRef.current) {
      lastActiveConnIdRef.current = activeConnectionId;
      setExpandedConnections((prev) => {
        const next = new Set(prev);
        next.add(activeConnectionId);
        return next;
      });
      if (!connectionDatabases[activeConnectionId]) {
        onExpandConnection(activeConnectionId);
      }
    }
  }, [activeConnectionId, connectionDatabases, onExpandConnection]);

  // When search query is entered/modified, auto-expand connections with matches so user sees them
  useEffect(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    const prevTrimmed = lastSearchQueryRef.current.trim().toLowerCase();
    if (trimmed && trimmed !== prevTrimmed) {
      setExpandedConnections((prev) => {
        const next = new Set(prev);
        connections.forEach((conn) => next.add(conn.id));
        return next;
      });
    }
    lastSearchQueryRef.current = searchQuery;
  }, [searchQuery, connections]);

  function handleToggleConnection(connId: string) {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(connId)) {
        next.delete(connId);
      } else {
        next.add(connId);
        if (!connectionDatabases[connId]) {
          onExpandConnection(connId);
        }
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
        if (!tables[key] && !treeLoading[key]) {
          onExpandDatabase(connId, dbName);
        }
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
        if (!tableStructure[key] && !treeLoading[key]) {
          onExpandTable(connId, dbName, tableName);
        }
      }
      return next;
    });
  }

  const query = searchQuery.trim().toLowerCase();

  // Check if any connections have matches
  const hasAnyMatches = !query || connections.some((conn) => {
    const dbs = connectionDatabases[conn.id] || [];
    const connLabelMatch = Boolean(
      (conn.label && conn.label.toLowerCase().includes(query)) ||
      conn.host.toLowerCase().includes(query) ||
      conn.dbType.toLowerCase().includes(query)
    );
    if (connLabelMatch) return true;
    return dbs.some((dbName) => {
      if (dbName.toLowerCase().includes(query)) return true;
      const dbKey = `${conn.id}.${dbName}`;
      const dbTables = tables[dbKey] || [];
      return dbTables.some((t) => t.toLowerCase().includes(query));
    });
  });

  if (query && !hasAnyMatches) {
    return (
      <div className="text-center py-6 text-gray-400 dark:text-gray-500">
        <p className="text-xs">No databases or tables matching "{searchQuery}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-xs">
      {connections.map((conn) => {
        const isConnExpanded = expandedConnections.has(conn.id);
        const dbs = connectionDatabases[conn.id] || [];
        const isConnActive = conn.id === activeConnectionId;
        const isConnLoading = treeLoading[conn.id];

        const connLabelMatch = Boolean(
          (conn.label && conn.label.toLowerCase().includes(query)) ||
          conn.host.toLowerCase().includes(query) ||
          conn.dbType.toLowerCase().includes(query)
        );

        const visibleDbs = dbs.filter((dbName) => {
          if (!query || connLabelMatch) return true;
          if (dbName.toLowerCase().includes(query)) return true;
          const dbKey = `${conn.id}.${dbName}`;
          const dbTables = tables[dbKey] || [];
          return dbTables.some((t) => t.toLowerCase().includes(query));
        });

        if (query && !connLabelMatch && visibleDbs.length === 0) {
          return null;
        }

        return (
          <div key={conn.id} className="select-none">
            {/* Connection header */}
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                isConnActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-200'
              }`}
              onClick={() => handleToggleConnection(conn.id)}
              title={isConnExpanded ? 'Click to collapse connection' : 'Click to expand connection'}
            >
              <span className="text-gray-400 dark:text-gray-500 w-3 text-center text-[10px]">
                {isConnLoading ? '⟳' : isConnExpanded ? '▼' : '▶'}
              </span>
              <span className="text-xs">⚡</span>
              <span className="font-semibold truncate flex-1">{conn.label || `${conn.host}:${conn.port}`}</span>
              <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {conn.dbType}
              </span>
            </div>

            {/* Connection children: databases */}
            {isConnExpanded && (
              <div className="ml-4 pl-2 border-l border-gray-200 dark:border-gray-700 space-y-0.5 mt-0.5">
                {dbs.length === 0 && !isConnLoading && (
                  <p className="text-[11px] text-gray-400 py-1 pl-2">No databases found</p>
                )}
                {dbs.length > 0 && visibleDbs.length === 0 && !isConnLoading && (
                  <p className="text-[11px] text-gray-400 py-1 pl-2">No matching databases</p>
                )}
                {visibleDbs.map((dbName) => {
                  const dbKey = `${conn.id}.${dbName}`;
                  const isDbExpanded = expandedDatabases.has(dbKey);
                  const rawTables = tables[dbKey];
                  const isDbLoading = treeLoading[dbKey];
                  const isDenied = accessDenied.includes(dbKey);

                  const isDbNameMatch = !query || connLabelMatch || dbName.toLowerCase().includes(query);
                  const filteredTables = (rawTables || []).filter((t) => {
                    if (!query) return true;
                    if (isDbNameMatch) return true;
                    return t.toLowerCase().includes(query);
                  });

                  const matchingTableCount = (rawTables || []).filter((t) =>
                    t.toLowerCase().includes(query)
                  ).length;

                  return (
                    <div key={dbKey}>
                      <div
                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 ${
                          isDenied ? 'opacity-50 text-red-500' : 'text-gray-700 dark:text-gray-300'
                        }`}
                        onClick={() => !isDenied && handleToggleDatabase(conn.id, dbName)}
                        title={
                          isDenied
                            ? 'Access denied'
                            : isDbExpanded
                            ? 'Click to collapse database'
                            : 'Click to expand database'
                        }
                      >
                        <span className="text-gray-400 w-3 text-center text-[10px]">
                          {isDbLoading ? '⟳' : isDbExpanded ? '▼' : '▶'}
                        </span>
                        <span>📁</span>
                        <span className="truncate flex-1 font-mono text-[11px]">{dbName}</span>
                        {isDenied && <span className="text-[9px] text-red-500 font-sans">denied</span>}
                        {query && !isDbNameMatch && matchingTableCount > 0 && !isDbExpanded && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-sans font-medium">
                            {matchingTableCount} table{matchingTableCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Database children: tables */}
                      {isDbExpanded && !isDenied && (
                        <div className="ml-4 pl-2 border-l border-gray-200 dark:border-gray-700 space-y-0.5 mt-0.5">
                          {isDbLoading && (
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 py-1 pl-2">
                              <span className="animate-spin text-[10px]">⟳</span>
                              <span>Loading tables...</span>
                            </div>
                          )}
                          {!isDbLoading && rawTables === undefined && (
                            <div className="flex items-center justify-between text-[10px] text-gray-400 py-1 pl-2">
                              <span>Tables not loaded</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExpandDatabase(conn.id, dbName);
                                }}
                                className="text-blue-500 hover:underline text-[10px]"
                              >
                                Load tables
                              </button>
                            </div>
                          )}
                          {!isDbLoading && rawTables !== undefined && rawTables.length === 0 && (
                            <p className="text-[10px] text-gray-400 py-0.5 pl-2">No tables found</p>
                          )}
                          {!isDbLoading &&
                            rawTables !== undefined &&
                            rawTables.length > 0 &&
                            filteredTables.length === 0 && (
                              <p className="text-[10px] text-gray-400 py-0.5 pl-2">No matching tables</p>
                            )}
                          {!isDbLoading &&
                            rawTables !== undefined &&
                            filteredTables.map((tableName) => {
                              const tableKey = `${conn.id}.${dbName}.${tableName}`;
                              const isTableExpanded = expandedTables.has(tableKey);
                              const rawColumns = tableStructure[tableKey];
                              const columns = rawColumns || [];
                              const isTableLoading = treeLoading[tableKey];

                              return (
                                <div key={tableKey}>
                                  <div className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 group text-gray-600 dark:text-gray-300">
                                    <span
                                      className="text-gray-400 w-3 text-center text-[9px] cursor-pointer hover:text-gray-600 dark:hover:text-gray-200"
                                      onClick={() => handleToggleTable(conn.id, dbName, tableName)}
                                      title={isTableExpanded ? 'Collapse columns' : 'Expand columns'}
                                    >
                                      {isTableLoading ? '⟳' : isTableExpanded ? '▼' : '▶'}
                                    </span>
                                    <span
                                      className="truncate flex-1 font-mono text-[11px] cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                                      onClick={() => onPreviewTable(conn.id, dbName, tableName)}
                                      title={`Preview ${tableName}`}
                                    >
                                      📋 {tableName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onPreviewTable(conn.id, dbName, tableName)}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900 rounded text-[10px] text-blue-600 transition-opacity"
                                      title="View Table Data"
                                    >
                                      open
                                    </button>
                                  </div>

                                  {/* Table children: columns */}
                                  {isTableExpanded && (
                                    <div className="ml-5 pl-2 border-l border-gray-100 dark:border-gray-800 space-y-0.5">
                                      {isTableLoading && (
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 py-0.5">
                                          <span className="animate-spin text-[10px]">⟳</span>
                                          <span>Loading columns...</span>
                                        </div>
                                      )}
                                      {!isTableLoading && rawColumns === undefined && (
                                        <p className="text-[10px] text-gray-400 py-0.5">Columns not loaded</p>
                                      )}
                                      {!isTableLoading && rawColumns !== undefined && columns.length === 0 && (
                                        <p className="text-[10px] text-gray-400 py-0.5">No columns found</p>
                                      )}
                                      {!isTableLoading &&
                                        columns.map((col) => (
                                          <div
                                            key={col.name}
                                            className="flex items-center gap-1.5 py-0.5 text-[10px] font-mono text-gray-500 dark:text-gray-400"
                                          >
                                            <span>{col.isPrimaryKey ? '🔑' : '▫️'}</span>
                                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                                              {col.name}
                                            </span>
                                            <span className="text-gray-400">{col.type}</span>
                                            {col.isNullable && (
                                              <span className="text-[9px] text-gray-400">null</span>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ConnectionTreeView;
