import { builtinModules } from "module";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname } from "path";
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "open-sse", "bin", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const SKIPPED_DIRS = new Set([".git", ".next", "coverage", "dist", "node_modules"]);
const INTERNAL_PREFIXES = ["@/", "@ozrouter/"];
const BUILT_INS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as PackageJson;
}

function walkFiles(directory: string, files: string[] = []): string[] {
  const absoluteDirectory = join(ROOT, directory);
  for (const entry of readdirSync(absoluteDirectory)) {
    if (SKIPPED_DIRS.has(entry)) continue;

    const absolutePath = join(absoluteDirectory, entry);
    const relativePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      walkFiles(relativePath, files);
      continue;
    }

    if (stats.isFile() && SOURCE_EXTENSIONS.has(extname(entry))) {
      files.push(relativePath);
    }
  }
  return files;
}

function getPackageName(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    BUILT_INS.has(specifier) ||
    INTERNAL_PREFIXES.some((prefix) => specifier.startsWith(prefix))
  ) {
    return null;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }

  return specifier.split("/")[0] || null;
}

function collectManifestPackages(packageJson: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]);
}

function collectExternalImports(file: string): string[] {
  const absolutePath = join(ROOT, file);
  const source = readFileSync(absolutePath, "utf8");
  const scriptKind =
    file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const imports: string[] = [];

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node)) {
      const [argument] = node.arguments;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;

      if ((isRequire || isDynamicImport) && argument && ts.isStringLiteralLike(argument)) {
        imports.push(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

test("all external package imports are declared in the root manifest", () => {
  const declaredPackages = collectManifestPackages(readPackageJson());
  const missing = new Map<string, string[]>();

  for (const file of SOURCE_ROOTS.flatMap((sourceRoot) => walkFiles(sourceRoot))) {
    for (const specifier of collectExternalImports(file)) {
      const packageName = getPackageName(specifier);
      if (!packageName || declaredPackages.has(packageName)) continue;

      const references = missing.get(packageName) ?? [];
      references.push(`${file}: ${specifier}`);
      missing.set(packageName, references);
    }
  }

  assert.deepEqual(
    [...missing.entries()].map(([packageName, references]) => ({
      packageName,
      references: references.slice(0, 5),
    })),
    []
  );
});
