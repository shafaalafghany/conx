export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatKeyCount(count: number): string {
  if (!count || count <= 0) return '0';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

export function formatTTL(ttl: number): string {
  if (ttl === -1) return 'No Expiry';
  if (ttl === -2) return 'Expired / Missing';
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) {
    const m = Math.floor(ttl / 60);
    const s = ttl % 60;
    return s > 0 ? `${m}m ${s}s (${ttl}s)` : `${m}m (${ttl}s)`;
  }
  const h = Math.floor(ttl / 3600);
  const m = Math.floor((ttl % 3600) / 60);
  return m > 0 ? `${h}h ${m}m (${ttl}s)` : `${h}h (${ttl}s)`;
}

export function middleTruncateKey(key: string, maxLen = 36): string {
  if (key.length <= maxLen) return key;
  const keepStart = Math.ceil((maxLen - 3) * 0.68);
  const keepEnd = Math.max(5, maxLen - 3 - keepStart);
  return `${key.slice(0, keepStart)}...${key.slice(key.length - keepEnd)}`;
}

export function formatTypeLabel(type: string, length?: number): string {
  const normalized = (type || 'unknown').toLowerCase();
  const map: Record<string, string> = {
    string: 'String',
    hash: 'Hash',
    list: 'List',
    set: 'Set',
    zset: 'Sorted Set',
    stream: 'Stream',
  };
  const label = map[normalized] || normalized;
  if (normalized === 'string') return label;
  if (typeof length === 'number' && length >= 0) {
    return `${label} (${length})`;
  }
  return label;
}

export const REDIS_TYPE_BADGE: Record<string, string> = {
  hash: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/70',
  string: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
  list: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
  set: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/70',
  zset: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800/70',
  stream: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/70',
};

export function expandNestedJson(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        return expandNestedJson(JSON.parse(trimmed));
      } catch {
        return obj;
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(expandNestedJson);
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(obj)) {
      out[k] = expandNestedJson(obj[k]);
    }
    return out;
  }
  return obj;
}

export function isLikelyJson(val: string): boolean {
  if (!val) return false;
  const t = val.trim();
  if (!(t.startsWith('{') && t.endsWith('}')) && !(t.startsWith('[') && t.endsWith(']'))) {
    return false;
  }
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function highlightJsonHtml(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-yellow-500 dark:text-yellow-400';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-sky-600 dark:text-cyan-400 font-semibold';
        } else {
          cls = 'text-emerald-600 dark:text-emerald-400';
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-600 dark:text-purple-400 font-medium';
      } else if (/null/.test(match)) {
        cls = 'text-slate-400 dark:text-slate-500 italic';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
