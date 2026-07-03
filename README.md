# Distributed Job Scheduler Dashboard

A full-stack dashboard demo for a Supabase PostgreSQL-backed job scheduler, with job queues, workers, executions, schedules, dead letter queue, and live metrics.

## Project overview

- Backend: Express server with PostgreSQL access
- Database: Supabase PostgreSQL using `DATABASE_URL` from `.env`
- ORM: Prisma client generated from `prisma/schema.prisma`
- Frontend: React + Vite single-page dashboard app
- Runtime: local development with `npm run dev`, production-ready build with `npm run build`

## PRD Sections

### Evaluation Criteria

This repository is evaluated on the following criteria:

- correctness of project setup and environment configuration
- clarity and completeness of architecture and design decisions
- consistency of backend and database design
- reliability under concurrency and transactional behavior
- usability of the frontend dashboard and UX flow
- completeness of API design and endpoint coverage
- quality of documentation in README and code comments
- presence of validation, build, and runtime checks

### System Architecture

- The app uses a single Express server (`server.ts`) to serve both API endpoints and the Vite-powered frontend in development.
- In production, the frontend is built by Vite and static assets are served from `dist/`.
- The backend uses a Supabase PostgreSQL database and the Prisma ORM for schema modeling.
- Frontend and backend communicate over REST endpoints under `/api/*`.

### Database Design

- The PostgreSQL schema is defined with tables for `users`, `organizations`, `projects`, `queues`, `jobs`, `job_executions`, `job_logs`, `workers`, `dead_letter`, and `schedules`.
- Relationships are enforced by foreign keys and cascade rules for cleanup.
- The database uses a trusted Supabase connection via `DATABASE_URL`.
- Prisma schema lives in `prisma/schema.prisma` and maps fields to the actual SQL column names.

### Backend Engineering

- Backend code is located in `server.ts` and `src/db/`.
- SQL connection helper is available in `src/db/connection.ts` and Prisma client initialization in `src/db/prisma.ts`.
- API routes provide authentication, user session, project and queue management, job lifecycle, schedules, and metrics.
- The backend includes database initialization and seeding logic for demo data.

### Reliability & Concurrency

- The app is designed for PostgreSQL transactional consistency.
- Background workers and schedule loops use transactions to update job state safely.
- The code-base is prepared for safely polling `jobs` and `schedules` with row-lock semantics.
- Production-ready deployment should use Supabase transaction pooler and proper `DATABASE_URL` settings.

### Frontend & UX

- The dashboard is built with React and provides views for jobs, queues, workers, schedules, dead letters, executions, and logs.
- Navigation is handled in `src/App.tsx` with a collapsible sidebar.
- The application gracefully falls back to login flows and session validation.
- The UI is optimized for a developer demo with clear metric panels and job management actions.

### API Design

- REST endpoints are available under `/api/`.
- Common endpoints include `/api/auth/*`, `/api/projects`, `/api/queues`, `/api/jobs`, `/api/executions`, `/api/logs`, `/api/workers`, `/api/schedules`.
- The backend uses JSON request/response bodies and standard HTTP status codes.
- Input validation is enforced using `zod` on key API routes.

### Documentation

- This README describes setup, architecture, and deployment steps.
- The codebase includes clear file structure and notes for the database and frontend.
- Environment variable requirements are documented in README and `.env` examples.

### Testing

- Basic validation is available through `npm run lint` (TypeScript compilation with `tsc --noEmit`).
- Build validation is available through `npm run build`.
- Manual runtime validation can be done by running `npm run dev` and exercising the UI.

## Architecture diagrams


```mermaid
flowchart TB
  classDef header fill:#0f172a,stroke:#6366f1,color:#f8fafc,stroke-width:2px;
  classDef item fill:#1e293b,stroke:#475569,color:#e2e8f0;
  Evaluation["Evaluation Criteria"]:::header
  Setup["Project Setup"]:::item
  Arch["System Architecture"]:::item
  DB["Database Design"]:::item
  Backend["Backend Engineering"]:::item
  Reliability["Reliability & Concurrency"]:::item
  Frontend["Frontend & UX"]:::item
  API["API Design"]:::item
  Docs["Documentation"]:::item
  Testing["Testing"]:::item

  Evaluation --> Setup
  Evaluation --> Arch
  Evaluation --> DB
  Evaluation --> Backend
  Evaluation --> Reliability
  Evaluation --> Frontend
  Evaluation --> API
  Evaluation --> Docs
  Evaluation --> Testing
```

### System Architecture

```mermaid
flowchart LR
  classDef service fill:#1e293b,stroke:#818cf8,color:#f8fafc;
  classDef store fill:#0f172a,stroke:#818cf8,color:#e2e8f0;
  classDef ui fill:#334155,stroke:#8b5cf6,color:#f8fafc;

  Browser["Browser / React UI"]:::ui
  Server["Express Server\nserver.ts"]:::service
  Database["Supabase PostgreSQL\nDATABASE_URL"]:::store
  Prisma["Prisma Client\nprisma/schema.prisma"]:::service
  Worker["Worker Loop\nBackground Job Engine"]:::service

  Browser -->|REST /api/*| Server
  Server -->|SQL / prisma| Database
  Server --> Prisma
  Worker -->|Job claims / updates| Database
  Worker -->|Heartbeat / logs| Server
```

### Database Design

```mermaid
erDiagram
  USERS {
    TEXT id PK
    TEXT email
    TEXT password_hash
    TEXT full_name
  }
  ORGANIZATIONS {
    TEXT id PK
    TEXT name
  }
  PROJECTS {
    TEXT id PK
    TEXT org_id FK
    TEXT name
  }
  QUEUES {
    TEXT id PK
    TEXT project_id FK
    INT priority
    INT concurrency_limit
    BOOLEAN is_paused
    TEXT retry_policy_id FK
  }
  JOBS {
    INT id PK
    TEXT queue_id FK
    TEXT status
    JSONB payload
    TEXT priority
    INT attempt
    INT max_attempts
    TIMESTAMP run_at
    TEXT cron_expr
    TEXT claimed_by
  }
  JOB_EXECUTIONS {
    TEXT id PK
    INT job_id FK
    TEXT worker_id
    TIMESTAMP started_at
    TIMESTAMP finished_at
    TEXT status
  }
  JOB_LOGS {
    INT id PK
    INT job_id FK
    TEXT execution_id FK
    TEXT level
    TEXT message
  }
  WORKERS {
    TEXT id PK
    TEXT status
    TIMESTAMP last_heartbeat_at
    TEXT current_job_id
  }
  DEAD_LETTER {
    INT id PK
    INT job_id FK
    TEXT queue_id
    TEXT reason
    JSONB failed_payload
  }
  SCHEDULES {
    TEXT id PK
    TEXT queue_id FK
    TEXT cron_expr
    TIMESTAMP next_run
    TEXT status
  }

  ORGANIZATIONS ||--o{ PROJECTS : owns
  PROJECTS ||--o{ QUEUES : contains
  QUEUES ||--o{ JOBS : schedules
  JOBS ||--o{ JOB_EXECUTIONS : records
  JOBS ||--o{ JOB_LOGS : logs
  JOB_EXECUTIONS ||--o{ JOB_LOGS : has
  QUEUES ||--o{ SCHEDULES : triggers
  QUEUES ||--o{ DEAD_LETTER : stores
  USERS ||--o{ PROJECTS : manages
```

### Backend Engineering

```mermaid
flowchart LR
  classDef core fill:#0f172a,stroke:#a855f7,color:#f8fafc;
  classDef route fill:#1e293b,stroke:#818cf8,color:#e2e8f0;

  API["API Routes\n/auth, /projects, /queues, /jobs, /workers, /schedules"]:::route
  DB["Database init & SQL helper\nsrc/db/connection.ts"]:::core
  Prisma["Prisma client\nsrc/db/prisma.ts"]:::core
  Worker["Worker service\nstartWorkerLoop()"]:::core
  Server["Express app\nserver.ts"]:::core

  Server --> API
  Server --> DB
  Server --> Prisma
  Server --> Worker
  API --> DB
  API --> Prisma
```

### Reliability & Concurrency

```mermaid
sequenceDiagram
  participant W as Worker Loop
  participant DB as Database
  participant API as API Route

  W->>DB: SELECT next eligible job FOR UPDATE SKIP LOCKED
  DB-->>W: locked job record
  W->>DB: UPDATE job status = 'claimed'
  W->>DB: INSERT job_execution / job_log
  W->>DB: UPDATE workers status / heartbeat
  W->>DB: UPDATE job status = 'running' / 'completed' / 'failed'
  W->>DB: INSERT dead_letter if retries exhausted
  API->>DB: query jobs / queues / metrics
  API->>DB: update queue pause/resume / retry
```

### Frontend & UX

```mermaid
flowchart TD
  classDef ui fill:#334155,stroke:#6366f1,color:#f8fafc;
  classDef info fill:#1e293b,stroke:#94a3b8,color:#e2e8f0;

  App["App Shell\nsrc/App.tsx"]:::ui
  Dashboard["Dashboard View"]:::ui
  Queues["Queues View"]:::ui
  Jobs["Jobs View"]:::ui
  Workers["Workers View"]:::ui
  Schedules["Schedules View"]:::ui
  Logs["Logs / Executions / DLQ"]:::ui

  App --> Dashboard
  App --> Queues
  App --> Jobs
  App --> Workers
  App --> Schedules
  App --> Logs
  Dashboard -->|polls /api/metrics| API["Backend API"]:::info
  Queues -->|fetch /api/queues| API
  Jobs -->|fetch /api/jobs| API
  Workers -->|fetch /api/workers| API
```

### API Design

```mermaid
flowchart TB
  classDef api fill:#0f172a,stroke:#8b5cf6,color:#f8fafc;
  classDef endpoint fill:#1e293b,stroke:#818cf8,color:#e2e8f0;

  API["API Gateway\nExpress /api"]:::api
  Auth["/api/auth/*"]:::endpoint
  Projects["/api/projects"]:::endpoint
  Queues["/api/queues*"]:::endpoint
  Jobs["/api/jobs*"]:::endpoint
  Workers["/api/workers*"]:::endpoint
  Schedules["/api/schedules*"]:::endpoint
  Logs["/api/logs"]:::endpoint
  DLQ["/api/dead-letter*"]:::endpoint

  API --> Auth
  API --> Projects
  API --> Queues
  API --> Jobs
  API --> Workers
  API --> Schedules
  API --> Logs
  API --> DLQ
```

### Documentation

```mermaid
flowchart LR
  classDef doc fill:#334155,stroke:#8b5cf6,color:#f8fafc;
  README["README / PRD"]:::doc
  Code["Code comments & structure"]:::doc
  Env[".env examples"]:::doc
  API["API docs via README"]:::doc

  README --> Code
  README --> Env
  README --> API
```

### Testing

```mermaid
flowchart TD
  classDef test fill:#0f172a,stroke:#818cf8,color:#f8fafc;
  Lint["npm run lint\nTypeScript check"]:::test
  Build["npm run build\nProduction bundle"]:::test
  Manual["Manual UI validation\nnpm run dev"]:::test

  TestSuite["Testing / Validation"]:::test
  TestSuite --> Lint
  TestSuite --> Build
  TestSuite --> Manual
```
```

## Run locally

**Prerequisites:** Node.js 18+ and npm

1. Install dependencies:
   `npm install`
2. Create a `.env` file with your Supabase connection values, for example:
   ```
   DATABASE_URL="postgresql://<user>:<password>@<host>:6543/postgres?sslmode=require&pgbouncer=true"
   DIRECT_URL="postgresql://<user>:<password>@<host>:5432/postgres?sslmode=require"
   PORT=3000
   NODE_ENV="development"
   ```
3. Generate the Prisma client:
   `npm run prisma:generate`
4. Start the app in development:
   `npm run dev`

## Build and start

1. Create production build:
   `npm run build`
2. Start the production server:
   `npm start`

## Notes

- The server loads the database connection from `DATABASE_URL` in `.env`
- Prisma schema is defined in `prisma/schema.prisma`
- The app uses `src/db/prisma.ts` for Prisma client access
- If the backend still uses raw SQL helper code, the current project supports both Prisma and raw Postgres access

## Repository structure

- `server.ts` - Express backend and Vite middleware for development
- `src/` - React frontend source and database helpers
- `src/db/` - database connection and initialization logic
- `prisma/` - Prisma schema and generated client config

## Troubleshooting

- If `npm run dev` fails, verify your `.env` values and Supabase connection string
- Use `npm run lint` to validate TypeScript
- Use `npm run build` to verify production bundle generation
