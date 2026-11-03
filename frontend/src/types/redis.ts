export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'none' | 'unknown';

export interface RedisConnectionItem {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  defaultDb: number;
  useTls: boolean;
  hasPassword: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  createdAt?: string;
}

export interface RedisConnectionFormData {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  defaultDb: number;
  useTls: boolean;
}

export interface RedisKeySummary {
  key: string;
  type: string;
}

export interface RedisScanResult {
  keys: RedisKeySummary[];
  nextCursor: number;
  totalKeys: number;
  scannedCount: number;
  hasMore: boolean;
}

export interface RedisHashField {
  field: string;
  value: string;
}

export interface RedisListItem {
  index: number;
  value: string;
}

export interface RedisZSetMember {
  member: string;
  score: number;
}

export interface RedisKeyDetail {
  key: string;
  type: string;
  ttl: number; // -1 = No Expiry, -2 = Missing, >= 0 = seconds
  sizeBytes: number;
  length: number;
  exists: boolean;
  stringValue: string;
  hashFields: RedisHashField[];
  listItems: RedisListItem[];
  setMembers: string[];
  zSetMembers: RedisZSetMember[];
}

export interface RedisSetKeyRequest {
  key: string;
  type: 'string' | 'hash' | 'list' | 'set' | 'zset';
  ttl: number;
  stringValue: string;
  hashFields: RedisHashField[];
  listValues: string[];
  setMembers: string[];
  zSetMembers: RedisZSetMember[];
}

export interface RedisCommandResult {
  command: string;
  output: string;
  executionTimeMs: number;
  error?: string;
}

export interface RedisCommandHistoryEntry {
  id: string;
  connectionId: string;
  dbIndex: number;
  commandText: string;
  status: 'success' | 'error';
  errorMessage?: string;
  executionTimeMs: number;
  executedAt: string;
}

export interface RedisKeyTab {
  id: string; // `${connectionId}:${dbIndex}:${key}`
  connectionId: string;
  connectionName: string;
  dbIndex: number;
  key: string;
  detail: RedisKeyDetail | null;
  isLoading: boolean;
  error: string | null;
}
