// Unified API client that auto-switches between Wails Native IPC and Web REST/WS mode

export const isWails = (): boolean => {
  return typeof (window as any).go?.main?.App !== 'undefined';
};

const getWailsApp = () => (window as any).go?.main?.App;

export const api = {
  // --- Virtual Machines ---
  listVMs: async () => {
    if (isWails()) {
      return getWailsApp().ListVMs();
    }
    const res = await fetch('/api/vms');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  saveVM: async (vm: any, password = '', keyData = '') => {
    if (isWails()) {
      return getWailsApp().SaveVM(vm, password, keyData);
    }
    const res = await fetch('/api/vms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...vm, password, keyData }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteVM: async (id: string) => {
    if (isWails()) {
      return getWailsApp().DeleteVM(id);
    }
    const res = await fetch(`/api/vms?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  refreshHealth: async () => {
    if (isWails()) {
      return getWailsApp().RefreshVMHealth();
    }
    const res = await fetch('/api/vms/health');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  listFiles: async (vmId: string, dir = '') => {
    if (isWails()) {
      return getWailsApp().ListFiles(vmId, dir);
    }
    const res = await fetch(`/api/vms/files?vmId=${encodeURIComponent(vmId)}&dir=${encodeURIComponent(dir)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  getVMPassword: async (vmId: string): Promise<{ hasPassword: boolean; password?: string }> => {
    if (isWails()) {
      const pass = await getWailsApp().GetVMPassword(vmId);
      return { hasPassword: Boolean(pass), password: pass || '' };
    }
    const res = await fetch(`/api/vms/password?vmId=${encodeURIComponent(vmId)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  setVMPassword: async (vmId: string, password: string): Promise<void> => {
    if (isWails()) {
      return getWailsApp().SetVMPassword(vmId, password);
    }
    const res = await fetch(`/api/vms/password?vmId=${encodeURIComponent(vmId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(await res.text());
  },

  // --- SSH Terminal ---
  startSSHSession: async (vmId: string, cols = 80, rows = 24): Promise<string> => {
    if (isWails()) {
      return getWailsApp().StartSSHSession(vmId, cols, rows);
    }
    return `web-${vmId}-${Date.now()}`;
  },

  sendTerminalInput: async (sessionId: string, data: string): Promise<void> => {
    if (isWails()) {
      return getWailsApp().SendTerminalInput(sessionId, data);
    }
  },

  resizeTerminal: async (sessionId: string, cols: number, rows: number): Promise<void> => {
    if (isWails()) {
      return getWailsApp().ResizeTerminal(sessionId, cols, rows);
    }
  },

  closeSSHSession: async (sessionId: string): Promise<void> => {
    if (isWails()) {
      return getWailsApp().CloseSSHSession(sessionId);
    }
  },

  // --- Databases ---
  listDatabases: async () => {
    if (isWails()) {
      return getWailsApp().ListDatabases();
    }
    const res = await fetch('/api/databases');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  saveDatabase: async (conn: any, password = '') => {
    if (isWails()) {
      return getWailsApp().SaveDatabase(conn, password);
    }
    const res = await fetch('/api/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...conn, password }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteDatabase: async (id: string) => {
    if (isWails()) {
      return getWailsApp().DeleteDatabase(id);
    }
    const res = await fetch(`/api/databases?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  testDatabase: async (conn: any, password = '') => {
    if (isWails()) {
      return getWailsApp().TestDatabaseConnection(conn, password);
    }
    const res = await fetch('/api/databases/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...conn, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Connection failed');
    }
    return data.message || 'Connection verified!';
  },

  connectDatabase: async (id: string) => {
    if (isWails()) {
      const dbs = await getWailsApp().ListDatabases();
      const target = (dbs || []).find((c: any) => c.id === id);
      if (!target) throw new Error('Database profile not found');
      await getWailsApp().TestDatabaseConnection(target, '');
      return { status: 'connected' };
    }
    const res = await fetch(`/api/databases/${encodeURIComponent(id)}/connect`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || 'Failed to connect');
    }
    return res.json();
  },

  disconnectDatabase: async (id: string) => {
    if (isWails()) {
      return { status: 'disconnected' };
    }
    const res = await fetch(`/api/databases/${encodeURIComponent(id)}/disconnect`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  getConnectionStatus: async (id: string): Promise<string> => {
    if (isWails()) {
      return 'connected';
    }
    try {
      const res = await fetch(`/api/databases/${encodeURIComponent(id)}/status`);
      if (!res.ok) return 'disconnected';
      const data = await res.json();
      return data.status || 'disconnected';
    } catch {
      return 'disconnected';
    }
  },

  executeQuery: async (connectionId: string, query: string, databaseName = '') => {
    if (isWails()) {
      return getWailsApp().ExecuteDatabaseQuery(connectionId, query);
    }
    const res = await fetch('/api/databases/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, query, database: databaseName }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  getDatabases: async (connId: string): Promise<string[]> => {
    if (isWails()) {
      return getWailsApp().GetDatabaseDatabases(connId);
    }
    const res = await fetch(`/api/databases/${connId}/schema`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.databases || [];
  },

  getTables: async (connId: string, dbName: string): Promise<string[]> => {
    if (isWails()) {
      return getWailsApp().GetDatabaseTables(connId, dbName);
    }
    const res = await fetch(`/api/databases/${connId}/schema/${encodeURIComponent(dbName)}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.tables || [];
  },

  getTableColumns: async (connId: string, dbName: string, tableName: string) => {
    if (isWails()) {
      return getWailsApp().GetDatabaseColumns(connId, dbName, tableName);
    }
    const res = await fetch(`/api/databases/${connId}/schema/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.columns || [];
  },

  getQueryHistory: async (connId: string) => {
    if (isWails()) {
      return getWailsApp().GetDatabaseHistory(connId);
    }
    const res = await fetch(`/api/databases/${connId}/history`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  exportCSV: async (connId: string, dbName: string, columns: string[], rows: any[]) => {
    if (isWails()) {
      // Direct client-side CSV download in desktop mode
      const csvContent = [
        columns.join(','),
        ...rows.map((r) =>
          columns
            .map((c) => {
              const val = r[c] ?? '';
              const strVal = String(val).replace(/"/g, '""');
              return `"${strVal}"`;
            })
            .join(',')
        ),
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${dbName || 'export'}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const res = await fetch(`/api/databases/${connId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns, rows, database: dbName }),
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dbName || 'export'}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  // --- Redis Management ---
  listRedisConnections: async () => {
    if (isWails()) {
      return getWailsApp().ListRedisConnections();
    }
    const res = await fetch('/api/redis');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  saveRedisConnection: async (conn: any, password = '') => {
    if (isWails()) {
      return getWailsApp().SaveRedisConnection(conn, password);
    }
    const res = await fetch('/api/redis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...conn, password }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteRedisConnection: async (id: string) => {
    if (isWails()) {
      return getWailsApp().DeleteRedisConnection(id);
    }
    const res = await fetch(`/api/redis?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  testRedisConnection: async (conn: any, password = '') => {
    if (isWails()) {
      return getWailsApp().TestRedisConnection(conn, password);
    }
    const res = await fetch('/api/redis/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...conn, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Connection failed');
    }
    return data.message || 'Connected!';
  },

  connectRedis: async (id: string) => {
    if (isWails()) {
      const conns = await getWailsApp().ListRedisConnections();
      const target = (conns || []).find((c: any) => c.id === id);
      if (!target) throw new Error('Redis profile not found');
      await getWailsApp().TestRedisConnection(target, '');
      return { status: 'connected' };
    }
    const res = await fetch(`/api/redis/${encodeURIComponent(id)}/connect`, { method: 'POST' });
    if (!res.ok) {
      throw new Error((await res.text()) || 'Failed to connect');
    }
    return res.json();
  },

  disconnectRedis: async (id: string) => {
    if (isWails()) {
      return { status: 'disconnected' };
    }
    const res = await fetch(`/api/redis/${encodeURIComponent(id)}/disconnect`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  scanRedisKeys: async (
    connectionId: string,
    dbIndex: number,
    cursor = 0,
    pattern = '*',
    keyType = '',
    count = 250
  ) => {
    if (isWails()) {
      return getWailsApp().ScanRedisKeys(connectionId, dbIndex, cursor, pattern, keyType, count);
    }
    const res = await fetch('/api/redis/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, dbIndex, cursor, pattern, keyType, count }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  getRedisKeyDetail: async (connectionId: string, dbIndex: number, key: string) => {
    if (isWails()) {
      return getWailsApp().GetRedisKeyDetail(connectionId, dbIndex, key);
    }
    const params = new URLSearchParams({
      connectionId,
      dbIndex: String(dbIndex),
      key,
    });
    const res = await fetch(`/api/redis/key?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  setRedisKey: async (connectionId: string, dbIndex: number, payload: any) => {
    if (isWails()) {
      return getWailsApp().SetRedisKey(connectionId, dbIndex, payload);
    }
    const res = await fetch('/api/redis/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, dbIndex, payload }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteRedisKey: async (connectionId: string, dbIndex: number, key: string) => {
    if (isWails()) {
      return getWailsApp().DeleteRedisKey(connectionId, dbIndex, key);
    }
    const params = new URLSearchParams({
      connectionId,
      dbIndex: String(dbIndex),
      key,
    });
    const res = await fetch(`/api/redis/key?${params.toString()}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  updateRedisString: async (connectionId: string, dbIndex: number, key: string, value: string) => {
    if (isWails()) {
      return getWailsApp().UpdateRedisString(connectionId, dbIndex, key, value);
    }
    const res = await fetch('/api/redis/key/string', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, dbIndex, key, value }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  setRedisHashField: async (
    connectionId: string,
    dbIndex: number,
    key: string,
    oldField: string,
    field: string,
    value: string
  ) => {
    if (isWails()) {
      return getWailsApp().SetRedisHashField(connectionId, dbIndex, key, oldField, field, value);
    }
    const res = await fetch('/api/redis/key/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, dbIndex, key, oldField, field, value }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteRedisHashField: async (connectionId: string, dbIndex: number, key: string, field: string) => {
    if (isWails()) {
      return getWailsApp().DeleteRedisHashField(connectionId, dbIndex, key, field);
    }
    const res = await fetch('/api/redis/key/hash', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, dbIndex, key, field }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  pushRedisListValue: async (
    connectionId: string,
    dbIndex: number,
    key: string,
    value: string,
    position: 'head' | 'tail' = 'tail'
  ) => {
    if (isWails()) {
      return getWailsApp().PushRedisListValue(connectionId, dbIndex, key, value, position);
    }
    const res = await fetch('/api/redis/key/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'push', connectionId, dbIndex, key, value, position }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  updateRedisListValue: async (
    connectionId: string,
    dbIndex: number,
    key: string,
    index: number,
    value: string
  ) => {
    if (isWails()) {
      return getWailsApp().UpdateRedisListValue(connectionId, dbIndex, key, index, value);
    }
    const res = await fetch('/api/redis/key/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', connectionId, dbIndex, key, index, value }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteRedisListIndex: async (connectionId: string, dbIndex: number, key: string, index: number) => {
    if (isWails()) {
      return getWailsApp().DeleteRedisListIndex(connectionId, dbIndex, key, index);
    }
    const res = await fetch('/api/redis/key/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', connectionId, dbIndex, key, index }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  addRedisSetMember: async (connectionId: string, dbIndex: number, key: string, member: string) => {
    if (isWails()) {
      return getWailsApp().AddRedisSetMember(connectionId, dbIndex, key, member);
    }
    const res = await fetch('/api/redis/key/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', connectionId, dbIndex, key, member }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  removeRedisSetMember: async (connectionId: string, dbIndex: number, key: string, member: string) => {
    if (isWails()) {
      return getWailsApp().RemoveRedisSetMember(connectionId, dbIndex, key, member);
    }
    const res = await fetch('/api/redis/key/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', connectionId, dbIndex, key, member }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  addRedisZSetMember: async (
    connectionId: string,
    dbIndex: number,
    key: string,
    member: string,
    score: number
  ) => {
    if (isWails()) {
      return getWailsApp().AddRedisZSetMember(connectionId, dbIndex, key, member, score);
    }
    const res = await fetch('/api/redis/key/zset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', connectionId, dbIndex, key, member, score }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  removeRedisZSetMember: async (connectionId: string, dbIndex: number, key: string, member: string) => {
    if (isWails()) {
      return getWailsApp().RemoveRedisZSetMember(connectionId, dbIndex, key, member);
    }
    const res = await fetch('/api/redis/key/zset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', connectionId, dbIndex, key, member }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  updateRedisKeyTTL: async (connectionId: string, dbIndex: number, key: string, ttlSeconds: number) => {
    if (isWails()) {
      return getWailsApp().UpdateRedisKeyTTL(connectionId, dbIndex, key, ttlSeconds);
    }
    const res = await fetch('/api/redis/key/ttl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, dbIndex, key, ttlSeconds }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  executeRedisCommand: async (connectionId: string, dbIndex: number, command: string) => {
    if (isWails()) {
      return getWailsApp().ExecuteRedisCommand(connectionId, dbIndex, command);
    }
    const res = await fetch('/api/redis/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, dbIndex, command }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  getRedisCommandHistory: async (connectionId: string) => {
    if (isWails()) {
      return getWailsApp().GetRedisCommandHistory(connectionId);
    }
    const res = await fetch(`/api/redis/${encodeURIComponent(connectionId)}/history`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // --- Settings Import / Export ---
  exportSettings: async (
    options = { includeVMs: true, includeDatabases: true, includeRedis: true }
  ): Promise<string> => {
    if (isWails()) {
      return getWailsApp().ExportSettings(options);
    }
    const res = await fetch('/api/settings/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.text();
  },

  exportSettingsToFile: async (
    options = { includeVMs: true, includeDatabases: true, includeRedis: true }
  ): Promise<string> => {
    if (isWails() && getWailsApp().ExportSettingsToFile) {
      return getWailsApp().ExportSettingsToFile(options);
    }
    const rawJson = await api.exportSettings(options);
    const blob = new Blob([rawJson], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `conx-settings-${dateStr}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return filename;
  },

  importSettings: async (
    rawJson: string,
    options = { includeVMs: true, includeDatabases: true, includeRedis: true, replaceExisting: false }
  ): Promise<{ vmsImported: number; databasesImported: number; redisImported: number }> => {
    if (isWails()) {
      return getWailsApp().ImportSettings(rawJson, options);
    }
    const res = await fetch('/api/settings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawJson, options }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
