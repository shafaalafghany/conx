import { useState, useEffect, useCallback } from 'react';
import { WindowTopBar } from './components/layout/WindowTopBar';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { VMGrid } from './components/vm/VMGrid';
import { AddVMModal } from './components/vm/AddVMModal';
import { EditVMModal } from './components/vm/EditVMModal';
import { TerminalTabs } from './components/terminal/TerminalTabs';
import { VaultView } from './components/vault/VaultView';
import { QueryConsole } from './components/QueryConsole';
import { RedisManagementPage } from './components/RedisManagementPage';
import { api } from './api/client';
import type { VM, ActiveSession, AddVMFormData, NavigationTab } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('vms');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // VM state
  const [vms, setVms] = useState<VM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProbing, setIsProbing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editVm, setEditVm] = useState<VM | null>(null);

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

  const handleAddVM = async (formData: AddVMFormData) => {
    const portNum = parseInt(formData.port, 10);
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

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Top Window Bar: Traffic Lights & Draggable Space (Spotify Style) */}
      <WindowTopBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Workspace (Sidebar + Content Panel) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          sidebarCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          vmCount={vms.length}
          activeSessionCount={sessions.length}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Header Navbar */}
          <Header activeTab={activeTab} />

        {/* Tab Body */}
        <main
          className={`flex-1 p-4 md:p-6 ${
            activeTab === 'terminal' || activeTab === 'database' || activeTab === 'redis'
              ? 'overflow-hidden flex flex-col min-h-0'
              : 'overflow-auto'
          }`}
        >
          {activeTab === 'vms' && (
            <VMGrid
              vms={vms}
              isLoading={isLoading}
              isProbing={isProbing}
              onRefreshHealth={handleRefreshHealth}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onConnect={handleConnectSSH}
              onEdit={setEditVm}
              onDelete={handleDeleteVM}
            />
          )}

          {activeTab === 'terminal' && (
            <TerminalTabs
              sessions={sessions}
              activeSessionID={activeSessionID}
              onSelectSession={setActiveSessionID}
              onCloseSession={handleCloseSession}
              onNavigateToVMs={() => setActiveTab('vms')}
            />
          )}

          {activeTab === 'database' && (
            <div className="h-full flex flex-col min-h-0">
              <QueryConsole />
            </div>
          )}

          {activeTab === 'redis' && (
            <div className="h-full flex flex-col min-h-0">
              <RedisManagementPage />
            </div>
          )}

          {activeTab === 'vault' && <VaultView />}
        </main>
      </div>
    </div>

      {/* Add VM Modal */}
      <AddVMModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddVM}
      />

      {/* Edit VM Modal */}
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
