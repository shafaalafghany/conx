/**
 * Utility functions for the SQL Editor component.
 * Extracted for testability since CodeMirror requires a browser environment.
 */

/**
 * Determines if a keyboard event represents the "Run Query" shortcut.
 * - Ctrl+Enter on Windows/Linux
 * - Cmd+Enter on macOS
 */
export function isRunQueryShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

/**
 * Detects if the current environment is macOS based on navigator.
 * Returns true for macOS, false otherwise.
 */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform?.toLowerCase().includes('mac') ?? false;
}

/**
 * Returns the display label for the run query shortcut based on platform.
 */
export function getRunShortcutLabel(): string {
  if (isMacOS()) {
    return '⌘+Enter';
  }
  return 'Ctrl+Enter';
}

/**
 * Detects if dark mode is active by checking the document root for the 'dark' class.
 * This matches the project's Tailwind dark mode strategy.
 */
export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return true; // default to dark in SSR
  return document.documentElement.classList.contains('dark');
}

/**
 * Extracts the selected text from a CodeMirror EditorView selection state.
 * Returns the selected text if there is a non-empty selection, otherwise returns empty string.
 */
export function getSelectedText(selection: { from: number; to: number }, sliceDoc: (from: number, to: number) => string): string {
  const { from, to } = selection;
  if (from === to) return '';
  return sliceDoc(from, to);
}

export interface ParsedSqlClauses {
  base: string;
  where: string;
  orderBy: string;
  limit: string;
}

/**
 * Parses a SQL statement into base query, WHERE clause, ORDER BY clause, and LIMIT clause.
 */
export function parseSqlClauses(sql: string): ParsedSqlClauses {
  let clean = sql.trim().replace(/;+$/, '');
  let where = '';
  let orderBy = '';
  let limit = '';

  const limitMatch = clean.match(/[\s\r\n]+LIMIT[\s\r\n]+(\d+(?:[\s\r\n]*,[\s\r\n]*\d+)?|\d+[\s\r\n]+OFFSET[\s\r\n]+\d+)/i);
  if (limitMatch && limitMatch.index !== undefined) {
    limit = limitMatch[0];
    clean = clean.slice(0, limitMatch.index);
  }

  const orderMatch = clean.match(/[\s\r\n]+ORDER[\s\r\n]+BY[\s\r\n]+([\s\S]+)$/i);
  if (orderMatch && orderMatch.index !== undefined) {
    orderBy = orderMatch[1].trim();
    clean = clean.slice(0, orderMatch.index);
  }

  const whereMatch = clean.match(/[\s\r\n]+WHERE[\s\r\n]+([\s\S]+)$/i);
  if (whereMatch && whereMatch.index !== undefined) {
    where = whereMatch[1].trim();
    clean = clean.slice(0, whereMatch.index);
  }

  const base = clean.trim();
  return { base, where, orderBy, limit };
}

/**
 * Reconstructs a SQL statement from base, WHERE, ORDER BY, and LIMIT clauses.
 */
export function buildSqlWithClauses(base: string, where: string, orderBy: string, limit: string): string {
  const trimmedBase = base.trim();
  if (!trimmedBase) return '';
  const parts: string[] = [trimmedBase];
  if (where && where.trim()) {
    parts.push('WHERE ' + where.trim());
  }
  if (orderBy && orderBy.trim()) {
    parts.push('ORDER BY ' + orderBy.trim());
  }
  if (limit && limit.trim()) {
    parts.push(limit.trim());
  }
  return parts.join(' ');
}

