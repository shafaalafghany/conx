import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  PlusCircle,
  Trash2,
  Search,
  Edit3,
  X,
  Copy,
  Check,
  Sparkles,
  Save,
} from 'lucide-react';
import type { RedisKeyTab } from '../../types';
import {
  formatBytes,
  formatTTL,
  formatTypeLabel,
  middleTruncateKey,
  isLikelyJson,
  expandNestedJson,
  highlightJsonHtml,
  REDIS_TYPE_BADGE,
} from './redis-utils';
import { PrettifyModal } from '../terminal/PrettifyModal';
import { EditTTLModal, HashFieldModal } from './RedisModals';

interface RedisKeyInspectorProps {
  tabs: RedisKeyTab[];
  activeTabId: string | null;
  hasActiveConnection: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRefreshTab: (tab: RedisKeyTab) => Promise<void> | void;
  onOpenAddKey: () => void;
  onDeleteKey: (tab: RedisKeyTab) => Promise<void>;
  onUpdateTTL: (tab: RedisKeyTab, ttlSeconds: number) => Promise<void>;
  onUpdateString: (tab: RedisKeyTab, newValue: string) => Promise<void>;
  onSaveHashField: (
    tab: RedisKeyTab,
    oldField: string,
    field: string,
    value: string
  ) => Promise<void>;
  onDeleteHashField: (tab: RedisKeyTab, field: string) => Promise<void>;
  onPushListValue: (
    tab: RedisKeyTab,
    value: string,
    position: 'head' | 'tail'
  ) => Promise<void>;
  onUpdateListValue: (
    tab: RedisKeyTab,
    index: number,
    value: string
  ) => Promise<void>;
  onDeleteListIndex: (tab: RedisKeyTab, index: number) => Promise<void>;
  onAddSetMember: (tab: RedisKeyTab, member: string) => Promise<void>;
  onRemoveSetMember: (tab: RedisKeyTab, member: string) => Promise<void>;
  onSaveZSetMember: (
    tab: RedisKeyTab,
    member: string,
    score: number
  ) => Promise<void>;
  onRemoveZSetMember: (tab: RedisKeyTab, member: string) => Promise<void>;
}

export const RedisKeyInspector: React.FC<RedisKeyInspectorProps> = ({
  tabs,
  activeTabId,
  hasActiveConnection,
  onSelectTab,
  onCloseTab,
  onRefreshTab,
  onOpenAddKey,
  onDeleteKey,
  onUpdateTTL,
  onUpdateString,
  onSaveHashField,
  onDeleteHashField,
  onPushListValue,
  onUpdateListValue,
  onDeleteListIndex,
  onAddSetMember,
  onRemoveSetMember,
  onSaveZSetMember,
  onRemoveZSetMember,
}) => {
  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || null,
    [tabs, activeTabId]
  );
  const detail = activeTab?.detail || null;

  // String view/edit state
  const [stringMode, setStringMode] = useState<'pretty' | 'raw' | 'edit'>('pretty');
  const [draftString, setDraftString] = useState('');
  const [savingString, setSavingString] = useState(false);

  // Field / collection search state
  const [fieldSearchOpen, setFieldSearchOpen] = useState(false);
  const [fieldFilter, setFieldFilter] = useState('');

  // Modals & inline CRUD states
  const [ttlModalOpen, setTtlModalOpen] = useState(false);
  const [hashModalState, setHashModalState] = useState<{
    open: boolean;
    field: string;
    value: string;
  }>({ open: false, field: '', value: '' });
  const [prettifyText, setPrettifyText] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Inline add/edit states for List / Set / ZSet
  const [addingItem, setAddingItem] = useState(false);
  const [newItemValue, setNewItemValue] = useState('');
  const [newItemScore, setNewItemScore] = useState('0');
  const [newListPos, setNewListPos] = useState<'tail' | 'head'>('tail');
  const [editingListIdx, setEditingListIdx] = useState<number | null>(null);
  const [editingListVal, setEditingListVal] = useState('');
  const [editingZMember, setEditingZMember] = useState<string | null>(null);
  const [editingZScore, setEditingZScore] = useState('0');

  useEffect(() => {
    setConfirmDeleteKey(false);
    setAddingItem(false);
    setEditingListIdx(null);
    setEditingZMember(null);
    setFieldFilter('');
    if (detail?.type === 'string' || detail?.type === 'stream') {
      setDraftString(detail.stringValue || '');
      setStringMode(isLikelyJson(detail.stringValue || '') ? 'pretty' : 'raw');
    }
  }, [activeTab?.id, detail?.type, detail?.stringValue]);

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1500);
  };

  const formattedPrettyString = useMemo(() => {
    if (!detail?.stringValue) return null;
    try {
      const parsed = JSON.parse(detail.stringValue.trim());
      return JSON.stringify(expandNestedJson(parsed), null, 2);
    } catch {
      return null;
    }
  }, [detail?.stringValue]);

  const filteredHashFields = useMemo(() => {
    if (!detail?.hashFields) return [];
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return detail.hashFields;
    return detail.hashFields.filter(
      (f) =>
        f.field.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
    );
  }, [detail?.hashFields, fieldFilter]);

  const filteredListItems = useMemo(() => {
    if (!detail?.listItems) return [];
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return detail.listItems;
    return detail.listItems.filter((item) =>
      item.value.toLowerCase().includes(q)
    );
  }, [detail?.listItems, fieldFilter]);

  const filteredSetMembers = useMemo(() => {
    if (!detail?.setMembers) return [];
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return detail.setMembers;
    return detail.setMembers.filter((m) => m.toLowerCase().includes(q));
  }, [detail?.setMembers, fieldFilter]);

  const filteredZSetMembers = useMemo(() => {
    if (!detail?.zSetMembers) return [];
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return detail.zSetMembers;
    return detail.zSetMembers.filter((z) =>
      z.member.toLowerCase().includes(q)
    );
  }, [detail?.zSetMembers, fieldFilter]);

  const handleTriggerAddElement = () => {
    if (!detail) return;
    if (detail.type === 'hash') {
      setHashModalState({ open: true, field: '', value: '' });
    } else if (
      detail.type === 'list' ||
      detail.type === 'set' ||
      detail.type === 'zset'
    ) {
      setAddingItem(true);
      setNewItemValue('');
      setNewItemScore('0');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* Top Bar: ADD KEY button + Multi-Key Result Tabs */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0 overflow-x-auto pb-0.5">
        <button
          type="button"
          disabled={!hasActiveConnection}
          onClick={onOpenAddKey}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 flex items-center gap-1.5 shadow-2xs transition-colors flex-shrink-0 disabled:opacity-50"
        >
          <span>ADD KEY</span>
          <span className="text-[10px]">▶</span>
        </button>

        {tabs.map((tab) => {
          const isCurrent = tab.id === activeTabId;
          const badgeCls =
            REDIS_TYPE_BADGE[tab.detail?.type || ''] ||
            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600';

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              title={`${tab.key} (DB ${tab.dbIndex})`}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border cursor-pointer select-none flex-shrink-0 transition-colors ${
                isCurrent
                  ? 'bg-white dark:bg-gray-800 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                  : 'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-gray-700'
              }`}
            >
              {tab.detail?.type && tab.detail.type !== 'none' && (
                <span
                  className={`text-[9px] uppercase font-mono px-1 rounded border ${badgeCls}`}
                >
                  {tab.detail.type === 'string' ? 'str' : tab.detail.type}
                </span>
              )}
              <span className="font-mono max-w-[180px] truncate">
                {middleTruncateKey(tab.key, 24)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="ml-1 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Result Action Toolbar (Refresh kept, WHERE & ORDER BY removed as requested!) */}
      <div
        className={`flex items-center justify-between gap-2 mb-2 p-2 rounded-lg border flex-shrink-0 transition-all ${
          activeTab
            ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-2xs'
            : 'bg-gray-50/80 dark:bg-gray-800/40 border-gray-200/60 dark:border-gray-700/60'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          {/* Refresh Active Key Button */}
          <button
            type="button"
            disabled={!activeTab || activeTab.isLoading}
            onClick={() => activeTab && onRefreshTab(activeTab)}
            title={
              activeTab
                ? 'Refresh this key value & TTL'
                : 'Select a key on the left to inspect'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all flex-shrink-0 ${
              activeTab && !activeTab.isLoading
                ? 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95'
                : 'text-gray-400 dark:text-gray-500 bg-gray-100/50 dark:bg-gray-700/50 cursor-not-allowed opacity-60'
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                activeTab?.isLoading ? 'animate-spin text-blue-500' : ''
              }`}
            />
            <span>Refresh</span>
          </button>

          {/* Key Metadata Summary: Hash (6) | 345 B | TTL : No Expiry */}
          {detail && detail.exists && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 font-medium">
              <span className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
              <span>{formatTypeLabel(detail.type, detail.length)}</span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>{formatBytes(detail.sizeBytes)}</span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>
                TTL :{' '}
                <button
                  type="button"
                  onClick={() => setTtlModalOpen(true)}
                  title="Click to edit TTL"
                  className="underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400 font-semibold"
                >
                  {formatTTL(detail.ttl)}
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Right Side Key Actions (Matching ss.png: Add Field ⊕, Prettify, Delete 🗑) */}
        {activeTab && detail && detail.exists && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {detail.type === 'string' && (
              <>
                <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600 text-xs">
                  {formattedPrettyString && (
                    <button
                      type="button"
                      onClick={() => setStringMode('pretty')}
                      className={`px-2.5 py-1 font-medium ${
                        stringMode === 'pretty'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      Pretty
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setStringMode('raw')}
                    className={`px-2.5 py-1 font-medium ${
                      stringMode === 'raw'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Raw
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftString(detail.stringValue);
                      setStringMode('edit');
                    }}
                    className={`px-2.5 py-1 font-medium ${
                      stringMode === 'edit'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Edit
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPrettifyText(detail.stringValue)}
                  title="Open in Prettify Log Modal"
                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span>Prettify</span>
                </button>
              </>
            )}

            {['hash', 'list', 'set', 'zset'].includes(detail.type) && (
              <button
                type="button"
                onClick={handleTriggerAddElement}
                title={`Add entry to ${detail.type}`}
                className="p-1.5 rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            )}

            {confirmDeleteKey ? (
              <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md">
                <span className="text-[11px] text-rose-700 dark:text-rose-300 font-medium">
                  Delete key?
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmDeleteKey(false);
                    await onDeleteKey(activeTab);
                  }}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded bg-rose-600 text-white hover:bg-rose-700"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteKey(false)}
                  className="px-1.5 py-0.5 text-[11px] text-gray-600 dark:text-gray-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteKey(true)}
                title="Delete this Redis key"
                className="p-1.5 rounded-md text-gray-500 hover:text-rose-600 dark:text-gray-300 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Key Inspector Card */}
      <div className="flex-1 min-h-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
        {!activeTab ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              No Redis Key Selected
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md">
              Select any key from the Keys explorer on the left to inspect its fields, JSON payload, and TTL, or click &quot;ADD KEY&quot; to create one.
            </p>
          </div>
        ) : activeTab.isLoading && !detail ? (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
            <span>Loading key {activeTab.key}...</span>
          </div>
        ) : activeTab.error ? (
          <div className="p-6 text-xs text-rose-600 dark:text-rose-400 font-mono">
            Error: {activeTab.error}
          </div>
        ) : !detail || !detail.exists ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Key Expired or Does Not Exist
            </p>
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1 break-all">
              {activeTab.key}
            </p>
          </div>
        ) : (
          <>
            {/* Key Full Title Banner (Matching ss.png) */}
            <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3 bg-gray-50/40 dark:bg-gray-900/30 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm md:text-base font-bold font-mono text-gray-900 dark:text-gray-100 break-all leading-snug">
                  {detail.key}
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {activeTab.connectionName} • DB {activeTab.dbIndex}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(detail.key)}
                title="Copy full key name"
                className="px-2.5 py-1 text-xs font-medium rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center gap-1 flex-shrink-0"
              >
                {copiedKey ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Key</span>
                  </>
                )}
              </button>
            </div>

            {/* Inline Add Row for List / Set / ZSet */}
            {addingItem && ['list', 'set', 'zset'].includes(detail.type) && (
              <div className="px-5 py-3 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800/70 flex items-center gap-2 flex-wrap flex-shrink-0">
                {detail.type === 'list' && (
                  <select
                    value={newListPos}
                    onChange={(e) => setNewListPos(e.target.value as 'tail' | 'head')}
                    className="px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                  >
                    <option value="tail">RPUSH (Tail)</option>
                    <option value="head">LPUSH (Head)</option>
                  </select>
                )}
                {detail.type === 'zset' && (
                  <input
                    type="number"
                    step="any"
                    value={newItemScore}
                    onChange={(e) => setNewItemScore(e.target.value)}
                    placeholder="Score"
                    className="w-28 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                )}
                <input
                  type="text"
                  value={newItemValue}
                  onChange={(e) => setNewItemValue(e.target.value)}
                  placeholder={detail.type === 'list' ? 'Item value...' : 'Member value...'}
                  className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newItemValue) return;
                    if (detail.type === 'list') {
                      await onPushListValue(activeTab, newItemValue, newListPos);
                    } else if (detail.type === 'set') {
                      await onAddSetMember(activeTab, newItemValue);
                    } else if (detail.type === 'zset') {
                      await onSaveZSetMember(
                        activeTab,
                        newItemValue,
                        parseFloat(newItemScore) || 0
                      );
                    }
                    setAddingItem(false);
                    setNewItemValue('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAddingItem(false)}
                  className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Body by Redis Data Type */}
            <div className="flex-1 overflow-auto min-h-0">
              {/* 1. HASH INSPECTOR (Exact match to ss.png!) */}
              {detail.type === 'hash' && (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10">
                    <tr>
                      <th className="py-2.5 px-5 text-xs font-bold text-gray-700 dark:text-gray-200 w-1/3 border-r border-gray-200/80 dark:border-gray-700/80">
                        <div className="flex items-center justify-between gap-2">
                          <span>Field</span>
                          <div className="flex items-center gap-1.5">
                            {fieldSearchOpen && (
                              <input
                                type="text"
                                autoFocus
                                value={fieldFilter}
                                onChange={(e) => setFieldFilter(e.target.value)}
                                placeholder="Filter..."
                                className="w-32 px-2 py-0.5 text-xs font-normal font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setFieldSearchOpen((prev) => {
                                  if (prev) setFieldFilter('');
                                  return !prev;
                                });
                              }}
                              title="Filter hash fields"
                              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
                                fieldFilter
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                              }`}
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </th>
                      <th className="py-2.5 px-5 text-xs font-bold text-gray-700 dark:text-gray-200">
                        Value
                      </th>
                      <th className="py-2.5 px-4 w-24 text-right text-xs font-bold text-gray-700 dark:text-gray-200" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700/70 text-xs font-mono">
                    {filteredHashFields.map((row) => {
                      const jsonDetected = isLikelyJson(row.value);
                      return (
                        <tr
                          key={row.field}
                          className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors"
                        >
                          <td className="py-3 px-5 align-top text-gray-600 dark:text-gray-300 break-all border-r border-gray-100 dark:border-gray-700/60">
                            {row.field}
                          </td>
                          <td className="py-3 px-5 align-top text-gray-800 dark:text-gray-100 break-all whitespace-pre-wrap">
                            <div className="flex items-start justify-between gap-2">
                              <span>{row.value}</span>
                              {jsonDetected && (
                                <button
                                  type="button"
                                  onClick={() => setPrettifyText(row.value)}
                                  title="Prettify JSON value"
                                  className="px-1.5 py-0.5 text-[10px] font-sans font-semibold rounded bg-emerald-600/90 hover:bg-emerald-500 text-white flex items-center gap-1 flex-shrink-0"
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                                  <span>Prettify</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 align-top text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setHashModalState({
                                    open: true,
                                    field: row.field,
                                    value: row.value,
                                  })
                                }
                                title="Edit field"
                                className="p-1 rounded bg-gray-200/80 dark:bg-gray-700 hover:bg-blue-600 hover:text-white text-gray-600 dark:text-gray-300 transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteHashField(activeTab, row.field)}
                                title="Delete field"
                                className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredHashFields.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="py-8 text-center text-gray-400 font-sans"
                        >
                          No fields match filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* 2. STRING / STREAM INSPECTOR */}
              {(detail.type === 'string' || detail.type === 'stream') && (
                <div className="p-4 h-full flex flex-col">
                  {stringMode === 'edit' && detail.type === 'string' ? (
                    <div className="flex-1 flex flex-col gap-3">
                      <textarea
                        value={draftString}
                        onChange={(e) => setDraftString(e.target.value)}
                        className="flex-1 min-h-[260px] w-full p-3 text-xs font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              setDraftString(
                                JSON.stringify(JSON.parse(draftString), null, 2)
                              );
                            } catch {}
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Format JSON
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setStringMode(formattedPrettyString ? 'pretty' : 'raw')
                            }
                            className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingString}
                            onClick={async () => {
                              setSavingString(true);
                              try {
                                await onUpdateString(activeTab, draftString);
                                setStringMode(
                                  isLikelyJson(draftString) ? 'pretty' : 'raw'
                                );
                              } finally {
                                setSavingString(false);
                              }
                            }}
                            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingString ? 'Saving...' : 'Save Value'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : stringMode === 'pretty' && formattedPrettyString ? (
                    <pre className="text-xs font-mono bg-gray-50 dark:bg-[#0c1017] text-gray-800 dark:text-slate-200 rounded-lg p-4 border border-gray-200 dark:border-slate-800 overflow-auto whitespace-pre-wrap leading-relaxed">
                      <code
                        dangerouslySetInnerHTML={{
                          __html: highlightJsonHtml(formattedPrettyString),
                        }}
                      />
                    </pre>
                  ) : (
                    <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900/80 text-gray-800 dark:text-gray-200 rounded-lg p-4 border border-gray-200 dark:border-gray-700 overflow-auto whitespace-pre-wrap break-all leading-relaxed">
                      {detail.stringValue}
                    </pre>
                  )}
                </div>
              )}

              {/* 3. LIST INSPECTOR */}
              {detail.type === 'list' && (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10">
                    <tr>
                      <th className="py-2.5 px-5 text-xs font-bold text-gray-700 dark:text-gray-200 w-24 border-r border-gray-200 dark:border-gray-700">
                        Index
                      </th>
                      <th className="py-2.5 px-5 text-xs font-bold text-gray-700 dark:text-gray-200">
                        <div className="flex items-center justify-between">
                          <span>Value</span>
                          <input
                            type="text"
                            value={fieldFilter}
                            onChange={(e) => setFieldFilter(e.target.value)}
                            placeholder="Filter items..."
                            className="w-40 px-2 py-0.5 text-xs font-normal font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                          />
                        </div>
                      </th>
                      <th className="py-2.5 px-4 w-24 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700/70 text-xs font-mono">
                    {filteredListItems.map((item) => (
                      <tr key={item.index} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30">
                        <td className="py-3 px-5 text-gray-500 border-r border-gray-100 dark:border-gray-700/60">
                          #{item.index}
                        </td>
                        <td className="py-3 px-5 text-gray-800 dark:text-gray-100 break-all">
                          {editingListIdx === item.index ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingListVal}
                                onChange={(e) => setEditingListVal(e.target.value)}
                                className="flex-1 px-2 py-1 rounded border border-blue-500 bg-white dark:bg-gray-900"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  await onUpdateListValue(
                                    activeTab,
                                    item.index,
                                    editingListVal
                                  );
                                  setEditingListIdx(null);
                                }}
                                className="px-2.5 py-1 rounded bg-blue-600 text-white font-sans font-semibold"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingListIdx(null)}
                                className="px-2 py-1 text-gray-500 font-sans"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <span>{item.value}</span>
                              {isLikelyJson(item.value) && (
                                <button
                                  type="button"
                                  onClick={() => setPrettifyText(item.value)}
                                  className="px-1.5 py-0.5 text-[10px] font-sans font-semibold rounded bg-emerald-600 text-white flex items-center gap-1 flex-shrink-0"
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                                  <span>Prettify</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingListIdx(item.index);
                                setEditingListVal(item.value);
                              }}
                              className="p-1 rounded bg-gray-200/80 dark:bg-gray-700 hover:bg-blue-600 hover:text-white text-gray-600 dark:text-gray-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteListIndex(activeTab, item.index)}
                              className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-gray-500 hover:text-rose-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 4. SET INSPECTOR */}
              {detail.type === 'set' && (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10">
                    <tr>
                      <th className="py-2.5 px-5 text-xs font-bold text-gray-700 dark:text-gray-200">
                        <div className="flex items-center justify-between">
                          <span>Member</span>
                          <input
                            type="text"
                            value={fieldFilter}
                            onChange={(e) => setFieldFilter(e.target.value)}
                            placeholder="Filter members..."
                            className="w-40 px-2 py-0.5 text-xs font-normal font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                          />
                        </div>
                      </th>
                      <th className="py-2.5 px-4 w-16 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700/70 text-xs font-mono">
                    {filteredSetMembers.map((member) => (
                      <tr key={member} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30">
                        <td className="py-3 px-5 text-gray-800 dark:text-gray-100 break-all">
                          <div className="flex items-start justify-between gap-2">
                            <span>{member}</span>
                            {isLikelyJson(member) && (
                              <button
                                type="button"
                                onClick={() => setPrettifyText(member)}
                                className="px-1.5 py-0.5 text-[10px] font-sans font-semibold rounded bg-emerald-600 text-white flex items-center gap-1 flex-shrink-0"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                                <span>Prettify</span>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onRemoveSetMember(activeTab, member)}
                            className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-gray-500 hover:text-rose-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 5. SORTED SET (ZSET) INSPECTOR */}
              {detail.type === 'zset' && (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10">
                    <tr>
                      <th className="py-2.5 px-5 text-xs font-bold text-gray-700 dark:text-gray-200 w-36 border-r border-gray-200 dark:border-gray-700">
                        Score
                      </th>
                      <th className="py-2.5 px-5 text-xs font-bold text-gray-700 dark:text-gray-200">
                        <div className="flex items-center justify-between">
                          <span>Member</span>
                          <input
                            type="text"
                            value={fieldFilter}
                            onChange={(e) => setFieldFilter(e.target.value)}
                            placeholder="Filter members..."
                            className="w-40 px-2 py-0.5 text-xs font-normal font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                          />
                        </div>
                      </th>
                      <th className="py-2.5 px-4 w-24 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700/70 text-xs font-mono">
                    {filteredZSetMembers.map((z) => (
                      <tr key={z.member} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30">
                        <td className="py-3 px-5 text-purple-600 dark:text-purple-400 font-semibold border-r border-gray-100 dark:border-gray-700/60">
                          {editingZMember === z.member ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="any"
                                value={editingZScore}
                                onChange={(e) => setEditingZScore(e.target.value)}
                                className="w-20 px-1.5 py-0.5 rounded border border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  await onSaveZSetMember(
                                    activeTab,
                                    z.member,
                                    parseFloat(editingZScore) || 0
                                  );
                                  setEditingZMember(null);
                                }}
                                className="px-2 py-0.5 rounded bg-blue-600 text-white font-sans text-[11px]"
                              >
                                OK
                              </button>
                            </div>
                          ) : (
                            z.score
                          )}
                        </td>
                        <td className="py-3 px-5 text-gray-800 dark:text-gray-100 break-all">
                          {z.member}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingZMember(z.member);
                                setEditingZScore(String(z.score));
                              }}
                              title="Edit score"
                              className="p-1 rounded bg-gray-200/80 dark:bg-gray-700 hover:bg-blue-600 hover:text-white text-gray-600 dark:text-gray-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveZSetMember(activeTab, z.member)}
                              className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-gray-500 hover:text-rose-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {activeTab && detail && (
        <>
          <EditTTLModal
            isOpen={ttlModalOpen}
            keyName={detail.key}
            currentTtl={detail.ttl}
            onClose={() => setTtlModalOpen(false)}
            onSave={(ttl) => onUpdateTTL(activeTab, ttl)}
          />

          <HashFieldModal
            isOpen={hashModalState.open}
            initialField={hashModalState.field}
            initialValue={hashModalState.value}
            onClose={() =>
              setHashModalState({ open: false, field: '', value: '' })
            }
            onSave={(oldF, newF, val) =>
              onSaveHashField(activeTab, oldF, newF, val)
            }
          />
        </>
      )}

      <PrettifyModal
        isOpen={prettifyText !== null}
        onClose={() => setPrettifyText(null)}
        rawText={prettifyText || ''}
      />
    </div>
  );
};
