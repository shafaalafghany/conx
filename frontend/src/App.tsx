import React, { useState, useEffect, useCallback } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { TerminalView } from './components/TerminalView';
import { QueryConsole } from './components/QueryConsole';
import { api } from './api/client';

type Tab = 'vms' | 'terminal' | 'database' | 'vault';

interface VM {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  tags: string;
  status: string; // online, offline, degraded
  lastLatencyMs: number;
}

interface ActiveSession {
  sessionID: string;
  vmID: string;
  vmName: string;
  host: string;
}

interface AddVMFormData {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  tags: string;
}

const initialFormData: AddVMFormData = {
  name: '',
  host: '',
  port: '22',
  username: '',
  password: '',
  tags: 'production',
};

function StatusIndicator({ status, latencyMs }: { status: string; latencyMs?: number }) {
  const isOnline = status === 'online';
  const isDegraded = status === 'degraded';

  const dotColor = isOnline ? 'bg-green-500' : isDegraded ? 'bg-yellow-500' : 'bg-red-500';
  const label = isOnline ? 'Online' : isDegraded ? 'Degraded' : 'Offline';

  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor} ${isOnline ? 'animate-pulse' : ''}`} />
      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {latencyMs !== undefined && latencyMs > 0 && (
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {latencyMs}ms
        </span>
      )}
    </span>
  );
}

interface EditVMModalProps {
  vm: VM;
  onClose: () => void;
  onSubmit: (data: {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    tags: string;
  }) => Promise<void>;
}

function EditVMModal({ vm, onClose, onSubmit }: EditVMModalProps) {
  const [name, setName] = useState(vm.name);
  const [host, setHost] = useState(vm.host);
  const [port, setPort] = useState(String(vm.port));
  const [username, setUsername] = useState(vm.username);
  const [password, setPassword] = useState('');
  const [tags, setTags] = useState(vm.tags || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Label / Name is required');
      return;
    }
    if (!host.trim()) {
      setError('Host is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError('Port must be between 1 and 65535');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        id: vm.id,
        name: name.trim(),
        host: host.trim(),
        port: portNum,
        username: username.trim(),
        password: password,
        tags: tags.trim(),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to update VM');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 md:p-6 max-h-[90vh] overflow-y-auto z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Edit VM</h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Label
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="e.g. Production Server"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Host
            </label>
            <input
              type="text"
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="e.g. 192.168.1.100 or domain"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Port
            </label>
            <input
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="22"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="e.g. root"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password <span className="text-gray-400 dark:text-gray-500 font-normal">(kosongkan jika tidak ingin ganti)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="production, redis, core"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              disabled={saving}
            />
          </div>

          {error && (
            <div role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-md transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('vms');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // VM state
  const [vms, setVms] = useState<VM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProbing, setIsProbing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editVm, setEditVm] = useState<VM | null>(null);
  const [formData, setFormData] = useState<AddVMFormData>(initialFormData);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active terminal sessions
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [activeSessionID, setActiveSessionID] = useState<string | null>(null);

  const loadVMs = useCallback(async () => {
    try {
      const list = await api.listVMs();
      setVms(list || []);
    } catch (err) {
      console.error('Failed to load VMs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVMs();

    const wailsRuntime = (window as any).runtime;
    if (wailsRuntime && wailsRuntime.EventsOn) {
      wailsRuntime.EventsOn('vm:health:update', (updates: Record<string, { status: string; latencyMs: number }>) => {
        setVms((prev) =>
          prev.map((vm) => {
            const u = updates[vm.id];
            if (u) {
              return { ...vm, status: u.status, lastLatencyMs: u.latencyMs };
            }
            return vm;
          })
        );
      });
    }

    return () => {
      if (wailsRuntime && wailsRuntime.EventsOff) {
        wailsRuntime.EventsOff('vm:health:update');
      }
    };
  }, [loadVMs]);

  const handleRefreshHealth = async () => {
    setIsProbing(true);
    try {
      const updates = await api.refreshHealth();
      if (updates) {
        setVms((prev) =>
          prev.map((vm) => {
            const u = updates[vm.id];
            if (u) {
              return { ...vm, status: u.status, lastLatencyMs: u.latencyMs };
            }
            return vm;
          })
        );
      }
    } catch (err) {
      console.error('Probe error:', err);
    } finally {
      setIsProbing(false);
    }
  };

  const handleSaveVM = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Label / Name is required');
      return;
    }
    if (!formData.host.trim()) {
      setFormError('Host is required');
      return;
    }
    if (!formData.username.trim()) {
      setFormError('Username is required');
      return;
    }

    const portNum = parseInt(formData.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFormError('Port must be between 1 and 65535');
      return;
    }

    setIsSubmitting(true);
    try {
      const vmPayload = {
        id: '',
        name: formData.name.trim(),
        host: formData.host.trim(),
        port: portNum,
        username: formData.username.trim(),
        tags: formData.tags.trim(),
        status: 'offline',
        lastLatencyMs: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await api.saveVM(vmPayload, formData.password, '');
      await loadVMs();
      setIsModalOpen(false);
      setFormData(initialFormData);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save VM');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (data: {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    tags: string;
  }) => {
    const vmPayload = {
      id: data.id,
      name: data.name.trim(),
      host: data.host.trim(),
      port: data.port,
      username: data.username.trim(),
      tags: data.tags.trim(),
    };

    await api.saveVM(vmPayload, data.password, '');

    // Synchronize active terminal tabs if name or host was updated
    setSessions((prev) =>
      prev.map((s) =>
        s.vmID === data.id
          ? { ...s, vmName: data.name.trim(), host: data.host.trim() }
          : s
      )
    );

    await loadVMs();
    setEditVm(null);
  };

  const handleDeleteVM = async (id: string) => {
    if (!confirm('Are you sure you want to delete this VM?')) return;
    try {
      await api.deleteVM(id);
      setSessions((prev) => prev.filter((s) => s.vmID !== id));
      await loadVMs();
    } catch (err) {
      alert('Delete failed: ' + err);
    }
  };

  const handleConnectSSH = (vm: VM) => {
    setActiveTab('terminal');

    // Check if session for this VM already exists
    const existing = sessions.find((s) => s.vmID === vm.id);
    if (existing) {
      setActiveSessionID(existing.sessionID);
      return;
    }

    const newSessionID = `${vm.id}-${Date.now()}`;
    const newSession: ActiveSession = {
      sessionID: newSessionID,
      vmID: vm.id,
      vmName: vm.name,
      host: vm.host,
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionID(newSessionID);
  };

  const handleCloseSession = (sessionID: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.sessionID !== sessionID);
      if (activeSessionID === sessionID) {
        setActiveSessionID(remaining.length > 0 ? remaining[0].sessionID : null);
      }
      return remaining;
    });
  };

  const activeSessionObj = sessions.find((s) => s.sessionID === activeSessionID);

  return (
    <div className="h-screen flex bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Sidebar - Matching manager-system-internal */}
      <aside
        className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-200 ease-in-out ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          {!sidebarCollapsed && (
            <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2 tracking-tight font-mono">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
              conx
            </h1>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mx-auto"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sidebarCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="p-3 space-y-1.5 flex-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab('vms')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'vms'
                ? 'text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60'
            }`}
            title="Virtual Machines"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
            {!sidebarCollapsed && <span>Virtual Machines</span>}
            {!sidebarCollapsed && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                {vms.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'terminal'
                ? 'text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60'
            }`}
            title="SSH Terminal"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {!sidebarCollapsed && <span>SSH Terminal</span>}
            {sessions.length > 0 && !sidebarCollapsed && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded bg-green-500 text-white font-bold">
                {sessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'database'
                ? 'text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60'
            }`}
            title="Database Management"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            {!sidebarCollapsed && <span>Database Management</span>}
          </button>
        </nav>

        {/* Bottom Sidebar - Security Vault */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 mt-auto flex-shrink-0">
          <button
            onClick={() => setActiveTab('vault')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'vault'
                ? 'text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60'
            }`}
            title="Security Vault"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {!sidebarCollapsed && <span>Security Vault</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Navbar */}
        <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black font-mono tracking-tight text-blue-600 dark:text-blue-400">
                conx
              </span>
              {activeTab !== 'vms' && (
                <>
                  <span className="text-gray-300 dark:text-gray-600 font-light">/</span>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {activeTab === 'terminal' && 'SSH Terminal'}
                    {activeTab === 'database' && 'Database Console'}
                    {activeTab === 'vault' && 'Credential Vault'}
                  </h2>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* ThemeToggle Right in Header */}
            <ThemeToggle />
          </div>
        </header>

        {/* Tab Body */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {/* TAB 1: VMS */}
          {activeTab === 'vms' && (
            <div className="flex flex-col h-full">
              {/* Header with Title and Buttons */}
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Virtual Machines</h1>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRefreshHealth}
                    disabled={isProbing}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
                  >
                    <svg
                      className={`w-4 h-4 ${isProbing ? 'animate-spin text-blue-500' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {isProbing ? 'Checking...' : 'Check Health'}
                  </button>

                  <button
                    onClick={() => {
                      setFormError('');
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add VM
                  </button>
                </div>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-500 dark:text-gray-400">Loading VMs...</div>
                </div>
              )}

              {/* Empty State */}
              {!isLoading && vms.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                  <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">No VMs configured yet</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Click &quot;Add VM&quot; to register your first host.</p>
                </div>
              )}

              {/* VM Cards Grid - Exact manager-system-internal styling! */}
              {!isLoading && vms.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {vms.map((vm) => (
                    <div
                      key={vm.id}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {vm.name}
                          </h3>
                          <StatusIndicator status={vm.status} latencyMs={vm.lastLatencyMs} />
                        </div>

                        <div className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                          <p>
                            <span className="text-gray-400 dark:text-gray-500">Host:</span>{' '}
                            <span className="text-gray-700 dark:text-gray-300 font-mono">{vm.host}</span>
                          </p>
                          <p>
                            <span className="text-gray-400 dark:text-gray-500">Port:</span>{' '}
                            <span className="text-gray-700 dark:text-gray-300 font-mono">{vm.port}</span>
                          </p>
                          <p>
                            <span className="text-gray-400 dark:text-gray-500">User:</span>{' '}
                            <span className="text-gray-700 dark:text-gray-300">{vm.username}</span>
                          </p>
                          {vm.tags && (
                            <p>
                              <span className="text-gray-400 dark:text-gray-500">Tags:</span>{' '}
                              <span className="text-gray-700 dark:text-gray-300 text-xs font-mono">{vm.tags}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <button
                          onClick={() => handleConnectSSH(vm)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Connect
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditVm(vm)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
                            aria-label={`Edit ${vm.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>

                          <button
                            onClick={() => handleDeleteVM(vm.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800 rounded-md transition-colors"
                            aria-label={`Delete ${vm.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TERMINAL */}
          {activeTab === 'terminal' && (
            <div className="h-full flex flex-col">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No Active Terminal Sessions</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                    Go to the Virtual Machines tab and click "Connect" on any host to open a live SSH session.
                  </p>
                  <button
                    onClick={() => setActiveTab('vms')}
                    className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  >
                    Go to Virtual Machines
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Tab Selector */}
                  <div className="flex items-center gap-1 mb-3 overflow-x-auto">
                    {sessions.map((s) => (
                      <button
                        key={s.sessionID}
                        onClick={() => setActiveSessionID(s.sessionID)}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                          activeSessionID === s.sessionID
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 shadow-sm'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span>{s.vmName}</span>
                      </button>
                    ))}
                  </div>

                  {/* Active Terminal Container */}
                  {activeSessionObj && (
                    <div className="flex-1 min-h-[450px]">
                      <TerminalView
                        key={activeSessionObj.sessionID}
                        sessionID={activeSessionObj.sessionID}
                        vmID={activeSessionObj.vmID}
                        vmName={activeSessionObj.vmName}
                        host={activeSessionObj.host}
                        onClose={handleCloseSession}
                        onSendInput={() => {}}
                        onResize={() => {}}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DATABASE CONSOLE */}
          {activeTab === 'database' && (
            <div className="h-full flex flex-col">
              <QueryConsole />
            </div>
          )}

          {/* TAB 4: VAULT */}
          {activeTab === 'vault' && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 max-w-4xl shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Security & Credential Vault
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Local cryptographic storage using Go standard <code className="font-mono text-blue-600 dark:text-blue-400">crypto/aes</code> (AES-256-GCM).
              </p>

              <div className="mt-6 space-y-4">
                <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-300">
                  <p className="font-semibold">Encryption Engine: AES-256-GCM with Random 12-byte Nonce</p>
                  <p className="mt-1 text-xs opacity-90">All VM passwords, SSH private keys, and database credentials are encrypted at rest inside local SQLite WAL database.</p>
                </div>

                <div className="p-4 rounded-md bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 text-sm">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Storage Location</p>
                  <p className="mt-1 text-xs font-mono text-gray-600 dark:text-gray-300">~/Library/Application Support/conx/conx.db</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add VM Modal - Exact styling from manager-system-internal! */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 md:p-6 max-h-[90vh] overflow-y-auto z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Add New VM</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveVM} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="e.g. Production Server"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Host
                </label>
                <input
                  type="text"
                  required
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="e.g. 192.168.1.100 or domain"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="65535"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="22"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="e.g. root"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="Enter password (AES-256 encrypted)"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="production, redis, core"
                  disabled={isSubmitting}
                />
              </div>

              {formError && (
                <div role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-md transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Add VM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit VM Modal - Matching manager-system-internal! */}
      {editVm && (
        <EditVMModal
          vm={editVm}
          onClose={() => setEditVm(null)}
          onSubmit={handleEditSubmit}
        />
      )}
    </div>
  );
}
