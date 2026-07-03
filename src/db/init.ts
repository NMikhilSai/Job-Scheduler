import { sql } from './connection.js';

export async function initDatabase() {
  console.log('Initializing database schema and seed data...');
  try {
    // 1. Create Users Table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 2. Create Organizations Table
    await sql`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 3. Create Projects Table
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 4. Create Retry Policies Table
    await sql`
      CREATE TABLE IF NOT EXISTS retry_policies (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'fixed' | 'linear' | 'exponential'
        base_delay_ms INTEGER NOT NULL,
        max_retries INTEGER NOT NULL
      )
    `;

    // 5. Create Queues Table
    await sql`
      CREATE TABLE IF NOT EXISTS queues (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        priority INTEGER NOT NULL, -- 1 = Low, 2 = Normal, 3 = High
        concurrency_limit INTEGER NOT NULL,
        is_paused BOOLEAN DEFAULT FALSE,
        retry_policy_id TEXT REFERENCES retry_policies(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 6. Create Jobs Table
    // Set serial value starting at 12558 to match screenshots
    await sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        queue_id TEXT REFERENCES queues(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL, -- 'queued'|'scheduled'|'claimed'|'running'|'completed'|'failed'|'dead_letter'
        priority TEXT NOT NULL, -- 'Low'|'Normal'|'High'
        attempt INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        run_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        cron_expr TEXT,
        batch_id TEXT,
        claimed_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Set the sequence starting value if it was just created
    try {
      await sql`SELECT setval('jobs_id_seq', GREATEST(12557, COALESCE((SELECT MAX(id) FROM jobs), 0)))`;
    } catch (e) {
      // Sequence might already be altered, ignore
    }

    // 7. Create Job Executions Table
    await sql`
      CREATE TABLE IF NOT EXISTS job_executions (
        id TEXT PRIMARY KEY, -- e.g. 'exe_789123'
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        worker_id TEXT,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP WITH TIME ZONE,
        status TEXT NOT NULL, -- 'running' | 'completed' | 'failed'
        result_payload JSONB,
        error_message TEXT
      )
    `;

    // 8. Create Job Logs Table
    await sql`
      CREATE TABLE IF NOT EXISTS job_logs (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        execution_id TEXT REFERENCES job_executions(id) ON DELETE CASCADE,
        level TEXT NOT NULL, -- 'info' | 'warn' | 'error'
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 9. Create Workers Table
    await sql`
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL, -- 'idle' | 'busy' | 'offline'
        last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        current_job_id INTEGER,
        cpu_usage INTEGER DEFAULT 0,
        memory_usage INTEGER DEFAULT 0,
        hostname TEXT NOT NULL,
        version TEXT DEFAULT '1.0.0',
        uptime TEXT DEFAULT '2d 4h 23m'
      )
    `;

    // 10. Create Dead Letter Table
    await sql`
      CREATE TABLE IF NOT EXISTS dead_letter (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL,
        queue_id TEXT NOT NULL,
        type TEXT NOT NULL,
        failed_payload JSONB NOT NULL,
        reason TEXT NOT NULL,
        failed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        attempts INTEGER NOT NULL
      )
    `;

    // 11. Create Schedules Table
    await sql`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        queue_id TEXT REFERENCES queues(id) ON DELETE CASCADE,
        cron_expr TEXT NOT NULL,
        next_run TIMESTAMP WITH TIME ZONE NOT NULL,
        status TEXT NOT NULL, -- 'Active' | 'Paused'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // --- SEEDING LOGIC ---
    // Check if default organization exists
    const orgs = await sql`SELECT id FROM organizations LIMIT 1`;
    if (orgs.length === 0) {
      console.log('Seeding initial database values...');

      // Seed default user
      // password: password123
      const passHash = '$2b$10$mRz5rQZ6T3S8F9N6Qv4P1uGk5L6m2YwU6eX8R4j3J9z8C5aR2OaG2';
      await sql`
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES ('user_demo', 'mikhilsai526@gmail.com', ${passHash}, 'John Doe')
        ON CONFLICT DO NOTHING
      `;

      // Seed organization
      await sql`
        INSERT INTO organizations (id, name)
        VALUES ('org_default', 'JobScheduler Corp')
        ON CONFLICT DO NOTHING
      `;

      // Seed projects
      const projects = [
        { id: 'proj_email', name: 'Email Service' },
        { id: 'proj_image', name: 'Image Processor' },
        { id: 'proj_pipeline', name: 'Data Pipeline' },
        { id: 'proj_marketing', name: 'Marketing' },
        { id: 'proj_system', name: 'System' },
        { id: 'proj_analytics', name: 'Analytics' },
        { id: 'proj_notifications', name: 'Notification Service' }
      ];
      for (const p of projects) {
        await sql`
          INSERT INTO projects (id, org_id, name)
          VALUES (${p.id}, 'org_default', ${p.name})
          ON CONFLICT DO NOTHING
        `;
      }

      // Seed retry policies
      const policies = [
        { id: 'policy_exp', type: 'exponential', base_delay_ms: 10000, max_retries: 5 },
        { id: 'policy_fixed', type: 'fixed', base_delay_ms: 5000, max_retries: 3 },
        { id: 'policy_linear', type: 'linear', base_delay_ms: 2000, max_retries: 4 }
      ];
      for (const pol of policies) {
        await sql`
          INSERT INTO retry_policies (id, type, base_delay_ms, max_retries)
          VALUES (${pol.id}, ${pol.type}, ${pol.base_delay_ms}, ${pol.max_retries})
          ON CONFLICT DO NOTHING
        `;
      }

      // Seed queues
      const queues = [
        { id: 'high-priority', project_id: 'proj_email', name: 'high-priority', priority: 3, concurrency_limit: 10, is_paused: false, retry_policy_id: 'policy_exp' },
        { id: 'default', project_id: 'proj_email', name: 'default', priority: 2, concurrency_limit: 5, is_paused: false, retry_policy_id: 'policy_fixed' },
        { id: 'image-processing', project_id: 'proj_image', name: 'image-processing', priority: 3, concurrency_limit: 8, is_paused: false, retry_policy_id: 'policy_linear' },
        { id: 'data-pipeline', project_id: 'proj_pipeline', name: 'data-pipeline', priority: 2, concurrency_limit: 4, is_paused: false, retry_policy_id: 'policy_exp' },
        { id: 'low-priority', project_id: 'proj_marketing', name: 'low-priority', priority: 1, concurrency_limit: 2, is_paused: true, retry_policy_id: 'policy_fixed' },
        { id: 'cleanup-jobs', project_id: 'proj_system', name: 'cleanup-jobs', priority: 1, concurrency_limit: 3, is_paused: false, retry_policy_id: 'policy_linear' },
        { id: 'report-generation', project_id: 'proj_analytics', name: 'report-generation', priority: 2, concurrency_limit: 4, is_paused: false, retry_policy_id: 'policy_exp' },
        { id: 'notifications', project_id: 'proj_notifications', name: 'notifications', priority: 3, concurrency_limit: 6, is_paused: false, retry_policy_id: 'policy_exp' }
      ];
      for (const q of queues) {
        await sql`
          INSERT INTO queues (id, project_id, name, priority, concurrency_limit, is_paused, retry_policy_id)
          VALUES (${q.id}, ${q.project_id}, ${q.name}, ${q.priority}, ${q.concurrency_limit}, ${q.is_paused}, ${q.retry_policy_id})
          ON CONFLICT DO NOTHING
        `;
      }

      // Seed workers
      const workers = [
        { id: 'worker-1@ip-10-0-0-1', name: 'worker-1', status: 'busy', hostname: 'ip-10-0-0-1', cpu_usage: 32, memory_usage: 256, uptime: '2d 4h 23m' },
        { id: 'worker-2@ip-10-0-0-2', name: 'worker-2', status: 'idle', hostname: 'ip-10-0-0-2', cpu_usage: 15, memory_usage: 128, uptime: '1d 12h 10m' },
        { id: 'worker-3@ip-10-0-0-5', name: 'worker-3', status: 'busy', hostname: 'ip-10-0-0-5', cpu_usage: 45, memory_usage: 512, uptime: '4d 1h 5m' },
        { id: 'worker-4@ip-10-0-0-8', name: 'worker-4', status: 'offline', hostname: 'ip-10-0-0-8', cpu_usage: 0, memory_usage: 0, uptime: '0d 0h 0m' },
        { id: 'worker-5@ip-10-0-0-9', name: 'worker-5', status: 'idle', hostname: 'ip-10-0-0-9', cpu_usage: 20, memory_usage: 128, uptime: '12h 45m' },
        { id: 'worker-6@ip-10-0-0-11', name: 'worker-6', status: 'idle', hostname: 'ip-10-0-0-11', cpu_usage: 5, memory_usage: 64, uptime: '1d 2h 15m' }
      ];
      for (const w of workers) {
        await sql`
          INSERT INTO workers (id, name, status, hostname, cpu_usage, memory_usage, uptime)
          VALUES (${w.id}, ${w.name}, ${w.status}, ${w.hostname}, ${w.cpu_usage}, ${w.memory_usage}, ${w.uptime})
          ON CONFLICT DO NOTHING
        `;
      }

      // Seed schedules
      const schedules = [
        { id: 'sched_daily', name: 'daily-report', queue_id: 'report-generation', cron_expr: '0 0 * * *', next_run: new Date('2026-07-03T00:00:00Z'), status: 'Active' },
        { id: 'sched_cleanup', name: 'cleanup-temp', queue_id: 'cleanup-jobs', cron_expr: '0 */6 * * *', next_run: new Date('2026-07-02T18:00:00Z'), status: 'Active' },
        { id: 'sched_weekly', name: 'weekly-summary', queue_id: 'report-generation', cron_expr: '0 0 * * 1', next_run: new Date('2026-07-06T08:00:00Z'), status: 'Active' },
        { id: 'sched_notifications', name: 'user-notifications', queue_id: 'notifications', cron_expr: '*/15 * * * *', next_run: new Date('2026-07-02T12:15:00Z'), status: 'Active' },
        { id: 'sched_billing', name: 'monthly-billing', queue_id: 'high-priority', cron_expr: '0 0 1 * *', next_run: new Date('2026-08-01T00:00:00Z'), status: 'Paused' }
      ];
      for (const s of schedules) {
        await sql`
          INSERT INTO schedules (id, name, queue_id, cron_expr, next_run, status)
          VALUES (${s.id}, ${s.name}, ${s.queue_id}, ${s.cron_expr}, ${s.next_run}, ${s.status})
          ON CONFLICT DO NOTHING
        `;
      }

      // Seed some real historical and interactive jobs
      const seedJobs = [
        // Completed
        { queue_id: 'high-priority', type: 'email-send', payload: { to: 'customer@example.com', template: 'welcome' }, status: 'completed', priority: 'High', attempt: 1, max_attempts: 5, run_at: new Date('2026-07-02T11:41:00Z') },
        // Failed
        { queue_id: 'high-priority', type: 'email-send', payload: { to: 'missing@domain.com', template: 'digest' }, status: 'failed', priority: 'High', attempt: 3, max_attempts: 5, run_at: new Date('2026-07-02T11:40:00Z') },
        // Running
        { queue_id: 'default', type: 'payment-process', payload: { amount: 150.00, token: 'tok_visa123' }, status: 'running', priority: 'Normal', attempt: 1, max_attempts: 3, run_at: new Date('2026-07-02T11:38:00Z'), claimed_by: 'worker-3@ip-10-0-0-5' },
        // Completed
        { queue_id: 'image-processing', type: 'image-thumbnail', payload: { s3Url: 's3://bucket/photo.jpg', size: '200x200' }, status: 'completed', priority: 'High', attempt: 1, max_attempts: 3, run_at: new Date('2026-07-02T11:38:00Z') },
        // Completed
        { queue_id: 'data-pipeline', type: 'data-import', payload: { source: 'sales_q2.csv' }, status: 'completed', priority: 'Normal', attempt: 1, max_attempts: 5, run_at: new Date('2026-07-02T11:27:00Z') },
        // Failed
        { queue_id: 'cleanup-jobs', type: 'system-cleanup', payload: { dir: '/var/log/tmp' }, status: 'failed', priority: 'Low', attempt: 5, max_attempts: 5, run_at: new Date('2026-07-02T11:26:00Z') },
        // Completed
        { queue_id: 'report-generation', type: 'report-generate', payload: { reportId: 'rep_daily_7823' }, status: 'completed', priority: 'Normal', attempt: 1, max_attempts: 3, run_at: new Date('2026-07-02T11:25:00Z') },
        // Running (will represent active pulsing job)
        { queue_id: 'notifications', type: 'sms-send', payload: { phone: '+15550199', body: 'Verify code: 8234' }, status: 'running', priority: 'High', attempt: 1, max_attempts: 3, run_at: new Date('2026-07-02T11:24:00Z'), claimed_by: 'worker-1@ip-10-0-0-1' },
        // Scheduled
        { queue_id: 'high-priority', type: 'email-send', payload: { to: 'vip@corp.com', body: 'Alert: server loads critical' }, status: 'scheduled', priority: 'High', attempt: 0, max_attempts: 5, run_at: new Date(Date.now() + 360000) }
      ];

      for (const j of seedJobs) {
        const [insertedJob] = await sql`
          INSERT INTO jobs (queue_id, type, payload, status, priority, attempt, max_attempts, run_at, claimed_by)
          VALUES (${j.queue_id}, ${j.type}, ${sql.json(j.payload as any)}, ${j.status}, ${j.priority}, ${j.attempt}, ${j.max_attempts}, ${j.run_at}, ${j.claimed_by || null})
          RETURNING id
        `;

        // Seed some corresponding executions and logs
        if (j.status === 'completed' || j.status === 'failed' || j.status === 'running') {
          const exeId = `exe_${insertedJob.id + 776565}`;
          const finishedAt = j.status === 'running' ? null : new Date(new Date(j.run_at).getTime() + 5000);
          
          await sql`
            INSERT INTO job_executions (id, job_id, worker_id, started_at, finished_at, status, result_payload, error_message)
            VALUES (
              ${exeId},
              ${insertedJob.id},
              ${j.claimed_by || 'worker-1@ip-10-0-0-1'},
              ${j.run_at},
              ${finishedAt},
              ${j.status},
              ${j.status === 'completed' ? '{"success": true}' : null},
              ${j.status === 'failed' ? 'Error: Failed execution attempt' : null}
            )
          `;

          await sql`
            INSERT INTO job_logs (job_id, execution_id, level, message, created_at)
            VALUES (
              ${insertedJob.id},
              ${exeId},
              'info',
              'Job received and initialized successfully.',
              ${j.run_at}
            )
          `;

          if (j.status === 'completed') {
            await sql`
              INSERT INTO job_logs (job_id, execution_id, level, message, created_at)
              VALUES (
                ${insertedJob.id},
                ${exeId},
                'info',
                'Job completed successfully in 5.00s.',
                ${finishedAt}
              )
            `;
          } else if (j.status === 'failed') {
            await sql`
              INSERT INTO job_logs (job_id, execution_id, level, message, created_at)
              VALUES (
                ${insertedJob.id},
                ${exeId},
                'error',
                'Job failed: DB query timed out after 10000ms.',
                ${finishedAt}
              )
            `;
          }
        }
      }

      // Seed Dead Letter Queue entries
      const dlqSeed = [
        { job_id: 12562, queue_id: 'cleanup-jobs', type: 'system-cleanup', failed_payload: { script: 'clean-tmp.sh' }, reason: 'Permission denied', attempts: 5, failed_at: new Date('2026-07-02T06:36:00Z') },
        { job_id: 12561, queue_id: 'data-pipeline', type: 'data-import', failed_payload: { file: 'import.xml' }, reason: 'Database timeout', attempts: 5, failed_at: new Date('2026-07-02T06:12:00Z') },
        { job_id: 12560, queue_id: 'image-processing', type: 'image-thumbnail', failed_payload: { imageId: 'img_8872' }, reason: 'Invalid image format', attempts: 5, failed_at: new Date('2026-07-02T07:45:00Z') },
        { job_id: 12559, queue_id: 'default', type: 'email-send', failed_payload: { recipient: 'invalid-email' }, reason: 'SMTP auth failed', attempts: 5, failed_at: new Date('2026-07-02T06:20:00Z') },
        { job_id: 12558, queue_id: 'notifications', type: 'push-notification', failed_payload: { token: 'unknown' }, reason: 'Network unreachable', attempts: 5, failed_at: new Date('2026-07-02T05:58:00Z') }
      ];

      for (const d of dlqSeed) {
        await sql`
          INSERT INTO dead_letter (job_id, queue_id, type, failed_payload, reason, attempts, failed_at)
          VALUES (${d.job_id}, ${d.queue_id}, ${d.type}, ${sql.json(d.failed_payload as any)}, ${d.reason}, ${d.attempts}, ${d.failed_at})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    console.log('Database initialization completed successfully.');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}
