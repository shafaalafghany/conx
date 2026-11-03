import { useRef, useEffect, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { sql, MySQL } from '@codemirror/lang-sql';
import type { SQLNamespace } from '@codemirror/lang-sql';
import { basicSetup } from 'codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { isRunQueryShortcut, getRunShortcutLabel } from './sql-editor-utils';
import { useTheme } from '../../context/ThemeContext';

export interface SQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the selected text when running a query. If nothing is selected, called with empty string. */
  onRun: (selectedText: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Schema for autocomplete: nested object { db: { table: [columns] } } */
  schema?: SQLNamespace;
  /** Height in pixels of the editor component when resizable */
  height?: number;
}

/**
 * High-contrast dark syntax highlight style for SQL.
 * Ensures all tokens are bright, crisp, and easily readable on dark backgrounds (#1f2937 / #111827).
 */
export const darkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#38bdf8', fontWeight: 'bold' }, // Bright sky blue for SELECT, FROM, WHERE, etc.
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#f3f4f6' }, // Crisp light gray/white for identifiers & table names
  { tag: [t.function(t.variableName), t.labelName], color: '#fbbf24', fontWeight: '600' }, // Warm yellow/amber for COUNT, SUM, etc.
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#f472b6' }, // Pink
  { tag: [t.definition(t.name), t.separator], color: '#e5e7eb' },
  { tag: [t.typeName, t.className], color: '#c084fc', fontWeight: '600' }, // Bright violet for INT, VARCHAR, etc.
  { tag: t.number, color: '#fb923c' }, // Bright orange for numbers
  { tag: [t.operator, t.operatorKeyword], color: '#f472b6', fontWeight: 'bold' }, // Bright pink for =, <, >, +, -, *
  { tag: [t.meta, t.comment], color: '#9ca3af', fontStyle: 'italic' }, // Soft gray for comments
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.atom, t.bool, t.null, t.special(t.variableName)], color: '#fb923c', fontWeight: 'bold' }, // TRUE, FALSE, NULL
  { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#4ade80' }, // Vibrant emerald green for strings
  { tag: t.invalid, color: '#f87171' },
]);

/**
 * High-contrast light syntax highlight style for SQL.
 * Ensures rich, deep colors with high contrast on white/gray-50 backgrounds.
 */
export const lightHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#1d4ed8', fontWeight: 'bold' }, // Deep royal blue
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#111827' }, // Deep slate/black
  { tag: [t.function(t.variableName), t.labelName], color: '#b45309', fontWeight: '600' }, // Deep amber
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#db2777' }, // Deep pink
  { tag: [t.definition(t.name), t.separator], color: '#374151' },
  { tag: [t.typeName, t.className], color: '#7c3aed', fontWeight: '600' }, // Deep purple
  { tag: t.number, color: '#c2410c' }, // Deep orange/coral
  { tag: [t.operator, t.operatorKeyword], color: '#db2777', fontWeight: 'bold' }, // Deep rose
  { tag: [t.meta, t.comment], color: '#64748b', fontStyle: 'italic' }, // Slate gray
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.atom, t.bool, t.null, t.special(t.variableName)], color: '#c2410c', fontWeight: 'bold' },
  { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#15803d' }, // Deep emerald green
  { tag: t.invalid, color: '#dc2626' },
]);

/**
 * Dark theme for CodeMirror that matches conx's Tailwind dark mode (#1f2937).
 */
const darkTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: '#1f2937', // gray-800
      color: '#f3f4f6', // gray-100
      fontSize: '13px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'inherit',
      lineHeight: '1.6',
    },
    '.cm-content': {
      caretColor: '#38bdf8', // blue-400
      padding: '8px 0',
    },
    '.cm-line': {
      padding: '0 8px',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#38bdf8',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#1e3a8a !important', // deep blue-900 selection
    },
    '.cm-content ::selection': {
      backgroundColor: '#1e3a8a',
    },
    '.cm-gutters': {
      backgroundColor: '#111827', // gray-900
      color: '#9ca3af', // gray-400
      borderRight: '1px solid #374151',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#1f2937',
      color: '#38bdf8',
      fontWeight: 'bold',
    },
    '.cm-activeLine': {
      backgroundColor: '#37415140',
    },
    '.cm-placeholder': {
      color: '#9ca3af !important',
      fontStyle: 'italic',
    },
  },
  { dark: true }
);

/**
 * Light theme for CodeMirror that matches conx's Tailwind light mode (#ffffff / #f9fafb).
 */
const lightTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: '#ffffff',
      color: '#111827',
      fontSize: '13px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'inherit',
      lineHeight: '1.6',
    },
    '.cm-content': {
      caretColor: '#2563eb',
      padding: '8px 0',
    },
    '.cm-line': {
      padding: '0 8px',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#2563eb',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#bfdbfe !important',
    },
    '.cm-content ::selection': {
      backgroundColor: '#bfdbfe',
    },
    '.cm-gutters': {
      backgroundColor: '#f3f4f6',
      color: '#6b7280',
      borderRight: '1px solid #e5e7eb',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#e5e7eb',
      color: '#1d4ed8',
      fontWeight: 'bold',
    },
    '.cm-activeLine': {
      backgroundColor: '#f8fafc',
    },
    '.cm-placeholder': {
      color: '#9ca3af !important',
      fontStyle: 'italic',
    },
  },
  { dark: false }
);

export default function SQLEditor({
  value,
  onChange,
  onRun,
  disabled = false,
  placeholder,
  schema,
  height,
}: SQLEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  const sqlCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const lastSelectionRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Initialize CodeMirror instance
  useEffect(() => {
    if (!editorRef.current) return;

    const isDark = theme === 'dark';

    const runQueryKeymap = keymap.of([
      {
        key: 'Ctrl-Enter',
        mac: 'Cmd-Enter',
        run: (view) => {
          const { from, to } = view.state.selection.main;
          const selectedText = from !== to ? view.state.sliceDoc(from, to) : '';
          onRunRef.current(selectedText);
          return true;
        },
      },
    ]);

    const extensions = [
      basicSetup,
      sqlCompartment.current.of(sql({ dialect: MySQL, schema: schema || undefined })),
      themeCompartment.current.of(isDark ? darkTheme : lightTheme),
      highlightCompartment.current.of(syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle)),
      runQueryKeymap,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          onChangeRef.current(newValue);
        }
        if (update.selectionSet || update.docChanged) {
          const { from, to } = update.state.selection.main;
          lastSelectionRef.current = { from, to };
        }
      }),
      EditorView.editable.of(true),
    ];

    if (placeholder) {
      extensions.push(cmPlaceholder(placeholder));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [placeholder]);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Update theme dynamically when theme changes ('light' <-> 'dark')
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const isDark = theme === 'dark';
    view.dispatch({
      effects: [
        themeCompartment.current.reconfigure(isDark ? darkTheme : lightTheme),
        highlightCompartment.current.reconfigure(syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle)),
      ],
    });
  }, [theme]);

  // Update SQL schema for autocomplete when schema changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: sqlCompartment.current.reconfigure(sql({ dialect: MySQL, schema: schema || undefined })),
    });
  }, [schema]);

  const handleRun = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      const { from, to } = lastSelectionRef.current;
      const selectedText = from !== to ? view.state.sliceDoc(from, to) : '';
      onRun(selectedText);
    } else {
      onRun('');
    }
  }, [onRun]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (isRunQueryShortcut(event)) {
        event.preventDefault();
        handleRun();
      }
    },
    [handleRun]
  );

  const shortcutLabel = getRunShortcutLabel();

  return (
    <div
      className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm bg-white dark:bg-gray-800"
      style={{ height: height ? `${height}px` : undefined }}
      onKeyDown={handleKeyDown}
      data-testid="sql-editor"
    >
      {/* CodeMirror Editor Container */}
      <div
        ref={editorRef}
        className="flex-1 min-h-[60px] overflow-auto"
        data-testid="sql-editor-codemirror"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            <kbd className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-600">
              {shortcutLabel}
            </kbd>{' '}
            to run
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
            • Select text to run partial query
          </span>
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleRun}
          disabled={disabled}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-900/50 disabled:cursor-not-allowed rounded-md shadow-sm transition-colors"
          data-testid="sql-editor-run-btn"
          aria-label="Run Query"
        >
          Run Query
        </button>
      </div>
    </div>
  );
}
