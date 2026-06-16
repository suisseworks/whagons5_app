import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type KeyUsage = {
  key: string;
  file: string;
  line: number;
};

type DynamicUsage = {
  file: string;
  line: number;
  expression: string;
};

type HardcodedHit = {
  file: string;
  line: number;
  kind: string;
  text: string;
};

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE_DIR = join(APP_ROOT, 'src/locales');
const SOURCE_DIR = join(APP_ROOT, 'src');
const BASE_LOCALE = 'en';
const TARGET_LOCALES = ['es'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SOURCE_IGNORES = [
  '/src/locales/',
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  '.d.ts',
];

const UI_JSX_ATTRIBUTES = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'alt',
  'headerTitle',
  'label',
  'placeholder',
  'tabBarLabel',
  'title',
]);

const UI_OBJECT_PROPERTIES = new Set([
  'accessibilityLabel',
  'buttonText',
  'description',
  'headerTitle',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'tabBarLabel',
  'title',
]);

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function relativePath(file: string): string {
  return relative(APP_ROOT, file).split('\\').join('/');
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function flattenLocale(value: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenLocale(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }

  out.set(prefix, String(value ?? ''));
  return out;
}

function listSourceFiles(root: string): string[] {
  const files: string[] = [];

  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      const rel = `/${relativePath(fullPath)}`;

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
        visit(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const extension = fullPath.endsWith('.tsx') ? '.tsx' : fullPath.endsWith('.ts') ? '.ts' : '';
      if (!SOURCE_EXTENSIONS.has(extension)) continue;
      if (SOURCE_IGNORES.some((ignore) => rel.includes(ignore))) continue;
      files.push(fullPath);
    }
  };

  visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function stringLiteralText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function jsxAttributeNameText(name: ts.JsxAttributeName): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isJsxNamespacedName(name)) return `${name.namespace.text}:${name.name.text}`;
  return name.getText();
}

function calleeText(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return expression.getText();
}

function isTranslationCall(call: ts.CallExpression): boolean {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text === 't';
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === 't';
  return false;
}

function looksTranslatable(raw: string): boolean {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 2) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(text)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return false;
  if (/^(true|false|null|undefined)$/i.test(text)) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(text)) return false;
  if (/^(http|https|mailto|tel|data|blob):/i.test(text)) return false;
  if (/^[a-z0-9_.:/-]+$/i.test(text) && /[_.:/-]/.test(text)) return false;
  if (/^[°%$€#@()[\]{}.,:;+\-/\\|]+$/.test(text)) return false;
  return true;
}

function isInsideTranslationCall(path: ts.Node[]): boolean {
  const current = path[path.length - 1];
  const parent = path[path.length - 2];
  return Boolean(
    current &&
    parent &&
    ts.isCallExpression(parent) &&
    parent.arguments.includes(current as ts.Expression) &&
    isTranslationCall(parent),
  );
}

function isAlertArgument(path: ts.Node[]): boolean {
  const current = path[path.length - 1];
  const parent = path[path.length - 2];
  if (!current || !parent || !ts.isCallExpression(parent)) return false;
  if (!parent.arguments.includes(current as ts.Expression)) return false;

  const expression = parent.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.expression.getText() === 'Alert' && expression.name.text === 'alert';
  }
  return false;
}

function isVisibleJsxString(path: ts.Node[]): boolean {
  if (isInsideTranslationCall(path)) return false;
  if (path.some((node) => ts.isJsxAttribute(node))) return false;
  return path.some((node) => ts.isJsxExpression(node) || ts.isJsxText(node));
}

function scanSourceFile(file: string): {
  keyUsages: KeyUsage[];
  dynamicUsages: DynamicUsage[];
  hardcodedHits: HardcodedHit[];
} {
  const text = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const rel = relativePath(file);
  const keyUsages: KeyUsage[] = [];
  const dynamicUsages: DynamicUsage[] = [];
  const hardcodedHits: HardcodedHit[] = [];

  const visit = (node: ts.Node, path: ts.Node[]) => {
    const nextPath = [...path, node];

    if (ts.isCallExpression(node) && isTranslationCall(node)) {
      const firstArg = node.arguments[0];
      const key = firstArg ? stringLiteralText(firstArg) : undefined;
      if (key) {
        keyUsages.push({ key, file: rel, line: lineOf(sourceFile, firstArg) });
      } else {
        dynamicUsages.push({
          file: rel,
          line: lineOf(sourceFile, node),
          expression: node.getText(sourceFile).slice(0, 160),
        });
      }
    }

    if (ts.isJsxText(node)) {
      const candidate = node.getText(sourceFile).replace(/[{}]/g, '').trim();
      if (looksTranslatable(candidate)) {
        hardcodedHits.push({ file: rel, line: lineOf(sourceFile, node), kind: 'jsx-text', text: candidate });
      }
    }

    if (ts.isJsxAttribute(node)) {
      const attrName = jsxAttributeNameText(node.name);
      const initializer = node.initializer;
      if (initializer && UI_JSX_ATTRIBUTES.has(attrName)) {
        const candidate = stringLiteralText(initializer);
        if (candidate && looksTranslatable(candidate)) {
          hardcodedHits.push({ file: rel, line: lineOf(sourceFile, initializer), kind: `jsx-attr:${attrName}`, text: candidate });
        }
      }
    }

    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !isInsideTranslationCall(nextPath)
    ) {
      const candidate = node.text;
      if (looksTranslatable(candidate)) {
        const parent = path[path.length - 1];
        if (isAlertArgument(nextPath)) {
          hardcodedHits.push({ file: rel, line: lineOf(sourceFile, node), kind: 'alert', text: candidate });
        } else if (isVisibleJsxString(nextPath)) {
          hardcodedHits.push({ file: rel, line: lineOf(sourceFile, node), kind: 'jsx-expression', text: candidate });
        } else if (parent && ts.isPropertyAssignment(parent)) {
          const prop = propertyNameText(parent.name);
          if (prop && UI_OBJECT_PROPERTIES.has(prop)) {
            hardcodedHits.push({ file: rel, line: lineOf(sourceFile, node), kind: `object:${prop}`, text: candidate });
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, nextPath));
  };

  visit(sourceFile, []);
  return { keyUsages, dynamicUsages, hardcodedHits };
}

function placeholders(value: string): string[] {
  const found = new Set<string>();
  for (const match of value.matchAll(/%\{([A-Za-z0-9_]+)\}/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

function formatList(items: string[], limit = 40): string {
  const visible = items.slice(0, limit).map((item) => `  - ${item}`).join('\n');
  const hidden = items.length > limit ? `\n  ...and ${items.length - limit} more` : '';
  return `${visible}${hidden}`;
}

function main() {
  const strictHardcoded = hasArg('--strict-hardcoded');
  const showHardcoded = strictHardcoded || hasArg('--hardcoded') || hasArg('--scan');
  const localePaths = [BASE_LOCALE, ...TARGET_LOCALES].map((locale) => ({
    locale,
    path: join(LOCALE_DIR, `${locale}.json`),
  }));

  for (const localePath of localePaths) {
    if (!existsSync(localePath.path)) {
      process.stderr.write(`Missing locale file: ${relativePath(localePath.path)}\n`);
      process.exit(1);
    }
  }

  const localeMaps = new Map(
    localePaths.map(({ locale, path }) => [locale, flattenLocale(readJson(path))]),
  );
  const baseMap = localeMaps.get(BASE_LOCALE)!;
  const sourceFiles = listSourceFiles(SOURCE_DIR);
  const scan = sourceFiles.map(scanSourceFile);
  const keyUsages = scan.flatMap((result) => result.keyUsages);
  const dynamicUsages = scan.flatMap((result) => result.dynamicUsages);
  const hardcodedHits = scan.flatMap((result) => result.hardcodedHits);
  const usedKeys = [...new Set(keyUsages.map((usage) => usage.key))].sort();

  let failureCount = 0;
  process.stdout.write(`Checked ${sourceFiles.length} source files and ${usedKeys.length} static translation keys.\n`);

  for (const targetLocale of TARGET_LOCALES) {
    const targetMap = localeMaps.get(targetLocale)!;
    const missingInTarget = [...baseMap.keys()].filter((key) => !targetMap.has(key)).sort();
    const extraInTarget = [...targetMap.keys()].filter((key) => !baseMap.has(key)).sort();
    const usedMissingInBase = usedKeys.filter((key) => !baseMap.has(key));
    const usedMissingInTarget = usedKeys.filter((key) => !targetMap.has(key));
    const placeholderMismatches = [...baseMap.entries()]
      .filter(([key]) => targetMap.has(key))
      .map(([key, baseValue]) => {
        const targetValue = targetMap.get(key) ?? '';
        const basePlaceholders = placeholders(baseValue);
        const targetPlaceholders = placeholders(targetValue);
        return {
          key,
          basePlaceholders,
          targetPlaceholders,
          mismatch: basePlaceholders.join('|') !== targetPlaceholders.join('|'),
        };
      })
      .filter((entry) => entry.mismatch);

    process.stdout.write(`\n${BASE_LOCALE} -> ${targetLocale}\n`);
    process.stdout.write(`  locale keys: ${baseMap.size} base, ${targetMap.size} target\n`);
    process.stdout.write(`  missing in ${targetLocale}: ${missingInTarget.length}\n`);
    process.stdout.write(`  extra in ${targetLocale}: ${extraInTarget.length}\n`);
    process.stdout.write(`  used keys missing in ${BASE_LOCALE}: ${usedMissingInBase.length}\n`);
    process.stdout.write(`  used keys missing in ${targetLocale}: ${usedMissingInTarget.length}\n`);
    process.stdout.write(`  placeholder mismatches: ${placeholderMismatches.length}\n`);

    if (missingInTarget.length > 0) {
      failureCount += missingInTarget.length;
      process.stdout.write(`\nMissing in ${targetLocale}:\n${formatList(missingInTarget)}\n`);
    }

    if (usedMissingInBase.length > 0) {
      failureCount += usedMissingInBase.length;
      process.stdout.write(`\nUsed keys missing in ${BASE_LOCALE}:\n${formatList(usedMissingInBase)}\n`);
    }

    if (usedMissingInTarget.length > 0) {
      failureCount += usedMissingInTarget.length;
      process.stdout.write(`\nUsed keys missing in ${targetLocale}:\n${formatList(usedMissingInTarget)}\n`);
    }

    if (placeholderMismatches.length > 0) {
      failureCount += placeholderMismatches.length;
      process.stdout.write('\nPlaceholder mismatches:\n');
      process.stdout.write(formatList(
        placeholderMismatches.map((entry) =>
          `${entry.key} (${BASE_LOCALE}: ${entry.basePlaceholders.join(',') || 'none'}; ${targetLocale}: ${entry.targetPlaceholders.join(',') || 'none'})`,
        ),
      ));
      process.stdout.write('\n');
    }
  }

  if (dynamicUsages.length > 0) {
    process.stdout.write(`\nDynamic translation calls, review manually: ${dynamicUsages.length}\n`);
    process.stdout.write(formatList(dynamicUsages.map((usage) => `${usage.file}:${usage.line} ${usage.expression}`), 25));
    process.stdout.write('\n');
  }

  if (showHardcoded) {
    process.stdout.write(`\nHardcoded visible-string candidates: ${hardcodedHits.length}\n`);
    if (hardcodedHits.length > 0) {
      process.stdout.write(formatList(hardcodedHits.map((hit) => `${hit.file}:${hit.line} [${hit.kind}] ${hit.text}`), 80));
      process.stdout.write('\n');
    }
  } else {
    process.stdout.write(`\nHardcoded visible-string candidates: ${hardcodedHits.length} (run with --hardcoded to list)\n`);
  }

  if (strictHardcoded && hardcodedHits.length > 0) {
    failureCount += hardcodedHits.length;
  }

  if (failureCount > 0) {
    process.stderr.write(`\nApp i18n check failed with ${failureCount} issue(s).\n`);
    process.exit(1);
  }

  process.stdout.write('\nApp i18n check passed.\n');
}

main();
