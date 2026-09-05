export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined }

export interface MonaCloudOptions {
  token: string;
  baseUrl?: string;
  sandbox?: boolean;
  fetch?: typeof fetch;
}

export interface CreateOptions {
  idempotencyKey?: string;
}

export interface CustomSpec {
  cpu: number;
  ram_gb: number;
  disk_gb: number;
  package_slug?: never;
}

export interface PackageSpec {
  package_slug: string;
  cpu?: never;
  ram_gb?: never;
  disk_gb?: never;
}

export type VpsCreate = {
  app_name: string;
  hostname?: string;
} & (CustomSpec | PackageSpec);

export type DatabaseEngine = 'mongodb' | 'mongo' | 'postgresql' | 'mysql';

export type DatabaseCreate = {
  app_name: string;
  engine?: DatabaseEngine;
} & (CustomSpec | PackageSpec);

export type JobStatus = 'pending' | 'queued' | 'running' | 'retrying' | 'succeeded' | 'done' | 'failed' | 'cancelled';

export interface Job extends JsonObject {
  id: string;
  status: JobStatus;
  type: string;
  result?: JsonObject | null;
  error?: string | null;
  attempts?: number;
  max_attempts?: number;
  sandbox?: boolean;
}

export interface Service extends JsonObject {
  id: string;
  kind: 'lxc' | 'database';
  status: string;
  name: string;
  ip_address?: string | null;
  sandbox?: boolean;
}

export interface WaitJobOptions {
  /** Maximum time in seconds. Default: 300. */
  timeout?: number;
  /** Delay between polls in seconds. Default: 1. */
  pollInterval?: number;
}

export interface ErrorOptions {
  status?: number;
  body?: unknown;
  requestId?: string;
}

export class MonaCloudError extends Error {
  readonly code: string;
  readonly next_step: string;
  readonly nextStep: string;
  readonly status?: number;
  readonly body?: unknown;
  readonly request_id?: string;
  constructor(code: string, message: string, nextStep: string, options?: ErrorOptions);
  toJSON(): { code: string; message: string; next_step: string; request_id?: string };
}

export class MonaCloud {
  readonly token: string;
  readonly baseUrl: string;
  readonly sandbox: boolean;
  constructor(options: MonaCloudOptions);
  prices(): Promise<JsonObject>;
  packages(): Promise<JsonObject>;
  createVps(payload: VpsCreate, options?: CreateOptions): Promise<Job>;
  createDatabase(payload: DatabaseCreate, options?: CreateOptions): Promise<Job>;
  job(id: string): Promise<Job>;
  waitJob(id: string, options?: WaitJobOptions): Promise<Job>;
  services(): Promise<Service[]>;
  startService(id: string): Promise<JsonObject>;
  stopService(id: string): Promise<JsonObject>;
  rebuildService(id: string): Promise<Job>;
  deleteService(id: string): Promise<JsonObject>;
  me(): Promise<JsonObject>;
}

export default MonaCloud;
