export interface VM {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  tags: string;
  status: string; // online, offline, degraded
  lastLatencyMs: number;
}

export interface ActiveSession {
  sessionID: string;
  vmID: string;
  vmName: string;
  host: string;
}

export interface AddVMFormData {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  tags: string;
}

export interface VMHealthUpdate {
  status: string;
  latencyMs: number;
}
