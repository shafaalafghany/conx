import React, { useMemo, useState, useEffect } from 'react';
import { Copy, Check, X } from 'lucide-react';

/**
 * Recursively expand string values that contain valid JSON.
 * e.g. trace: "[{\"host\":...}]" → trace: [{host:...}]
 */
function expandJsonStrings(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        const parsed = JSON.parse(trimmed);
        return expandJsonStrings(parsed);
      } catch {
        return obj;
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(expandJsonStrings);
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = expandJsonStrings(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Highlight JSON syntax using syntax colors matching the design in ss.png
 */
function highlightJson(json: string): string {
  // Safe HTML escape first
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-yellow-400'; // number default
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-cyan-400 font-semibold'; // key
        } else {
          cls = 'text-emerald-400'; // string value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400 font-medium'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-slate-500 italic'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

interface PrettifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawText: string;
}

export const PrettifyModal: React.FC<PrettifyModalProps> = ({
  isOpen,
  onClose,
  rawText,
}) => {
  const [viewMode, setViewMode] = useState<'pretty' | 'raw'>('pretty');
  const [copied, setCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Strip ANSI codes and parse/expand JSON
  const formatted = useMemo(() => {
    // Strip ANSI codes
    const clean = rawText
      .replace(/\x1b\[[0-9;?><=]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b[@-Z\\-_]/g, '')
      .trim();

    if (!clean) return [];

    // Try whole-string JSON parse first (handles multi-line JSON selections)
    if (clean.startsWith('{') || clean.startsWith('[')) {
      try {
        const parsed = JSON.parse(clean);
        return [{ type: 'json' as const, content: expandJsonStrings(parsed) }];
      } catch {}
    }

    // Otherwise, parse line by line
    const results: { type: 'json' | 'text'; content: any }[] = [];
    const lines = clean.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try full line as JSON
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          results.push({ type: 'json', content: expandJsonStrings(parsed) });
          continue;
        } catch {}
      }

      // Try embedded JSON (e.g. prefix + JSON payload)
      const jsonStart = trimmed.indexOf('{');
      if (jsonStart > 0) {
        const prefix = trimmed.slice(0, jsonStart);
        const candidate = trimmed.slice(jsonStart);
        try {
          const parsed = JSON.parse(candidate);
          results.push({ type: 'text', content: prefix.trim() });
          results.push({ type: 'json', content: expandJsonStrings(parsed) });
          continue;
        } catch {}
      }

      results.push({ type: 'text', content: trimmed });
    }

    return results;
  }, [rawText]);

  const copyToClipboard = () => {
    const text = formatted
      .map((r) => (r.type === 'json' ? JSON.stringify(r.content, null, 2) : r.content))
      .join('\n');
    navigator.clipboard.writeText(text || rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl max-h-[88vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100 z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <span className="text-amber-400">✨</span>
            <span>Prettify Log</span>
          </h2>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle: [ Pretty | Raw ] */}
            <div className="flex rounded-lg overflow-hidden border border-slate-700 bg-slate-800/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('pretty')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  viewMode === 'pretty'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                Pretty
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  viewMode === 'raw'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                Raw
              </button>
            </div>

            {/* Copy Button */}
            <button
              type="button"
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors shadow-sm active:scale-95"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-300" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors ml-1"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950/60">
          {viewMode === 'raw' ? (
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all bg-slate-950 p-4 rounded-lg border border-slate-800/80 leading-relaxed selection:bg-blue-600 selection:text-white">
              {rawText}
            </pre>
          ) : (
            <div className="space-y-3">
              {formatted.map((block, i) => (
                <div key={i}>
                  {block.type === 'json' ? (
                    <pre className="text-xs font-mono bg-[#0c1017] text-slate-300 rounded-lg p-4 border border-slate-800/80 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner selection:bg-blue-600 selection:text-white">
                      <code
                        dangerouslySetInnerHTML={{
                          __html: highlightJson(JSON.stringify(block.content, null, 2)),
                        }}
                      />
                    </pre>
                  ) : (
                    <div className="text-xs font-mono text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded border border-slate-800/60">
                      {block.content}
                    </div>
                  )}
                </div>
              ))}

              {formatted.length === 0 && (
                <div className="py-12 text-center text-sm text-slate-500 font-sans">
                  No content selected or available to display.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
