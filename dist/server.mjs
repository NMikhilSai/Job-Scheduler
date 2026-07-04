// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv2 from "dotenv";

// src/db/connection.ts
import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
var DEFAULT_DB_URL = "postgresql://postgres.xjepohumtnltyeuepyki:1%40Srivani123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";
var connectionString = process.env.DATABASE_URL || DEFAULT_DB_URL;
var sql = postgres(connectionString, {
  prepare: false,
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

// src/db/init.ts
async function initDatabase() {
  console.log("Initializing database schema and seed data...");
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS retry_policies (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'fixed' | 'linear' | 'exponential'
        base_delay_ms INTEGER NOT NULL,
        max_retries INTEGER NOT NULL
      )
    `;
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
    try {
      await sql`SELECT setval('jobs_id_seq', GREATEST(12557, COALESCE((SELECT MAX(id) FROM jobs), 0)))`;
    } catch (e) {
    }
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
    const orgs = await sql`SELECT id FROM organizations LIMIT 1`;
    if (orgs.length === 0) {
      console.log("Seeding initial database values...");
      const passHash = "$2b$10$mRz5rQZ6T3S8F9N6Qv4P1uGk5L6m2YwU6eX8R4j3J9z8C5aR2OaG2";
      await sql`
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES ('user_demo', 'mikhilsai526@gmail.com', ${passHash}, 'John Doe')
        ON CONFLICT DO NOTHING
      `;
      await sql`
        INSERT INTO organizations (id, name)
        VALUES ('org_default', 'JobScheduler Corp')
        ON CONFLICT DO NOTHING
      `;
      const projects = [
        { id: "proj_email", name: "Email Service" },
        { id: "proj_image", name: "Image Processor" },
        { id: "proj_pipeline", name: "Data Pipeline" },
        { id: "proj_marketing", name: "Marketing" },
        { id: "proj_system", name: "System" },
        { id: "proj_analytics", name: "Analytics" },
        { id: "proj_notifications", name: "Notification Service" }
      ];
      for (const p of projects) {
        await sql`
          INSERT INTO projects (id, org_id, name)
          VALUES (${p.id}, 'org_default', ${p.name})
          ON CONFLICT DO NOTHING
        `;
      }
      const policies = [
        { id: "policy_exp", type: "exponential", base_delay_ms: 1e4, max_retries: 5 },
        { id: "policy_fixed", type: "fixed", base_delay_ms: 5e3, max_retries: 3 },
        { id: "policy_linear", type: "linear", base_delay_ms: 2e3, max_retries: 4 }
      ];
      for (const pol of policies) {
        await sql`
          INSERT INTO retry_policies (id, type, base_delay_ms, max_retries)
          VALUES (${pol.id}, ${pol.type}, ${pol.base_delay_ms}, ${pol.max_retries})
          ON CONFLICT DO NOTHING
        `;
      }
      const queues = [
        { id: "high-priority", project_id: "proj_email", name: "high-priority", priority: 3, concurrency_limit: 10, is_paused: false, retry_policy_id: "policy_exp" },
        { id: "default", project_id: "proj_email", name: "default", priority: 2, concurrency_limit: 5, is_paused: false, retry_policy_id: "policy_fixed" },
        { id: "image-processing", project_id: "proj_image", name: "image-processing", priority: 3, concurrency_limit: 8, is_paused: false, retry_policy_id: "policy_linear" },
        { id: "data-pipeline", project_id: "proj_pipeline", name: "data-pipeline", priority: 2, concurrency_limit: 4, is_paused: false, retry_policy_id: "policy_exp" },
        { id: "low-priority", project_id: "proj_marketing", name: "low-priority", priority: 1, concurrency_limit: 2, is_paused: true, retry_policy_id: "policy_fixed" },
        { id: "cleanup-jobs", project_id: "proj_system", name: "cleanup-jobs", priority: 1, concurrency_limit: 3, is_paused: false, retry_policy_id: "policy_linear" },
        { id: "report-generation", project_id: "proj_analytics", name: "report-generation", priority: 2, concurrency_limit: 4, is_paused: false, retry_policy_id: "policy_exp" },
        { id: "notifications", project_id: "proj_notifications", name: "notifications", priority: 3, concurrency_limit: 6, is_paused: false, retry_policy_id: "policy_exp" }
      ];
      for (const q of queues) {
        await sql`
          INSERT INTO queues (id, project_id, name, priority, concurrency_limit, is_paused, retry_policy_id)
          VALUES (${q.id}, ${q.project_id}, ${q.name}, ${q.priority}, ${q.concurrency_limit}, ${q.is_paused}, ${q.retry_policy_id})
          ON CONFLICT DO NOTHING
        `;
      }
      const workers = [
        { id: "worker-1@ip-10-0-0-1", name: "worker-1", status: "busy", hostname: "ip-10-0-0-1", cpu_usage: 32, memory_usage: 256, uptime: "2d 4h 23m" },
        { id: "worker-2@ip-10-0-0-2", name: "worker-2", status: "idle", hostname: "ip-10-0-0-2", cpu_usage: 15, memory_usage: 128, uptime: "1d 12h 10m" },
        { id: "worker-3@ip-10-0-0-5", name: "worker-3", status: "busy", hostname: "ip-10-0-0-5", cpu_usage: 45, memory_usage: 512, uptime: "4d 1h 5m" },
        { id: "worker-4@ip-10-0-0-8", name: "worker-4", status: "offline", hostname: "ip-10-0-0-8", cpu_usage: 0, memory_usage: 0, uptime: "0d 0h 0m" },
        { id: "worker-5@ip-10-0-0-9", name: "worker-5", status: "idle", hostname: "ip-10-0-0-9", cpu_usage: 20, memory_usage: 128, uptime: "12h 45m" },
        { id: "worker-6@ip-10-0-0-11", name: "worker-6", status: "idle", hostname: "ip-10-0-0-11", cpu_usage: 5, memory_usage: 64, uptime: "1d 2h 15m" }
      ];
      for (const w of workers) {
        await sql`
          INSERT INTO workers (id, name, status, hostname, cpu_usage, memory_usage, uptime)
          VALUES (${w.id}, ${w.name}, ${w.status}, ${w.hostname}, ${w.cpu_usage}, ${w.memory_usage}, ${w.uptime})
          ON CONFLICT DO NOTHING
        `;
      }
      const schedules = [
        { id: "sched_daily", name: "daily-report", queue_id: "report-generation", cron_expr: "0 0 * * *", next_run: /* @__PURE__ */ new Date("2026-07-03T00:00:00Z"), status: "Active" },
        { id: "sched_cleanup", name: "cleanup-temp", queue_id: "cleanup-jobs", cron_expr: "0 */6 * * *", next_run: /* @__PURE__ */ new Date("2026-07-02T18:00:00Z"), status: "Active" },
        { id: "sched_weekly", name: "weekly-summary", queue_id: "report-generation", cron_expr: "0 0 * * 1", next_run: /* @__PURE__ */ new Date("2026-07-06T08:00:00Z"), status: "Active" },
        { id: "sched_notifications", name: "user-notifications", queue_id: "notifications", cron_expr: "*/15 * * * *", next_run: /* @__PURE__ */ new Date("2026-07-02T12:15:00Z"), status: "Active" },
        { id: "sched_billing", name: "monthly-billing", queue_id: "high-priority", cron_expr: "0 0 1 * *", next_run: /* @__PURE__ */ new Date("2026-08-01T00:00:00Z"), status: "Paused" }
      ];
      for (const s of schedules) {
        await sql`
          INSERT INTO schedules (id, name, queue_id, cron_expr, next_run, status)
          VALUES (${s.id}, ${s.name}, ${s.queue_id}, ${s.cron_expr}, ${s.next_run}, ${s.status})
          ON CONFLICT DO NOTHING
        `;
      }
      const seedJobs = [
        // Completed
        { queue_id: "high-priority", type: "email-send", payload: { to: "customer@example.com", template: "welcome" }, status: "completed", priority: "High", attempt: 1, max_attempts: 5, run_at: /* @__PURE__ */ new Date("2026-07-02T11:41:00Z") },
        // Failed
        { queue_id: "high-priority", type: "email-send", payload: { to: "missing@domain.com", template: "digest" }, status: "failed", priority: "High", attempt: 3, max_attempts: 5, run_at: /* @__PURE__ */ new Date("2026-07-02T11:40:00Z") },
        // Running
        { queue_id: "default", type: "payment-process", payload: { amount: 150, token: "tok_visa123" }, status: "running", priority: "Normal", attempt: 1, max_attempts: 3, run_at: /* @__PURE__ */ new Date("2026-07-02T11:38:00Z"), claimed_by: "worker-3@ip-10-0-0-5" },
        // Completed
        { queue_id: "image-processing", type: "image-thumbnail", payload: { s3Url: "s3://bucket/photo.jpg", size: "200x200" }, status: "completed", priority: "High", attempt: 1, max_attempts: 3, run_at: /* @__PURE__ */ new Date("2026-07-02T11:38:00Z") },
        // Completed
        { queue_id: "data-pipeline", type: "data-import", payload: { source: "sales_q2.csv" }, status: "completed", priority: "Normal", attempt: 1, max_attempts: 5, run_at: /* @__PURE__ */ new Date("2026-07-02T11:27:00Z") },
        // Failed
        { queue_id: "cleanup-jobs", type: "system-cleanup", payload: { dir: "/var/log/tmp" }, status: "failed", priority: "Low", attempt: 5, max_attempts: 5, run_at: /* @__PURE__ */ new Date("2026-07-02T11:26:00Z") },
        // Completed
        { queue_id: "report-generation", type: "report-generate", payload: { reportId: "rep_daily_7823" }, status: "completed", priority: "Normal", attempt: 1, max_attempts: 3, run_at: /* @__PURE__ */ new Date("2026-07-02T11:25:00Z") },
        // Running (will represent active pulsing job)
        { queue_id: "notifications", type: "sms-send", payload: { phone: "+15550199", body: "Verify code: 8234" }, status: "running", priority: "High", attempt: 1, max_attempts: 3, run_at: /* @__PURE__ */ new Date("2026-07-02T11:24:00Z"), claimed_by: "worker-1@ip-10-0-0-1" },
        // Scheduled
        { queue_id: "high-priority", type: "email-send", payload: { to: "vip@corp.com", body: "Alert: server loads critical" }, status: "scheduled", priority: "High", attempt: 0, max_attempts: 5, run_at: new Date(Date.now() + 36e4) }
      ];
      for (const j of seedJobs) {
        const [insertedJob] = await sql`
          INSERT INTO jobs (queue_id, type, payload, status, priority, attempt, max_attempts, run_at, claimed_by)
          VALUES (${j.queue_id}, ${j.type}, ${sql.json(j.payload)}, ${j.status}, ${j.priority}, ${j.attempt}, ${j.max_attempts}, ${j.run_at}, ${j.claimed_by || null})
          RETURNING id
        `;
        if (j.status === "completed" || j.status === "failed" || j.status === "running") {
          const exeId = `exe_${insertedJob.id + 776565}`;
          const finishedAt = j.status === "running" ? null : new Date(new Date(j.run_at).getTime() + 5e3);
          await sql`
            INSERT INTO job_executions (id, job_id, worker_id, started_at, finished_at, status, result_payload, error_message)
            VALUES (
              ${exeId},
              ${insertedJob.id},
              ${j.claimed_by || "worker-1@ip-10-0-0-1"},
              ${j.run_at},
              ${finishedAt},
              ${j.status},
              ${j.status === "completed" ? '{"success": true}' : null},
              ${j.status === "failed" ? "Error: Failed execution attempt" : null}
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
          if (j.status === "completed") {
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
          } else if (j.status === "failed") {
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
      const dlqSeed = [
        { job_id: 12562, queue_id: "cleanup-jobs", type: "system-cleanup", failed_payload: { script: "clean-tmp.sh" }, reason: "Permission denied", attempts: 5, failed_at: /* @__PURE__ */ new Date("2026-07-02T06:36:00Z") },
        { job_id: 12561, queue_id: "data-pipeline", type: "data-import", failed_payload: { file: "import.xml" }, reason: "Database timeout", attempts: 5, failed_at: /* @__PURE__ */ new Date("2026-07-02T06:12:00Z") },
        { job_id: 12560, queue_id: "image-processing", type: "image-thumbnail", failed_payload: { imageId: "img_8872" }, reason: "Invalid image format", attempts: 5, failed_at: /* @__PURE__ */ new Date("2026-07-02T07:45:00Z") },
        { job_id: 12559, queue_id: "default", type: "email-send", failed_payload: { recipient: "invalid-email" }, reason: "SMTP auth failed", attempts: 5, failed_at: /* @__PURE__ */ new Date("2026-07-02T06:20:00Z") },
        { job_id: 12558, queue_id: "notifications", type: "push-notification", failed_payload: { token: "unknown" }, reason: "Network unreachable", attempts: 5, failed_at: /* @__PURE__ */ new Date("2026-07-02T05:58:00Z") }
      ];
      for (const d of dlqSeed) {
        await sql`
          INSERT INTO dead_letter (job_id, queue_id, type, failed_payload, reason, attempts, failed_at)
          VALUES (${d.job_id}, ${d.queue_id}, ${d.type}, ${sql.json(d.failed_payload)}, ${d.reason}, ${d.attempts}, ${d.failed_at})
          ON CONFLICT DO NOTHING
        `;
      }
    }
    console.log("Database initialization completed successfully.");
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
}

// server.ts
import { z } from "zod";
dotenv2.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT ?? 3e3);
var invokedEntry = process.argv[1]?.replace(/\\/g, "/");
var isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) || Boolean(process.env.RAILWAY_PROJECT_ID) || Boolean(process.env.RAILWAY_STATIC_URL) || Boolean(process.env.RAILWAY_PUBLIC_DOMAIN) || Boolean(process.env.RAILWAY_LB_HOST) || invokedEntry?.endsWith("/dist/server.mjs") || invokedEntry?.endsWith("/dist/server.js");
app.use(express.json());
initDatabase().then(() => {
  startWorkerLoop();
  startScheduleCronLoop();
});
function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return "user_demo";
}
app.post("/api/auth/sign-in", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid email or password format." } });
  }
  const { email } = parsed.data;
  try {
    const users = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`;
    if (users.length === 0) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User not found." } });
    }
    const user = users[0];
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name
      },
      token: user.id
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/auth/sign-up", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid signup input." } });
  }
  const { email, fullName } = parsed.data;
  const userId = "user_" + Math.random().toString(36).substring(2, 11);
  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: { code: "EMAIL_EXISTS", message: "Email already registered." } });
    }
    await sql`
      INSERT INTO users (id, email, password_hash, full_name)
      VALUES (${userId}, ${email}, 'mock_hash', ${fullName})
    `;
    const orgId = "org_" + userId;
    await sql`INSERT INTO organizations (id, name) VALUES (${orgId}, ${fullName + " Org"})`;
    await sql`INSERT INTO projects (id, org_id, name) VALUES (${"proj_" + userId}, ${orgId}, 'Default Project')`;
    await sql`
      INSERT INTO queues (id, project_id, name, priority, concurrency_limit, is_paused, retry_policy_id)
      VALUES (
        ${"queue_" + userId},
        ${"proj_" + userId},
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
        fullName
      },
      token: userId
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/auth/me", async (req, res) => {
  const userId = getUserId(req);
  try {
    const users = await sql`SELECT id, email, full_name FROM users WHERE id = ${userId}`;
    if (users.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found." } });
    }
    res.json({ user: users[0] });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/projects", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Project name is required." } });
  }
  const userId = getUserId(req);
  const projectId = "proj_" + Math.random().toString(36).substring(2, 9);
  const orgId = "org_default";
  try {
    await sql`
      INSERT INTO projects (id, org_id, name)
      VALUES (${projectId}, ${orgId}, ${parsed.data.name})
    `;
    res.json({ data: { id: projectId, name: parsed.data.name } });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/projects", async (req, res) => {
  try {
    const projects = await sql`
      SELECT * FROM projects
      ORDER BY created_at DESC
    `;
    res.json({ data: projects });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/queues", async (req, res) => {
  try {
    const queuesList = await sql`
      SELECT q.*, p.name as project_name, rp.type as retry_policy_type
      FROM queues q
      LEFT JOIN projects p ON q.project_id = p.id
      LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
      ORDER BY q.created_at DESC
    `;
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
        let baseJobs = 0;
        let baseFailed = 0;
        if (queue.id === "high-priority") {
          baseJobs = 1234;
          baseFailed = 12;
        } else if (queue.id === "default") {
          baseJobs = 8765;
          baseFailed = 45;
        } else if (queue.id === "image-processing") {
          baseJobs = 3456;
          baseFailed = 22;
        } else if (queue.id === "data-pipeline") {
          baseJobs = 5618;
          baseFailed = 31;
        } else if (queue.id === "low-priority") {
          baseJobs = 456;
          baseFailed = 5;
        } else if (queue.id === "cleanup-jobs") {
          baseJobs = 2943;
          baseFailed = 10;
        } else if (queue.id === "report-generation") {
          baseJobs = 1234;
          baseFailed = 8;
        } else if (queue.id === "notifications") {
          baseJobs = 7890;
          baseFailed = 17;
        }
        const totalJobs = Number(stats[0].completed_count) + Number(stats[0].failed_count) + Number(stats[0].running_count) + Number(stats[0].queued_count) + baseJobs;
        const totalFailed = Number(stats[0].dead_letter_count) + Number(stats[0].failed_count) + baseFailed;
        return {
          ...queue,
          jobsCount: totalJobs,
          failedCount: totalFailed,
          activeCount: Number(stats[0].running_count),
          queuedCount: Number(stats[0].queued_count)
        };
      })
    );
    res.json({ data: queuesWithStats });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/queues", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    projectId: z.string().min(1),
    priority: z.number().int().min(1).max(3),
    concurrencyLimit: z.number().int().min(1).max(50),
    retryPolicyId: z.string().optional().default("policy_fixed"),
    isPaused: z.boolean().optional().default(false)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.message } });
  }
  const { name, projectId, priority, concurrencyLimit, retryPolicyId, isPaused } = parsed.data;
  const queueId = name.toLowerCase().replace(/\s+/g, "-");
  try {
    await sql`
      INSERT INTO queues (id, project_id, name, priority, concurrency_limit, is_paused, retry_policy_id)
      VALUES (${queueId}, ${projectId}, ${name}, ${priority}, ${concurrencyLimit}, ${isPaused}, ${retryPolicyId})
    `;
    res.json({ data: { id: queueId, name, priority, concurrencyLimit, isPaused } });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.patch("/api/queues/:id", async (req, res) => {
  const { id } = req.params;
  const schema = z.object({
    isPaused: z.boolean().optional(),
    concurrencyLimit: z.number().int().min(1).optional(),
    priority: z.number().int().min(1).max(3).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.message } });
  }
  try {
    const queue = await sql`SELECT * FROM queues WHERE id = ${id}`;
    if (queue.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Queue not found." } });
    }
    const updates = {};
    if (parsed.data.isPaused !== void 0) updates.is_paused = parsed.data.isPaused;
    if (parsed.data.concurrencyLimit !== void 0) updates.concurrency_limit = parsed.data.concurrencyLimit;
    if (parsed.data.priority !== void 0) updates.priority = parsed.data.priority;
    if (Object.keys(updates).length > 0) {
      await sql`
        UPDATE queues
        SET ${sql(updates)}
        WHERE id = ${id}
      `;
    }
    res.json({ data: { id, ...queue[0], ...updates } });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/queues/:id/stats", async (req, res) => {
  const { id } = req.params;
  try {
    const queue = await sql`SELECT * FROM queues WHERE id = ${id}`;
    if (queue.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Queue not found." } });
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
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/jobs", async (req, res) => {
  const schema = z.object({
    queueId: z.string().min(1),
    type: z.string().min(1),
    payload: z.any(),
    priority: z.enum(["Low", "Normal", "High"]).optional().default("Normal"),
    delaySeconds: z.number().int().nonnegative().optional().default(0),
    cronExpr: z.string().optional(),
    maxAttempts: z.number().int().min(1).optional().default(3)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.message } });
  }
  const { queueId, type, payload, priority, delaySeconds, cronExpr, maxAttempts } = parsed.data;
  try {
    const runAt = new Date(Date.now() + delaySeconds * 1e3);
    const status = delaySeconds > 0 ? "scheduled" : "queued";
    const [job] = await sql`
      INSERT INTO jobs (queue_id, type, payload, status, priority, attempt, max_attempts, run_at, cron_expr)
      VALUES (${queueId}, ${type}, ${sql.json(payload)}, ${status}, ${priority}, 0, ${maxAttempts}, ${runAt}, ${cronExpr || null})
      RETURNING *
    `;
    await sql`
      INSERT INTO job_logs (job_id, level, message)
      VALUES (${job.id}, 'info', ${`Job created with status '${status}'. Scheduled run: ${runAt.toISOString()}`})
    `;
    res.json({ data: job });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/jobs", async (req, res) => {
  const { status, queueId, page = "1", pageSize = "10", search = "" } = req.query;
  const limit = parseInt(pageSize);
  const offset = (parseInt(page) - 1) * limit;
  try {
    let query = sql`
      SELECT j.*, q.name as queue_name
      FROM jobs j
      LEFT JOIN queues q ON j.queue_id = q.id
      WHERE 1=1
    `;
    if (status) {
      query = sql`${query} AND j.status = ${status}`;
    }
    if (queueId) {
      query = sql`${query} AND j.queue_id = ${queueId}`;
    }
    if (search) {
      query = sql`${query} AND (j.type ILIKE ${"%" + search + "%"} OR j.id::text ILIKE ${"%" + search + "%"})`;
    }
    let countQuery = sql`SELECT COUNT(*) FROM jobs j WHERE 1=1`;
    if (status) countQuery = sql`${countQuery} AND j.status = ${status}`;
    if (queueId) countQuery = sql`${countQuery} AND j.queue_id = ${queueId}`;
    if (search) countQuery = sql`${countQuery} AND (j.type ILIKE ${"%" + search + "%"} OR j.id::text ILIKE ${"%" + search + "%"})`;
    const totalRes = await countQuery;
    const total = parseInt(totalRes[0].count);
    const jobs = await sql`
      ${query}
      ORDER BY j.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    res.json({
      data: jobs,
      total,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/jobs/:id", async (req, res) => {
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
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    }
    const executions = await sql`
      SELECT * FROM job_executions
      WHERE job_id = ${parseInt(id)}
      ORDER BY started_at DESC
    `;
    const logs = await sql`
      SELECT * FROM job_logs
      WHERE job_id = ${parseInt(id)}
      ORDER BY created_at ASC
    `;
    res.json({
      data: {
        ...jobs[0],
        executions,
        logs
      }
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/jobs/:id/retry", async (req, res) => {
  const { id } = req.params;
  try {
    const jobs = await sql`SELECT * FROM jobs WHERE id = ${parseInt(id)}`;
    if (jobs.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    }
    const job = jobs[0];
    if (job.status !== "failed" && job.status !== "dead_letter") {
      return res.status(400).json({ error: { code: "INVALID_STATE", message: "Only failed or dead_letter jobs can be retried." } });
    }
    await sql`
      UPDATE jobs
      SET status = 'queued', attempt = 0, run_at = CURRENT_TIMESTAMP, claimed_by = NULL
      WHERE id = ${parseInt(id)}
    `;
    await sql`
      INSERT INTO job_logs (job_id, level, message)
      VALUES (${parseInt(id)}, 'info', 'Job manual retry triggered from dashboard.')
    `;
    await sql`DELETE FROM dead_letter WHERE job_id = ${parseInt(id)}`;
    res.json({ data: { id: parseInt(id), status: "queued" } });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/dead-letter", async (req, res) => {
  try {
    const dlqs = await sql`
      SELECT d.*, q.name as queue_name
      FROM dead_letter d
      LEFT JOIN queues q ON d.queue_id = q.id
      ORDER BY d.failed_at DESC
    `;
    res.json({ data: dlqs });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/dead-letter/:id/requeue", async (req, res) => {
  const { id } = req.params;
  try {
    const dlq = await sql`SELECT * FROM dead_letter WHERE id = ${parseInt(id)}`;
    if (dlq.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Dead letter entry not found." } });
    }
    const entry = dlq[0];
    await sql`
      UPDATE jobs
      SET status = 'queued', attempt = 0, run_at = CURRENT_TIMESTAMP, claimed_by = NULL
      WHERE id = ${entry.job_id}
    `;
    await sql`
      INSERT INTO job_logs (job_id, level, message)
      VALUES (${entry.job_id}, 'info', 'Job requeued from Dead Letter Queue.')
    `;
    await sql`DELETE FROM dead_letter WHERE id = ${parseInt(id)}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.delete("/api/dead-letter/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const dlq = await sql`SELECT * FROM dead_letter WHERE id = ${parseInt(id)}`;
    if (dlq.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Dead letter entry not found." } });
    }
    await sql`DELETE FROM jobs WHERE id = ${dlq[0].job_id}`;
    await sql`DELETE FROM dead_letter WHERE id = ${parseInt(id)}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/workers", async (req, res) => {
  try {
    const workersList = await sql`SELECT * FROM workers ORDER BY name ASC`;
    res.json({ data: workersList });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/workers", async (req, res) => {
  const schema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    hostname: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.message } });
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
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.delete("/api/workers/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await sql`DELETE FROM workers WHERE id = ${id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/executions", async (req, res) => {
  const { status, page = "1", pageSize = "10" } = req.query;
  const limit = parseInt(pageSize);
  const offset = (parseInt(page) - 1) * limit;
  try {
    let query = sql`
      SELECT e.*, j.type as job_type, j.queue_id
      FROM job_executions e
      LEFT JOIN jobs j ON e.job_id = j.id
      WHERE 1=1
    `;
    if (status) {
      query = sql`${query} AND e.status = ${status}`;
    }
    const totalRes = await sql`
      SELECT COUNT(*) FROM job_executions e WHERE 1=1
      ${status ? sql`AND e.status = ${status}` : sql``}
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
      page: parseInt(page),
      pageSize: limit
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/logs", async (req, res) => {
  const { level, limit = "50" } = req.query;
  try {
    let query = sql`
      SELECT l.*, j.type as job_type, j.queue_id
      FROM job_logs l
      LEFT JOIN jobs j ON l.job_id = j.id
      WHERE 1=1
    `;
    if (level) {
      query = sql`${query} AND l.level = ${level}`;
    }
    const logs = await sql`
      ${query}
      ORDER BY l.created_at DESC
      LIMIT ${parseInt(limit)}
    `;
    res.json({ data: logs });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/schedules", async (req, res) => {
  try {
    const list = await sql`
      SELECT s.*, q.name as queue_name
      FROM schedules s
      LEFT JOIN queues q ON s.queue_id = q.id
      ORDER BY s.created_at DESC
    `;
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/schedules", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    queueId: z.string().min(1),
    cronExpr: z.string().min(5)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.message } });
  }
  const { name, queueId, cronExpr } = parsed.data;
  const id = "sched_" + Math.random().toString(36).substring(2, 9);
  const nextRun = new Date(Date.now() + 36e5);
  try {
    await sql`
      INSERT INTO schedules (id, name, queue_id, cron_expr, next_run, status)
      VALUES (${id}, ${name}, ${queueId}, ${cronExpr}, ${nextRun}, 'Active')
    `;
    res.json({ data: { id, name, queueId, cronExpr, nextRun, status: "Active" } });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.post("/api/schedules/:id/toggle", async (req, res) => {
  const { id } = req.params;
  try {
    const list = await sql`SELECT status FROM schedules WHERE id = ${id}`;
    if (list.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Schedule not found." } });
    }
    const currentStatus = list[0].status;
    const newStatus = currentStatus === "Active" ? "Paused" : "Active";
    await sql`
      UPDATE schedules
      SET status = ${newStatus}
      WHERE id = ${id}
    `;
    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
app.get("/api/metrics/throughput", async (req, res) => {
  try {
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
    const completedTotal = 20312 + extraCompleted;
    const failedTotal = 1343 + extraFailed;
    const runningTotal = 320 + extraRunning;
    const queuedTotal = 2567 + extraQueued;
    const totalJobs = completedTotal + failedTotal + runningTotal + queuedTotal;
    const successRate = totalJobs > 0 ? Number((completedTotal / (completedTotal + failedTotal) * 100).toFixed(1)) : 96.3;
    const lineChartData = [
      { time: "00:00", completed: 400, failed: 120 },
      { time: "02:00", completed: 520, failed: 140 },
      { time: "04:00", completed: 780, failed: 220 },
      { time: "06:00", completed: 640, failed: 180 },
      { time: "08:00", completed: 700, failed: 210 },
      { time: "10:00", completed: 620, failed: 190 },
      { time: "12:00", completed: 580, failed: 180 },
      { time: "14:00", completed: 720, failed: 160 },
      { time: "16:00", completed: 840, failed: 240 },
      { time: "18:00", completed: 680, failed: 260 },
      { time: "20:00", completed: 620, failed: 220 },
      { time: "22:00", completed: 740, failed: 160 },
      { time: "24:00", completed: 960 + extraCompleted * 50, failed: 210 + extraFailed * 50 }
      // visually reflect new completions
    ];
    res.json({
      summary: {
        totalJobs,
        completed: completedTotal,
        failed: failedTotal,
        running: runningTotal,
        queued: queuedTotal,
        throughput: "1,234/hr",
        successRate: `${successRate}%`,
        avgDuration: "1.42s"
      },
      lineChart: lineChartData,
      donutChart: [
        { name: "Completed", value: completedTotal, color: "#10B981" },
        { name: "Failed", value: failedTotal, color: "#EF4444" },
        { name: "Running", value: runningTotal, color: "#F59E0B" },
        { name: "Queued", value: queuedTotal, color: "#8B5CF6" }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
  }
});
async function startWorkerLoop() {
  console.log("Worker listening engine active. Polling Supabase DB for jobs...");
  setInterval(async () => {
    try {
      await sql.begin(async (tx) => {
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
          return;
        }
        const job = eligibleJobs[0];
        const activeCountRes = await tx`
          SELECT COUNT(*) FROM jobs
          WHERE queue_id = ${job.queue_id} AND status = 'running'
        `;
        const activeCount = parseInt(activeCountRes[0].count);
        if (activeCount >= job.concurrency_limit) {
          return;
        }
        const onlineWorkers = await tx`
          SELECT id FROM workers 
          WHERE status != 'offline'
          ORDER BY RANDOM()
          LIMIT 1
        `;
        const assignedWorkerId = onlineWorkers.length > 0 ? onlineWorkers[0].id : "worker-1@ip-10-0-0-1";
        const nextAttempt = job.attempt + 1;
        await tx`
          UPDATE jobs
          SET status = 'running', attempt = ${nextAttempt}, claimed_by = ${assignedWorkerId}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${job.id}
        `;
        await tx`
          UPDATE workers
          SET status = 'busy', current_job_id = ${job.id}, last_heartbeat_at = CURRENT_TIMESTAMP
          WHERE id = ${assignedWorkerId}
        `;
        const executionId = `exe_${job.id}_${nextAttempt}_${Math.floor(Math.random() * 1e6)}`;
        await tx`
          INSERT INTO job_executions (id, job_id, worker_id, started_at, status)
          VALUES (${executionId}, ${job.id}, ${assignedWorkerId}, CURRENT_TIMESTAMP, 'running')
        `;
        await tx`
          INSERT INTO job_logs (job_id, execution_id, level, message)
          VALUES (${job.id}, ${executionId}, 'info', ${`Job claimed atomically by ${assignedWorkerId}. Executing attempt ${nextAttempt} of ${job.max_attempts}.`})
        `;
        runSimulatedJob(job, executionId, assignedWorkerId, nextAttempt);
      });
    } catch (err) {
      console.error("Worker loop claim error:", err);
    }
  }, 3e3);
}
async function runSimulatedJob(job, executionId, workerId, attempt) {
  setTimeout(async () => {
    try {
      const payload = job.payload || {};
      let shouldFail = false;
      let failureReason = "Simulated execution error";
      if (payload.shouldFail === true || payload.forceFail === true) {
        shouldFail = true;
        failureReason = payload.failReason || "User forced failure";
      } else if (job.type === "system-cleanup" || payload.script === "clean-tmp.sh") {
        shouldFail = true;
        failureReason = "Permission denied to delete system directory.";
      } else if (job.type === "data-import" && Math.random() < 0.25) {
        shouldFail = true;
        failureReason = "Database connection timed out during CSV row ingestion.";
      }
      if (shouldFail) {
        await sql.begin(async (tx) => {
          const isDeadLetter = attempt >= job.max_attempts;
          const finalStatus = isDeadLetter ? "dead_letter" : "failed";
          let nextRunAt = /* @__PURE__ */ new Date();
          if (!isDeadLetter) {
            const baseDelay = job.base_delay_ms || 1e4;
            const policy = job.policy_type || "exponential";
            let delayMs = baseDelay;
            if (policy === "linear") {
              delayMs = baseDelay * attempt;
            } else if (policy === "exponential") {
              delayMs = baseDelay * Math.pow(2, attempt);
            }
            nextRunAt = new Date(Date.now() + delayMs);
          }
          await tx`
            UPDATE jobs
            SET status = ${finalStatus}, run_at = ${isDeadLetter ? /* @__PURE__ */ new Date() : nextRunAt}, claimed_by = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${job.id}
          `;
          await tx`
            UPDATE job_executions
            SET finished_at = CURRENT_TIMESTAMP, status = 'failed', error_message = ${failureReason}
            WHERE id = ${executionId}
          `;
          await tx`
            INSERT INTO job_logs (job_id, execution_id, level, message)
            VALUES (${job.id}, ${executionId}, 'error', ${`Execution attempt ${attempt} failed: ${failureReason}`})
          `;
          if (isDeadLetter) {
            await tx`
              INSERT INTO job_logs (job_id, execution_id, level, message)
              VALUES (${job.id}, ${executionId}, 'error', 'Max retry limit reached. Job relocated to Dead Letter Queue.')
            `;
            await tx`
              INSERT INTO dead_letter (job_id, queue_id, type, failed_payload, reason, attempts)
              VALUES (${job.id}, ${job.queue_id}, ${job.type}, ${sql.json(job.payload)}, ${failureReason}, ${attempt})
            `;
          } else {
            await tx`
              INSERT INTO job_logs (job_id, execution_id, level, message)
              VALUES (${job.id}, ${executionId}, 'warn', ${`Retrying job in ${(job.base_delay_ms || 1e4) / 1e3}s per retry policy.`})
            `;
          }
          await tx`
            UPDATE workers
            SET status = 'idle', current_job_id = NULL, last_heartbeat_at = CURRENT_TIMESTAMP
            WHERE id = ${workerId}
          `;
        });
      } else {
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
      console.error("Error executing job:", err);
    }
  }, 2e3);
}
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
          const [job] = await tx`
            INSERT INTO jobs (queue_id, type, payload, status, priority, attempt, max_attempts)
            VALUES (${sched.queue_id}, ${sched.name}, '{"triggeredBy": "schedule"}', 'queued', 'Normal', 0, 3)
            RETURNING *
          `;
          await tx`
            INSERT INTO job_logs (job_id, level, message)
            VALUES (${job.id}, 'info', ${`Job automatically triggered by recurring schedule '${sched.name}'.`})
          `;
          const nextRun = new Date(Date.now() + 6e4);
          await tx`
            UPDATE schedules
            SET next_run = ${nextRun}
            WHERE id = ${sched.id}
          `;
        });
      }
    } catch (err) {
      console.error("Schedule cron loop error:", err);
    }
  }, 1e4);
}
setInterval(async () => {
  try {
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
  }
}, 5e3);
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving production static build from ./dist.");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.mjs.map
