import React from 'react';

interface TableActionPickerModalProps {
  data: { connId: string; dbName: string; tableName: string } | null;
  onClose: () => void;
  onViewData: () => void;
  onViewDDL: () => void;
}

export const TableActionPickerModal: React.FC<TableActionPickerModalProps> = ({
  data,
  onClose,
  onViewData,
  onViewDDL,
}) => {
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {data.tableName}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-mono">
          {data.dbName}
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onViewData}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 transition-colors"
          >
            <span className="text-lg">📊</span>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">View Data</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">SELECT * FROM table LIMIT 300</div>
            </div>
          </button>
          <button
            type="button"
            onClick={onViewDDL}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-gray-700 transition-colors"
          >
            <span className="text-lg">🏗️</span>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">View DDL</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">SHOW CREATE TABLE</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

interface DDLModalProps {
  content: { tableName: string; ddl: string } | null;
  isLoading: boolean;
  onClose: () => void;
  onCopy: () => void;
}

export const DDLModal: React.FC<DDLModalProps> = ({ content, isLoading, onClose, onCopy }) => {
  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              DDL — {content.tableName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">CREATE TABLE statement</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              disabled={isLoading || !content.ddl}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded transition-colors"
            >
              Copy DDL
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-gray-500 dark:text-gray-400">Loading DDL...</span>
            </div>
          ) : (
            <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto">
              {content.ddl}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

interface ConfirmExecutionModalProps {
  confirmQuery: { sql: string; selectedText?: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmExecutionModal: React.FC<ConfirmExecutionModalProps> = ({
  confirmQuery,
  onCancel,
  onConfirm,
}) => {
  if (!confirmQuery) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Confirm Execution
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This query will modify data in the database.
            </p>
          </div>
        </div>
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-auto max-h-[150px]">
          <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap break-all">
            {confirmQuery.sql}
          </pre>
        </div>
        <p className="text-xs text-orange-700 dark:text-orange-300 mb-4">
          ⚠️ Are you sure you want to execute this query? This action may not be reversible.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors"
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  );
};
