import React from 'react';

interface StatusIndicatorProps {
  status: string;
  latencyMs?: number;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, latencyMs }) => {
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
};
