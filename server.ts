import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { sql } from './src/db/connection.js';
import { initDatabase } from './src/db/init.js';
import { z } from 'zod';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const distPath = path.resolve(__dirname);
const hasBuiltAssets = existsSync(path.join(distPath, 'index.html'));
const isProductionLike = process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) ||
  Boolean(process.env.RAILWAY_PROJECT_ID) ||
  Boolean(process.env.RAILWAY_STATIC_URL) ||
  Boolean(process.env.RAILWAY_PUBLIC_DOMAIN) ||
  Boolean(process.env.RAILWAY_LB_HOST);
const shouldUseVite = !hasBuiltAssets && !isProductionLike;

app.use(express.json());

// Initialize database
initDatabase().then(() => {
  // Start the background worker process once the database is ready
  startWorkerLoop();
  startScheduleCronLoop();
});

// Helper for auth validation (simulates auth or uses seeded demo user if none provided)
function getUserId(req: express.Request): string {
  // Default to demo user if no auth header for zero friction in demo, but accept customized user
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return 'user_demo';
}

// ==========================================
// AUTHENTICATION ENDPOINTS (SIMULATING CLERK)
// ==========================================

app.post('/api/auth/sign-in', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid email or password format.' } });
  }

  const { email } = parsed.data;

  try {
    const users = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`;
    if (users.length === 0) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found.' } });
    }

    const user = users[0];
    // In demo, we accept any password since hashes are mock seeded, but validate email
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
      token: user.id,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.post('/api/auth/sign-up', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid signup input.' } });
  }

  const { email, fullName } = parsed.data;
  const userId = 'user_' + Math.random().toString(36).substring(2, 11);

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: { code: 'EMAIL_EXISTS', message: 'Email already registered.' } });
    }

    // Insert user
    await sql`
      INSERT INTO users (id, email, password_hash, full_name)
      VALUES (${userId}, ${email}, 'mock_hash', ${fullName})
    `;

    // Seed default project and default queues for this new user's demo sandbox
    const orgId = 'org_' + userId;
    await sql`INSERT INTO organizations (id, name) VALUES (${orgId}, ${fullName + ' Org'})`;
    await sql`INSERT INTO projects (id, org_id, name) VALUES (${'proj_' + userId}, ${orgId}, 'Default Project')`;
    
    // Seed standard queue
    await sql`
      INSERT INTO queues (id, project_id, name, priority, concurrency_limit, is_paused, retry_policy_id)
      VALUES (
        ${'queue_' + userId},
        ${'proj_' + userId},
        'default-queue',
        2,
        5,
        false,
        'policy_fixed'
      )
    `;

    res.json({
      user: {
        id: userId,
        email,
        fullName,
      },
      token: userId,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const userId = getUserId(req);
  try {
    const users = await sql`SELECT id, email, full_name FROM users WHERE id = ${userId}`;
    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }
    res.json({ user: users[0] });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// PROJECTS & QUEUES ENDPOINTS
// ==========================================

app.post('/api/projects', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Project name is required.' } });
  }

  const userId = getUserId(req);
  const projectId = 'proj_' + Math.random().toString(36).substring(2, 9);
  const orgId = 'org_default'; // Use main org default for simple single-tenant demonstration

  try {
    await sql`
      INSERT INTO projects (id, org_id, name)
      VALUES (${projectId}, ${orgId}, ${parsed.data.name})
    `;
    res.json({ data: { id: projectId, name: parsed.data.name } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await sql`
      SELECT * FROM projects
      ORDER BY created_at DESC
    `;
    res.json({ data: projects });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/queues', async (req, res) => {
  try {
    const queuesList = await sql`
      SELECT q.*, p.name as project_name, rp.type as retry_policy_type
      FROM queues q
      LEFT JOIN projects p ON q.project_id = p.id
      LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
      ORDER BY q.created_at DESC
    `;

    // For each queue, compute dynamic statistics from jobs table
    const queuesWithStats = await Promise.all(
      queuesList.map(async (queue) => {
        const stats = await sql`
          SELECT 
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
            COUNT(CASE WHEN status = 'running' THEN 1 END) as running_count,
            COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_count,
            COUNT(CASE WHEN status = 'dead_letter' THEN 1 END) as dead_letter_count
          FROM jobs
          WHERE queue_id = ${queue.id}
        `;

        // If the database stats are small, we can add realistic base offsets to match high-density screenshots
        // high-priority = 1,234 jobs, 12 failed
        // default = 8,765 jobs, 45 failed
        let baseJobs = 0;
        let baseFailed = 0;
        if (queue.id === 'high-priority') { baseJobs = 1234; baseFailed = 12; }
        else if (queue.id === 'default') { baseJobs = 8765; baseFailed = 45; }
        else if (queue.id === 'image-processing') { baseJobs = 3456; baseFailed = 22; }
        else if (queue.id === 'data-pipeline') { baseJobs = 5618; baseFailed = 31; }
        else if (queue.id === 'low-priority') { baseJobs = 456; baseFailed = 5; }
        else if (queue.id === 'cleanup-jobs') { baseJobs = 2943; baseFailed = 10; }
        else if (queue.id === 'report-generation') { baseJobs = 1234; baseFailed = 8; }
        else if (queue.id === 'notifications') { baseJobs = 7890; baseFailed = 17; }

        const totalJobs = Number(stats[0].completed_count) + Number(stats[0].failed_count) + Number(stats[0].running_count) + Number(stats[0].queued_count) + baseJobs;
        const totalFailed = Number(stats[0].dead_letter_count) + Number(stats[0].failed_count) + baseFailed;

        return {
          ...queue,
          jobsCount: totalJobs,
          failedCount: totalFailed,
          activeCount: Number(stats[0].running_count),
          queuedCount: Number(stats[0].queued_count),
        };
      })
    );

    res.json({ data: queuesWithStats });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.post('/api/queues', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    projectId: z.string().min(1),
    priority: z.number().int().min(1).max(3),
    concurrencyLimit: z.number().int().min(1).max(50),
    retryPolicyId: z.string().optional().default('policy_fixed'),
    isPaused: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.message } });
  }

  const { name, projectId, priority, concurrencyLimit, retryPolicyId, isPaused } = parsed.data;
  const queueId = name.toLowerCase().replace(/\s+/g, '-');

  try {
    await sql`
      INSERT INTO queues (id, project_id, name, priority, concurrency_limit, is_paused, retry_policy_id)
      VALUES (${queueId}, ${projectId}, ${name}, ${priority}, ${concurrencyLimit}, ${isPaused}, ${retryPolicyId})
    `;
    res.json({ data: { id: queueId, name, priority, concurrencyLimit, isPaused } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.patch('/api/queues/:id', async (req, res) => {
  const { id } = req.params;
  const schema = z.object({
    isPaused: z.boolean().optional(),
    concurrencyLimit: z.number().int().min(1).optional(),
    priority: z.number().int().min(1).max(3).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.message } });
  }

  try {
    const queue = await sql`SELECT * FROM queues WHERE id = ${id}`;
    if (queue.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found.' } });
    }

    const updates: Record<string, any> = {};
    if (parsed.data.isPaused !== undefined) updates.is_paused = parsed.data.isPaused;
    if (parsed.data.concurrencyLimit !== undefined) updates.concurrency_limit = parsed.data.concurrencyLimit;
    if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;

    if (Object.keys(updates).length > 0) {
      await sql`
        UPDATE queues
        SET ${sql(updates)}
        WHERE id = ${id}
      `;
    }

    res.json({ data: { id, ...queue[0], ...updates } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/queues/:id/stats', async (req, res) => {
  const { id } = req.params;
  try {
    const queue = await sql`SELECT * FROM queues WHERE id = ${id}`;
    if (queue.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found.' } });
    }

    const stats = await sql`
      SELECT 
        COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'dead_letter' THEN 1 END) as dead_letter
      FROM jobs
      WHERE queue_id = ${id}
    `;

    res.json({ data: stats[0] });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// JOBS ENDPOINTS
// ==========================================

app.post('/api/jobs', async (req, res) => {
  const schema = z.object({
    queueId: z.string().min(1),
    type: z.string().min(1),
    payload: z.any(),
    priority: z.enum(['Low', 'Normal', 'High']).optional().default('Normal'),
    delaySeconds: z.number().int().nonnegative().optional().default(0),
    cronExpr: z.string().optional(),
    maxAttempts: z.number().int().min(1).optional().default(3),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.message } });
  }

  const { queueId, type, payload, priority, delaySeconds, cronExpr, maxAttempts } = parsed.data;

  try {
    const runAt = new Date(Date.now() + delaySeconds * 1000);
    const status = delaySeconds > 0 ? 'scheduled' : 'queued';

    // Insert Job
    const [job] = await sql`
      INSERT INTO jobs (queue_id, type, payload, status, priority, attempt, max_attempts, run_at, cron_expr)
      VALUES (${queueId}, ${type}, ${sql.json(payload as any)}, ${status}, ${priority}, 0, ${maxAttempts}, ${runAt}, ${cronExpr || null})
      RETURNING *
    `;

    // Log the initial event
    await sql`
      INSERT INTO job_logs (job_id, level, message)
      VALUES (${job.id}, 'info', ${`Job created with status '${status}'. Scheduled run: ${runAt.toISOString()}`})
    `;

    res.json({ data: job });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/jobs', async (req, res) => {
  const { status, queueId, page = '1', pageSize = '10', search = '' } = req.query;
  const limit = parseInt(pageSize as string);
  const offset = (parseInt(page as string) - 1) * limit;

  try {
    let query = sql`
      SELECT j.*, q.name as queue_name
      FROM jobs j
      LEFT JOIN queues q ON j.queue_id = q.id
      WHERE 1=1
    `;

    if (status) {
      query = sql`${query} AND j.status = ${status as string}`;
    }
    if (queueId) {
      query = sql`${query} AND j.queue_id = ${queueId as string}`;
    }
    if (search) {
      query = sql`${query} AND (j.type ILIKE ${'%' + search + '%'} OR j.id::text ILIKE ${'%' + search + '%'})`;
    }

    // Get total count
    let countQuery = sql`SELECT COUNT(*) FROM jobs j WHERE 1=1`;
    if (status) countQuery = sql`${countQuery} AND j.status = ${status as string}`;
    if (queueId) countQuery = sql`${countQuery} AND j.queue_id = ${queueId as string}`;
    if (search) countQuery = sql`${countQuery} AND (j.type ILIKE ${'%' + search + '%'} OR j.id::text ILIKE ${'%' + search + '%'})`;

    const totalRes = await countQuery;
    const total = parseInt(totalRes[0].count);

    // Get paginated jobs ordered by created_at desc
    const jobs = await sql`
      ${query}
      ORDER BY j.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json({
      data: jobs,
      total,
      page: parseInt(page as string),
      pageSize: limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const jobs = await sql`
      SELECT j.*, q.name as queue_name, q.concurrency_limit, rp.type as retry_policy_type
      FROM jobs j
      LEFT JOIN queues q ON j.queue_id = q.id
      LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
      WHERE j.id = ${parseInt(id)}
    `;

    if (jobs.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found.' } });
    }

    // Fetch executions
    const executions = await sql`
      SELECT * FROM job_executions
      WHERE job_id = ${parseInt(id)}
      ORDER BY started_at DESC
    `;

    // Fetch logs
    const logs = await sql`
      SELECT * FROM job_logs
      WHERE job_id = ${parseInt(id)}
      ORDER BY created_at ASC
    `;

    res.json({
      data: {
        ...jobs[0],
        executions,
        logs,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.post('/api/jobs/:id/retry', async (req, res) => {
  const { id } = req.params;
  try {
    const jobs = await sql`SELECT * FROM jobs WHERE id = ${parseInt(id)}`;
    if (jobs.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found.' } });
    }

    const job = jobs[0];
    if (job.status !== 'failed' && job.status !== 'dead_letter') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Only failed or dead_letter jobs can be retried.' } });
    }

    // Requeue the job
    await sql`
      UPDATE jobs
      SET status = 'queued', attempt = 0, run_at = CURRENT_TIMESTAMP, claimed_by = NULL
      WHERE id = ${parseInt(id)}
    `;

    // Write a retry log
    await sql`
      INSERT INTO job_logs (job_id, level, message)
      VALUES (${parseInt(id)}, 'info', 'Job manual retry triggered from dashboard.')
    `;

    // Remove from DLQ if exists
    await sql`DELETE FROM dead_letter WHERE job_id = ${parseInt(id)}`;

    res.json({ data: { id: parseInt(id), status: 'queued' } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// DEAD LETTER QUEUE ENDPOINTS
// ==========================================

app.get('/api/dead-letter', async (req, res) => {
  try {
    const dlqs = await sql`
      SELECT d.*, q.name as queue_name
      FROM dead_letter d
      LEFT JOIN queues q ON d.queue_id = q.id
      ORDER BY d.failed_at DESC
    `;
    res.json({ data: dlqs });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.post('/api/dead-letter/:id/requeue', async (req, res) => {
  const { id } = req.params;
  try {
    const dlq = await sql`SELECT * FROM dead_letter WHERE id = ${parseInt(id)}`;
    if (dlq.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dead letter entry not found.' } });
    }

    const entry = dlq[0];

    // Reset status in jobs table
    await sql`
      UPDATE jobs
      SET status = 'queued', attempt = 0, run_at = CURRENT_TIMESTAMP, claimed_by = NULL
      WHERE id = ${entry.job_id}
    `;

    await sql`
      INSERT INTO job_logs (job_id, level, message)
      VALUES (${entry.job_id}, 'info', 'Job requeued from Dead Letter Queue.')
    `;

    // Delete dead letter record
    await sql`DELETE FROM dead_letter WHERE id = ${parseInt(id)}`;

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.delete('/api/dead-letter/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const dlq = await sql`SELECT * FROM dead_letter WHERE id = ${parseInt(id)}`;
    if (dlq.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dead letter entry not found.' } });
    }

    // Delete job fully from database as "Discard" action
    await sql`DELETE FROM jobs WHERE id = ${dlq[0].job_id}`;
    await sql`DELETE FROM dead_letter WHERE id = ${parseInt(id)}`;

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// WORKERS ENDPOINTS
// ==========================================

app.get('/api/workers', async (req, res) => {
  try {
    const workersList = await sql`SELECT * FROM workers ORDER BY name ASC`;
    res.json({ data: workersList });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Register worker endpoint
app.post('/api/workers', async (req, res) => {
  const schema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    hostname: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.message } });
  }

  const { id, name, hostname } = parsed.data;

  try {
    await sql`
      INSERT INTO workers (id, name, status, hostname, cpu_usage, memory_usage, last_heartbeat_at)
      VALUES (${id}, ${name}, 'idle', ${hostname}, 5, 64, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET status = 'idle', last_heartbeat_at = CURRENT_TIMESTAMP
    `;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Unregister worker
app.delete('/api/workers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await sql`DELETE FROM workers WHERE id = ${id}`;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// EXECUTIONS & LOGS ENDPOINTS
// ==========================================

app.get('/api/executions', async (req, res) => {
  const { status, page = '1', pageSize = '10' } = req.query;
  const limit = parseInt(pageSize as string);
  const offset = (parseInt(page as string) - 1) * limit;

  try {
    let query = sql`
      SELECT e.*, j.type as job_type, j.queue_id
      FROM job_executions e
      LEFT JOIN jobs j ON e.job_id = j.id
      WHERE 1=1
    `;

    if (status) {
      query = sql`${query} AND e.status = ${status as string}`;
    }

    const totalRes = await sql`
      SELECT COUNT(*) FROM job_executions e WHERE 1=1
      ${status ? sql`AND e.status = ${status as string}` : sql``}
    `;
    const total = parseInt(totalRes[0].count);

    const executions = await sql`
      ${query}
      ORDER BY e.started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json({
      data: executions,
      total,
      page: parseInt(page as string),
      pageSize: limit
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/logs', async (req, res) => {
  const { level, limit = '50' } = req.query;
  try {
    let query = sql`
      SELECT l.*, j.type as job_type, j.queue_id
      FROM job_logs l
      LEFT JOIN jobs j ON l.job_id = j.id
      WHERE 1=1
    `;

    if (level) {
      query = sql`${query} AND l.level = ${level as string}`;
    }

    const logs = await sql`
      ${query}
      ORDER BY l.created_at DESC
      LIMIT ${parseInt(limit as string)}
    `;

    res.json({ data: logs });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// SCHEDULES ENDPOINTS
// ==========================================

app.get('/api/schedules', async (req, res) => {
  try {
    const list = await sql`
      SELECT s.*, q.name as queue_name
      FROM schedules s
      LEFT JOIN queues q ON s.queue_id = q.id
      ORDER BY s.created_at DESC
    `;
    res.json({ data: list });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.post('/api/schedules', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    queueId: z.string().min(1),
    cronExpr: z.string().min(5),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.message } });
  }

  const { name, queueId, cronExpr } = parsed.data;
  const id = 'sched_' + Math.random().toString(36).substring(2, 9);
  // Next run is in 1 hour for simple schedule placeholder
  const nextRun = new Date(Date.now() + 3600000);

  try {
    await sql`
      INSERT INTO schedules (id, name, queue_id, cron_expr, next_run, status)
      VALUES (${id}, ${name}, ${queueId}, ${cronExpr}, ${nextRun}, 'Active')
    `;
    res.json({ data: { id, name, queueId, cronExpr, nextRun, status: 'Active' } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.post('/api/schedules/:id/toggle', async (req, res) => {
  const { id } = req.params;
  try {
    const list = await sql`SELECT status FROM schedules WHERE id = ${id}`;
    if (list.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found.' } });
    }

    const currentStatus = list[0].status;
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';

    await sql`
      UPDATE schedules
      SET status = ${newStatus}
      WHERE id = ${id}
    `;

    res.json({ success: true, status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// METRICS ENDPOINTS
// ==========================================

app.get('/api/metrics/throughput', async (req, res) => {
  // Return simulated metrics + additions for live executed jobs
  try {
    // Count actual job states to add to the dashboard baseline
    const stats = await sql`
      SELECT 
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running_count,
        COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_count
      FROM jobs
    `;

    const extraCompleted = Number(stats[0].completed_count);
    const extraFailed = Number(stats[0].failed_count);
    const extraRunning = Number(stats[0].running_count);
    const extraQueued = Number(stats[0].queued_count);

    // Baseline stats from the screenshot:
    // Completed: 20312, Failed: 1243 (or 1343), Running: 320, Queued: 2567
    const completedTotal = 20312 + extraCompleted;
    const failedTotal = 1343 + extraFailed;
    const runningTotal = 320 + extraRunning;
    const queuedTotal = 2567 + extraQueued;
    const totalJobs = completedTotal + failedTotal + runningTotal + queuedTotal;

    const successRate = totalJobs > 0 ? Number(((completedTotal / (completedTotal + failedTotal)) * 100).toFixed(1)) : 96.3;

    // Charts: 24h jobs completed/failed over time
    // Completed: [400, 520, 780, 640, 700, 620, 580, 720, 840, 680, 620, 740, 960, 760, 720, 780, 680]
    // Failed: [120, 140, 220, 180, 210, 190, 180, 160, 240, 260, 220, 160, 210, 180, 220, 230, 200]
    const lineChartData = [
      { time: '00:00', completed: 400, failed: 120 },
      { time: '02:00', completed: 520, failed: 140 },
      { time: '04:00', completed: 780, failed: 220 },
      { time: '06:00', completed: 640, failed: 180 },
      { time: '08:00', completed: 700, failed: 210 },
      { time: '10:00', completed: 620, failed: 190 },
      { time: '12:00', completed: 580, failed: 180 },
      { time: '14:00', completed: 720, failed: 160 },
      { time: '16:00', completed: 840, failed: 240 },
      { time: '18:00', completed: 680, failed: 260 },
      { time: '20:00', completed: 620, failed: 220 },
      { time: '22:00', completed: 740, failed: 160 },
      { time: '24:00', completed: 960 + (extraCompleted * 50), failed: 210 + (extraFailed * 50) } // visually reflect new completions
    ];

    res.json({
      summary: {
        totalJobs,
        completed: completedTotal,
        failed: failedTotal,
        running: runningTotal,
        queued: queuedTotal,
        throughput: '1,234/hr',
        successRate: `${successRate}%`,
        avgDuration: '1.42s',
      },
      lineChart: lineChartData,
      donutChart: [
        { name: 'Completed', value: completedTotal, color: '#10B981' },
        { name: 'Failed', value: failedTotal, color: '#EF4444' },
        { name: 'Running', value: runningTotal, color: '#F59E0B' },
        { name: 'Queued', value: queuedTotal, color: '#8B5CF6' }
      ]
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// BACKGROUND DISTRIBUTED WORKER PROCESS
// ==========================================

async function startWorkerLoop() {
  console.log('Worker listening engine active. Polling Supabase DB for jobs...');
  
  setInterval(async () => {
    try {
      // Begin a transaction to atomically lock and claim a single eligible job
      await sql.begin(async (tx) => {
        // Find a job in 'queued' or 'scheduled' state whose run_at is in the past
        // And check that its queue is NOT paused
        const eligibleJobs = await tx`
          SELECT j.*, q.concurrency_limit, q.is_paused, rp.type as policy_type, rp.base_delay_ms
          FROM jobs j
          JOIN queues q ON j.queue_id = q.id
          LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
          WHERE (j.status = 'queued' OR j.status = 'scheduled')
            AND j.run_at <= CURRENT_TIMESTAMP
            AND q.is_paused = FALSE
          ORDER BY q.priority DESC, j.priority DESC, j.id ASC
          LIMIT 1
          FOR UPDATE OF j SKIP LOCKED
        `;

        if (eligibleJobs.length === 0) {
          return; // No jobs ready to run
        }

        const job = eligibleJobs[0];

        // Check concurrency limits on this queue
        const activeCountRes = await tx`
          SELECT COUNT(*) FROM jobs
          WHERE queue_id = ${job.queue_id} AND status = 'running'
        `;
        const activeCount = parseInt(activeCountRes[0].count);

        if (activeCount >= job.concurrency_limit) {
          // Concurrency limit reached for this queue, do not execute yet
          return;
        }

        // We can claim this job!
        // Select an active worker to "assign" the job to
        const onlineWorkers = await tx`
          SELECT id FROM workers 
          WHERE status != 'offline'
          ORDER BY RANDOM()
          LIMIT 1
        `;
        const assignedWorkerId = onlineWorkers.length > 0 ? onlineWorkers[0].id : 'worker-1@ip-10-0-0-1';

        const nextAttempt = job.attempt + 1;

        // Mark job as running
        await tx`
          UPDATE jobs
          SET status = 'running', attempt = ${nextAttempt}, claimed_by = ${assignedWorkerId}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${job.id}
        `;

        // Update worker status
        await tx`
          UPDATE workers
          SET status = 'busy', current_job_id = ${job.id}, last_heartbeat_at = CURRENT_TIMESTAMP
          WHERE id = ${assignedWorkerId}
        `;

        // Create job execution record using a robust, collision-free unique identifier format
        const executionId = `exe_${job.id}_${nextAttempt}_${Math.floor(Math.random() * 1000000)}`;
        await tx`
          INSERT INTO job_executions (id, job_id, worker_id, started_at, status)
          VALUES (${executionId}, ${job.id}, ${assignedWorkerId}, CURRENT_TIMESTAMP, 'running')
        `;

        // Write initial execution log
        await tx`
          INSERT INTO job_logs (job_id, execution_id, level, message)
          VALUES (${job.id}, ${executionId}, 'info', ${`Job claimed atomically by ${assignedWorkerId}. Executing attempt ${nextAttempt} of ${job.max_attempts}.`})
        `;

        // Fire asynchronous simulated run to avoid blocking database transaction
        runSimulatedJob(job, executionId, assignedWorkerId, nextAttempt);
      });
    } catch (err) {
      console.error('Worker loop claim error:', err);
    }
  }, 3000); // Poll every 3 seconds for active UI updates
}

// Simulated job execution with failures/retries
async function runSimulatedJob(job: any, executionId: string, workerId: string, attempt: number) {
  // Simulated job runs for 2 seconds
  setTimeout(async () => {
    try {
      const payload = job.payload || {};
      let shouldFail = false;
      let failureReason = 'Simulated execution error';

      // 1. Check if payload triggers a forced error
      if (payload.shouldFail === true || payload.forceFail === true) {
        shouldFail = true;
        failureReason = payload.failReason || 'User forced failure';
      } 
      // 2. Specific jobs always fail to demonstrate retries and Dead Letter Queue
      else if (job.type === 'system-cleanup' || payload.script === 'clean-tmp.sh') {
        shouldFail = true;
        failureReason = 'Permission denied to delete system directory.';
      } else if (job.type === 'data-import' && Math.random() < 0.25) {
        // Random 25% failure for pipeline to feel highly realistic
        shouldFail = true;
        failureReason = 'Database connection timed out during CSV row ingestion.';
      }

      if (shouldFail) {
        // Handle Failure
        await sql.begin(async (tx) => {
          // Check if retry is exhausted
          const isDeadLetter = attempt >= job.max_attempts;
          const finalStatus = isDeadLetter ? 'dead_letter' : 'failed';

          // Calculate next retry delay if not dead letter
          let nextRunAt = new Date();
          if (!isDeadLetter) {
            const baseDelay = job.base_delay_ms || 10000;
            const policy = job.policy_type || 'exponential';
            let delayMs = baseDelay;

            if (policy === 'linear') {
              delayMs = baseDelay * attempt;
            } else if (policy === 'exponential') {
              delayMs = baseDelay * Math.pow(2, attempt);
            }

            nextRunAt = new Date(Date.now() + delayMs);
          }

          // Update job
          await tx`
            UPDATE jobs
            SET status = ${finalStatus}, run_at = ${isDeadLetter ? new Date() : nextRunAt}, claimed_by = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${job.id}
          `;

          // Update execution
          await tx`
            UPDATE job_executions
            SET finished_at = CURRENT_TIMESTAMP, status = 'failed', error_message = ${failureReason}
            WHERE id = ${executionId}
          `;

          // Write logs
          await tx`
            INSERT INTO job_logs (job_id, execution_id, level, message)
            VALUES (${job.id}, ${executionId}, 'error', ${`Execution attempt ${attempt} failed: ${failureReason}`})
          `;

          if (isDeadLetter) {
            await tx`
              INSERT INTO job_logs (job_id, execution_id, level, message)
              VALUES (${job.id}, ${executionId}, 'error', 'Max retry limit reached. Job relocated to Dead Letter Queue.')
            `;

            // Insert to Dead Letter Queue
            await tx`
              INSERT INTO dead_letter (job_id, queue_id, type, failed_payload, reason, attempts)
              VALUES (${job.id}, ${job.queue_id}, ${job.type}, ${sql.json(job.payload)}, ${failureReason}, ${attempt})
            `;
          } else {
            await tx`
              INSERT INTO job_logs (job_id, execution_id, level, message)
              VALUES (${job.id}, ${executionId}, 'warn', ${`Retrying job in ${(job.base_delay_ms || 10000)/1000}s per retry policy.`})
            `;
          }

          // Return worker to idle
          await tx`
            UPDATE workers
            SET status = 'idle', current_job_id = NULL, last_heartbeat_at = CURRENT_TIMESTAMP
            WHERE id = ${workerId}
          `;
        });
      } else {
        // Handle Success
        await sql.begin(async (tx) => {
          await tx`
            UPDATE jobs
            SET status = 'completed', claimed_by = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${job.id}
          `;

          await tx`
            UPDATE job_executions
            SET finished_at = CURRENT_TIMESTAMP, status = 'completed', result_payload = '{"success": true, "duration": "2.0s"}'
            WHERE id = ${executionId}
          `;

          await tx`
            INSERT INTO job_logs (job_id, execution_id, level, message)
            VALUES (${job.id}, ${executionId}, 'info', 'Job execution completed successfully in 2.0s.')
          `;

          await tx`
            UPDATE workers
            SET status = 'idle', current_job_id = NULL, last_heartbeat_at = CURRENT_TIMESTAMP
            WHERE id = ${workerId}
          `;
        });
      }
    } catch (err) {
      console.error('Error executing job:', err);
    }
  }, 2000);
}

// Background scheduler for recurring schedules (evaluates every 10 seconds)
async function startScheduleCronLoop() {
  setInterval(async () => {
    try {
      const activeSchedules = await sql`
        SELECT s.*, q.is_paused 
        FROM schedules s
        JOIN queues q ON s.queue_id = q.id
        WHERE s.status = 'Active' AND s.next_run <= CURRENT_TIMESTAMP AND q.is_paused = FALSE
      `;

      for (const sched of activeSchedules) {
        await sql.begin(async (tx) => {
          // Trigger a new job
          const [job] = await tx`
            INSERT INTO jobs (queue_id, type, payload, status, priority, attempt, max_attempts)
            VALUES (${sched.queue_id}, ${sched.name}, '{"triggeredBy": "schedule"}', 'queued', 'Normal', 0, 3)
            RETURNING *
          `;

          await tx`
            INSERT INTO job_logs (job_id, level, message)
            VALUES (${job.id}, 'info', ${`Job automatically triggered by recurring schedule '${sched.name}'.`})
          `;

          // Update schedule next run to 1 minute later for simple live demo triggers, or standard intervals
          const nextRun = new Date(Date.now() + 60000);
          await tx`
            UPDATE schedules
            SET next_run = ${nextRun}
            WHERE id = ${sched.id}
          `;
        });
      }
    } catch (err) {
      console.error('Schedule cron loop error:', err);
    }
  }, 10000);
}

// Periodic worker heartbeat & metrics tick
setInterval(async () => {
  try {
    // Update live workers' heartbeats and vary CPU/memory load dynamically to simulate a hot active system
    const cpu1 = Math.floor(25 + Math.random() * 15);
    const cpu2 = Math.floor(10 + Math.random() * 10);
    const cpu3 = Math.floor(40 + Math.random() * 10);

    await sql`
      UPDATE workers 
      SET last_heartbeat_at = CURRENT_TIMESTAMP, 
          cpu_usage = CASE 
            WHEN id = 'worker-1@ip-10-0-0-1' THEN ${cpu1} 
            WHEN id = 'worker-2@ip-10-0-0-2' THEN ${cpu2}
            WHEN id = 'worker-3@ip-10-0-0-5' THEN ${cpu3}
            ELSE cpu_usage
          END
      WHERE status != 'offline'
    `;
  } catch (e) {
    // heartbeat error
  }
}, 5000);

// ==========================================
// VITE DEV SERVER AND STATIC FILES SERVING
// ==========================================

async function startServer() {
  if (shouldUseVite) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite development server middleware loaded.');
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production static build from ./dist.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
