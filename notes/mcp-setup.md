# MCP Setup Notes

## kotadb MCP Server Configuration

### Issue: "Failed to reconnect to kotadb"

**Root cause**: Using non-existent package `@modelcontextprotocol/server-http` as a proxy.

```json
// WRONG - package doesn't exist on npm
"kotadb": {
  "command": "bunx",
  "args": ["@modelcontextprotocol/server-http", "http://localhost:3000/mcp"],
  "env": {
    "KOTADB_API_KEY": "..."
  }
}
```

### Solution: Use Native HTTP Transport

For HTTP-based MCP servers, use `"type": "http"` directly in `~/.claude.json`:

```json
"kotadb": {
  "type": "http",
  "url": "http://localhost:3000/mcp",
  "headers": {
    "Authorization": "Bearer kota_team_team1234567890ab_0123456789abcdef0123456789abcdef"
  }
}
```

### Prerequisites

1. Local server must be running (`http://localhost:3000`)
2. Valid API key with appropriate permissions

### Verification

```bash
# Check server health
curl -s http://localhost:3000/health

# Test MCP endpoint directly
curl -s http://localhost:3000/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <your-api-key>"
```

Expected response:
```json
{"status":"ok","protocol":"mcp","version":"2024-11-05","transport":"http"}
```

### Reference

See `.mcp.sample.json` in project root for example configuration.
