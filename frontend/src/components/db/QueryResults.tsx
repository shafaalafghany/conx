'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  getDisplayState,
  formatExecutionTime,
  getTruncationMessage,
  getAffectedRowsMessage,
  shouldShowExportButton,
  formatCellValue,
  getFullCellValue,
} from './query-results-utils';
import type { QueryResult } from './query-results-utils';

export type { QueryResult };

export interface QueryResultsProps {
  result: QueryResult | null;
  error: string | null;
  isLoading: boolean;
  onExport: () => void;
  onCopyQuery?: (sql: string) => void;
  tableName?: string;
  /** Execute an UPDATE query directly */
  onExecuteUpdate?: (sql: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  rowIdx: number;
  colIdx: number;
}

interface EditingCell {
  rowIdx: number;
  colIdx: number;
  value: string;
  originalValue: any;
}

interface PendingEdit {
  rowIdx: number;
  col: string;
  newValue: string;
  originalValue: any;
}

export default function QueryResults({
  result,
  error,
  isLoading,
  onExport,
  onCopyQuery,
  tableName,
  onExecuteUpdate,
}: QueryResultsProps) {
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, rowIdx: -1, colIdx: -1 });
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [pkColumn, setPkColumn] = useState<string | null>(null);
  const [showPkPicker, setShowPkPicker] = useState(false);
  const [pendingEditForPk, setPendingEditForPk] = useState<PendingEdit | null>(null);
  const [inspectCell, setInspectCell] = useState<{ col: string; rowIdx: number; value: any } | null>(null);
  const [copiedInspect, setCopiedInspect] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const displayState = getDisplayState(result, error, isLoading);
  const showExport = shouldShowExportButton(result, isLoading);

  // Initialize column widths based on column names
  useEffect(() => {
    if (result && result.columns) {
      setColumnWidths((prev) => {
        const next = { ...prev };
        result.columns.forEach((col) => {
          if (!next[col]) {
            // Adaptive initial width between 130px and 260px
            const baseWidth = Math.max(130, Math.min(260, col.length * 11 + 45));
            next[col] = baseWidth;
          }
        });
        return next;
      });
    }
  }, [result]);

  // Handle column header resize dragging
  const handleResizeStart = (e: React.MouseEvent, colName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const currentWidth = columnWidths[colName] || 160;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(70, Math.min(1200, currentWidth + delta));
      setColumnWidths((prev) => ({ ...prev, [colName]: newWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Focus input when editing starts
  const prevEditingRef = useRef<{ rowIdx: number; colIdx: number } | null>(null);
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      const isNewCell = !prevEditingRef.current ||
        prevEditingRef.current.rowIdx !== editingCell.rowIdx ||
        prevEditingRef.current.colIdx !== editingCell.colIdx;
      if (isNewCell) {
        editInputRef.current.focus();
        editInputRef.current.select();
      }
      prevEditingRef.current = { rowIdx: editingCell.rowIdx, colIdx: editingCell.colIdx };
    } else {
      prevEditingRef.current = null;
    }
  }, [editingCell]);

  // Close context menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    }
    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.visible]);

  // Close context menu on scroll
  useEffect(() => {
    function handleScroll() {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    }
    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, []);

  // Global keyboard shortcut for save (Cmd+S / Ctrl+S)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && editingCell) {
        e.preventDefault();
        commitEdit();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const handleRowClick = useCallback((rowIdx: number) => {
    if (editingCell) return;
    setSelectedRowIdx((prev) => (prev === rowIdx ? null : rowIdx));
  }, [editingCell]);

  const handleCellContextMenu = useCallback((e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    setSelectedRowIdx(rowIdx);
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, rowIdx, colIdx });
  }, []);

  const handleCellDoubleClick = useCallback((rowIdx: number, colIdx: number) => {
    if (!result) return;
    const col = result.columns[colIdx];
    const val = result.rows[rowIdx][col];
    setEditingCell({
      rowIdx,
      colIdx,
      value: val === null ? '' : String(val),
      originalValue: val,
    });
    setSelectedRowIdx(rowIdx);
  }, [result]);

  const commitEdit = useCallback(() => {
    if (!editingCell || !result) return;
    const col = result.columns[editingCell.colIdx];
    const newValue = editingCell.value;
    const originalValue = editingCell.originalValue;

    const originalStr = originalValue === null ? '' : String(originalValue);
    if (newValue === originalStr) {
      setEditingCell(null);
      return;
    }

    const edit: PendingEdit = {
      rowIdx: editingCell.rowIdx,
      col,
      newValue,
      originalValue,
    };

    setEditingCell(null);

    if (!pkColumn) {
      setPendingEditForPk(edit);
      setShowPkPicker(true);
      return;
    }

    setPendingEdit(edit);
  }, [editingCell, result, pkColumn]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [commitEdit]);

  const handleConfirmUpdate = useCallback(() => {
    if (!pendingEdit || !result) return;
    const row = result.rows[pendingEdit.rowIdx];
    const table = tableName || '`table_name`';
    const pkCol = pkColumn || result.columns[0];
    const pkVal = row[pkCol];

    const whereClause = pkVal === null
      ? `\`${pkCol}\` IS NULL`
      : typeof pkVal === 'number'
        ? `\`${pkCol}\` = ${pkVal}`
        : `\`${pkCol}\` = '${String(pkVal).replace(/'/g, "''")}'`;

    const newVal = pendingEdit.newValue === '' ? 'NULL' : `'${pendingEdit.newValue.replace(/'/g, "''")}'`;
    const sql = `UPDATE ${table} SET \`${pendingEdit.col}\` = ${newVal} WHERE ${whereClause};`;

    if (onExecuteUpdate) {
      onExecuteUpdate(sql);
    } else if (onCopyQuery) {
      onCopyQuery(sql);
    }

    setPendingEdit(null);
  }, [pendingEdit, result, tableName, pkColumn, onExecuteUpdate, onCopyQuery]);

  const handleCancelUpdate = useCallback(() => {
    setPendingEdit(null);
  }, []);

  const handleSelectPk = useCallback((col: string) => {
    setPkColumn(col);
    setShowPkPicker(false);
    if (pendingEditForPk) {
      setPendingEdit(pendingEditForPk);
      setPendingEditForPk(null);
    }
  }, [pendingEditForPk]);

  const handleCancelPkPicker = useCallback(() => {
    setShowPkPicker(false);
    setPendingEditForPk(null);
  }, []);

  const generateInsertQuery = useCallback((row: Record<string, any>) => {
    if (!result) return '';
    const table = tableName || '`table_name`';
    const cols = result.columns.map((c) => `\`${c}\``).join(', ');
    const vals = result.columns.map((col) => {
      const val = row[col];
      if (val === null) return 'NULL';
      if (typeof val === 'number') return String(val);
      return `'${String(val).replace(/'/g, "''")}'`;
    }).join(', ');
    return `INSERT INTO ${table} (${cols}) VALUES (${vals});`;
  }, [result, tableName]);

  const generateUpdateQuery = useCallback((row: Record<string, any>) => {
    if (!result) return '';
    const table = tableName || '`table_name`';
    const setClauses = result.columns.map((col) => {
      const val = row[col];
      if (val === null) return `\`${col}\` = NULL`;
      if (typeof val === 'number') return `\`${col}\` = ${val}`;
      return `\`${col}\` = '${String(val).replace(/'/g, "''")}'`;
    }).join(', ');
    const pkCol = pkColumn || result.columns[0];
    const pkVal = row[pkCol];
    const whereClause = pkVal === null
      ? `\`${pkCol}\` IS NULL`
      : typeof pkVal === 'number'
        ? `\`${pkCol}\` = ${pkVal}`
        : `\`${pkCol}\` = '${String(pkVal).replace(/'/g, "''")}'`;
    return `UPDATE ${table} SET ${setClauses} WHERE ${whereClause};`;
  }, [result, tableName, pkColumn]);

  const generateDeleteQuery = useCallback((row: Record<string, any>) => {
    if (!result) return '';
    const table = tableName || '`table_name`';
    const pkCol = pkColumn || result.columns[0];
    const pkVal = row[pkCol];
    const whereClause = pkVal === null
      ? `\`${pkCol}\` IS NULL`
      : typeof pkVal === 'number'
        ? `\`${pkCol}\` = ${pkVal}`
        : `\`${pkCol}\` = '${String(pkVal).replace(/'/g, "''")}'`;
    return `DELETE FROM ${table} WHERE ${whereClause};`;
  }, [result, tableName, pkColumn]);

  const handleCopyCell = useCallback(() => {
    if (!result || contextMenu.rowIdx < 0 || contextMenu.colIdx < 0) return;
    const col = result.columns[contextMenu.colIdx];
    const val = result.rows[contextMenu.rowIdx][col];
    navigator.clipboard.writeText(getFullCellValue(val));
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, [result, contextMenu.rowIdx, contextMenu.colIdx]);

  const handleInspectCell = useCallback(() => {
    if (!result || contextMenu.rowIdx < 0 || contextMenu.colIdx < 0) return;
    const col = result.columns[contextMenu.colIdx];
    const val = result.rows[contextMenu.rowIdx][col];
    setInspectCell({ col, rowIdx: contextMenu.rowIdx, value: val });
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, [result, contextMenu.rowIdx, contextMenu.colIdx]);

  const handleCopyInsert = useCallback(() => {
    if (!result || contextMenu.rowIdx < 0) return;
    const row = result.rows[contextMenu.rowIdx];
    const sql = generateInsertQuery(row);
    if (onCopyQuery) onCopyQuery(sql); else navigator.clipboard.writeText(sql);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, [result, contextMenu.rowIdx, generateInsertQuery, onCopyQuery]);

  const handleCopyUpdate = useCallback(() => {
    if (!result || contextMenu.rowIdx < 0) return;
    const row = result.rows[contextMenu.rowIdx];
    const sql = generateUpdateQuery(row);
    if (onCopyQuery) onCopyQuery(sql); else navigator.clipboard.writeText(sql);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, [result, contextMenu.rowIdx, generateUpdateQuery, onCopyQuery]);

  const handleCopyDelete = useCallback(() => {
    if (!result || contextMenu.rowIdx < 0) return;
    const row = result.rows[contextMenu.rowIdx];
    const sql = generateDeleteQuery(row);
    if (onCopyQuery) onCopyQuery(sql); else navigator.clipboard.writeText(sql);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, [result, contextMenu.rowIdx, generateDeleteQuery, onCopyQuery]);

  const handleDuplicateRow = useCallback(() => {
    if (!result || contextMenu.rowIdx < 0) return;
    const row = result.rows[contextMenu.rowIdx];
    const sql = generateInsertQuery(row);
    if (onCopyQuery) onCopyQuery(sql); else navigator.clipboard.writeText(sql);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, [result, contextMenu.rowIdx, generateInsertQuery, onCopyQuery]);

  return (
    <div
      data-testid="query-results"
      className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden h-full relative bg-white dark:bg-gray-800"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            Results
          </span>
          {pkColumn && (
            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded font-mono">
              PK: {pkColumn}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {result && !isLoading && (
            <span data-testid="execution-time" className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {formatExecutionTime(result.executionTimeMs)}
            </span>
          )}
          {showExport && (
            <button
              type="button"
              onClick={onExport}
              data-testid="export-csv-btn"
              className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded transition-colors shadow-sm"
              aria-label="Export CSV"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Truncation warning */}
      {result && result.truncated && (
        <div data-testid="truncation-notice" className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-700">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            ⚠️ {getTruncationMessage(result.rowCount, result.totalRows)}
          </p>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-[100px] overflow-auto">
        {displayState === 'loading' && (
          <div data-testid="loading-indicator" className="flex items-center justify-center h-[150px]">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Executing query...</span>
            </div>
          </div>
        )}

        {displayState === 'error' && (
          <div data-testid="error-message" className="p-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
              <p className="text-xs text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}

        {displayState === 'initial' && (
          <div data-testid="initial-state" className="flex items-center justify-center h-[150px] text-gray-500 dark:text-gray-400">
            <p className="text-xs">Run a query to see results here.</p>
          </div>
        )}

        {displayState === 'empty' && (
          <div data-testid="empty-results" className="flex items-center justify-center h-[150px] text-gray-500 dark:text-gray-400">
            <p className="text-xs">No results returned.</p>
          </div>
        )}

        {displayState === 'mutation' && result && (
          <div data-testid="mutation-result" className="flex items-center justify-center h-[150px]">
            <div className="text-center">
              <svg className="mx-auto h-8 w-8 text-green-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{getAffectedRowsMessage(result.affectedRows ?? 0)}</p>
            </div>
          </div>
        )}

        {/* SELECT results table */}
        {displayState === 'select' && result && (
          <table data-testid="results-table" className="table-fixed text-left min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10 select-none">
              <tr>
                {/* Sticky row index column header */}
                <th
                  style={{ width: 44, minWidth: 44, maxWidth: 44 }}
                  className="px-2 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 text-center border-r border-gray-200 dark:border-gray-700"
                >
                  #
                </th>
                {result.columns.map((col, idx) => {
                  const width = columnWidths[col] || 160;
                  return (
                    <th
                      key={idx}
                      style={{ width, minWidth: 70, maxWidth: width }}
                      className={`relative px-3 py-2 text-xs font-semibold group border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors ${
                        pkColumn === col ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                      onClick={() => setPkColumn(col)}
                      title={pkColumn === col ? `Primary key: ${col}` : `Click to set as primary key: ${col}`}
                    >
                      <div className="flex items-center justify-between pr-2 overflow-hidden">
                        <span className="truncate font-mono" title={col}>
                          {pkColumn === col && <span className="mr-1">🔑</span>}
                          {col}
                        </span>
                      </div>
                      {/* Resizer Handle */}
                      <div
                        onMouseDown={(e) => handleResizeStart(e, col)}
                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
                        title="Drag to resize column"
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900 font-mono">
              {result.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  onClick={() => handleRowClick(rowIdx)}
                  className={`transition-colors ${
                    selectedRowIdx === rowIdx
                      ? 'bg-blue-50/70 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
                >
                  {/* Row index cell */}
                  <td
                    style={{ width: 44, minWidth: 44, maxWidth: 44 }}
                    className="px-2 py-1 text-[10px] text-gray-400 dark:text-gray-500 text-center select-none border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30"
                  >
                    {rowIdx + 1}
                  </td>
                  {result.columns.map((col, colIdx) => {
                    const width = columnWidths[col] || 160;
                    const cellVal = row[col];
                    const fullText = getFullCellValue(cellVal);
                    const isNull = cellVal === null;

                    return (
                      <td
                        key={colIdx}
                        style={{ width, maxWidth: width }}
                        onDoubleClick={() => handleCellDoubleClick(rowIdx, colIdx)}
                        onContextMenu={(e) => handleCellContextMenu(e, rowIdx, colIdx)}
                        className={`px-3 py-1.5 text-xs border-r border-gray-100 dark:border-gray-800 cursor-pointer overflow-hidden ${
                          editingCell?.rowIdx === rowIdx && editingCell?.colIdx === colIdx
                            ? 'p-0 bg-yellow-50 dark:bg-yellow-900/40'
                            : isNull
                              ? 'text-gray-400 dark:text-gray-500 italic'
                              : 'text-gray-900 dark:text-gray-100'
                        }`}
                        title={fullText}
                      >
                        {editingCell?.rowIdx === rowIdx && editingCell?.colIdx === colIdx ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onKeyDown={handleEditKeyDown}
                            onBlur={commitEdit}
                            className="w-full px-2 py-1 text-xs bg-yellow-50 dark:bg-yellow-900/40 border-2 border-orange-400 dark:border-orange-500 rounded outline-none text-gray-900 dark:text-gray-100 font-mono"
                          />
                        ) : (
                          <div className="truncate text-[11px]" title={fullText}>
                            {formatCellValue(cellVal, 60)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {displayState === 'select' && result && (
        <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span data-testid="row-count">
            {result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Double-click cell to edit • Right-click cell for options & full view • Drag column border to resize
          </span>
        </div>
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[200px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          data-testid="row-context-menu"
        >
          {contextMenu.colIdx >= 0 && (
            <>
              <button
                type="button"
                onClick={handleInspectCell}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-left font-medium"
              >
                <span>🔍</span>
                <span>Inspect full cell value</span>
              </button>
              <button
                type="button"
                onClick={handleCopyCell}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <span>📄</span>
                <span>Copy cell value</span>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            </>
          )}
          <button type="button" onClick={handleCopyInsert} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <span className="text-green-600 dark:text-green-400 font-bold text-[10px]">INSERT</span>
            <span>Copy INSERT query</span>
          </button>
          <button type="button" onClick={handleCopyUpdate} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <span className="text-blue-600 dark:text-blue-400 font-bold text-[10px]">UPDATE</span>
            <span>Copy UPDATE query</span>
          </button>
          <button type="button" onClick={handleCopyDelete} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left">
            <span className="text-red-600 dark:text-red-400 font-bold text-[10px]">DELETE</span>
            <span>Copy DELETE query</span>
          </button>
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <button type="button" onClick={handleDuplicateRow} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <span>📋</span>
            <span>Duplicate row (INSERT)</span>
          </button>
        </div>
      )}

      {/* Inspect Cell Value Modal */}
      {inspectCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setInspectCell(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">
                  {inspectCell.col}
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Row #{inspectCell.rowIdx + 1}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(getFullCellValue(inspectCell.value));
                    setCopiedInspect(true);
                    setTimeout(() => setCopiedInspect(false), 2000);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                >
                  {copiedInspect ? 'Copied!' : 'Copy Value'}
                </button>
                <button
                  type="button"
                  onClick={() => setInspectCell(null)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-3 rounded-md border border-gray-200 dark:border-gray-700 select-text overflow-auto max-h-[55vh]">
                {getFullCellValue(inspectCell.value)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Update Modal */}
      {pendingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={handleCancelUpdate}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Confirm Update
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Update column <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">{pendingEdit.col}</code> in table <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">{tableName || 'table'}</code>?
            </p>
            <div className="space-y-1.5 mb-4 text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700">
              <div className="text-red-600 dark:text-red-400">
                - {String(pendingEdit.originalValue)}
              </div>
              <div className="text-green-600 dark:text-green-400">
                + {pendingEdit.newValue}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelUpdate}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUpdate}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                Apply Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pick Primary Key Modal */}
      {showPkPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={handleCancelPkPicker}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Select Primary Key
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Choose the column to use as primary key to identify this row:
            </p>
            <div className="space-y-1 max-h-[200px] overflow-auto mb-4">
              {result?.columns.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => handleSelectPk(col)}
                  className="w-full text-left px-3 py-2 text-xs rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-800 dark:text-gray-200 font-mono transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-700"
                >
                  🔑 {col}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCancelPkPicker}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
