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
};
