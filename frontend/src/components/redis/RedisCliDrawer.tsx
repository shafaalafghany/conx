import React, { useState } from 'react';
import { Play, Clock, Terminal as TerminalIcon } from 'lucide-react';
import type { RedisCommandHistoryEntry, RedisCommandResult } from '../../types';

interface RedisCliDrawerProps {
  dbIndex: number;
  isConnected: boolean;
  history: RedisCommandHistoryEntry[];
  onExecute: (command: string) => Promise<RedisCommandResult>;
}

export const RedisCliDrawer: React.FC<RedisCliDrawerProps> = ({
  dbIndex,
  isConnected,
  history,
  onExecute,
}) => {
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<RedisCommandResult | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'output' | 'history'>('output');

  const handleRun = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!command.trim() || !isConnected || running) return;
    setRunning(true);
    setActiveSubTab('output');
    try {
      const res = await onExecute(command.trim());
      setLastResult(res);
    } catch (err: any) {
      setLastResult({
        command: command.trim(),
        output: `(error) ${err?.message || String(err)}`,
        executionTimeMs: 0,
        error: err?.message || String(err),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-xs flex-shrink-0">
      <form
        onSubmit={handleRun}
        className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60"
      >
        <TerminalIcon className="w-4 h-4 text-rose-500 flex-shrink-0" />
        <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 select-none flex-shrink-0">
          db{dbIndex} &gt;
        </span>
        <input
          type="text"
          disabled={!isConnected}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={
            isConnected
              ? 'Run Redis command (e.g. HGETALL mykey, INFO memory, TTL mykey) — Enter to run'
              : 'Connect to a Redis server first...'
          }
          className="flex-1 bg-transparent text-xs font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab(activeSubTab === 'history' ? 'output' : 'history')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded flex items-center gap-1 transition-colors ${
              activeSubTab === 'history'
                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>History ({history.length})</span>
          </button>

          <button
            type="submit"
            disabled={!isConnected || !command.trim() || running}
            className="px-3 py-1 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{running ? 'Running...' : 'Run'}</span>
          </button>
        </div>
      </form>

      <div className="max-h-40 overflow-y-auto p-3 bg-slate-950 text-slate-200 font-mono text-xs">
        {activeSubTab === 'output' ? (
          lastResult ? (
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>$ {lastResult.command}</span>
                <span>{lastResult.executionTimeMs} ms</span>
              </div>
              <pre
                className={`whitespace-pre-wrap break-all leading-relaxed ${
                  lastResult.error ? 'text-rose-400' : 'text-emerald-300'
                }`}
              >
                {lastResult.output}
              </pre>
            </div>
          ) : (
            <span className="text-slate-500">
              Output will appear here. Example: PING, DBSIZE, INFO keyspace, HGETALL &lt;key&gt;
            </span>
          )
        ) : history.length === 0 ? (
          <span className="text-slate-500">No command history for this connection yet.</span>
        ) : (
          <div className="space-y-1">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setCommand(h.commandText);
                  setActiveSubTab('output');
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center justify-between gap-3"
              >
                <span className="truncate text-cyan-300">
                  [db{h.dbIndex}] {h.commandText}
                </span>
                <span className="text-[10px] text-slate-400 flex-shrink-0">
                  {h.executionTimeMs}ms
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
