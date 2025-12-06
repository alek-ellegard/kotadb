/**
 * Python symbol and import extraction using regex patterns.
 *
 * This module extracts symbols (functions, classes, methods) and imports from Python
 * source files using regex-based parsing. This MVP approach avoids the complexity
 * of full AST parsing while providing useful functionality for code intelligence.
 *
 * Key features:
 * - Function extraction (def, async def)
 * - Class extraction with inheritance
 * - Method extraction (instance, static, class methods)
 * - Import extraction (import, from...import, relative imports)
 * - Line number tracking for editor navigation
 *
 * Known limitations (MVP):
 * - Multiline function signatures may not parse correctly
 * - Complex decorator chains not fully supported
 * - Type hints captured but not analyzed
 * - No docstring extraction
 *
 * @see app/src/indexer/symbol-extractor.ts - TypeScript symbol extractor
 * @see docs/specs/feature-python-file-support-mvp.md - Feature specification
 */

import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-python-extractor" });

/**
 * Python symbol metadata extracted from source code.
 */
export interface PythonSymbol {
	/** Symbol name */
	name: string;
	/** Symbol classification (function, class, method) */
	kind: PythonSymbolKind;
	/** Start line number (1-indexed) */
	lineStart: number;
	/** End line number (1-indexed, estimated from indentation) */
	lineEnd: number;
	/** Function/method signature with parameters */
	signature: string | null;
	/** Whether function is async */
	isAsync?: boolean;
	/** Containing class name for methods */
	className?: string;
}

/**
 * Python symbol classification types.
 */
export type PythonSymbolKind = "function" | "class" | "method";

/**
 * Python import metadata extracted from source code.
 */
export interface PythonImport {
	/** Import path/module (e.g., "os", "./sibling", "../parent") */
	modulePath: string;
	/** Imported names (for 'from X import Y, Z') */
	importedNames: string[];
	/** Whether this is a relative import */
	isRelative: boolean;
	/** Line number (1-indexed) */
	line: number;
}

/**
 * Result of Python extraction.
 */
export interface PythonExtractionResult {
	symbols: PythonSymbol[];
	imports: PythonImport[];
}

// Regex patterns for Python constructs
// Match function definitions at any indentation level
const FUNCTION_PATTERN = /^(\s*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm;

// Match class definitions
const CLASS_PATTERN = /^class\s+(\w+)(?:\s*\(([^)]*)\))?:/gm;

// Match import statements
const IMPORT_PATTERN = /^import\s+(.+)/gm;
const FROM_IMPORT_PATTERN = /^from\s+(\S+)\s+import\s+(.+)/gm;

/**
 * Extract symbols and imports from Python source code.
 *
 * @param content - Python source code
 * @param filePath - File path (for logging)
 * @returns Extraction result with symbols and imports
 */
export function extractPythonSymbols(content: string, filePath: string): PythonExtractionResult {
	const symbols: PythonSymbol[] = [];
	const imports: PythonImport[] = [];
	const lines = content.split("\n");

	// Track class context for method extraction
	let currentClass: { name: string; indent: number; startLine: number } | null = null;

	// Extract classes first to establish context
	const classPositions = extractClasses(content, lines, symbols);

	// Extract functions and methods
	extractFunctions(content, lines, symbols, classPositions);

	// Extract imports
	extractImports(content, imports);

	logger.debug("Extracted Python symbols", {
		file_path: filePath,
		symbol_count: symbols.length,
		import_count: imports.length,
	});

	return { symbols, imports };
}

/**
 * Extract class definitions from Python source.
 *
 * @param content - Source code
 * @param lines - Source lines array
 * @param symbols - Symbol accumulator
 * @returns Map of line numbers to class info for method detection
 */
function extractClasses(
	content: string,
	lines: string[],
	symbols: PythonSymbol[],
): Map<number, { name: string; indent: number; endLine: number }> {
	const classPositions = new Map<number, { name: string; indent: number; endLine: number }>();

	CLASS_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = CLASS_PATTERN.exec(content)) !== null) {
		const name = match[1];
		const inheritance = match[2] || null;
		const lineStart = getLineNumber(content, match.index);
		const indent = 0; // Classes at top level

		// Estimate end line by finding next class or function at same/lower indent
		const endLine = estimateBlockEnd(lines, lineStart, indent);

		classPositions.set(lineStart, { name: name!, indent, endLine });

		symbols.push({
			name: name!,
			kind: "class",
			lineStart,
			lineEnd: endLine,
			signature: inheritance ? `(${inheritance})` : null,
		});
	}

	return classPositions;
}

/**
 * Extract function and method definitions from Python source.
 *
 * @param content - Source code
 * @param lines - Source lines array
 * @param symbols - Symbol accumulator
 * @param classPositions - Map of class positions for method detection
 */
function extractFunctions(
	content: string,
	lines: string[],
	symbols: PythonSymbol[],
	classPositions: Map<number, { name: string; indent: number; endLine: number }>,
): void {
	FUNCTION_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = FUNCTION_PATTERN.exec(content)) !== null) {
		const indent = match[1]?.length || 0;
		const isAsync = !!match[2];
		const name = match[3];
		const params = match[4] || "";
		const returnType = match[5] || null;
		const lineStart = getLineNumber(content, match.index);

		// Determine if this is a method (inside a class)
		let className: string | undefined;
		let kind: PythonSymbolKind = "function";

		for (const [classLine, classInfo] of classPositions) {
			// endLine is the first line OUTSIDE the class, so use < instead of <=
			if (lineStart > classLine && lineStart < classInfo.endLine && indent > classInfo.indent) {
				className = classInfo.name;
				kind = "method";
				break;
			}
		}

		// Estimate end line
		const endLine = estimateBlockEnd(lines, lineStart, indent);

		// Build signature
		let signature = `(${params.trim()})`;
		if (returnType) {
			signature += ` -> ${returnType.trim()}`;
		}

		symbols.push({
			name: name!,
			kind,
			lineStart,
			lineEnd: endLine,
			signature,
			isAsync,
			className,
		});
	}
}

/**
 * Extract import statements from Python source.
 *
 * @param content - Source code
 * @param imports - Import accumulator
 */
function extractImports(content: string, imports: PythonImport[]): void {
	// Handle 'import X' statements
	IMPORT_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = IMPORT_PATTERN.exec(content)) !== null) {
		const lineNumber = getLineNumber(content, match.index);
		const moduleList = match[1]!.trim();

		// Handle 'import X, Y, Z' or 'import X as Y'
		const modules = moduleList.split(",").map((m) =>
			m
				.trim()
				.split(/\s+as\s+/)[0]!
				.trim(),
		);

		for (const modulePath of modules) {
			imports.push({
				modulePath,
				importedNames: [],
				isRelative: false,
				line: lineNumber,
			});
		}
	}

	// Handle 'from X import Y' statements
	FROM_IMPORT_PATTERN.lastIndex = 0;

	while ((match = FROM_IMPORT_PATTERN.exec(content)) !== null) {
		const lineNumber = getLineNumber(content, match.index);
		const modulePath = match[1]!.trim();
		const nameList = match[2]!.trim();

		// Parse imported names (handling 'as' aliases)
		const importedNames = nameList
			.split(",")
			.map((n) =>
				n
					.trim()
					.split(/\s+as\s+/)[0]!
					.trim(),
			)
			.filter((n) => n && n !== "*");

		// Detect relative imports
		const isRelative = modulePath.startsWith(".");

		// Convert Python relative imports to path-like format
		const normalizedPath = normalizePythonImport(modulePath);

		imports.push({
			modulePath: normalizedPath,
			importedNames,
			isRelative,
			line: lineNumber,
		});
	}
}

/**
 * Normalize Python import path to file-system-like format.
 *
 * Converts:
 * - '.' → './'
 * - '..' → '../'
 * - '.module' → './module'
 * - '..parent.child' → '../parent/child'
 *
 * @param importPath - Python import path
 * @returns Normalized path
 */
function normalizePythonImport(importPath: string): string {
	if (!importPath.startsWith(".")) {
		return importPath;
	}

	// Count leading dots
	let dotCount = 0;
	for (const char of importPath) {
		if (char === ".") {
			dotCount++;
		} else {
			break;
		}
	}

	// Get the rest of the path after dots
	const rest = importPath.slice(dotCount);

	// Build normalized path
	if (dotCount === 1) {
		// Single dot: current directory
		return rest ? `./${rest.replace(/\./g, "/")}` : "./";
	}

	// Multiple dots: parent directories
	const parentPath = "../".repeat(dotCount - 1);
	return rest ? `${parentPath}${rest.replace(/\./g, "/")}` : parentPath.slice(0, -1);
}

/**
 * Get line number (1-indexed) from character position.
 *
 * @param content - Source code
 * @param position - Character position
 * @returns Line number (1-indexed)
 */
function getLineNumber(content: string, position: number): number {
	const before = content.slice(0, position);
	return (before.match(/\n/g) || []).length + 1;
}

/**
 * Estimate the end line of a Python block based on indentation.
 *
 * @param lines - Source lines array (0-indexed)
 * @param startLine - Block start line (1-indexed)
 * @param startIndent - Block starting indentation
 * @returns Estimated end line (1-indexed)
 */
function estimateBlockEnd(lines: string[], startLine: number, startIndent: number): number {
	// Convert to 0-indexed and start from the line after the definition
	const startIndex = startLine; // startLine is 1-indexed, so startLine means line startLine+1 (0-indexed)

	for (let i = startIndex; i < lines.length; i++) {
		const line = lines[i];

		// Skip empty lines and comments
		if (!line || !line.trim() || line.trimStart().startsWith("#")) continue;

		// Get indentation
		const indent = line.length - line.trimStart().length;

		// If we find a line at same or lower indentation, block ended before this line
		if (indent <= startIndent) {
			return i; // Return 0-indexed position as the end (exclusive)
		}
	}

	// Block extends to end of file
	return lines.length;
}

/**
 * Extract Python dependencies from source (convenience wrapper).
 *
 * @param content - Python source code
 * @returns Array of import paths
 */
export function extractPythonDependencies(content: string): string[] {
	const { imports } = extractPythonSymbols(content, "<inline>");
	return imports.map((imp) => imp.modulePath);
}
