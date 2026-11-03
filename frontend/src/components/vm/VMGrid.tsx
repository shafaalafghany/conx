import React from 'react';
import { VMCard } from './VMCard';
import type { VM } from '../../types';

interface VMGridProps {
  vms: VM[];
  isLoading: boolean;
  isProbing: boolean;
  onRefreshHealth: () => void;
  onOpenAddModal: () => void;
  onConnect: (vm: VM) => void;
  onEdit: (vm: VM) => void;
  onDelete: (id: string) => void;
}

export const VMGrid: React.FC<VMGridProps> = ({
  vms,
  isLoading,
  isProbing,
  onRefreshHealth,
  onOpenAddModal,
  onConnect,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header with Title and Action Buttons */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Virtual Machines</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={onRefreshHealth}
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
            onClick={onOpenAddModal}
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
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Click &quot;Add VM&quot; to register your first host.</p>
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add VM
          </button>
        </div>
      )}

      {/* VM Cards Grid */}
      {!isLoading && vms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {vms.map((vm) => (
            <VMCard
              key={vm.id}
              vm={vm}
              onConnect={onConnect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};
