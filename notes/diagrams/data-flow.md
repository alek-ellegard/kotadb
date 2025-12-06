# KotaDB Data Flow Diagrams

## 1. Repository Indexing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REPOSITORY INDEXING WORKFLOW                          │
│                    (Asynchronous Background Processing)                      │
└─────────────────────────────────────────────────────────────────────────────┘

TRIGGER:
  ┌────────────────────┐
  │ User Action        │
  ├────────────────────┤
  │ • POST /index      │   OR   ┌──────────────────────┐
  │   - repository URL │        │ GitHub Webhook       │
  │   - ref (branch)   │        ├──────────────────────┤
  │   - localPath      │        │ POST /webhooks/github│
  └────────┬───────────┘        │ - push event         │
           │                    │ - signature verified │
           │                    └──────────┬───────────┘
           │                               │
           └───────────────┬───────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Request Validation & Repository Lookup                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POST /index Handler (app/src/api/routes.ts)                               │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  1. Authenticate request (API key or JWT)                             │ │
│  │  2. Check rate limit (tier-based: 100/1k/10k per hour)                │ │
│  │  3. Call ensureRepository(supabase, userId, indexRequest)             │ │
│  │     ┌────────────────────────────────────────────────────────────┐   │ │
│  │     │ • Check if repository exists for this user                  │   │ │
│  │     │ • If not found: INSERT into repositories table              │   │ │
│  │     │   - name, url, clone_url, user_id, org_id                   │   │ │
│  │     │ • Return repository_id                                       │   │ │
│  │     └────────────────────────────────────────────────────────────┘   │ │
│  │  4. Create index job: createIndexJob(repositoryId, ref, ...)          │ │
│  │     ┌────────────────────────────────────────────────────────────┐   │ │
│  │     │ • INSERT into index_jobs table                              │   │ │
│  │     │   - repository_id, ref, status='pending'                    │   │ │
│  │     │   - user_id (for RLS)                                        │   │ │
│  │     │ • Return job.id                                              │   │ │
│  │     └────────────────────────────────────────────────────────────┘   │ │
│  │  5. Enqueue to pg-boss: queue.send(QUEUE_NAMES.INDEX_REPO, payload)  │ │
│  │  6. Return 202 Accepted { jobId, status: "pending" }                  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Job Queue (pg-boss)                                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Queue: "index-repo"                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Job Payload:                                                          │ │
│  │  {                                                                     │ │
│  │    indexJobId: "uuid",      // References index_jobs.id               │ │
│  │    repositoryId: "uuid",    // References repositories.id             │ │
│  │    commitSha: "main"        // Git ref to checkout                    │ │
│  │  }                                                                     │ │
│  │                                                                         │ │
│  │  Job State: created → active → completed/failed                        │ │
│  │  Retry Policy: 3 retries, backoff [60s, 120s, 180s]                   │ │
│  │  Concurrency: 3 workers                                                │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Worker Execution (app/src/queue/workers/index-repo.ts)            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  startIndexWorker(queue)                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  queue.work(QUEUE_NAMES.INDEX_REPO, async (job) => {                  │ │
│  │                                                                         │ │
│  │    1. Extract payload: { indexJobId, repositoryId, commitSha }        │ │
│  │                                                                         │ │
│  │    2. Update job status: updateJobStatus(jobId, 'in_progress')        │ │
│  │       ┌─────────────────────────────────────────────────────────┐    │ │
│  │       │ UPDATE index_jobs SET status = 'in_progress'            │    │ │
│  │       │ WHERE id = indexJobId                                    │    │ │
│  │       └─────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  │    3. Run indexing workflow: runIndexingWorkflow(...)                 │ │
│  │       ┌─────────────────────────────────────────────────────────┐    │ │
│  │       │ See "Indexing Workflow Detail" below                     │    │ │
│  │       └─────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  │    4. Update job status: updateJobStatus(jobId, 'completed', {        │ │
│  │         filesProcessed, symbolsExtracted                               │ │
│  │       })                                                                │ │
│  │       ┌─────────────────────────────────────────────────────────┐    │ │
│  │       │ UPDATE index_jobs SET                                    │    │ │
│  │       │   status = 'completed',                                  │    │ │
│  │       │   completed_at = now(),                                  │    │ │
│  │       │   metadata = { filesProcessed: N, symbolsExtracted: M }  │    │ │
│  │       │ WHERE id = indexJobId                                    │    │ │
│  │       └─────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  │    5. Return success result                                            │ │
│  │  })                                                                     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ INDEXING WORKFLOW DETAIL (app/src/api/queries.ts)                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  runIndexingWorkflow(supabase, repositoryId, userId, indexRequest)         │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 1: Repository Clone/Update                                      │ │
│  │ ┌────────────────────────────────────────────────────────────────┐   │ │
│  │ │ cloneOrUpdateRepository(indexRequest) [@indexer/repos.ts]      │   │ │
│  │ │                                                                 │   │ │
│  │ │ IF localPath:                                                   │   │ │
│  │ │   ├─ Use existing local directory                              │   │ │
│  │ │   └─ workspacePath = indexRequest.localPath                    │   │ │
│  │ │                                                                 │   │ │
│  │ │ ELSE (remote repository):                                       │   │ │
│  │ │   ├─ workspacePath = data/workspace/<repo-name>                │   │ │
│  │ │   ├─ IF directory exists:                                       │   │ │
│  │ │   │   ├─ git fetch origin                                       │   │ │
│  │ │   │   └─ git checkout <ref>                                     │   │ │
│  │ │   └─ ELSE:                                                      │   │ │
│  │ │       └─ git clone <url> <workspacePath>                        │   │ │
│  │ │                                                                 │   │ │
│  │ │ Return: { workspacePath, commitSha }                            │   │ │
│  │ └────────────────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 2: File Discovery & Parsing                                     │ │
│  │ ┌────────────────────────────────────────────────────────────────┐   │ │
│  │ │ parseRepository(workspacePath) [@indexer/parsers.ts]           │   │ │
│  │ │                                                                 │   │ │
│  │ │ 1. Walk directory tree (recursive)                             │   │ │
│  │ │    ├─ Ignore: .git, node_modules, dist, build, coverage        │   │ │
│  │ │    └─ Filter: .ts, .tsx, .js, .jsx, .cjs, .mjs, .json         │   │ │
│  │ │                                                                 │   │ │
│  │ │ 2. For each file:                                               │   │ │
│  │ │    ├─ Read file content                                         │   │ │
│  │ │    ├─ Detect language (TypeScript, JavaScript, JSON)           │   │ │
│  │ │    ├─ Parse AST (TypeScript compiler API)                      │   │ │
│  │ │    │   └─ Extract imports, exports, symbols                    │   │ │
│  │ │    └─ Store in memory: ParsedFile[]                            │   │ │
│  │ │                                                                 │   │ │
│  │ │ Return: ParsedFile[] (content + metadata)                       │   │ │
│  │ └────────────────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 3: Database Storage (Bulk Insert)                               │ │
│  │ ┌────────────────────────────────────────────────────────────────┐   │ │
│  │ │ storeIndexedData(supabase, files, repositoryId)                │   │ │
│  │ │                [@db/migrations/.../store_indexed_data.sql]     │   │ │
│  │ │                                                                 │   │ │
│  │ │ Single SQL function call (atomic transaction):                  │   │ │
│  │ │                                                                 │   │ │
│  │ │ 1. Delete old data:                                             │   │ │
│  │ │    ├─ DELETE FROM dependencies WHERE source_file_id IN (...)   │   │ │
│  │ │    ├─ DELETE FROM references WHERE file_id IN (...)            │   │ │
│  │ │    ├─ DELETE FROM symbols WHERE file_id IN (...)               │   │ │
│  │ │    └─ DELETE FROM indexed_files WHERE repository_id = ?        │   │ │
│  │ │                                                                 │   │ │
│  │ │ 2. Insert new data:                                             │   │ │
│  │ │    ┌───────────────────────────────────────────────────────┐  │   │ │
│  │ │    │ INSERT INTO indexed_files (                            │  │   │ │
│  │ │    │   repository_id, file_path, content, language,         │  │   │ │
│  │ │    │   size_bytes, user_id, indexed_at                      │  │   │ │
│  │ │    │ ) VALUES (...)                                          │  │   │ │
│  │ │    │ RETURNING id AS file_id                                 │  │   │ │
│  │ │    └───────────────────────────────────────────────────────┘  │   │ │
│  │ │                                                                 │   │ │
│  │ │    ┌───────────────────────────────────────────────────────┐  │   │ │
│  │ │    │ INSERT INTO symbols (                                  │  │   │ │
│  │ │    │   file_id, name, kind, location,                       │  │   │ │
│  │ │    │   user_id, repository_id                               │  │   │ │
│  │ │    │ ) VALUES (...)                                          │  │   │ │
│  │ │    │                                                          │  │   │ │
│  │ │    │ Kind: function, class, interface, variable, type, etc. │  │   │ │
│  │ │    └───────────────────────────────────────────────────────┘  │   │ │
│  │ │                                                                 │   │ │
│  │ │    ┌───────────────────────────────────────────────────────┐  │   │ │
│  │ │    │ INSERT INTO references (                               │  │   │ │
│  │ │    │   file_id, symbol_id, location,                        │  │   │ │
│  │ │    │   user_id, repository_id                               │  │   │ │
│  │ │    │ ) VALUES (...)                                          │  │   │ │
│  │ │    └───────────────────────────────────────────────────────┘  │   │ │
│  │ │                                                                 │   │ │
│  │ │    ┌───────────────────────────────────────────────────────┐  │   │ │
│  │ │    │ INSERT INTO dependencies (                             │  │   │ │
│  │ │    │   source_file_id, target_file_id,                      │  │   │ │
│  │ │    │   import_type, dependency_path,                        │  │   │ │
│  │ │    │   user_id, repository_id                               │  │   │ │
│  │ │    │ ) VALUES (...)                                          │  │   │ │
│  │ │    │                                                          │  │   │ │
│  │ │    │ import_type: import, require, dynamic                  │  │   │ │
│  │ │    └───────────────────────────────────────────────────────┘  │   │ │
│  │ │                                                                 │   │ │
│  │ │ 3. Return summary: { filesProcessed, symbolsExtracted }        │   │ │
│  │ └────────────────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘

USER POLLING:
  GET /jobs/:jobId
  ┌────────────────────────────────────────────────┐
  │ Response:                                       │
  │ {                                               │
  │   id: "uuid",                                   │
  │   status: "pending|in_progress|completed|failed"│
  │   metadata: {                                   │
  │     filesProcessed: 42,                         │
  │     symbolsExtracted: 156                       │
  │   },                                            │
  │   error: null | "error message"                 │
  │ }                                               │
  └────────────────────────────────────────────────┘
```

## 2. Code Search Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CODE SEARCH WORKFLOW                                │
│                      (Real-time Query with PostgreSQL)                       │
└─────────────────────────────────────────────────────────────────────────────┘

REQUEST:
  GET /search?term=<query>&repository=<id>&project_id=<id>&limit=<n>
  Headers: Authorization: Bearer <api-key>

           │
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Authentication & Rate Limiting                                     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  authenticateRequest(request) [@auth/middleware.ts]                         │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  1. Extract Bearer token from Authorization header                    │ │
│  │  2. Validate API key or JWT:                                           │ │
│  │     ┌────────────────────────────────────────────────────────────┐   │ │
│  │     │ SELECT user_id, tier, rate_limit_per_hour                  │   │ │
│  │     │ FROM api_keys                                               │   │ │
│  │     │ WHERE key_id = ? AND enabled = true                         │   │ │
│  │     │ AND revoked_at IS NULL                                      │   │ │
│  │     │                                                              │   │ │
│  │     │ OR verify JWT with Supabase Auth                            │   │ │
│  │     └────────────────────────────────────────────────────────────┘   │ │
│  │  3. Check rate limit:                                                  │ │
│  │     ┌────────────────────────────────────────────────────────────┐   │ │
│  │     │ enforceRateLimit(userId, tier) [@auth/rate-limit.ts]       │   │ │
│  │     │                                                              │   │ │
│  │     │ • Count requests in last hour (sliding window)              │   │ │
│  │     │ • Compare to tier limit: free=100, solo=1000, team=10000   │   │ │
│  │     │ • Return { allowed, remaining, resetAt }                    │   │ │
│  │     └────────────────────────────────────────────────────────────┘   │ │
│  │  4. Return AuthContext { userId, tier, rateLimit }                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Full-Text Search Query                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  searchFiles(supabase, term, userId, options) [@api/queries.ts]            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Build PostgreSQL query with filters:                                 │ │
│  │                                                                         │ │
│  │  SELECT                                                                 │ │
│  │    f.id,                                                                │ │
│  │    f.file_path,                                                         │ │
│  │    f.content,                                                           │ │
│  │    f.language,                                                          │ │
│  │    f.indexed_at,                                                        │ │
│  │    r.name AS repository_name,                                           │ │
│  │    ts_rank(to_tsvector('english', f.content), query) AS rank           │ │
│  │  FROM indexed_files f                                                   │ │
│  │  JOIN repositories r ON f.repository_id = r.id                          │ │
│  │  WHERE                                                                   │ │
│  │    to_tsvector('english', f.content) @@ plainto_tsquery('english', ?)  │ │
│  │    AND f.user_id = ?                       -- RLS user isolation       │ │
│  │    AND (? IS NULL OR f.repository_id = ?)  -- Optional repo filter     │ │
│  │    AND (? IS NULL OR r.id IN (             -- Optional project filter  │ │
│  │      SELECT repository_id FROM project_repositories                     │ │
│  │      WHERE project_id = ?                                               │ │
│  │    ))                                                                    │ │
│  │  ORDER BY rank DESC, f.indexed_at DESC                                  │ │
│  │  LIMIT ?                                                                 │ │
│  │                                                                         │ │
│  │  Index Used: idx_indexed_files_content_fts (GIN on to_tsvector)        │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Snippet Generation                                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  buildSnippet(content, term) [@indexer/extractors.ts]                      │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  1. Find first occurrence of search term in content                   │ │
│  │  2. Extract surrounding context (3 lines before/after)                │ │
│  │  3. Highlight term with markers                                        │ │
│  │  4. Truncate to ~200 characters                                        │ │
│  │  5. Return snippet with line numbers                                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
RESPONSE:
  {
    results: [
      {
        id: "uuid",
        file_path: "src/api/routes.ts",
        repository_name: "kotadb",
        language: "typescript",
        snippet: "...export function createExpressApp(supabase) {...",
        indexed_at: "2024-12-06T12:00:00Z"
      },
      ...
    ]
  }
  Headers:
    X-RateLimit-Limit: 100
    X-RateLimit-Remaining: 95
    X-RateLimit-Reset: 1733500800
```

## 3. MCP Protocol Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MCP (Model Context Protocol) FLOW                       │
│                         Claude Code Integration                              │
└─────────────────────────────────────────────────────────────────────────────┘

CLIENT (Claude Code):
  POST /mcp
  Headers:
    Authorization: Bearer <api-key>
    Accept: application/json, text/event-stream    # REQUIRED: Both types
    Content-Type: application/json

  Body (JSON-RPC 2.0):
  {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {
        "term": "createExpressApp",
        "repository": "kotadb",
        "limit": 10
      }
    },
    "id": 1
  }

           │
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: MCP Server Initialization (Per-Request)                           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POST /mcp Handler [@api/routes.ts]                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  1. Authenticate request (sets authContext)                            │ │
│  │  2. Validate Accept header (must include json + event-stream)         │ │
│  │  3. Create per-request MCP server:                                     │ │
│  │     ┌────────────────────────────────────────────────────────────┐   │ │
│  │     │ createMcpServer({ supabase, userId }) [@mcp/server.ts]     │   │ │
│  │     │                                                              │   │ │
│  │     │ • Initialize Server from @modelcontextprotocol/sdk         │   │ │
│  │     │ • Register tool handlers:                                   │   │ │
│  │     │   - search_code                                             │   │ │
│  │     │   - index_repository                                        │   │ │
│  │     │   - list_recent_files                                       │   │ │
│  │     │   - search_dependencies                                     │   │ │
│  │     │ • Attach user context (userId for RLS)                      │   │ │
│  │     └────────────────────────────────────────────────────────────┘   │ │
│  │  4. Create HTTP transport:                                             │ │
│  │     ┌────────────────────────────────────────────────────────────┐   │ │
│  │     │ createMcpTransport() [@mcp/server.ts]                       │   │ │
│  │     │                                                              │   │ │
│  │     │ • Use StreamableHTTPServerTransport from SDK                │   │ │
│  │     │ • Handles JSON-RPC 2.0 protocol                             │   │ │
│  │     │ • Supports SSE for streaming responses                      │   │ │
│  │     └────────────────────────────────────────────────────────────┘   │ │
│  │  5. Connect server to transport:                                       │ │
│  │     server.connect(transport)                                          │ │
│  │  6. Delegate to transport:                                             │ │
│  │     transport.handleRequest(req, res, body)                            │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Tool Execution                                                     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Tool Handler: search_code [@mcp/tools/search.ts]                          │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  server.setRequestHandler(CallToolRequestSchema, async (request) => { │ │
│  │    const { name, arguments } = request.params;                         │ │
│  │                                                                         │ │
│  │    if (name === "search_code") {                                       │ │
│  │      ┌─────────────────────────────────────────────────────────────┐  │ │
│  │      │ 1. Validate arguments (term, repository, limit)             │  │ │
│  │      │ 2. Call searchFiles(supabase, term, userId, options)        │  │ │
│  │      │    └─ Same PostgreSQL full-text search as REST API          │  │ │
│  │      │ 3. Format results as MCP Content[]                          │  │ │
│  │      │    ┌──────────────────────────────────────────────────┐    │  │ │
│  │      │    │ return {                                          │    │  │ │
│  │      │    │   content: [                                      │    │  │ │
│  │      │    │     {                                             │    │  │ │
│  │      │    │       type: "text",                               │    │  │ │
│  │      │    │       text: JSON.stringify({                      │    │  │ │
│  │      │    │         results: [                                │    │  │ │
│  │      │    │           {                                        │    │  │ │
│  │      │    │             file_path: "...",                     │    │  │ │
│  │      │    │             repository_name: "...",               │    │  │ │
│  │      │    │             snippet: "...",                       │    │  │ │
│  │      │    │             language: "typescript"                │    │  │ │
│  │      │    │           }                                        │    │  │ │
│  │      │    │         ]                                          │    │  │ │
│  │      │    │       }, null, 2)                                 │    │  │ │
│  │      │    │     }                                             │    │  │ │
│  │      │    │   ]                                               │    │  │ │
│  │      │    │ }                                                 │    │  │ │
│  │      │    └──────────────────────────────────────────────────┘    │  │ │
│  │      └─────────────────────────────────────────────────────────────┘  │ │
│  │    }                                                                   │ │
│  │  })                                                                     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Other Tool Handlers:                                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ • index_repository [@mcp/tools/index.ts]                              │ │
│  │   └─ Calls POST /index internally                                     │ │
│  │                                                                         │ │
│  │ • list_recent_files [@mcp/tools/list-files.ts]                        │ │
│  │   └─ Queries indexed_files ORDER BY indexed_at DESC                   │ │
│  │                                                                         │ │
│  │ • search_dependencies [@mcp/tools/dependencies.ts]                    │ │
│  │   └─ Queries dependencies table for import/export graph               │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
RESPONSE (JSON-RPC 2.0):
  {
    "jsonrpc": "2.0",
    "result": {
      "content": [
        {
          "type": "text",
          "text": "{\"results\": [{\"file_path\": \"src/api/routes.ts\", ...}]}"
        }
      ]
    },
    "id": 1
  }

  Headers:
    Content-Type: application/json
    X-RateLimit-Limit: 100
    X-RateLimit-Remaining: 94
    X-RateLimit-Reset: 1733500800
```

## 4. Authentication & Authorization Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   AUTHENTICATION & AUTHORIZATION FLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ METHOD 1: API Key Authentication (For API Clients)                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Initial Setup (One-time):                                                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ POST /api/keys/generate                                             │ │
│  │ Headers: Authorization: Bearer <jwt-token-from-supabase-auth>       │ │
│  │                                                                      │ │
│  │ Flow:                                                                │ │
│  │ 1. Verify JWT with Supabase Auth                                    │ │
│  │ 2. Check if user already has API key                                │ │
│  │ 3. If not, generate new key:                                        │ │
│  │    ┌─────────────────────────────────────────────────────────┐    │ │
│  │    │ generateApiKey({ userId, tier, orgId })                 │    │ │
│  │    │                                                          │    │ │
│  │    │ • Generate random key: kota_<24-char-random>            │    │ │
│  │    │ • Generate key_id: first 8 chars                        │    │ │
│  │    │ • Hash secret with bcrypt (cost=10)                     │    │ │
│  │    │ • INSERT into api_keys table                            │    │ │
│  │    │ • Return plain key (ONLY TIME IT'S VISIBLE)             │    │ │
│  │    └─────────────────────────────────────────────────────────┘    │ │
│  │ 4. Return: { apiKey, keyId, tier, rateLimitPerHour }               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  Subsequent Requests:                                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Any API endpoint (e.g., GET /search)                                │ │
│  │ Headers: Authorization: Bearer kota_abc123...                       │ │
│  │                                                                      │ │
│  │ Flow:                                                                │ │
│  │ 1. Extract key from header                                          │ │
│  │ 2. Extract key_id (first 8 chars)                                   │ │
│  │ 3. Lookup key in database (or cache):                               │ │
│  │    ┌─────────────────────────────────────────────────────────┐    │ │
│  │    │ SELECT user_id, secret_hash, tier, rate_limit_per_hour  │    │ │
│  │    │ FROM api_keys                                            │    │ │
│  │    │ WHERE key_id = ? AND enabled = true                      │    │ │
│  │    │ AND revoked_at IS NULL                                   │    │ │
│  │    └─────────────────────────────────────────────────────────┘    │ │
│  │ 4. Verify secret with bcrypt.compare(key, secret_hash)             │ │
│  │ 5. Check rate limit (sliding window)                                │ │
│  │ 6. Return AuthContext { userId, tier, rateLimit }                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ METHOD 2: JWT Authentication (For Web App)                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Login Flow:                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ User logs in via Supabase Auth (email/password, OAuth, etc)        │ │
│  │ ↓                                                                   │ │
│  │ Supabase Auth returns JWT token                                     │ │
│  │ ↓                                                                   │ │
│  │ Client stores token in localStorage/cookie                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  API Request:                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Any API endpoint (e.g., POST /index)                                │ │
│  │ Headers: Authorization: Bearer <jwt-token>                          │ │
│  │                                                                      │ │
│  │ Flow:                                                                │ │
│  │ 1. Extract JWT from header                                          │ │
│  │ 2. Verify with Supabase Auth:                                       │ │
│  │    ┌─────────────────────────────────────────────────────────┐    │ │
│  │    │ const { data: { user }, error } =                       │    │ │
│  │    │   await supabase.auth.getUser(token)                     │    │ │
│  │    │                                                          │    │ │
│  │    │ • Validates signature with Supabase secret               │    │ │
│  │    │ • Checks expiration                                      │    │ │
│  │    │ • Returns user object or error                           │    │ │
│  │    └─────────────────────────────────────────────────────────┘    │ │
│  │ 3. Lookup user's tier (check subscription or API key tier)         │ │
│  │ 4. Check rate limit                                                 │ │
│  │ 5. Return AuthContext { userId: user.id, tier, rateLimit }         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Row Level Security (RLS) Enforcement                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  For every authenticated request:                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Set PostgreSQL session context:                                  │ │
│  │    ┌─────────────────────────────────────────────────────────┐    │ │
│  │    │ SET LOCAL app.user_id = '<user-id>';                    │    │ │
│  │    └─────────────────────────────────────────────────────────┘    │ │
│  │                                                                      │ │
│  │ 2. All subsequent queries automatically filtered by RLS policies:   │ │
│  │    ┌─────────────────────────────────────────────────────────┐    │ │
│  │    │ CREATE POLICY indexed_files_select ON indexed_files      │    │ │
│  │    │ FOR SELECT                                               │    │ │
│  │    │ USING (                                                  │    │ │
│  │    │   user_id = current_setting('app.user_id')::uuid         │    │ │
│  │    │   OR EXISTS (                                            │    │ │
│  │    │     SELECT 1 FROM user_organizations                     │    │ │
│  │    │     WHERE user_id = current_setting('app.user_id')::uuid │    │ │
│  │    │     AND org_id = indexed_files.org_id                    │    │ │
│  │    │   )                                                       │    │ │
│  │    │ );                                                        │    │ │
│  │    └─────────────────────────────────────────────────────────┘    │ │
│  │                                                                      │ │
│  │ 3. User can only access:                                             │ │
│  │    • Their own data (user_id match)                                 │ │
│  │    • Shared organization data (org membership)                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Rate Limiting (Tier-based Sliding Window)                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  enforceRateLimit(userId, tier) [@auth/rate-limit.ts]                    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Determine limit based on tier:                                   │ │
│  │    • free: 100 requests/hour                                        │ │
│  │    • solo: 1,000 requests/hour                                      │ │
│  │    • team: 10,000 requests/hour                                     │ │
│  │                                                                      │ │
│  │ 2. Count requests in last hour (sliding window):                    │ │
│  │    ┌─────────────────────────────────────────────────────────┐    │ │
│  │    │ SELECT COUNT(*) FROM rate_limit_events                   │    │ │
│  │    │ WHERE user_id = ?                                        │    │ │
│  │    │ AND timestamp > NOW() - INTERVAL '1 hour'                │    │ │
│  │    └─────────────────────────────────────────────────────────┘    │ │
│  │                                                                      │ │
│  │ 3. If count < limit:                                                 │ │
│  │    • INSERT new event                                                │ │
│  │    • Return { allowed: true, remaining, resetAt }                   │ │
│  │                                                                      │ │
│  │ 4. If count >= limit:                                                │ │
│  │    • Return { allowed: false, remaining: 0, resetAt }               │ │
│  │    • Handler returns 429 Too Many Requests                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

## 5. GitHub Webhook Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GITHUB WEBHOOK AUTO-INDEXING                         │
└─────────────────────────────────────────────────────────────────────────────┘

GITHUB (Push Event):
  POST /webhooks/github
  Headers:
    X-Hub-Signature-256: sha256=<hmac>
    X-GitHub-Event: push
    X-GitHub-Delivery: <uuid>

  Body:
  {
    "repository": {
      "full_name": "user/repo",
      "clone_url": "https://github.com/user/repo.git"
    },
    "ref": "refs/heads/main",
    "after": "abc123...",
    "pusher": { "name": "user" }
  }

           │
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Signature Verification                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  verifyWebhookSignature(rawBody, signature, secret)                        │
│  [@github/webhook-handler.ts]                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Compute HMAC-SHA256 of raw body using GITHUB_WEBHOOK_SECRET       │ │
│  │ 2. Compare computed hash with X-Hub-Signature-256 header             │ │
│  │ 3. If mismatch: return 401 Unauthorized                               │ │
│  │ 4. If match: continue to processing                                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Event Processing (Async)                                          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  processPushEvent(payload) [@github/webhook-processor.ts]                  │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Extract repository info:                                            │ │
│  │    • full_name, clone_url, ref, commit_sha                            │ │
│  │                                                                         │ │
│  │ 2. Lookup repository in database:                                      │ │
│  │    ┌────────────────────────────────────────────────────────────┐    │ │
│  │    │ SELECT id, user_id FROM repositories                        │    │ │
│  │    │ WHERE clone_url = ?                                         │    │ │
│  │    │ OR url LIKE '%' || ? || '%'                                 │    │ │
│  │    └────────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  │ 3. If repository found:                                                │ │
│  │    ┌────────────────────────────────────────────────────────────┐    │ │
│  │    │ • Update last_push_at timestamp                             │    │ │
│  │    │ • Create index job:                                         │    │ │
│  │    │   createIndexJob(repositoryId, ref, commitSha, userId)      │    │ │
│  │    │ • Enqueue to pg-boss:                                       │    │ │
│  │    │   queue.send(QUEUE_NAMES.INDEX_REPO, payload)               │    │ │
│  │    │ • Log event                                                 │    │ │
│  │    └────────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  │ 4. If repository NOT found:                                            │ │
│  │    • Log warning (not auto-indexed, requires manual /index call)      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Return 200 OK to GitHub immediately (async processing doesn't block)      │
└────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
    [Same indexing flow as "Repository Indexing Flow" above]
```
