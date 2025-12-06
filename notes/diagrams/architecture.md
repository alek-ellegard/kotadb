# KotaDB Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            KotaDB System Architecture                        │
│                    Code Intelligence API (Bun + TypeScript)                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENTS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │ Claude Code  │   │   REST API   │   │   Web App    │   │   GitHub    │ │
│  │  (MCP SDK)   │   │   Clients    │   │  (Frontend)  │   │  Webhooks   │ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬──────┘ │
│         │                  │                   │                   │         │
└─────────┼──────────────────┼───────────────────┼───────────────────┼─────────┘
          │                  │                   │                   │
          │ MCP Protocol     │ Bearer Token      │ JWT Token         │ Signature
          │ (HTTP + SSE)     │ (API Key)         │ (Supabase Auth)   │ (HMAC)
          │                  │                   │                   │
┌─────────┼──────────────────┼───────────────────┼───────────────────┼─────────┐
│         │                  │                   │                   │         │
│         ▼                  ▼                   ▼                   ▼         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      EXPRESS HTTP SERVER                             │   │
│  │                      (Bun Runtime - Port 3000)                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MIDDLEWARE PIPELINE                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  1. Request Logging → 2. CORS → 3. Auth Middleware → 4. Body Parse  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│                                     ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        ROUTE HANDLERS                                │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                       │   │
│  │  Public Routes:                                                       │   │
│  │  • GET  /health              - Health check + queue metrics          │   │
│  │  • POST /webhooks/github     - GitHub push events (sig verified)     │   │
│  │  • POST /webhooks/stripe     - Stripe subscription events            │   │
│  │                                                                       │   │
│  │  Authenticated Routes (API Key or JWT):                              │   │
│  │  • POST /index               - Queue repository indexing             │   │
│  │  • GET  /jobs/:id            - Get job status                        │   │
│  │  • GET  /search              - Search indexed code                   │   │
│  │  • GET  /files/recent        - List recent files                     │   │
│  │  • POST /mcp                 - MCP protocol endpoint                 │   │
│  │  • POST /validate-output     - Validate command output               │   │
│  │                                                                       │   │
│  │  JWT-Only Routes:                                                     │   │
│  │  • POST /api/keys/generate   - Generate API key                      │   │
│  │  • GET  /api/keys/current    - Get key metadata                      │   │
│  │  • POST /api/keys/reset      - Reset API key                         │   │
│  │  • DELETE /api/keys/current  - Revoke API key                        │   │
│  │                                                                       │   │
│  │  Project Management:                                                  │   │
│  │  • POST /api/projects        - Create project                        │   │
│  │  • GET  /api/projects        - List projects                         │   │
│  │  • GET  /api/projects/:id    - Get project details                   │   │
│  │  • PATCH /api/projects/:id   - Update project                        │   │
│  │  • DELETE /api/projects/:id  - Delete project                        │   │
│  │                                                                       │   │
│  │  Admin Routes (Service Role Key):                                    │   │
│  │  • GET  /admin/jobs/failed   - List failed jobs                      │   │
│  │  • POST /admin/jobs/:id/retry - Retry failed job                     │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Core Modules Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE APPLICATION MODULES                           │
│                           (app/src/* via @aliases)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐  │
│  │   @auth/*         │  │   @api/*          │  │   @mcp/*              │  │
│  │ Authentication    │  │   Queries         │  │   MCP Server          │  │
│  ├───────────────────┤  ├───────────────────┤  ├───────────────────────┤  │
│  │ • middleware.ts   │  │ • queries.ts      │  │ • server.ts           │  │
│  │ • validator.ts    │  │ • projects.ts     │  │ • tools/              │  │
│  │ • keys.ts         │  │ • webhooks.ts     │  │   - search.ts         │  │
│  │ • rate-limit.ts   │  │ • auto-reindex.ts │  │   - index.ts          │  │
│  │ • context.ts      │  │ • stripe.ts       │  │   - list-files.ts     │  │
│  │ • cache.ts        │  │                   │  │   - dependencies.ts   │  │
│  └─────────┬─────────┘  └─────────┬─────────┘  └──────────┬────────────┘  │
│            │                      │                        │                │
│            └──────────────────────┴────────────────────────┘                │
│                                   │                                         │
│  ┌────────────────────────────────┼────────────────────────────────────┐  │
│  │                                ▼                                     │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │  │
│  │  │   @indexer/*     │  │   @queue/*       │  │  @validation/*   │  │  │
│  │  │   Code Parsing   │  │   Job Queue      │  │  Schema Validate │  │  │
│  │  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤  │  │
│  │  │ • repos.ts       │  │ • client.ts      │  │ • schemas.ts     │  │  │
│  │  │ • parsers.ts     │  │ • config.ts      │  │ • common-*.ts    │  │  │
│  │  │ • extractors.ts  │  │ • types.ts       │  │                  │  │  │
│  │  │ • ast-parser.ts  │  │ • workers/       │  │                  │  │  │
│  │  │ • storage.ts     │  │   - index-repo.ts│  │                  │  │  │
│  │  │ • dependency-*.ts│  │ • job-tracker.ts │  │                  │  │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐  │
│  │   @db/*           │  │   @logging/*      │  │   @shared/types       │  │
│  │   Database        │  │   Logging         │  │   Shared Types        │  │
│  ├───────────────────┤  ├───────────────────┤  ├───────────────────────┤  │
│  │ • client.ts       │  │ • logger.ts       │  │ • index.ts            │  │
│  │ • migrations/     │  │ • middleware.ts   │  │ • auth.ts             │  │
│  │                   │  │                   │  │ • entities.ts         │  │
│  │                   │  │                   │  │ • validation.ts       │  │
│  └─────────┬─────────┘  └───────────────────┘  └───────────────────────┘  │
│            │                                                                │
└────────────┼────────────────────────────────────────────────────────────────┘
             │
             ▼
```

## Database & Queue Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PERSISTENCE & QUEUE LAYER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      SUPABASE (PostgreSQL + Auth)                      │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │                                                                         │ │
│  │  Schema: public                                                         │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │ │
│  │  │ api_keys       │  │ organizations  │  │ user_organizations     │  │ │
│  │  ├────────────────┤  ├────────────────┤  ├────────────────────────┤  │ │
│  │  │ • user_id      │  │ • owner_id     │  │ • user_id              │  │ │
│  │  │ • key_id       │  │ • name         │  │ • org_id               │  │ │
│  │  │ • secret_hash  │  │ • slug         │  │ • role (owner/admin)   │  │ │
│  │  │ • tier         │  │                │  │                        │  │ │
│  │  │ • rate_limit   │  │                │  │                        │  │ │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘  │ │
│  │                                                                         │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │ │
│  │  │ repositories   │  │ index_jobs     │  │ indexed_files          │  │ │
│  │  ├────────────────┤  ├────────────────┤  ├────────────────────────┤  │ │
│  │  │ • name         │  │ • repository_id│  │ • repository_id        │  │ │
│  │  │ • url          │  │ • status       │  │ • file_path            │  │ │
│  │  │ • user_id      │  │ • commit_sha   │  │ • content (full-text)  │  │ │
│  │  │ • org_id       │  │ • metadata     │  │ • language             │  │ │
│  │  │ • clone_url    │  │ • error        │  │ • indexed_at           │  │ │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘  │ │
│  │                                                                         │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │ │
│  │  │ symbols        │  │ references     │  │ dependencies           │  │ │
│  │  ├────────────────┤  ├────────────────┤  ├────────────────────────┤  │ │
│  │  │ • file_id      │  │ • file_id      │  │ • source_file_id       │  │ │
│  │  │ • name         │  │ • symbol_id    │  │ • target_file_id       │  │ │
│  │  │ • kind         │  │ • location     │  │ • import_type          │  │ │
│  │  │ • location     │  │                │  │ • dependency_path      │  │ │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘  │ │
│  │                                                                         │ │
│  │  ┌────────────────┐  ┌────────────────┐                               │ │
│  │  │ projects       │  │ project_repos  │  RLS Policies Enabled         │ │
│  │  ├────────────────┤  ├────────────────┤  • User-scoped isolation      │ │
│  │  │ • name         │  │ • project_id   │  • Org-scoped sharing         │ │
│  │  │ • user_id      │  │ • repository_id│  • Auth via app.user_id       │ │
│  │  └────────────────┘  └────────────────┘                               │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        PG-BOSS JOB QUEUE                               │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  Schema: pgboss                                                        │ │
│  │  ┌────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Queue: index-repo                                              │  │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐  │  │ │
│  │  │  │  Job Lifecycle:                                           │  │  │ │
│  │  │  │  created → active → completed/failed                      │  │  │ │
│  │  │  │                                                            │  │  │ │
│  │  │  │  Retry Policy:                                            │  │  │ │
│  │  │  │  • Max retries: 3                                         │  │  │ │
│  │  │  │  • Backoff: 60s, 120s, 180s (exponential)                │  │  │ │
│  │  │  │  • Archive after: 1 hour                                  │  │  │ │
│  │  │  │  • Expire after: 24 hours                                 │  │  │ │
│  │  │  │                                                            │  │  │ │
│  │  │  │  Workers:                                                  │  │  │ │
│  │  │  │  • Concurrency: 3 workers                                 │  │  │ │
│  │  │  │  • Handler: startIndexWorker()                            │  │  │ │
│  │  │  └──────────────────────────────────────────────────────────┘  │  │ │
│  │  └────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Autonomous Development Workflows (ADW)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS DEVELOPMENT WORKFLOW (ADW)                     │
│                         Python Agents (automation/)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  3-Phase Architecture (Simplified from 5-phase in PR #136)                  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PHASE 1: PLAN                                                         │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │  adw_phases/adw_plan.py                                           │ │ │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │ │ │
│  │  │  │ Classify Issue │→ │ Generate Branch│→ │ Create Plan File   │ │ │ │
│  │  │  │ (feat/bug/etc) │  │ (conventional) │  │ (/workflows:plan)  │ │ │ │
│  │  │  └────────────────┘  └────────────────┘  └────────────────────┘ │ │ │
│  │  │                                                                   │ │ │
│  │  │  Atomic Agents:                                                   │ │ │
│  │  │  • agent_classify_issue.py - Determine issue type                │ │ │
│  │  │  • agent_generate_branch.py - Create branch name                 │ │ │
│  │  │  • agent_create_plan.py - Generate implementation plan           │ │ │
│  │  │  • agent_commit_plan.py - Commit plan to git                     │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                     │                                        │
│                                     ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PHASE 2: BUILD                                                        │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │  adw_phases/adw_build.py                                          │ │ │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │ │ │
│  │  │  │ Implement Plan │→ │ Commit Code    │→ │ Push & Create PR   │ │ │ │
│  │  │  │ (/workflows:   │  │ (conventional) │  │ (gh pr create)     │ │ │ │
│  │  │  │  implement)    │  │                │  │                    │ │ │ │
│  │  │  └────────────────┘  └────────────────┘  └────────────────────┘ │ │ │
│  │  │                                                                   │ │ │
│  │  │  Atomic Agents:                                                   │ │ │
│  │  │  • agent_implement_plan.py - Execute implementation               │ │ │
│  │  │  • agent_commit_implementation.py - Create commit                 │ │ │
│  │  │  • agent_push_branch.py - Push to remote                          │ │ │
│  │  │  • agent_create_pr.py - Create pull request                       │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                     │                                        │
│                                     ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PHASE 3: REVIEW                                                       │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │  adw_phases/adw_review.py                                         │ │ │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │ │ │
│  │  │  │ Code Review    │→ │ Report Findings│→ │ Block if Issues    │ │ │ │
│  │  │  │ (/tools:       │  │ (summary)      │  │ (unresolved)       │ │ │ │
│  │  │  │  pr-review)    │  │                │  │                    │ │ │ │
│  │  │  └────────────────┘  └────────────────┘  └────────────────────┘ │ │ │
│  │  │                                                                   │ │ │
│  │  │  Atomic Agents:                                                   │ │ │
│  │  │  • agent_review_code.py - Execute code review                     │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  ORCHESTRATION                                                         │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │  adw_sdlc.py - Full SDLC orchestrator                             │ │ │
│  │  │  Chains: adw_plan.py → adw_build.py → adw_review.py              │ │ │
│  │  │  State: agents/<adw_id>/adw_state.json                            │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                         │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │  adw_modules/orchestrators.py                                     │ │ │
│  │  │  • run_sequence() - Sequential phase execution                    │ │ │
│  │  │  • run_parallel() - Concurrent agent execution                    │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TECHNOLOGY STACK                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Runtime & Language                                                          │
│  ├─ Bun 1.1+           - JavaScript runtime (backend)                        │
│  ├─ TypeScript         - Type-safe application code                          │
│  └─ Python 3.11+       - ADW automation agents                               │
│                                                                              │
│  Backend Framework                                                           │
│  ├─ Express.js         - HTTP server & routing                               │
│  ├─ Supabase JS Client - Database & auth client                              │
│  └─ pg-boss            - PostgreSQL-backed job queue                         │
│                                                                              │
│  Database & Storage                                                          │
│  ├─ PostgreSQL 15      - Primary database (via Supabase)                     │
│  ├─ Row Level Security - Multi-tenant isolation                              │
│  └─ pgboss schema      - Job queue tables                                    │
│                                                                              │
│  Authentication & Security                                                   │
│  ├─ Supabase Auth      - JWT token validation                                │
│  ├─ API Keys           - bcrypt hashed keys                                  │
│  ├─ Rate Limiting      - Sliding window (100/1k/10k req/hr)                  │
│  └─ HMAC Signatures    - Webhook verification                                │
│                                                                              │
│  Code Analysis                                                               │
│  ├─ TypeScript AST     - Code parsing & symbol extraction                    │
│  ├─ Dependency Graph   - Import/export tracking                              │
│  └─ Full-Text Search   - PostgreSQL tsvector indexes                         │
│                                                                              │
│  Protocols & APIs                                                            │
│  ├─ MCP (Model Context Protocol) - Claude Code integration                   │
│  ├─ REST API           - Standard HTTP endpoints                             │
│  ├─ GitHub Webhooks    - Push event automation                               │
│  └─ Stripe Webhooks    - Subscription billing (optional)                     │
│                                                                              │
│  Development Tools                                                           │
│  ├─ uv                 - Python package manager                              │
│  ├─ Supabase CLI       - Database migrations                                 │
│  ├─ gh CLI             - GitHub automation                                   │
│  └─ Docker Compose     - Local Supabase services                             │
│                                                                              │
│  Testing                                                                     │
│  ├─ Bun Test           - TypeScript test runner                              │
│  ├─ pytest             - Python test framework                               │
│  └─ Antimocking        - Real database connections only                      │
│                                                                              │
│  Monitoring & Logging                                                        │
│  ├─ Sentry             - Error tracking                                      │
│  ├─ Structured Logging - JSON logs via process.stdout                        │
│  └─ Health Checks      - /health endpoint with queue metrics                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Path Aliases Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TYPESCRIPT PATH ALIASES                               │
│                        (app/tsconfig.json)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  @api/*        → app/src/api/*        (HTTP routes, queries, webhooks)      │
│  @auth/*       → app/src/auth/*       (Auth middleware, rate limits)        │
│  @db/*         → app/src/db/*         (Supabase client, migrations)         │
│  @indexer/*    → app/src/indexer/*    (Code parsing, AST analysis)          │
│  @mcp/*        → app/src/mcp/*        (MCP protocol implementation)         │
│  @queue/*      → app/src/queue/*      (pg-boss job queue)                   │
│  @validation/* → app/src/validation/* (Schema validation with Zod)          │
│  @logging/*    → app/src/logging/*    (Structured logging)                  │
│  @shared/*     → shared/*             (Monorepo shared types)               │
│  @app-types/*  → app/src/types/*      (App-specific types)                  │
│                                                                              │
│  ALWAYS use these aliases instead of relative paths!                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```
