import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { RedisConnectionFormData, RedisConnectionItem } from '../../types';

interface RedisConnectionFormProps {
  initialData?: RedisConnectionItem | null;
  onSubmit: (data: RedisConnectionFormData) => Promise<void> | void;
  onCancel: () => void;
}

export const RedisConnectionForm: React.FC<RedisConnectionFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const isEdit = Boolean(initialData);

  const [name, setName] = useState(initialData?.name || '');
  const [host, setHost] = useState(initialData?.host || 'localhost');
  const [port, setPort] = useState(String(initialData?.port || 6379));
  const [username, setUsername] = useState(initialData?.username || '');
  const [password, setPassword] = useState('');
  const [defaultDb, setDefaultDb] = useState(String(initialData?.defaultDb ?? 0));
  const [useTls, setUseTls] = useState(Boolean(initialData?.useTls));

  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setHost(initialData.host);
      setPort(String(initialData.port || 6379));
      setUsername(initialData.username || '');
      setPassword('');
      setDefaultDb(String(initialData.defaultDb ?? 0));
      setUseTls(Boolean(initialData.useTls));
      setError(null);
      setTestResult(null);
    }
  }, [initialData]);

  const buildPayload = () => {
    const parsedPort = parseInt(port, 10) || 6379;
    const parsedDb = Math.max(0, Math.min(15, parseInt(defaultDb, 10) || 0));
    return {
      id: initialData?.id || '',
      name: name.trim() || `${host.trim()}:${parsedPort}`,
      host: host.trim(),
      port: parsedPort,
      username: username.trim(),
      defaultDb: parsedDb,
      useTls,
    };
  };

  const handleTest = async () => {
    if (!host.trim()) {
      setError('Host is required');
      return;
    }
    setError(null);
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await api.testRedisConnection(buildPayload(), password);
      setTestResult({ success: true, message: msg || 'Connection verified!' });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || String(err) || 'Failed to connect to Redis',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) {
      setError('Host is required');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = buildPayload();
      await onSubmit({
        name: payload.name,
        host: payload.host,
        port: payload.port,
        username: payload.username,
        password,
        defaultDb: payload.defaultDb,
        useTls: payload.useTls,
      });
    } catch (err: any) {
      setError(err?.message || String(err) || 'Failed to save Redis connection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
      {error && (
        <div className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Connection Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. BRImo Dev Redis"
          className="w-full px-3 py-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Host *
          </label>
          <input
            type="text"
            required
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="127.0.0.1 or redis.dev.internal"
            className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Port *
          </label>
          <input
            type="number"
            required
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="6379"
            className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Username <span className="text-gray-400 font-normal">(optional ACL)</span>
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="default"
            className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default DB <span className="text-gray-400 font-normal">(0–15)</span>
          </label>
          <input
            type="number"
            min={0}
            max={15}
            value={defaultDb}
            onChange={(e) => setDefaultDb(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Password{' '}
          {isEdit && initialData?.hasPassword && (
            <span className="text-emerald-600 dark:text-emerald-400 font-normal">
              (Leave blank to keep saved password)
            </span>
          )}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit && initialData?.hasPassword ? '••••••••' : 'Leave blank if no password'}
          className="w-full px-3 py-2 text-xs font-mono rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
        <input
          type="checkbox"
          checked={useTls}
          onChange={(e) => setUseTls(e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-700 dark:text-gray-300">
          Enable TLS / SSL connection
        </span>
      </label>

      {testResult && (
        <div
          className={`p-2.5 rounded-md border text-xs ${
            testResult.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || submitting}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
          >
            {submitting ? 'Saving...' : isEdit ? 'Update' : 'Save Connection'}
          </button>
        </div>
      </div>
    </form>
  );
};
