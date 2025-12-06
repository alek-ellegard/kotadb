 
```bash
# path: /Users/alek/code/work/kotadb
> pbpaste
    "/Users/alek/code/work/kotadb": {
      "allowedTools": [],
      "mcpContextUris": [],
      "mcpServers": {
        "kotadb": {
          "command": "bunx",
          "args": [
            "@anthropic-ai/mcp-proxy@0.1.0",
            "http://localhost:3000/mcp"
          ],
          "env": {
            "KOTADB_API_KEY": "kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef"
          }
        },
      },
      "enabledMcpjsonServers": [],
      "disabledMcpjsonServers": [],
      "hasTrustDialogAccepted": false,
      "projectOnboardingSeenCount": 0,
      "hasClaudeMdExternalIncludesApproved": false,
      "hasClaudeMdExternalIncludesWarningShown": false,
      "exampleFiles": [
        "routes.ts",
        "queries.ts",
        "webhooks.ts",
        "tools.ts",
        "workflow_ops.py"
      ],
      "exampleFilesGeneratedAt": 1765032108615,
      "hasCompletedProjectOnboarding": true,
      "lastTotalWebSearchRequests": 0
    }
  },
```

```bash
# path: /Users/alek/code/work/kotadb
> pbpaste
    "/Users/alek/code/work/caes": {
      "allowedTools": [],
      "mcpContextUris": [],
      "mcpServers": {
        "kotadb": {
          "command": "bunx",
          "args": [
            "@anthropic-ai/mcp-proxy@0.1.0",
            "http://localhost:3000/mcp"
          ],
          "env": {
            "KOTADB_API_KEY": "kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef"
          }
        },
        "filesystem": {
          "command": "npx",
          "args": [
            "-y",
            "@modelcontextprotocol/server-filesystem",
            "/Users/alek/Desktop",
            "/Users/alek/Downloads"
          ]
        },
        "sequential-thinking": {
          "command": "docker",
          "args": [
            "run",
            "--rm",
            "-i",
            "mcp/sequentialthinking"
          ]
        },
        "memory": {
          "command": "docker",
          "args": [
            "run",
            "-i",
            "-v",
            "claude-memory:/app/dist",
            "--rm",
            "mcp/memory"
          ]
        }
      },
      "enabledMcpjsonServers": [],
      "disabledMcpjsonServers": [],
      "hasTrustDialogAccepted": true,
      "hasTrustDialogHooksAccepted": false,
      "projectOnboardingSeenCount": 12,
      "hasClaudeMdExternalIncludesApproved": false,
      "hasClaudeMdExternalIncludesWarningShown": false,
      "exampleFiles": [
        "zmq_socket.py",
        "orchestrator.py",
        "metrics_manager.py",
        "pr-worktree.mk",
        "exporter.py"
      ],
      "exampleFilesGeneratedAt": 1764947654721,
      "hasCompletedProjectOnboarding": true,
      "lastTotalWebSearchRequests": 0,
      "disabledMcpServers": [
        "sequential-thinking",
        "memory",
        "filesystem"
      ]
    },
```

