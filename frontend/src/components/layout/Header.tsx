import React from 'react';
import type { NavigationTab } from '../../types';

interface HeaderProps {
  activeTab: NavigationTab;
}

const tabTitles: Record<NavigationTab, string> = {
  vms: 'Virtual Machines',
  terminal: 'SSH Terminal',
  database: 'Database Management',
  redis: 'Redis Management',
  vault: 'Security Vault',
};

export const Header: React.FC<HeaderProps> = ({ activeTab }) => {
  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, .wails-no-drag, [style*="--wails-draggable: no-drag"]')) {
      return;
    }
    if (typeof window !== 'undefined' && (window as any).runtime?.WindowToggleMaximise) {
      (window as any).runtime.WindowToggleMaximise();
    }
  };

  return (
    <header
      onDoubleClick={handleDoubleClick}
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
      className="h-12 flex items-center justify-between px-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 select-none flex-shrink-0 wails-drag"
    >
      <div
        className="flex items-center gap-2 wails-no-drag"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider font-mono">
          Workspace
        </span>
        <span className="text-gray-300 dark:text-gray-600 font-light">/</span>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {tabTitles[activeTab] || 'Dashboard'}
        </h2>
      </div>
    </header>
  );
};
