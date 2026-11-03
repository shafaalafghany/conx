import React from 'react';
import { TerminalView } from '../TerminalView';
import type { ActiveSession } from '../../types';

interface TerminalTabsProps {
  sessions: ActiveSession[];
  activeSessionID: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNavigateToVMs: () => void;
}

export const TerminalTabs: React.FC<TerminalTabsProps> = ({
  sessions,
  activeSessionID,
  onSelectSession,
  onCloseSession,
  onNavigateToVMs,
}) => {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No Active Terminal Sessions</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
          Go to the Virtual Machines tab and click &quot;Connect&quot; on any host to open a live SSH session.
        </p>
        <button
          onClick={onNavigateToVMs}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          Go to Virtual Machines
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {/* Tab Selector */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
        {sessions.map((s) => (
          <div
            key={s.sessionID}
            onClick={() => onSelectSession(s.sessionID)}
            className={`group flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors cursor-pointer select-none ${
              activeSessionID === s.sessionID
                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 shadow-sm'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{s.vmName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(s.sessionID);
              }}
              className="ml-1 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Close session"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Terminal Viewports Container - Persistent background sessions */}
      <div className="flex-1 min-h-0 relative">
        {sessions.map((s) => (
          <div
            key={s.sessionID}
            className={`h-full w-full min-h-0 ${activeSessionID === s.sessionID ? 'block' : 'hidden'}`}
          >
            <TerminalView
              sessionID={s.sessionID}
              vmID={s.vmID}
              vmName={s.vmName}
              host={s.host}
              isActive={activeSessionID === s.sessionID}
              onClose={onCloseSession}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
