// Unified API client that auto-switches between Wails Native IPC and Web REST/WS mode

export const isWails = (): boolean => {
  return typeof (window as any).go?.main?.App !== 'undefined';
};

const getWailsApp = () => (window as any).go?.main?.App;

export const api = {
  // Virtual Machines
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

  // Databases
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

  executeQuery: async (connectionId: string, query: string) => {
    if (isWails()) {
      return getWailsApp().ExecuteDatabaseQuery(connectionId, query);
    }
    const res = await fetch('/api/databases/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, query }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
