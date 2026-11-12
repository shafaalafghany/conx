import React, { useState, useRef } from 'react';
import { Download, Upload, Copy, Check, FileJson, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { api } from '../../api/client';
import type { SettingsExportOptions, SettingsImportOptions, SettingsImportResult } from '../../types';

interface SettingsBackupPanelProps {
  onImported?: (result: SettingsImportResult) => void;
}

export const SettingsBackupPanel: React.FC<SettingsBackupPanelProps> = ({ onImported }) => {
  // Export state
  const [exportOpts, setExportOpts] = useState<SettingsExportOptions>({
    includeVMs: true,
    includeDatabases: true,
    includeRedis: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportedJsonPreview, setExportedJsonPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Import state
  const [importOpts, setImportOpts] = useState<SettingsImportOptions>({
    includeVMs: true,
    includeDatabases: true,
    includeRedis: true,
    replaceExisting: false,
  });
  const [importJsonText, setImportJsonText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Parse quick summary of loaded import JSON
  const parsedSummary = React.useMemo(() => {
    if (!importJsonText.trim()) return null;
    try {
      const obj = JSON.parse(importJsonText);
      const vms = Array.isArray(obj.vms) ? obj.vms.length : 0;
      const dbs = Array.isArray(obj.databases) ? obj.databases.length : 0;
      const redis = Array.isArray(obj.redis) ? obj.redis.length : 0;
      return { valid: true, vms, dbs, redis };
    } catch {
      return { valid: false, vms: 0, dbs: 0, redis: 0 };
    }
  }, [importJsonText]);

  const handleExportFile = async () => {
    if (!exportOpts.includeVMs && !exportOpts.includeDatabases && !exportOpts.includeRedis) {
      setExportStatus({ type: 'error', message: 'Please select at least one category to export.' });
      return;
    }
    setIsExporting(true);
    setExportStatus(null);
    try {
      const savedPath = await api.exportSettingsToFile(exportOpts);
      if (savedPath) {
        setExportStatus({ type: 'success', message: `Settings exported to ${savedPath}` });
      }
    } catch (err: any) {
      setExportStatus({ type: 'error', message: err?.message || String(err) });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreviewAndCopy = async () => {
    if (!exportOpts.includeVMs && !exportOpts.includeDatabases && !exportOpts.includeRedis) {
      setExportStatus({ type: 'error', message: 'Please select at least one category to export.' });
      return;
    }
    setIsExporting(true);
    setExportStatus(null);
    try {
      const raw = await api.exportSettings(exportOpts);
      setExportedJsonPreview(raw);
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setExportStatus({ type: 'success', message: 'Exported JSON copied to clipboard!' });
    } catch (err: any) {
      setExportStatus({ type: 'error', message: err?.message || String(err) });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    setImportStatus(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setImportJsonText(content);
    };
    reader.onerror = () => {
      setImportStatus({ type: 'error', message: 'Failed to read selected JSON file.' });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportSubmit = async () => {
    if (!importJsonText.trim()) {
      setImportStatus({ type: 'error', message: 'Please select a JSON file or paste JSON content first.' });
      return;
    }
    if (!importOpts.includeVMs && !importOpts.includeDatabases && !importOpts.includeRedis) {
      setImportStatus({ type: 'error', message: 'Please select at least one category to import.' });
      return;
    }
    if (
      importOpts.replaceExisting &&
      !confirm('Replace mode will delete existing connections in the selected categories before importing. Continue?')
    ) {
      return;
    }

    setIsImporting(true);
    setImportStatus(null);
    try {
      const result = await api.importSettings(importJsonText, importOpts);
      setImportStatus({
        type: 'success',
        message: `Successfully imported ${result.vmsImported} VM(s), ${result.databasesImported} Database(s), and ${result.redisImported} Redis profile(s).`,
      });
      window.dispatchEvent(new CustomEvent('conx:settings-imported', { detail: result }));
      onImported?.(result);
    } catch (err: any) {
      setImportStatus({ type: 'error', message: err?.message || String(err) });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Export Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Export Settings (JSON)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Backup your VM, Database, and Redis connection profiles to a JSON file.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Include Categories
            </p>
            <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOpts.includeVMs}
                onChange={(e) => setExportOpts((s) => ({ ...s, includeVMs: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span>Virtual Machines (SSH)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOpts.includeDatabases}
                onChange={(e) => setExportOpts((s) => ({ ...s, includeDatabases: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span>Database Connections (PostgreSQL / MySQL / SQLite)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOpts.includeRedis}
                onChange={(e) => setExportOpts((s) => ({ ...s, includeRedis: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span>Redis Connections</span>
            </label>
          </div>

          {exportedJsonPreview && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">JSON Preview</span>
                <button
                  onClick={() => setExportedJsonPreview(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  Hide
                </button>
              </div>
              <pre className="max-h-40 overflow-auto p-2.5 rounded bg-gray-900 text-gray-100 text-xs font-mono border border-gray-700">
                {exportedJsonPreview}
              </pre>
            </div>
          )}

          {exportStatus && (
            <div
              className={`mt-4 p-3 rounded-md text-xs flex items-start gap-2 border ${
                exportStatus.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {exportStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span className="break-all">{exportStatus.message}</span>
            </div>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/60 flex items-center gap-2.5">
          <button
            onClick={handleExportFile}
            disabled={isExporting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export JSON File'}
          </button>
          <button
            onClick={handlePreviewAndCopy}
            disabled={isExporting}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Preview and Copy JSON to Clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>
        </div>
      </div>

      {/* Import Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Import Settings (JSON)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Restore or merge VM, Database, and Redis settings from a JSON file.
              </p>
            </div>
          </div>

          {/* File Selector */}
          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 transition-colors"
              >
                <FileJson className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Choose JSON File...
              </button>
              {selectedFileName && (
                <span className="text-xs text-gray-600 dark:text-gray-300 font-mono truncate max-w-[200px]">
                  {selectedFileName}
                </span>
              )}
              {importJsonText && (
                <button
                  type="button"
                  onClick={() => {
                    setImportJsonText('');
                    setSelectedFileName(null);
                    setImportStatus(null);
                  }}
                  className="ml-auto text-xs text-gray-400 hover:text-red-500"
                  title="Clear loaded JSON"
                >
                  Clear
                </button>
              )}
            </div>

            <textarea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='Or paste settings JSON here ({"vms": [...], "databases": [...], "redis": [...]})'
              rows={3}
              className="mt-2.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/60 px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />

            {parsedSummary && (
              <div className="mt-1.5 text-xs">
                {parsedSummary.valid ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Detected: {parsedSummary.vms} VM(s), {parsedSummary.dbs} Database(s), {parsedSummary.redis} Redis profile(s)
                  </span>
                ) : (
                  <span className="text-red-500 font-medium">Invalid JSON syntax</span>
                )}
              </div>
            )}
          </div>

          {/* Import Options */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Categories
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importOpts.includeVMs}
                  onChange={(e) => setImportOpts((s) => ({ ...s, includeVMs: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
                />
                <span>VMs</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importOpts.includeDatabases}
                  onChange={(e) => setImportOpts((s) => ({ ...s, includeDatabases: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Databases</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importOpts.includeRedis}
                  onChange={(e) => setImportOpts((s) => ({ ...s, includeRedis: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Redis</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Import Mode
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  checked={!importOpts.replaceExisting}
                  onChange={() => setImportOpts((s) => ({ ...s, replaceExisting: false }))}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>Merge (Upsert & Keep Existing)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  checked={importOpts.replaceExisting}
                  onChange={() => setImportOpts((s) => ({ ...s, replaceExisting: true }))}
                  className="text-red-600 focus:ring-red-500"
                />
                <span className="text-amber-600 dark:text-amber-400">Replace All Existing</span>
              </label>
            </div>
          </div>

          {importStatus && (
            <div
              className={`mt-4 p-3 rounded-md text-xs flex items-start gap-2 border ${
                importStatus.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {importStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span>{importStatus.message}</span>
            </div>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/60">
          <button
            onClick={handleImportSubmit}
            disabled={isImporting || !importJsonText.trim() || (parsedSummary !== null && !parsedSummary.valid)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import Settings JSON'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface SettingsBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsBackupModal: React.FC<SettingsBackupModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2.5">
            <FileJson className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              Import & Export Settings (VM, Database & Redis)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <SettingsBackupPanel />
        </div>
      </div>
    </div>
  );
};
