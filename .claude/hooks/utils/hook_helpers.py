#!/usr/bin/env python3
"""
Shared utilities for Claude Code hooks.

All hooks must use sys.stdout.write() and sys.stderr.write()
per KotaDB logging standards. Never use print().
"""

import json
import os
import sys
from typing import Any


def read_hook_input() -> dict[str, Any]:
    """
    Parse JSON input from stdin.

    Returns:
        Parsed JSON as a dictionary, or empty dict on error.
    """
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            return {}
        return json.loads(raw_input)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Hook input parse error: {e}\n")
        return {}
    except Exception as e:
        sys.stderr.write(f"Hook input read error: {e}\n")
        return {}


def output_result(
    decision: str,
    message: str = "",
    hook_event_name: str | None = None,
) -> None:
    """
    Write JSON result to stdout for Claude Code.

    Args:
        decision: Either "continue" or "block" (prefer "continue" for advisory hooks)
        message: Additional context to show Claude
        hook_event_name: Hook event name (e.g., "UserPromptSubmit", "PostToolUse")
                        Required for proper schema validation
    """
    result: dict[str, Any] = {}

    # Use "continue" as boolean, not "decision"
    if decision == "continue":
        result["continue"] = True
    elif decision == "block":
        result["decision"] = "block"

    # Add hook event name if provided
    if hook_event_name:
        result["hookEventName"] = hook_event_name

    # Add additional context if provided
    if message:
        result["additionalContext"] = message

    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


def is_js_ts_file(path: str) -> bool:
    """
    Check if a file path is a JavaScript or TypeScript file.

    Args:
        path: File path to check

    Returns:
        True if file has .js, .jsx, .ts, or .tsx extension
    """
    if not path:
        return False
    extensions = (".ts", ".tsx", ".js", ".jsx")
    return path.lower().endswith(extensions)


def get_project_root() -> str:
    """
    Get the project root directory.

    Returns:
        Project root from CLAUDE_PROJECT_DIR env var, or current directory.
    """
    return os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())


def get_file_path_from_input(hook_input: dict[str, Any]) -> str | None:
    """
    Extract file path from hook input.

    Handles both Write and Edit tool inputs.

    Args:
        hook_input: Parsed hook input dictionary

    Returns:
        File path if found, None otherwise
    """
    tool_input = hook_input.get("tool_input", {})

    # Write tool uses "file_path"
    if "file_path" in tool_input:
        return tool_input["file_path"]

    # Edit tool may use "path" or "file_path"
    if "path" in tool_input:
        return tool_input["path"]

    return None
