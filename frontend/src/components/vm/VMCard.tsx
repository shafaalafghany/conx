import React from 'react';
import { StatusIndicator } from './StatusIndicator';
import type { VM } from '../../types';

interface VMCardProps {
  vm: VM;
  onConnect: (vm: VM) => void;
  onEdit: (vm: VM) => void;
  onDelete: (id: string) => void;
}

export const VMCard: React.FC<VMCardProps> = ({ vm, onConnect, onEdit, onDelete }) => {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors shadow-sm flex flex-col justify-between">
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
          onClick={() => onConnect(vm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Connect
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(vm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
            aria-label={`Edit ${vm.name}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>

          <button
            onClick={() => onDelete(vm.id)}
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
  );
};
