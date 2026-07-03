export interface User {
  id: string;
  email: string;
  fullName: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface RetryPolicy {
  id: string;
  type: 'fixed' | 'linear' | 'exponential';
  baseDelayMs: number;
  maxRetries: number;
}

export interface Queue {
  id: string;
  projectId: string;
  project_name?: string;
  name: string;
  priority: number; // 1 = Low, 2 = Normal, 3 = High
  concurrencyLimit: number;
  is_paused: boolean;
  retryPolicyId?: string;
  retry_policy_type?: string;
  createdAt: string;
  
  // Computed dynamic stats
  jobsCount?: number;
  failedCount?: number;
  activeCount?: number;
  queuedCount?: number;
}

export interface Job {
  id: number;
  queue_id: string;
  queue_name?: string;
  type: string;
  payload: any;
  status: 'queued' | 'scheduled' | 'claimed' | 'running' | 'completed' | 'failed' | 'dead_letter';
  priority: 'Low' | 'Normal' | 'High';
  attempt: number;
  max_attempts: number;
  run_at: string;
  cron_expr?: string;
  batch_id?: string;
  claimed_by?: string;
  created_at: string;
  updated_at: string;
}

export interface JobExecution {
  id: string;
  job_id: number;
  worker_id: string;
  started_at: string;
  finished_at?: string;
  status: 'running' | 'completed' | 'failed';
  result_payload?: any;
  error_message?: string;
  job_type?: string;
  queue_id?: string;
}

export interface JobLog {
  id: number;
  job_id: number;
  execution_id?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  created_at: string;
  job_type?: string;
  queue_id?: string;
}

export interface Worker {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline';
  last_heartbeat_at: string;
  current_job_id?: number;
  cpu_usage: number;
  memory_usage: number;
  hostname: string;
  version: string;
  uptime: string;
}

export interface DeadLetter {
  id: number;
  job_id: number;
  queue_id: string;
  queue_name?: string;
  type: string;
  failed_payload: any;
  reason: string;
  failed_at: string;
  attempts: number;
}

export interface Schedule {
  id: string;
  name: string;
  queue_id: string;
  queue_name?: string;
  cron_expr: string;
  next_run: string;
  status: 'Active' | 'Paused';
  created_at: string;
}
