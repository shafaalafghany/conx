import React from 'react';
import type { NavigationTab } from '../../types';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  sidebarCollapsed: boolean;
  onToggleCollapse?: () => void;
  vmCount: number;
  activeSessionCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  sidebarCollapsed,
  onToggleCollapse,
  vmCount,
  activeSessionCount,
}) => {
  return (
    <aside
      className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-200 ease-in-out ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* 
        Sidebar Header Row
        Sits right below the 40px WindowTopBar, matching the main content Header height (h-12 = 48px)
      */}
      <div className="h-12 flex items-center px-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 select-none">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />
            <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight font-mono">
              conx
            </h1>
          </div>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="w-full flex justify-center py-1 hover:opacity-80 transition-opacity"
            title="Expand sidebar"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />
          </button>
        )}
      </div>

      {/* Sidebar Navigation */}
      <nav className="p-3 space-y-1.5 flex-1 overflow-y-auto">
        <button
          onClick={() => onSelectTab('vms')}
          className={`w-full flex items-center text-sm font-medium rounded-md transition-colors ${
            sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          } ${
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
              {vmCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectTab('terminal')}
          className={`w-full flex items-center text-sm font-medium rounded-md transition-colors ${
            sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          } ${
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
          {activeSessionCount > 0 && !sidebarCollapsed && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded bg-green-500 text-white font-bold">
              {activeSessionCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectTab('database')}
          className={`w-full flex items-center text-sm font-medium rounded-md transition-colors ${
            sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          } ${
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

        <button
          onClick={() => onSelectTab('redis')}
          className={`w-full flex items-center text-sm font-medium rounded-md transition-colors ${
            sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          } ${
            activeTab === 'redis'
              ? 'text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60'
          }`}
          title="Redis Management"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 3L3 7.5 12 12l9-4.5L12 3zm-9 9l9 4.5 9-4.5M3 16.5L12 21l9-4.5"
            />
          </svg>
          {!sidebarCollapsed && <span>Redis Management</span>}
        </button>
      </nav>

      {/* Bottom Sidebar - Security Vault */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 mt-auto flex-shrink-0">
        <button
          onClick={() => onSelectTab('vault')}
          className={`w-full flex items-center text-sm font-medium rounded-md transition-colors ${
            sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          } ${
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
  );
};
