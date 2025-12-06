# KotaDB Usage Workflows with Claude Code

This guide shows practical workflows for using KotaDB with Claude Code via MCP integration.

## 1. First-Time Setup & Indexing Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INITIAL SETUP & FIRST REPOSITORY INDEX                   │
│                         (One-time setup process)                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: Start Local Infrastructure
┌────────────────────────────────────────────────────────────────────────────┐
│ Terminal 1 - Start Services                                                │
├────────────────────────────────────────────────────────────────────────────┤
│ $ cd app                                                                    │
│ $ supabase start                                                            │
│                                                                             │
│ Wait for output:                                                            │
│   ✓ API URL: http://localhost:54321                                        │
│   ✓ DB URL: postgresql://postgres:postgres@localhost:5434/postgres         │
│   ✓ Studio URL: http://localhost:54323                                     │
│                                                                             │
│ $ supabase db reset              # Apply migrations + seed data             │
│ $ bun run dev                    # Start KotaDB server                      │
│                                                                             │
│ Verify server is running:                                                  │
│ $ curl http://localhost:3000/health                                         │
│   {"status":"ok","version":"1.0.0","timestamp":"...","queue":{...}}         │
└────────────────────────────────────────────────────────────────────────────┘

STEP 2: Configure Claude Code MCP
┌────────────────────────────────────────────────────────────────────────────┐
│ Edit ~/.claude/settings.json (or .claude/settings.local.json)              │
├────────────────────────────────────────────────────────────────────────────┤
│ {                                                                           │
│   "mcpServers": {                                                           │
│     "kotadb": {                                                             │
│       "command": "bunx",                                                    │
│       "args": [                                                             │
│         "@anthropic-ai/mcp-proxy@0.1.0",                                    │
│         "http://localhost:3000/mcp"                                         │
│       ],                                                                    │
│       "env": {                                                              │
│         "KOTADB_API_KEY": "kota_free_test1234567890ab_0123456789abcdef..."│
│       }                                                                     │
│     }                                                                       │
│   }                                                                         │
│ }                                                                           │
│                                                                             │
│ Available test API keys (from seed.sql):                                   │
│ • Free tier (100 req/hr):                                                  │
│   kota_free_test1234567890ab_0123456789abcdef0123456789abcdef              │
│ • Solo tier (1000 req/hr):                                                 │
│   kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef              │
│ • Team tier (10000 req/hr):                                                │
│   kota_team_team1234567890ab_0123456789abcdef0123456789abcdef              │
└────────────────────────────────────────────────────────────────────────────┘

STEP 3: Restart Claude Code
┌────────────────────────────────────────────────────────────────────────────┐
│ Restart Claude Code to load MCP server configuration                       │
│                                                                             │
│ Verify MCP connection:                                                      │
│ • Open Claude Code                                                          │
│ • Type a message - you should see "kotadb" in available tools              │
│ • Check MCP logs: ~/.claude/logs/mcp-kotadb.log                            │
└────────────────────────────────────────────────────────────────────────────┘

STEP 4: Index Your First Repository
┌────────────────────────────────────────────────────────────────────────────┐
│ Option A: Via Claude Code (Recommended)                                    │
├────────────────────────────────────────────────────────────────────────────┤
│ You: "Index this repository for code search"                               │
│                                                                             │
│ Claude Code will:                                                           │
│   1. Use index_repository MCP tool                                         │
│   2. Detect current git repository                                         │
│   3. Send POST /mcp request to KotaDB                                       │
│   4. KotaDB creates job and returns jobId                                  │
│   5. Claude polls job status until completed                               │
│                                                                             │
│ Expected output:                                                            │
│   ✓ Repository indexed: kotadb                                             │
│   ✓ Files processed: 156                                                   │
│   ✓ Symbols extracted: 842                                                 │
│   ✓ Ready for search                                                       │
└────────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│ Option B: Via Direct API Call                                              │
├────────────────────────────────────────────────────────────────────────────┤
│ $ curl -X POST http://localhost:3000/index \                               │
│   -H "Authorization: Bearer kota_free_test1234567890ab_..." \              │
│   -H "Content-Type: application/json" \                                    │
│   -d '{                                                                     │
│     "repository": "https://github.com/your-username/your-repo.git",        │
│     "ref": "main"                                                           │
│   }'                                                                        │
│                                                                             │
│ Response:                                                                   │
│   {"jobId":"uuid-here","status":"pending"}                                 │
│                                                                             │
│ Check job status:                                                           │
│ $ curl http://localhost:3000/jobs/<jobId> \                                │
│   -H "Authorization: Bearer kota_free_test..."                             │
│                                                                             │
│ Response when complete:                                                     │
│   {                                                                         │
│     "id":"uuid",                                                            │
│     "status":"completed",                                                   │
│     "metadata":{                                                            │
│       "filesProcessed":156,                                                 │
│       "symbolsExtracted":842                                                │
│     }                                                                       │
│   }                                                                         │
└────────────────────────────────────────────────────────────────────────────┘

STEP 5: Verify Indexing in Supabase Studio
┌────────────────────────────────────────────────────────────────────────────┐
│ $ open http://localhost:54323                                              │
│                                                                             │
│ Tables to inspect:                                                          │
│ • repositories - Your indexed repo metadata                                │
│ • index_jobs - Job status and metrics                                      │
│ • indexed_files - All extracted files                                      │
│ • symbols - Parsed functions, classes, types                               │
│ • dependencies - Import/export graph                                       │
│                                                                             │
│ SQL Query Examples:                                                         │
│                                                                             │
│ -- Count indexed files                                                      │
│ SELECT COUNT(*) FROM indexed_files;                                         │
│                                                                             │
│ -- List all symbols                                                         │
│ SELECT name, kind, file_path                                                │
│ FROM symbols s                                                              │
│ JOIN indexed_files f ON s.file_id = f.id                                   │
│ LIMIT 20;                                                                   │
│                                                                             │
│ -- Check job history                                                        │
│ SELECT * FROM index_jobs ORDER BY created_at DESC;                          │
└────────────────────────────────────────────────────────────────────────────┘

✓ Setup complete! Ready for daily development workflow.
```

## 2. Daily Development Workflow with Claude Code

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              DAILY CLAUDE CODE + KOTADB DEVELOPMENT WORKFLOW                │
│                    (Typical coding session pattern)                         │
└─────────────────────────────────────────────────────────────────────────────┘

MORNING STARTUP
┌────────────────────────────────────────────────────────────────────────────┐
│ Terminal 1: Start KotaDB                                                    │
├────────────────────────────────────────────────────────────────────────────┤
│ $ cd ~/code/kotadb/app                                                      │
│ $ supabase start        # Start PostgreSQL + services                       │
│ $ bun run dev           # Start KotaDB API server                           │
│                                                                             │
│ Leave this terminal running ────────────────────────────────────────────►  │
└────────────────────────────────────────────────────────────────────────────┘

SCENARIO 1: Understanding Existing Code
┌────────────────────────────────────────────────────────────────────────────┐
│ You: "How does authentication work in this codebase?"                      │
├────────────────────────────────────────────────────────────────────────────┤
│ Claude Code workflow:                                                       │
│   1. Uses search_code tool:                                                 │
│      ┌──────────────────────────────────────────────────────────────┐     │
│      │ tool: search_code                                             │     │
│      │ arguments: {                                                  │     │
│      │   term: "authenticateRequest",                                │     │
│      │   limit: 10                                                   │     │
│      │ }                                                              │     │
│      └──────────────────────────────────────────────────────────────┘     │
│                                                                             │
│   2. KotaDB returns matches with snippets:                                 │
│      ┌──────────────────────────────────────────────────────────────┐     │
│      │ Results:                                                       │     │
│      │ • src/auth/middleware.ts:42                                   │     │
│      │   export async function authenticateRequest(request) {        │     │
│      │     // Extract Bearer token...                                │     │
│      │                                                                │     │
│      │ • src/api/routes.ts:429                                       │     │
│      │   const { context, response } = await                         │     │
│      │     authenticateRequest(bunRequest);                          │     │
│      └──────────────────────────────────────────────────────────────┘     │
│                                                                             │
│   3. Claude reads full files and explains:                                 │
│      "Authentication works through two methods:                            │
│       1. API Keys - Bearer token validated against api_keys table          │
│       2. JWT Tokens - Validated via Supabase Auth                          │
│       The middleware checks both and enforces rate limits..."              │
└────────────────────────────────────────────────────────────────────────────┘

SCENARIO 2: Finding Dependencies
┌────────────────────────────────────────────────────────────────────────────┐
│ You: "What files depend on the auth middleware?"                           │
├────────────────────────────────────────────────────────────────────────────┤
│ Claude Code workflow:                                                       │
│   1. Uses search_dependencies tool:                                        │
│      ┌──────────────────────────────────────────────────────────────┐     │
│      │ tool: search_dependencies                                     │     │
│      │ arguments: {                                                  │     │
│      │   file_path: "src/auth/middleware.ts",                        │     │
│      │   direction: "dependents"  // who imports this file           │     │
│      │ }                                                              │     │
│      └──────────────────────────────────────────────────────────────┘     │
│                                                                             │
│   2. KotaDB returns dependency graph:                                      │
│      ┌──────────────────────────────────────────────────────────────┐     │
│      │ Dependents (files that import auth/middleware.ts):            │     │
│      │ • src/api/routes.ts                                           │     │
│      │   import { authenticateRequest } from '@auth/middleware'      │     │
│      │                                                                │     │
│      │ • tests/api/routes.test.ts                                    │     │
│      │   import { authenticateRequest } from '@auth/middleware'      │     │
│      └──────────────────────────────────────────────────────────────┘     │
│                                                                             │
│   3. Claude summarizes:                                                    │
│      "The auth middleware is used in 2 places:                             │
│       1. routes.ts - Main API authentication                               │
│       2. routes.test.ts - Unit tests                                       │
│       If you modify it, you'll need to update tests."                      │
└────────────────────────────────────────────────────────────────────────────┘

SCENARIO 3: Code Refactoring
┌────────────────────────────────────────────────────────────────────────────┐
│ You: "Refactor the rate limiting logic into a separate module"             │
├────────────────────────────────────────────────────────────────────────────┤
│ Claude Code workflow:                                                       │
│   1. Search for rate limit code:                                           │
│      search_code("enforceRateLimit")                                       │
│                                                                             │
│   2. Find all usages:                                                       │
│      search_dependencies("src/auth/rate-limit.ts", direction: "dependents")│
│                                                                             │
│   3. Read related files                                                     │
│                                                                             │
│   4. Perform refactoring (create new files, update imports)                │
│                                                                             │
│   5. After changes, re-index repository:                                   │
│      ┌──────────────────────────────────────────────────────────────┐     │
│      │ tool: index_repository                                        │     │
│      │ arguments: {                                                  │     │
│      │   repository: ".",  // current directory                      │     │
│      │   ref: "main"                                                 │     │
│      │ }                                                              │     │
│      └──────────────────────────────────────────────────────────────┘     │
│                                                                             │
│   6. Verify changes with fresh search:                                     │
│      search_code("enforceRateLimit")  // shows new locations               │
└────────────────────────────────────────────────────────────────────────────┘

SCENARIO 4: Bug Investigation
┌────────────────────────────────────────────────────────────────────────────┐
│ You: "The search endpoint is returning empty results. Why?"                │
├────────────────────────────────────────────────────────────────────────────┤
│ Claude Code workflow:                                                       │
│   1. Search for search endpoint:                                           │
│      search_code("GET /search")                                            │
│      → Finds: src/api/routes.ts:563                                        │
│                                                                             │
│   2. Search for search implementation:                                     │
│      search_code("searchFiles")                                            │
│      → Finds: src/api/queries.ts                                           │
│                                                                             │
│   3. Check dependencies:                                                    │
│      search_dependencies("src/api/queries.ts", "dependencies")             │
│      → Uses: @db/client, PostgreSQL queries                                │
│                                                                             │
│   4. Claude reads files and analyzes:                                      │
│      "The search uses PostgreSQL full-text search with to_tsvector.        │
│       Empty results could mean:                                            │
│       1. No files indexed for your user_id (check RLS)                     │
│       2. Search term doesn't match (try simpler term)                      │
│       3. Wrong repository filter                                           │
│                                                                             │
│       Let's check indexed_files table..."                                  │
│                                                                             │
│   5. Suggests debugging query:                                             │
│      list_recent_files(limit: 10)  // Check if any files exist             │
└────────────────────────────────────────────────────────────────────────────┘

SCENARIO 5: Adding New Feature
┌────────────────────────────────────────────────────────────────────────────┐
│ You: "Add a new endpoint to export search results as JSON"                 │
├────────────────────────────────────────────────────────────────────────────┤
│ Claude Code workflow:                                                       │
│   1. Find similar endpoints:                                               │
│      search_code("app.get")  // Find Express route patterns                │
│                                                                             │
│   2. Find search implementation:                                           │
│      search_code("searchFiles")                                            │
│                                                                             │
│   3. Check dependencies for search:                                        │
│      search_dependencies("src/api/queries.ts")                             │
│                                                                             │
│   4. Claude implements new endpoint in routes.ts                           │
│                                                                             │
│   5. Re-index after implementation:                                        │
│      index_repository(repository: ".", ref: "main")                        │
│                                                                             │
│   6. Verify new code is searchable:                                        │
│      search_code("export search results")                                  │
└────────────────────────────────────────────────────────────────────────────┘

END OF DAY SHUTDOWN
┌────────────────────────────────────────────────────────────────────────────┐
│ Terminal 1: Stop services                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ ^C                      # Stop bun dev server (Ctrl+C)                      │
│ $ supabase stop         # Stop PostgreSQL + services                        │
│                                                                             │
│ Optional: Keep supabase running if you'll work tomorrow                    │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3. MCP Tool Usage Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     KOTADB MCP TOOLS - USAGE PATTERNS                       │
│                      (How Claude Code uses each tool)                       │
└─────────────────────────────────────────────────────────────────────────────┘

TOOL 1: search_code
┌────────────────────────────────────────────────────────────────────────────┐
│ Purpose: Full-text search across indexed files                             │
├────────────────────────────────────────────────────────────────────────────┤
│ When Claude uses it:                                                        │
│ • You ask "how does X work?"                                                │
│ • You ask "where is X defined?"                                             │
│ • You ask "find all usages of X"                                            │
│ • During code exploration and understanding                                 │
│                                                                             │
│ Arguments:                                                                  │
│   {                                                                         │
│     term: string,           // Required: search term                        │
│     repository?: string,    // Optional: filter by repo name               │
│     project_id?: string,    // Optional: filter by project                 │
│     limit?: number          // Optional: max results (default 10)          │
│   }                                                                         │
│                                                                             │
│ Example prompts that trigger this tool:                                    │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ ✓ "Search for authentication logic"                                  │  │
│ │ ✓ "Find all API route handlers"                                      │  │
│ │ ✓ "Where is the database connection created?"                        │  │
│ │ ✓ "Show me error handling code"                                      │  │
│ │ ✓ "Find TypeScript interfaces for API requests"                      │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Returns:                                                                    │
│   {                                                                         │
│     results: [                                                              │
│       {                                                                     │
│         file_path: "src/auth/middleware.ts",                                │
│         repository_name: "kotadb",                                          │
│         language: "typescript",                                             │
│         snippet: "...code snippet with highlighted term...",                │
│         indexed_at: "2024-12-06T12:00:00Z"                                 │
│       }                                                                     │
│     ]                                                                       │
│   }                                                                         │
│                                                                             │
│ Claude's follow-up actions:                                                │
│ 1. Reads full file content using Read tool                                 │
│ 2. Analyzes code context                                                    │
│ 3. Provides explanation or makes modifications                             │
└────────────────────────────────────────────────────────────────────────────┘

TOOL 2: index_repository
┌────────────────────────────────────────────────────────────────────────────┐
│ Purpose: Index or re-index a repository for searching                      │
├────────────────────────────────────────────────────────────────────────────┤
│ When Claude uses it:                                                        │
│ • You explicitly ask "index this repository"                                │
│ • After making significant code changes                                     │
│ • When search results seem stale                                            │
│ • First time using KotaDB with a new project                                │
│                                                                             │
│ Arguments:                                                                  │
│   {                                                                         │
│     repository: string,     // Required: git URL or "." for current dir    │
│     ref?: string,           // Optional: branch name (default: "main")     │
│     localPath?: string      // Optional: absolute path to local repo       │
│   }                                                                         │
│                                                                             │
│ Example prompts that trigger this tool:                                    │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ ✓ "Index this repository"                                             │  │
│ │ ✓ "Re-index the codebase with my latest changes"                     │  │
│ │ ✓ "Index the main branch"                                             │  │
│ │ ✓ "Update the search index after my refactoring"                     │  │
│ │ ✓ "Index github.com/user/repo on the develop branch"                 │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Returns:                                                                    │
│   {                                                                         │
│     jobId: "uuid",                                                          │
│     status: "pending|in_progress|completed|failed",                        │
│     metadata?: {                                                            │
│       filesProcessed: 156,                                                  │
│       symbolsExtracted: 842                                                 │
│     }                                                                       │
│   }                                                                         │
│                                                                             │
│ Claude's follow-up actions:                                                │
│ 1. Polls job status until completion                                       │
│ 2. Reports progress to you                                                  │
│ 3. Confirms when indexing is complete                                      │
│ 4. May suggest next actions (e.g., "Now you can search the code")          │
│                                                                             │
│ Note: Indexing is asynchronous - may take 10-60 seconds for large repos    │
└────────────────────────────────────────────────────────────────────────────┘

TOOL 3: list_recent_files
┌────────────────────────────────────────────────────────────────────────────┐
│ Purpose: List recently indexed files, ordered by timestamp                 │
├────────────────────────────────────────────────────────────────────────────┤
│ When Claude uses it:                                                        │
│ • You ask "what files are indexed?"                                         │
│ • Debugging why search returns no results                                   │
│ • Verifying indexing completed successfully                                 │
│ • Exploring what's available in the index                                   │
│                                                                             │
│ Arguments:                                                                  │
│   {                                                                         │
│     limit?: number          // Optional: max results (default 10)          │
│   }                                                                         │
│                                                                             │
│ Example prompts that trigger this tool:                                    │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ ✓ "What files are indexed?"                                           │  │
│ │ ✓ "Show me the most recently indexed files"                          │  │
│ │ ✓ "List indexed files"                                                │  │
│ │ ✓ "Is the codebase indexed yet?"                                     │  │
│ │ ✓ "What was indexed in the last run?"                                │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Returns:                                                                    │
│   {                                                                         │
│     results: [                                                              │
│       {                                                                     │
│         file_path: "src/api/routes.ts",                                     │
│         repository_name: "kotadb",                                          │
│         language: "typescript",                                             │
│         size_bytes: 45123,                                                  │
│         indexed_at: "2024-12-06T12:00:00Z"                                 │
│       },                                                                    │
│       ...                                                                   │
│     ]                                                                       │
│   }                                                                         │
│                                                                             │
│ Claude's follow-up actions:                                                │
│ 1. Summarizes file count and types                                         │
│ 2. Identifies most recently updated files                                  │
│ 3. May suggest re-indexing if files seem old                               │
└────────────────────────────────────────────────────────────────────────────┘

TOOL 4: search_dependencies
┌────────────────────────────────────────────────────────────────────────────┐
│ Purpose: Find import/export relationships between files                    │
├────────────────────────────────────────────────────────────────────────────┤
│ When Claude uses it:                                                        │
│ • You ask "what depends on this file?"                                      │
│ • You ask "what does this file import?"                                     │
│ • Planning refactoring impact analysis                                      │
│ • Understanding module boundaries                                           │
│                                                                             │
│ Arguments:                                                                  │
│   {                                                                         │
│     file_path: string,      // Required: file to analyze                   │
│     direction?: string      // "dependencies" or "dependents" (default both)│
│   }                                                                         │
│                                                                             │
│ Example prompts that trigger this tool:                                    │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ ✓ "What files depend on auth/middleware.ts?"                         │  │
│ │ ✓ "What does routes.ts import?"                                      │  │
│ │ ✓ "Show me the dependency graph for this module"                     │  │
│ │ ✓ "If I change this file, what else needs updating?"                │  │
│ │ ✓ "What's the import chain for this component?"                      │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Returns:                                                                    │
│   {                                                                         │
│     dependencies: [      // Files that file_path imports                   │
│       {                                                                     │
│         target_file_path: "src/auth/middleware.ts",                         │
│         import_type: "import",  // import, require, dynamic                │
│         dependency_path: "@auth/middleware"                                 │
│       }                                                                     │
│     ],                                                                      │
│     dependents: [        // Files that import file_path                    │
│       {                                                                     │
│         source_file_path: "src/api/routes.ts",                              │
│         import_type: "import",                                              │
│         dependency_path: "@auth/middleware"                                 │
│       }                                                                     │
│     ]                                                                       │
│   }                                                                         │
│                                                                             │
│ Claude's follow-up actions:                                                │
│ 1. Visualizes dependency graph                                             │
│ 2. Identifies circular dependencies if present                             │
│ 3. Estimates refactoring impact                                            │
│ 4. Suggests safe refactoring order                                         │
└────────────────────────────────────────────────────────────────────────────┘

COMBINING TOOLS - COMMON WORKFLOWS
┌────────────────────────────────────────────────────────────────────────────┐
│ Workflow: "Understand how feature X works"                                 │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. search_code(term: "feature X")        → Find entry points               │
│ 2. search_dependencies(file_path: "...")  → Map dependencies               │
│ 3. Read all related files                                                   │
│ 4. Explain architecture                                                     │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Workflow: "Refactor module Y safely"                                       │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. search_code(term: "module Y")          → Find all usages                │
│ 2. search_dependencies(                   → Find dependents                │
│      file_path: "src/module-y.ts",                                         │
│      direction: "dependents"                                                │
│    )                                                                        │
│ 3. Perform refactoring                                                      │
│ 4. index_repository(repository: ".")      → Re-index changes               │
│ 5. search_code(term: "module Y")          → Verify changes                 │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Workflow: "Debug why search returns empty"                                 │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. list_recent_files(limit: 20)          → Check if files indexed         │
│ 2. If empty: index_repository(...)        → Index first                    │
│ 3. If not empty: search_code(simpler term) → Try broader search            │
└────────────────────────────────────────────────────────────────────────────┘
```

## 4. Troubleshooting Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TROUBLESHOOTING COMMON ISSUES                          │
└─────────────────────────────────────────────────────────────────────────────┘

ISSUE 1: "MCP server not connecting"
┌────────────────────────────────────────────────────────────────────────────┐
│ Symptoms:                                                                   │
│ • Claude Code shows "kotadb tools unavailable"                              │
│ • MCP errors in logs                                                        │
│                                                                             │
│ Debugging steps:                                                            │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ 1. Check KotaDB server is running:                                    │  │
│ │    $ curl http://localhost:3000/health                                │  │
│ │    Expected: {"status":"ok",...}                                      │  │
│ │                                                                        │  │
│ │ 2. Check MCP endpoint specifically:                                   │  │
│ │    $ curl http://localhost:3000/mcp \                                 │  │
│ │      -H "Authorization: Bearer kota_free_test..."                     │  │
│ │    Expected: {"status":"ok","protocol":"mcp",...}                     │  │
│ │                                                                        │  │
│ │ 3. Verify API key in Claude settings:                                 │  │
│ │    $ cat ~/.claude/settings.json | jq '.mcpServers.kotadb.env'       │  │
│ │    Should show: {"KOTADB_API_KEY": "kota_..."}                        │  │
│ │                                                                        │  │
│ │ 4. Check Claude Code MCP logs:                                        │  │
│ │    $ tail -f ~/.claude/logs/mcp-kotadb.log                            │  │
│ │    Look for connection errors or auth failures                        │  │
│ │                                                                        │  │
│ │ 5. Test MCP proxy manually:                                           │  │
│ │    $ bunx @anthropic-ai/mcp-proxy@0.1.0 http://localhost:3000/mcp    │  │
│ │    Should start without errors                                        │  │
│ │                                                                        │  │
│ │ 6. Restart Claude Code:                                               │  │
│ │    Completely quit and reopen Claude Code                             │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Common fixes:                                                               │
│ • Wrong API key → Use key from seed.sql                                     │
│ • KotaDB not running → Start with `bun run dev`                            │
│ • Stale MCP connection → Restart Claude Code                                │
│ • Port conflict → Check nothing else using port 3000                        │
└────────────────────────────────────────────────────────────────────────────┘

ISSUE 2: "Search returns no results"
┌────────────────────────────────────────────────────────────────────────────┐
│ Symptoms:                                                                   │
│ • search_code tool returns empty results                                    │
│ • Recently indexed but still no matches                                     │
│                                                                             │
│ Debugging steps:                                                            │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ 1. Check if any files are indexed:                                    │  │
│ │    Ask Claude: "List indexed files"                                   │  │
│ │    → Uses list_recent_files tool                                      │  │
│ │                                                                        │  │
│ │ 2. If no files indexed:                                               │  │
│ │    Ask Claude: "Index this repository"                                │  │
│ │    → Uses index_repository tool                                       │  │
│ │                                                                        │  │
│ │ 3. Check indexing job status:                                         │  │
│ │    $ curl http://localhost:3000/jobs/<jobId> \                        │  │
│ │      -H "Authorization: Bearer kota_..."                              │  │
│ │                                                                        │  │
│ │ 4. Inspect database directly (Supabase Studio):                       │  │
│ │    $ open http://localhost:54323                                      │  │
│ │    Query:                                                              │  │
│ │      SELECT COUNT(*) FROM indexed_files;                              │  │
│ │      SELECT * FROM index_jobs ORDER BY created_at DESC LIMIT 5;       │  │
│ │                                                                        │  │
│ │ 5. Check RLS isolation (user_id mismatch):                            │  │
│ │    Files might be indexed under different user_id                     │  │
│ │    Query:                                                              │  │
│ │      SELECT DISTINCT user_id FROM indexed_files;                      │  │
│ │      SELECT DISTINCT user_id FROM api_keys;                           │  │
│ │    They should match!                                                 │  │
│ │                                                                        │  │
│ │ 6. Try simpler search term:                                           │  │
│ │    Instead of "authenticateRequest"                                   │  │
│ │    Try "auth" or "request"                                            │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Common fixes:                                                               │
│ • Not indexed yet → Run index_repository                                    │
│ • RLS user_id mismatch → Re-index with correct API key                     │
│ • Search term too specific → Use broader terms                              │
│ • Wrong repository filter → Remove repository parameter                     │
└────────────────────────────────────────────────────────────────────────────┘

ISSUE 3: "Indexing job stuck in pending/in_progress"
┌────────────────────────────────────────────────────────────────────────────┐
│ Symptoms:                                                                   │
│ • Job status never changes to completed                                     │
│ • Claude keeps polling indefinitely                                         │
│                                                                             │
│ Debugging steps:                                                            │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ 1. Check KotaDB server logs:                                          │  │
│ │    Look at terminal where `bun run dev` is running                    │  │
│ │    Should see job processing logs                                     │  │
│ │                                                                        │  │
│ │ 2. Check pg-boss queue health:                                        │  │
│ │    $ curl http://localhost:3000/health                                │  │
│ │    Look at queue.depth and queue.failed_24h                           │  │
│ │                                                                        │  │
│ │ 3. Check job table directly:                                          │  │
│ │    $ open http://localhost:54323                                      │  │
│ │    Query:                                                              │  │
│ │      SELECT * FROM index_jobs                                         │  │
│ │        WHERE status IN ('pending', 'in_progress')                     │  │
│ │        ORDER BY created_at DESC;                                      │  │
│ │                                                                        │  │
│ │ 4. Check for worker errors:                                           │  │
│ │    Look for errors in bun dev output                                  │  │
│ │    Common issues:                                                     │  │
│ │    • Git clone failed (wrong URL)                                     │  │
│ │    • Permission denied (can't access directory)                       │  │
│ │    • Out of disk space                                                │  │
│ │                                                                        │  │
│ │ 5. Check admin endpoint for failed jobs:                              │  │
│ │    $ curl http://localhost:3000/admin/jobs/failed \                   │  │
│ │      -H "Authorization: Bearer <SUPABASE_SERVICE_KEY>"                │  │
│ │                                                                        │  │
│ │ 6. Retry failed job:                                                  │  │
│ │    $ curl -X POST http://localhost:3000/admin/jobs/<jobId>/retry \    │  │
│ │      -H "Authorization: Bearer <SERVICE_KEY>"                         │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Common fixes:                                                               │
│ • Worker crashed → Restart bun dev                                          │
│ • Bad git URL → Fix repository URL and retry                                │
│ • Queue stalled → Restart Supabase (supabase stop && supabase start)       │
└────────────────────────────────────────────────────────────────────────────┘

ISSUE 4: "Rate limit exceeded"
┌────────────────────────────────────────────────────────────────────────────┐
│ Symptoms:                                                                   │
│ • MCP tools return 429 errors                                               │
│ • Error: "Rate limit exceeded"                                              │
│                                                                             │
│ Debugging steps:                                                            │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ 1. Check current rate limit:                                          │  │
│ │    Look at response headers from any request:                         │  │
│ │      X-RateLimit-Limit: 100                                           │  │
│ │      X-RateLimit-Remaining: 0                                         │  │
│ │      X-RateLimit-Reset: 1733500800                                    │  │
│ │                                                                        │  │
│ │ 2. Check your tier:                                                   │  │
│ │    Free tier: 100 requests/hour                                       │  │
│ │    Solo tier: 1,000 requests/hour                                     │  │
│ │    Team tier: 10,000 requests/hour                                    │  │
│ │                                                                        │  │
│ │ 3. Upgrade to higher tier key:                                        │  │
│ │    Edit ~/.claude/settings.json:                                      │  │
│ │    Change KOTADB_API_KEY to solo or team key from seed.sql           │  │
│ │                                                                        │  │
│ │ 4. Wait for reset (1 hour sliding window):                            │  │
│ │    Convert reset timestamp to human time:                             │  │
│ │    $ date -r 1733500800                                               │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Common fixes:                                                               │
│ • Use higher tier API key (solo or team)                                    │
│ • Wait for rate limit window to reset                                       │
│ • Reduce Claude Code query frequency                                        │
└────────────────────────────────────────────────────────────────────────────┘

ISSUE 5: "Dependencies not found"
┌────────────────────────────────────────────────────────────────────────────┐
│ Symptoms:                                                                   │
│ • search_dependencies returns empty results                                 │
│ • Known imports not showing up                                              │
│                                                                             │
│ Debugging steps:                                                            │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ 1. Verify file path is correct:                                       │  │
│ │    Use exact path from indexed_files table                            │  │
│ │    Example: "src/api/routes.ts" not "/src/api/routes.ts"             │  │
│ │                                                                        │  │
│ │ 2. Check if dependencies were extracted:                              │  │
│ │    $ open http://localhost:54323                                      │  │
│ │    Query:                                                              │  │
│ │      SELECT COUNT(*) FROM dependencies;                               │  │
│ │      SELECT * FROM dependencies LIMIT 10;                             │  │
│ │                                                                        │  │
│ │ 3. Re-index to extract dependencies:                                  │  │
│ │    Dependencies are extracted during indexing                         │  │
│ │    Ask Claude: "Re-index this repository"                             │  │
│ │                                                                        │  │
│ │ 4. Check supported file types:                                        │  │
│ │    Dependencies only extracted from:                                  │  │
│ │    .ts, .tsx, .js, .jsx, .cjs, .mjs                                  │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Common fixes:                                                               │
│ • Wrong file path → Use exact path from list_recent_files                   │
│ • Not indexed yet → Run index_repository                                    │
│ • Unsupported file type → Only works with JS/TS files                       │
└────────────────────────────────────────────────────────────────────────────┘

GENERAL DEBUGGING CHECKLIST
┌────────────────────────────────────────────────────────────────────────────┐
│ When something isn't working:                                               │
│                                                                             │
│ □ KotaDB server running? (curl http://localhost:3000/health)               │
│ □ Supabase running? (supabase status)                                      │
│ □ Correct API key? (check settings.json matches seed.sql)                  │
│ □ Repository indexed? (list_recent_files)                                  │
│ □ Check server logs (terminal running bun dev)                             │
│ □ Check MCP logs (~/.claude/logs/mcp-kotadb.log)                           │
│ □ Inspect database (http://localhost:54323)                                │
│ □ Restart Claude Code (full quit and reopen)                               │
│ □ Restart services (supabase stop && supabase start)                       │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5. Advanced Workflows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ADVANCED USAGE PATTERNS                            │
└─────────────────────────────────────────────────────────────────────────────┘

WORKFLOW: Multi-Repository Code Search
┌────────────────────────────────────────────────────────────────────────────┐
│ Scenario: Search across multiple related repositories                      │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. Index all repositories:                                                  │
│    Ask Claude:                                                              │
│    "Index these repositories:                                               │
│     - https://github.com/user/frontend                                      │
│     - https://github.com/user/backend                                       │
│     - https://github.com/user/shared"                                       │
│                                                                             │
│    Claude will call index_repository for each                              │
│                                                                             │
│ 2. Search across all:                                                       │
│    Ask Claude: "Search for 'User' interface across all repos"              │
│                                                                             │
│    Claude will call search_code without repository filter                  │
│    Results will include matches from all indexed repos                     │
│                                                                             │
│ 3. Filter to specific repo:                                                 │
│    Ask Claude: "Search for 'User' but only in the backend repo"            │
│                                                                             │
│    Claude will call search_code with repository: "backend"                 │
└────────────────────────────────────────────────────────────────────────────┘

WORKFLOW: Project-based Organization
┌────────────────────────────────────────────────────────────────────────────┐
│ Scenario: Group related repositories into projects                         │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. Create project via API:                                                  │
│    $ curl -X POST http://localhost:3000/api/projects \                     │
│      -H "Authorization: Bearer kota_..." \                                  │
│      -H "Content-Type: application/json" \                                  │
│      -d '{                                                                  │
│        "name": "E-commerce Platform",                                       │
│        "description": "Frontend + Backend + Shared libs",                   │
│        "repository_ids": ["repo-id-1", "repo-id-2"]                         │
│      }'                                                                     │
│                                                                             │
│ 2. Search within project:                                                   │
│    Ask Claude: "Search for authentication in my e-commerce project"        │
│                                                                             │
│    Claude will call search_code with project_id filter                     │
│    Only repositories in that project will be searched                      │
└────────────────────────────────────────────────────────────────────────────┘

WORKFLOW: Automated Re-indexing with GitHub Webhooks
┌────────────────────────────────────────────────────────────────────────────┐
│ Scenario: Auto-index on every git push                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. First, index the repository manually to register it:                    │
│    Ask Claude: "Index https://github.com/user/repo"                        │
│                                                                             │
│ 2. Set up GitHub webhook (on github.com):                                  │
│    Repo Settings → Webhooks → Add webhook                                  │
│    • Payload URL: https://your-domain.com/webhooks/github                  │
│    • Content type: application/json                                        │
│    • Secret: (set GITHUB_WEBHOOK_SECRET in .env)                           │
│    • Events: Just the push event                                           │
│                                                                             │
│ 3. Configure webhook secret in KotaDB:                                     │
│    Edit app/.env:                                                           │
│      GITHUB_WEBHOOK_SECRET=your-secret-here                                │
│                                                                             │
│ 4. Now every git push automatically triggers re-indexing:                  │
│    Push to GitHub → Webhook fires → KotaDB re-indexes → Search updated    │
│                                                                             │
│ Note: For local development, use ngrok to expose webhook endpoint          │
└────────────────────────────────────────────────────────────────────────────┘

WORKFLOW: Impact Analysis Before Refactoring
┌────────────────────────────────────────────────────────────────────────────┐
│ Scenario: Plan a safe refactoring with full impact analysis                │
├────────────────────────────────────────────────────────────────────────────┤
│ Ask Claude:                                                                 │
│ "I want to refactor src/auth/middleware.ts. Show me:                       │
│  1. All files that import it (dependents)                                   │
│  2. All files it imports (dependencies)                                     │
│  3. Potential circular dependencies                                         │
│  4. Recommended refactoring order"                                          │
│                                                                             │
│ Claude's workflow:                                                          │
│   1. search_dependencies(                                                   │
│        file_path: "src/auth/middleware.ts",                                │
│        direction: "dependents"                                              │
│      )                                                                      │
│      → Finds: routes.ts, tests/routes.test.ts                              │
│                                                                             │
│   2. search_dependencies(                                                   │
│        file_path: "src/auth/middleware.ts",                                │
│        direction: "dependencies"                                            │
│      )                                                                      │
│      → Finds: @auth/validator, @auth/rate-limit                            │
│                                                                             │
│   3. Analyzes dependency graph for cycles                                  │
│                                                                             │
│   4. Provides refactoring plan:                                             │
│      "Safe refactoring order:                                               │
│       1. Create new auth/v2/middleware.ts                                   │
│       2. Migrate @auth/validator first (no dependents)                      │
│       3. Update routes.ts to import from v2                                 │
│       4. Update tests                                                       │
│       5. Deprecate old middleware                                           │
│                                                                             │
│       Files that will need changes:                                         │
│       • src/api/routes.ts (1 import)                                        │
│       • tests/api/routes.test.ts (1 import)                                 │
│                                                                             │
│       No circular dependencies detected ✓"                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

## Quick Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              QUICK REFERENCE                                │
└─────────────────────────────────────────────────────────────────────────────┘

DAILY COMMANDS
┌────────────────────────────────────────────────────────────────────────────┐
│ Start services:                                                             │
│   cd app && supabase start && bun run dev                                   │
│                                                                             │
│ Stop services:                                                              │
│   ^C (in bun dev terminal)                                                  │
│   supabase stop                                                             │
│                                                                             │
│ Health check:                                                               │
│   curl http://localhost:3000/health                                         │
│                                                                             │
│ View database:                                                              │
│   open http://localhost:54323                                               │
│                                                                             │
│ Check logs:                                                                 │
│   tail -f ~/.claude/logs/mcp-kotadb.log                                     │
└────────────────────────────────────────────────────────────────────────────┘

TEST API KEYS (from seed.sql)
┌────────────────────────────────────────────────────────────────────────────┐
│ Free tier (100 req/hr):                                                     │
│   kota_free_test1234567890ab_0123456789abcdef0123456789abcdef              │
│                                                                             │
│ Solo tier (1,000 req/hr):                                                   │
│   kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef              │
│                                                                             │
│ Team tier (10,000 req/hr):                                                  │
│   kota_team_team1234567890ab_0123456789abcdef0123456789abcdef              │
└────────────────────────────────────────────────────────────────────────────┘

CLAUDE CODE PROMPTS
┌────────────────────────────────────────────────────────────────────────────┐
│ Index repository:                                                           │
│   "Index this repository"                                                   │
│   "Re-index with my latest changes"                                         │
│                                                                             │
│ Search code:                                                                │
│   "Search for authentication logic"                                         │
│   "Find all API routes"                                                     │
│   "Where is the database connection created?"                               │
│                                                                             │
│ Check dependencies:                                                         │
│   "What files depend on auth/middleware.ts?"                                │
│   "What does routes.ts import?"                                             │
│                                                                             │
│ List indexed files:                                                         │
│   "What files are indexed?"                                                 │
│   "Show me recently indexed files"                                          │
└────────────────────────────────────────────────────────────────────────────┘

SUPABASE LOCAL URLS
┌────────────────────────────────────────────────────────────────────────────┐
│ Studio (Database UI):    http://localhost:54323                            │
│ API Gateway (Kong):      http://localhost:54321                            │
│ PostgreSQL:              postgresql://postgres:postgres@localhost:5434     │
│ Auth Service (GoTrue):   http://localhost:54325                            │
│ Storage:                 http://localhost:54327                            │
└────────────────────────────────────────────────────────────────────────────┘
```
