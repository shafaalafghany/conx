import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { RedisSetKeyRequest, RedisHashField, RedisZSetMember } from '../../types';

/* -------------------------------------------------------------------------- */
/* 1. Add New Redis Key Modal ("ADD KEY ▶")                                   */
/* -------------------------------------------------------------------------- */
interface AddKeyModalProps {
  isOpen: boolean;
  dbIndex: number;
  onClose: () => void;
  onSubmit: (payload: RedisSetKeyRequest) => Promise<void>;
}

export const AddKeyModal: React.FC<AddKeyModalProps> = ({
  isOpen,
  dbIndex,
  onClose,
  onSubmit,
}) => {
  const [keyName, setKeyName] = useState('');
  const [keyType, setKeyType] = useState<'string' | 'hash' | 'list' | 'set' | 'zset'>('string');
  const [ttlInput, setTtlInput] = useState('');
  const [stringValue, setStringValue] = useState('');
  const [hashFields, setHashFields] = useState<RedisHashField[]>([{ field: '', value: '' }]);
  const [listValues, setListValues] = useState<string[]>(['']);
  const [setMembers, setSetMembers] = useState<string[]>(['']);
  const [zSetMembers, setZSetMembers] = useState<RedisZSetMember[]>([{ score: 0, member: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setKeyName('');
      setKeyType('string');
      setTtlInput('');
      setStringValue('');
      setHashFields([{ field: '', value: '' }]);
      setListValues(['']);
      setSetMembers(['']);
      setZSetMembers([{ score: 0, member: '' }]);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(stringValue);
      setStringValue(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      setError('Value is not valid JSON');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      setError('Key name is required');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const ttl = ttlInput.trim() ? parseInt(ttlInput.trim(), 10) || -1 : -1;
      await onSubmit({
        key: keyName.trim(),
        type: keyType,
        ttl,
        stringValue,
        hashFields: hashFields.filter((f) => f.field.trim() !== ''),
        listValues: listValues.filter((v) => v !== ''),
        setMembers: setMembers.filter((m) => m !== ''),
        zSetMembers: zSetMembers.filter((z) => z.member !== ''),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err) || 'Failed to create key');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-5 max-h-[88vh] flex flex-col z-10">
        <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
            Add Key <span className="text-xs font-mono font-normal text-gray-400">(DB {dbIndex})</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-3.5 overflow-y-auto pr-1 flex-1">
          {error && (
            <div className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Key Name *
            </label>
            <input
              type="text"
              required
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. ibank_brimo.tbl_device:user123"
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Data Type
              </label>
              <select
                value={keyType}
                onChange={(e) => setKeyType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="string">String</option>
                <option value="hash">Hash</option>
                <option value="list">List</option>
                <option value="set">Set</option>
                <option value="zset">Sorted Set (ZSet)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                TTL (Seconds) <span className="font-normal text-gray-400">(blank = No Expiry)</span>
              </label>
              <input
                type="number"
                value={ttlInput}
                onChange={(e) => setTtlInput(e.target.value)}
                placeholder="No Expiry"
                className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {keyType === 'string' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Value
                </label>
                <button
                  type="button"
                  onClick={handleFormatJson}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Format JSON
                </button>
              </div>
              <textarea
                rows={6}
                value={stringValue}
                onChange={(e) => setStringValue(e.target.value)}
                placeholder='Enter string or JSON payload...'
                className="w-full p-2.5 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {keyType === 'hash' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Hash Fields
                </label>
                <button
                  type="button"
                  onClick={() => setHashFields([...hashFields, { field: '', value: '' }])}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Field
                </button>
              </div>
              {hashFields.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Field"
                    value={row.field}
                    onChange={(e) => {
                      const next = [...hashFields];
                      next[idx] = { ...next[idx], field: e.target.value };
                      setHashFields(next);
                    }}
                    className="w-2/5 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => {
                      const next = [...hashFields];
                      next[idx] = { ...next[idx], value: e.target.value };
                      setHashFields(next);
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  {hashFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setHashFields(hashFields.filter((_, i) => i !== idx))}
                      className="p-1 text-gray-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {keyType === 'list' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  List Items
                </label>
                <button
                  type="button"
                  onClick={() => setListValues([...listValues, ''])}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>
              {listValues.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Item #${idx}`}
                    value={val}
                    onChange={(e) => {
                      const next = [...listValues];
                      next[idx] = e.target.value;
                      setListValues(next);
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  {listValues.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setListValues(listValues.filter((_, i) => i !== idx))}
                      className="p-1 text-gray-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {keyType === 'set' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Set Members
                </label>
                <button
                  type="button"
                  onClick={() => setSetMembers([...setMembers, ''])}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Member
                </button>
              </div>
              {setMembers.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Member value"
                    value={val}
                    onChange={(e) => {
                      const next = [...setMembers];
                      next[idx] = e.target.value;
                      setSetMembers(next);
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  {setMembers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSetMembers(setMembers.filter((_, i) => i !== idx))}
                      className="p-1 text-gray-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {keyType === 'zset' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Sorted Set Members
                </label>
                <button
                  type="button"
                  onClick={() => setZSetMembers([...zSetMembers, { score: 0, member: '' }])}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Member
                </button>
              </div>
              {zSetMembers.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    placeholder="Score"
                    value={row.score}
                    onChange={(e) => {
                      const next = [...zSetMembers];
                      next[idx] = { ...next[idx], score: parseFloat(e.target.value) || 0 };
                      setZSetMembers(next);
                    }}
                    className="w-28 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Member"
                    value={row.member}
                    onChange={(e) => {
                      const next = [...zSetMembers];
                      next[idx] = { ...next[idx], member: e.target.value };
                      setZSetMembers(next);
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  {zSetMembers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setZSetMembers(zSetMembers.filter((_, i) => i !== idx))}
                      className="p-1 text-gray-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Edit TTL Modal                                                          */
/* -------------------------------------------------------------------------- */
interface EditTTLModalProps {
  isOpen: boolean;
  keyName: string;
  currentTtl: number;
  onClose: () => void;
  onSave: (ttlSeconds: number) => Promise<void>;
}

export const EditTTLModal: React.FC<EditTTLModalProps> = ({
  isOpen,
  keyName,
  currentTtl,
  onClose,
  onSave,
}) => {
  const [ttlValue, setTtlValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTtlValue(currentTtl > 0 ? String(currentTtl) : '');
    }
  }, [isOpen, currentTtl]);

  if (!isOpen) return null;

  const presets = [
    { label: 'No Expiry', val: -1 },
    { label: '1 min', val: 60 },
    { label: '5 min', val: 300 },
    { label: '1 hour', val: 3600 },
    { label: '24 hours', val: 86400 },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsed = ttlValue.trim() === '' ? -1 : parseInt(ttlValue.trim(), 10);
      await onSave(isNaN(parsed) || parsed <= 0 ? -1 : parsed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-5 z-10">
        <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Update Key TTL</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">{keyName}</p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              TTL in seconds <span className="font-normal text-gray-400">(leave empty for No Expiry)</span>
            </label>
            <input
              type="number"
              value={ttlValue}
              onChange={(e) => setTtlValue(e.target.value)}
              placeholder="No Expiry (-1)"
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setTtlValue(p.val < 0 ? '' : String(p.val))}
                className="px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save TTL'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Add / Edit Hash Field Modal                                             */
/* -------------------------------------------------------------------------- */
interface HashFieldModalProps {
  isOpen: boolean;
  initialField?: string;
  initialValue?: string;
  onClose: () => void;
  onSave: (oldField: string, field: string, value: string) => Promise<void>;
}

export const HashFieldModal: React.FC<HashFieldModalProps> = ({
  isOpen,
  initialField = '',
  initialValue = '',
  onClose,
  onSave,
}) => {
  const [field, setField] = useState(initialField);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setField(initialField);
      setValue(initialValue);
      setError(null);
    }
  }, [isOpen, initialField, initialValue]);

  if (!isOpen) return null;

  const isEdit = Boolean(initialField);

  const handleFormatJson = () => {
    try {
      setValue(JSON.stringify(JSON.parse(value), null, 2));
      setError(null);
    } catch {
      setError('Value is not valid JSON');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!field.trim()) {
      setError('Field name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(initialField, field.trim(), value);
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-5 z-10">
        <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Edit Hash Field' : 'Add Hash Field'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          {error && (
            <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Field
            </label>
            <input
              type="text"
              required
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="e.g. device_name"
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Value
              </label>
              <button
                type="button"
                onClick={handleFormatJson}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                Format JSON
              </button>
            </div>
            <textarea
              rows={6}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Field value..."
              className="w-full p-2.5 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
