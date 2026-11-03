import React from 'react';

export const VaultView: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 max-w-4xl shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Security & Credential Vault
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Local cryptographic storage using Go standard <code className="font-mono text-blue-600 dark:text-blue-400">crypto/aes</code> (AES-256-GCM).
      </p>

      <div className="mt-6 space-y-4">
        <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-300">
          <p className="font-semibold">Encryption Engine: AES-256-GCM with Random 12-byte Nonce</p>
          <p className="mt-1 text-xs opacity-90">
            All VM passwords, SSH private keys, and database credentials are encrypted at rest inside local SQLite WAL database.
          </p>
        </div>

        <div className="p-4 rounded-md bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 text-sm">
          <p className="font-semibold text-gray-800 dark:text-gray-200">Storage Location</p>
          <p className="mt-1 text-xs font-mono text-gray-600 dark:text-gray-300">
            ~/Library/Application Support/conx/conx.db
          </p>
        </div>
      </div>
    </div>
  );
};
