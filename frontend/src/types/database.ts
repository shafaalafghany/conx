export type DatabaseType = 'mysql' | 'postgresql' | 'mariadb' | 'sqlite';
export type ConnectionStatus = 'connected' | 'disconnected' | 'unreachable';

export interface DatabaseConnection {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslMode: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConnectionItem {
  id: string;
  label?: string | null;
  dbType: string;
  host: string;
  port: number;
  username: string;
  status: ConnectionStatus;
}

export interface ColumnInfo {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  totalRows?: number;
  truncated: boolean;
  affectedRows?: number;
  executionTimeMs: number;
  error?: string;
}

export interface QueryHistoryEntry {
  id: string;
  queryText: string;
  databaseName: string | null;
  status: 'success' | 'error';
  errorMessage: string | null;
  executionTimeMs: number | null;
  rowCount: number | null;
  executedAt: string;
}

export interface TableTab {
  id: string; // unique key: connId.dbName.tableName or query.N
  connId: string;
  dbName: string;
  tableName: string;
  sql?: string;
  result: QueryResult | null;
  error: string | null;
  isLoading: boolean;
}

export interface ConnectionFormData {
  dbType: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  label?: string;
  databaseName?: string;
  sslMode?: string;
}

export interface ConnectionFormInitialData {
  dbType: DatabaseType;
  host: string;
  port: number;
  username: string;
  label?: string;
  databaseName?: string;
  sslMode?: string;
}
