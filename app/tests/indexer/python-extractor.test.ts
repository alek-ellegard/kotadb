/**
 * Unit tests for Python symbol and import extraction.
 *
 * Tests cover:
 * - Function extraction (def, async def)
 * - Class extraction with inheritance
 * - Method extraction (instance, static, class methods)
 * - Import extraction (import, from...import, relative imports)
 * - Line number accuracy
 * - Edge cases (decorators, multiline, docstrings)
 */

import { describe, expect, test } from "bun:test";
import { extractPythonDependencies, extractPythonSymbols } from "@indexer/python-extractor";

describe("Python Symbol Extraction - Functions", () => {
	test("extracts basic function", () => {
		const content = `def hello():
    return "hello"
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toMatchObject({
			name: "hello",
			kind: "function",
			lineStart: 1,
			signature: "()",
			isAsync: false,
		});
	});

	test("extracts function with parameters", () => {
		const content = `def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toMatchObject({
			name: "greet",
			kind: "function",
			signature: '(name, greeting="Hello")',
		});
	});

	test("extracts async function", () => {
		const content = `async def fetch_data(url):
    response = await client.get(url)
    return response
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toMatchObject({
			name: "fetch_data",
			kind: "function",
			isAsync: true,
		});
	});

	test("extracts function with return type annotation", () => {
		const content = `def add(a: int, b: int) -> int:
    return a + b
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toMatchObject({
			name: "add",
			kind: "function",
			signature: "(a: int, b: int) -> int",
		});
	});

	test("extracts multiple functions", () => {
		const content = `def foo():
    pass

def bar():
    pass

def baz():
    pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		const functions = symbols.filter((s) => s.kind === "function");
		expect(functions).toHaveLength(3);
		expect(functions.map((f) => f.name)).toEqual(["foo", "bar", "baz"]);
	});
});

describe("Python Symbol Extraction - Classes", () => {
	test("extracts basic class", () => {
		const content = `class MyClass:
    pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toMatchObject({
			name: "MyClass",
			kind: "class",
			lineStart: 1,
		});
	});

	test("extracts class with inheritance", () => {
		const content = `class Child(Parent):
    pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toMatchObject({
			name: "Child",
			kind: "class",
			signature: "(Parent)",
		});
	});

	test("extracts class with multiple inheritance", () => {
		const content = `class MultiChild(Parent1, Parent2, Mixin):
    pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toMatchObject({
			name: "MultiChild",
			kind: "class",
			signature: "(Parent1, Parent2, Mixin)",
		});
	});
});

describe("Python Symbol Extraction - Methods", () => {
	test("extracts instance methods", () => {
		const content = `class User:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return f"Hello, {self.name}"
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		const classSymbol = symbols.find((s) => s.kind === "class");
		const methods = symbols.filter((s) => s.kind === "method");

		expect(classSymbol).toBeDefined();
		expect(methods).toHaveLength(2);
		expect(methods.map((m) => m.name)).toContain("__init__");
		expect(methods.map((m) => m.name)).toContain("greet");
		expect(methods[0]?.className).toBe("User");
	});

	test("extracts async methods", () => {
		const content = `class ApiClient:
    async def fetch(self, url):
        return await self._request(url)
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		const methods = symbols.filter((s) => s.kind === "method");
		expect(methods).toHaveLength(1);
		expect(methods[0]).toMatchObject({
			name: "fetch",
			kind: "method",
			isAsync: true,
			className: "ApiClient",
		});
	});
});

describe("Python Import Extraction - Basic Imports", () => {
	test("extracts simple import", () => {
		const content = `import os
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(1);
		expect(imports[0]).toMatchObject({
			modulePath: "os",
			importedNames: [],
			isRelative: false,
		});
	});

	test("extracts multiple imports on one line", () => {
		const content = `import os, sys, json
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(3);
		expect(imports.map((i) => i.modulePath)).toEqual(["os", "sys", "json"]);
	});

	test("extracts from import", () => {
		const content = `from typing import List, Dict, Optional
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(1);
		expect(imports[0]).toMatchObject({
			modulePath: "typing",
			importedNames: ["List", "Dict", "Optional"],
			isRelative: false,
		});
	});
});

describe("Python Import Extraction - Relative Imports", () => {
	test("extracts current directory import", () => {
		const content = `from . import sibling
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(1);
		expect(imports[0]).toMatchObject({
			modulePath: "./",
			isRelative: true,
		});
	});

	test("extracts parent directory import", () => {
		const content = `from .. import parent_module
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(1);
		expect(imports[0]).toMatchObject({
			modulePath: "..",
			isRelative: true,
		});
	});

	test("extracts nested relative import", () => {
		const content = `from .sub.module import func
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(1);
		expect(imports[0]).toMatchObject({
			modulePath: "./sub/module",
			importedNames: ["func"],
			isRelative: true,
		});
	});

	test("extracts double parent relative import", () => {
		const content = `from ..parent.child import helper
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(1);
		expect(imports[0]).toMatchObject({
			modulePath: "../parent/child",
			importedNames: ["helper"],
			isRelative: true,
		});
	});
});

describe("Python Dependency Extraction", () => {
	test("extracts all dependencies from source", () => {
		const content = `import os
import sys
from typing import List
from .utils import helper
from ..models import User
`;
		const deps = extractPythonDependencies(content);

		expect(deps).toHaveLength(5);
		expect(deps).toContain("os");
		expect(deps).toContain("sys");
		expect(deps).toContain("typing");
		expect(deps).toContain("./utils");
		expect(deps).toContain("../models");
	});
});

describe("Python Symbol Extraction - Line Numbers", () => {
	test("tracks relative line ordering for functions", () => {
		const content = `def first_func():
    pass

def second_func():
    pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		const firstFunc = symbols.find((s) => s.name === "first_func");
		const secondFunc = symbols.find((s) => s.name === "second_func");

		// Verify both functions are found
		expect(firstFunc).toBeDefined();
		expect(secondFunc).toBeDefined();

		// Verify relative ordering (first_func comes before second_func)
		expect(firstFunc!.lineStart).toBeLessThan(secondFunc!.lineStart);
	});

	test("tracks relative line ordering for classes and methods", () => {
		const content = `class MyClass:
    def method_one(self):
        pass

    def method_two(self):
        pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		const classSymbol = symbols.find((s) => s.kind === "class");
		const methodOne = symbols.find((s) => s.name === "method_one");
		const methodTwo = symbols.find((s) => s.name === "method_two");

		// All symbols found
		expect(classSymbol).toBeDefined();
		expect(methodOne).toBeDefined();
		expect(methodTwo).toBeDefined();

		// Class comes first
		expect(classSymbol!.lineStart).toBeLessThan(methodOne!.lineStart);
		// method_one comes before method_two
		expect(methodOne!.lineStart).toBeLessThan(methodTwo!.lineStart);
	});
});

describe("Python Symbol Extraction - Edge Cases", () => {
	test("handles decorated functions", () => {
		const content = `@decorator
def decorated_func():
    pass

@another
@decorator
def multi_decorated():
    pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		const functions = symbols.filter((s) => s.kind === "function");
		expect(functions).toHaveLength(2);
		expect(functions.map((f) => f.name)).toContain("decorated_func");
		expect(functions.map((f) => f.name)).toContain("multi_decorated");
	});

	test("handles empty file", () => {
		const content = "";
		const { symbols, imports } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(0);
		expect(imports).toHaveLength(0);
	});

	test("handles file with only comments", () => {
		const content = `# This is a comment
# Another comment
"""
Docstring
"""
`;
		const { symbols, imports } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(0);
		expect(imports).toHaveLength(0);
	});

	test("handles function with docstring", () => {
		const content = `def documented():
    """This is a docstring."""
    pass
`;
		const { symbols } = extractPythonSymbols(content, "test.py");

		expect(symbols).toHaveLength(1);
		expect(symbols[0]?.name).toBe("documented");
	});

	test("ignores import aliases", () => {
		const content = `import numpy as np
from pandas import DataFrame as DF
`;
		const { imports } = extractPythonSymbols(content, "test.py");

		expect(imports).toHaveLength(2);
		expect(imports[0]?.modulePath).toBe("numpy");
		expect(imports[1]?.modulePath).toBe("pandas");
		expect(imports[1]?.importedNames).toContain("DataFrame");
	});
});

describe("Python Symbol Extraction - Complex File", () => {
	test("extracts from realistic Python file", () => {
		const content = `"""Module docstring."""

import os
from typing import List, Optional
from .models import User

class UserService:
    """Service for user operations."""

    def __init__(self, db):
        self.db = db

    async def get_user(self, user_id: int) -> Optional[User]:
        """Fetch user by ID."""
        return await self.db.find(user_id)

    def list_users(self) -> List[User]:
        return self.db.all()

def create_service(db) -> UserService:
    """Factory function."""
    return UserService(db)
`;
		const { symbols, imports } = extractPythonSymbols(content, "test.py");

		// Check imports
		expect(imports).toHaveLength(3);
		expect(imports.some((i) => i.modulePath === "os")).toBe(true);
		expect(imports.some((i) => i.modulePath === "typing")).toBe(true);
		expect(imports.some((i) => i.modulePath === "./models")).toBe(true);

		// Check class
		const classSymbol = symbols.find((s) => s.kind === "class");
		expect(classSymbol?.name).toBe("UserService");

		// Check methods
		const methods = symbols.filter((s) => s.kind === "method");
		expect(methods).toHaveLength(3);
		expect(methods.map((m) => m.name)).toContain("__init__");
		expect(methods.map((m) => m.name)).toContain("get_user");
		expect(methods.map((m) => m.name)).toContain("list_users");

		// Check async method
		const getUser = methods.find((m) => m.name === "get_user");
		expect(getUser?.isAsync).toBe(true);

		// Check standalone function
		const factory = symbols.find((s) => s.kind === "function" && s.name === "create_service");
		expect(factory).toBeDefined();
		expect(factory?.className).toBeUndefined();
	});
});
