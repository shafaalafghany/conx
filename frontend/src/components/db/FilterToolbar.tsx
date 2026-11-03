import React from 'react';

interface FilterToolbarProps {
  hasActiveResult: boolean;
  isLoading: boolean;
  whereInput: string;
  orderByInput: string;
  onRefresh: () => void;
  onWhereChange: (val: string) => void;
  onOrderByChange: (val: string) => void;
  onClearFilters: () => void;
  onApplyFilter: () => void;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  hasActiveResult,
  isLoading,
  whereInput,
  orderByInput,
  onRefresh,
  onWhereChange,
  onOrderByChange,
  onClearFilters,
  onApplyFilter,
}) => {
  return (
    <div
      data-testid="db-filter-toolbar"
      className={`flex items-center gap-2 mb-2 p-2 rounded-lg border transition-all ${
        hasActiveResult
          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs'
          : 'bg-gray-50/80 dark:bg-gray-800/40 border-gray-200/60 dark:border-gray-700/60'
      }`}
    >
      {/* Refresh Button */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={!hasActiveResult || isLoading}
        title={hasActiveResult ? 'Refresh active table query' : 'Open a result tab to refresh'}
        data-testid="filter-toolbar-refresh-btn"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all flex-shrink-0 ${
          hasActiveResult && !isLoading
            ? 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95'
            : 'text-gray-400 dark:text-gray-500 bg-gray-100/50 dark:bg-gray-700/50 cursor-not-allowed opacity-60'
        }`}
      >
        <svg
          className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span>Refresh</span>
      </button>

      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

      {/* WHERE Clause Input */}
      <div className="flex-1 min-w-0">
        <div className="relative flex items-center w-full">
          <span
            className={`absolute left-2 text-[10px] font-bold font-mono uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none select-none transition-colors ${
              hasActiveResult
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40'
                : 'text-gray-400 dark:text-gray-500 bg-gray-200/50 dark:bg-gray-700/50'
            }`}
          >
            WHERE
          </span>
          <input
            type="text"
            value={whereInput}
            onChange={(e) => onWhereChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onApplyFilter();
              }
            }}
            disabled={!hasActiveResult}
            placeholder={
              hasActiveResult
                ? "condition (e.g. status = 'active' AND id > 100)..."
                : 'Open a result tab to filter with WHERE clause...'
            }
            data-testid="filter-toolbar-where-input"
            className={`w-full pl-16 pr-3 py-1.5 text-xs font-mono rounded-md border transition-colors focus:outline-none ${
              hasActiveResult
                ? 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
                : 'bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 placeholder-gray-400/60 cursor-not-allowed opacity-60'
            }`}
          />
        </div>
      </div>

      {/* ORDER BY Clause Input */}
      <div className="w-56 sm:w-64 md:w-72 flex-shrink-0 min-w-0">
        <div className="relative flex items-center w-full">
          <span
            className={`absolute left-2 text-[10px] font-bold font-mono uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none select-none transition-colors ${
              hasActiveResult
                ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/40'
                : 'text-gray-400 dark:text-gray-500 bg-gray-200/50 dark:bg-gray-700/50'
            }`}
          >
            ORDER BY
          </span>
          <input
            type="text"
            value={orderByInput}
            onChange={(e) => onOrderByChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onApplyFilter();
              }
            }}
            disabled={!hasActiveResult}
            placeholder={hasActiveResult ? 'e.g. created_at DESC' : 'ORDER BY...'}
            data-testid="filter-toolbar-order-input"
            className={`w-full pl-20 pr-3 py-1.5 text-xs font-mono rounded-md border transition-colors focus:outline-none ${
              hasActiveResult
                ? 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-purple-500 focus:border-purple-500'
                : 'bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 placeholder-gray-400/60 cursor-not-allowed opacity-60'
            }`}
          />
        </div>
      </div>

      {/* Clear filters button */}
      {hasActiveResult && (whereInput || orderByInput) && (
        <button
          type="button"
          onClick={onClearFilters}
          title="Clear WHERE and ORDER BY clauses"
          data-testid="filter-toolbar-clear-btn"
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Apply Filter Button */}
      <button
        type="button"
        onClick={onApplyFilter}
        disabled={!hasActiveResult || isLoading}
        title={hasActiveResult ? 'Apply WHERE and ORDER BY filter (Enter)' : 'Open a result tab to filter'}
        data-testid="filter-toolbar-apply-btn"
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md shadow-xs transition-all flex-shrink-0 ${
          hasActiveResult && !isLoading
            ? 'text-white bg-blue-600 hover:bg-blue-700 active:scale-95'
            : 'text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 cursor-not-allowed opacity-60'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        <span>Filter</span>
      </button>
    </div>
  );
};
