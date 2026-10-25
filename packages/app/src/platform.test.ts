/**
 * The shared hooks run in a browser and in React Native. Both have the language, `fetch`, `URL`,
 * `AbortSignal`, `Headers` — and `localStorage`, which the phone gets from expo-sqlite's polyfill
 * (mobile/app/_layout.tsx). Everything else the DOM lib declares is the browser's alone; this
 * walks every source file's syntax tree and fails on any read of one. Same rule as core's, with
 * `localStorage` allowed.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const BROWSER_ONLY = new Set([
  'window', 'document', 'sessionStorage', 'navigator', 'location', 'history',
  'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'IntersectionObserver',
  'ResizeObserver', 'MutationObserver', 'HTMLElement', 'Element', 'getComputedStyle', 'indexedDB',
])

const SRC = new URL('.', import.meta.url).pathname
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') ? [join(dir, e.name)] : [],
  )

/** Identifiers that read a global: not a property name, a declaration's own name or a type. */
function browserReads(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const hits: string[] = []
  // a name declared in an enclosing scope (`window` the time span in index/queries.ts) is that
  // binding, not the global: walk out from the use, through each function's parameters and each
  // block's declarations
  const names = (b: ts.BindingName): string[] => (ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name))))
  const declaresIn = (scope: ts.Node, name: string): boolean => {
    if (ts.isFunctionLike(scope) && scope.parameters.some((q) => names(q.name).includes(name))) return true
    const stmts = ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) ? scope.statements : undefined
    return !!stmts?.some((st) =>
      (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => names(d.name).includes(name))) ||
      ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name?.text === name))
  }
  const isLocal = (n: ts.Identifier) => { for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (declaresIn(p, n.text)) return true; return false }
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && BROWSER_ONLY.has(n.text) && !isLocal(n)) {
      const p = n.parent
      const isName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) ||
          ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isShorthandPropertyAssignment(p)) && p.name === n) ||
        ts.isTypeReferenceNode(p) || ts.isQualifiedName(p)
      if (!isName) hits.push(`${file.slice(SRC.length)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.text}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return hits
}

describe('the shared hooks are platform-free', () => {
  it('reads no browser-only global', () => {
    expect(sources(SRC).flatMap(browserReads)).toEqual([])
  })
})
