export type NavigationTab = 'vms' | 'terminal' | 'database' | 'redis' | 'vault';
export type MainPanel = 'results' | 'history';

export interface SettingsExportOptions {
  includeVMs: boolean;
  includeDatabases: boolean;
  includeRedis: boolean;
}

export interface SettingsImportOptions {
  includeVMs: boolean;
  includeDatabases: boolean;
  includeRedis: boolean;
  replaceExisting: boolean;
}

export interface SettingsImportResult {
  vmsImported: number;
  databasesImported: number;
  redisImported: number;
}

