# KotaDB Local Setup Guide

## Prerequisites

- Bun (1.0+)
- Docker
- Supabase CLI: `brew install supabase/tap/supabase`

## Quick Start

```bash
cd app

# Install dependencies
bun install

# Start Supabase Local
supabase start

# Create .env from sample
cp .env.sample .env

# Get Supabase keys and update .env
supabase status -o json | jq -r '"SUPABASE_ANON_KEY=\(.ANON_KEY)\nSUPABASE_SERVICE_KEY=\(.SERVICE_ROLE_KEY)"'

# Update .env with local values:
# - SUPABASE_URL=http://127.0.0.1:54322
# - SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:5434/postgres
# - Paste the keys from supabase status output above

# Run migrations
supabase db reset

# Start server
bun run dev
```

Verify: `curl http://localhost:3000/health`

## Test API Keys

See `supabase/seed.sql` for pre-seeded test API keys. Format: `kota_<tier>_<key_id>_<secret>`

## Claude Code MCP Integration

Add to `~/.claude/settings.json` or `.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["@anthropic-ai/mcp-proxy@0.1.0", "http://localhost:3000/mcp"],
      "env": {
        "KOTADB_API_KEY": "<your-api-key-from-seed.sql>"
      }
    }
  }
}
```

### Available MCP Tools

- `search_code` - Search indexed files for a term
- `index_repository` - Index a git repository
- `list_recent_files` - List recently indexed files
- `search_dependencies` - Find file dependencies

## Useful Commands

```bash
# Stop everything
supabase stop

# View Supabase Studio
open http://127.0.0.1:54328

# Run tests
bun test
```
