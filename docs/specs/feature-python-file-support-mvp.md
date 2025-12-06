# Feature Plan: MVP Python File Support (Regex-Based)

## Metadata
- **Issue**: #1
- **Title**: feat(indexer): add MVP Python file support with regex-based parsing
- **Labels**: enhancement
- **Branch**: `feat/1-python-file-support-mvp`

## Context

KotaDB currently supports indexing JavaScript/TypeScript files (.ts, .tsx, .js, .jsx, .cjs, .mjs, .json). Users need to index Python codebases for code search and dependency analysis.

This MVP implements Python file support using regex-based parsing, avoiding the complexity of full AST parsing while providing useful functionality for:
- Full-text code search across Python files
- Basic function and class symbol extraction
- Import dependency tracking

**Constraints:**
- Must not require external Python runtime or heavy WASM bindings
- Must maintain existing architecture patterns
- Regex-based parsing is acceptable for MVP (covers ~80% of use cases)
- No breaking changes to existing TypeScript/JavaScript indexing

## Relevant Files

Files to be modified:
- `app/src/indexer/parsers.ts` — Add `.py` to SUPPORTED_EXTENSIONS (line 10-18)
- `app/src/queue/workers/index-repo.ts` — Add Python case to getLanguageFromPath (line 546-562)
- `app/src/indexer/import-resolver.ts` — Add `__init__.py` to INDEX_FILES (line 40)

### New Files

Files to be created:
- `app/src/indexer/python-extractor.ts` — Regex-based symbol and reference extraction for Python
- `app/tests/indexer/python-extractor.test.ts` — Unit tests for Python extraction

## Work Items

### Preparation
- [x] Research existing Python support infrastructure (queries.ts already maps py → python)
- [x] Review IGNORED_DIRECTORIES (already includes __pycache__, .venv, etc.)
- [x] Verify regex-based dependency extraction already captures Python imports
- [ ] Create branch

### Execution
1. Add `.py` to SUPPORTED_EXTENSIONS in parsers.ts
2. Add Python language detection in index-repo.ts
3. Create python-extractor.ts with regex patterns for:
   - Function definitions (def, async def)
   - Class definitions
   - Import statements (import, from...import)
4. Integrate Python extractor into indexing pipeline
5. Add `__init__.py` to INDEX_FILES for import resolution
6. Write comprehensive tests

### Follow-up
- [ ] Monitor indexing performance with Python repositories
- [ ] Collect user feedback on symbol extraction accuracy
- [ ] Consider full AST parsing with tree-sitter for v2

## Step by Step Tasks

### 1. File Discovery Configuration

**File: `app/src/indexer/parsers.ts`**
```typescript
// Line 10-18: Add .py to SUPPORTED_EXTENSIONS
const SUPPORTED_EXTENSIONS = new Set<string>([
	".ts",
	".tsx",
	".js",
	".jsx",
	".cjs",
	".mjs",
	".json",
	".py",  // Add Python support
]);
```

### 2. Language Detection

**File: `app/src/queue/workers/index-repo.ts`**
```typescript
// Line 546-562: Add Python case to getLanguageFromPath
case "py":
	return "python";
```

### 3. Create Python Extractor

**File: `app/src/indexer/python-extractor.ts`**

Implement regex-based extraction for:

```typescript
// Function patterns
const PYTHON_FUNCTION_PATTERN = /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm;

// Class patterns
const PYTHON_CLASS_PATTERN = /^class\s+(\w+)(?:\(([^)]*)\))?:/gm;

// Import patterns
const PYTHON_IMPORT_PATTERN = /^(?:from\s+(\S+)\s+)?import\s+(.+)/gm;

// Method patterns (indented def inside class)
const PYTHON_METHOD_PATTERN = /^(\s{4}|\t)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm;
```

Extract:
- **Symbols**: functions, classes, methods (with line numbers, signatures)
- **References**: import statements, module references

### 4. Index File Resolution

**File: `app/src/indexer/import-resolver.ts`**
```typescript
// Line 40: Add __init__.py to INDEX_FILES
const INDEX_FILES = ["index.ts", "index.tsx", "index.js", "index.jsx", "__init__.py"];
```

### 5. Pipeline Integration

**File: `app/src/queue/workers/index-repo.ts`**

Add conditional logic to use Python extractor:
```typescript
const isPythonFile = file.path.endsWith('.py');
if (isPythonFile) {
	// Use Python regex extractor
	const { symbols, references } = extractPythonSymbols(file.content, file.path);
	// ... store symbols and references
}
```

### 6. Testing

**File: `app/tests/indexer/python-extractor.test.ts`**

Test cases:
- Basic function extraction (def, async def)
- Class extraction with inheritance
- Method extraction (instance, static, class methods)
- Import extraction (import, from...import, relative imports)
- Edge cases (decorators, multiline signatures, docstrings)
- Line number accuracy

### Validation and Finalization
- Run validation commands (see "Validation Commands" section)
- Verify Python file discovery works
- Verify symbol search returns Python functions/classes
- Verify import dependencies are tracked
- Commit changes with conventional commit message
- Push branch to remote

## Risks

**Risk**: Regex parsing misses edge cases (multiline function signatures, complex decorators)
> **Mitigation**: Document known limitations; plan tree-sitter upgrade for v2

**Risk**: Performance impact with large Python codebases
> **Mitigation**: Use streaming regex matching; same file size limits as JS/TS

**Risk**: Import resolution differs from Python semantics
> **Mitigation**: Focus on relative imports; skip stdlib/third-party for MVP

## Validation Commands

**Level 2** (Integration): Features, bugs, endpoints (DEFAULT)
- `cd app && bun run lint` — validate formatting
- `cd app && bunx tsc --noEmit` — type-check
- `cd app && bun test --filter python` — Python extractor tests
- `cd app && bun test --filter integration` — integration tests

Manual verification:
- Index a Python repository via MCP `index_repository` tool
- Search for Python functions using `search_code` tool
- Verify dependency tracking with `search_dependencies` tool

## Deliverables

**Code changes:**
- Python file discovery (parsers.ts)
- Python language detection (index-repo.ts)
- Python symbol/reference extraction (python-extractor.ts)
- Import resolver update (import-resolver.ts)

**Test coverage:**
- `app/tests/indexer/python-extractor.test.ts`
- Unit tests for all regex patterns
- Integration test with sample Python file

## Dependencies

**npm packages:**
- None required (regex-based approach)

**Environment variables:**
- None required

**Infrastructure:**
- No database migrations required
- No external services needed

## Technical Design

### Symbol Extraction Strategy

| Python Construct | Symbol Kind | Detection Pattern |
|-----------------|-------------|-------------------|
| `def func():` | function | `^(async\s+)?def\s+(\w+)` |
| `class Foo:` | class | `^class\s+(\w+)` |
| `    def method():` | method | `^(\s+)(async\s+)?def\s+(\w+)` |
| `@property` decorated | property | `^(\s+)@property\n\s+def\s+(\w+)` |

### Import Extraction Strategy

| Python Import | Extracted Path | Notes |
|---------------|---------------|-------|
| `import os` | `os` | stdlib, skip resolution |
| `from module import func` | `module` | relative to project |
| `from . import sibling` | `.` → `./` | same directory |
| `from ..parent import x` | `..` → `../` | parent directory |
| `from .sub.module import y` | `.sub.module` → `./sub/module` | nested relative |

### Architecture Decision

Chose regex over tree-sitter for MVP because:
1. **Zero dependencies** — no WASM, no native bindings
2. **Fast implementation** — 1-2 days vs 1-2 weeks
3. **Good enough** — covers 80%+ of real Python code patterns
4. **Easy to upgrade** — clear path to tree-sitter v2 if needed

## References

- Exploration analysis from conversation (2024-12-06)
- `app/src/indexer/parsers.ts` — existing file discovery
- `app/src/indexer/extractors.ts` — existing regex-based dependency extraction
- `app/src/api/queries.ts:detectLanguage()` — already has Python mapping
