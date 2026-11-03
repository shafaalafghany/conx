import React from 'react';
import { ThemeToggle } from '../ThemeToggle';
import type { NavigationTab } from '../../types';

interface HeaderProps {
  activeTab: NavigationTab;
}

export const Header: React.FC<HeaderProps> = ({ activeTab }) => {
  return (
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
        <ThemeToggle />
      </div>
    </header>
  );
};
