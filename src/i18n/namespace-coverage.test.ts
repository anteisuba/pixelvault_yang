import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
  MARKETING_NAMESPACES,
  OUTSIDE_APP_NAMESPACES,
} from '@/i18n/messages-split'

/**
 * ── The ruler for message-bundle slicing ──────────────────────────────
 *
 * `completeness.test.ts` answers "does this key exist in the JSON?".
 * It cannot answer the question that actually breaks pages:
 *
 *   > Did the `NextIntlClientProvider` wrapping this route ship the
 *   > namespace that a client component under it asks for?
 *
 * Miss that and `useTranslations('Foo')` resolves to the literal string
 * `"Foo.bar"` on screen. No throw, no type error, no failing test — the
 * exact failure mode the marketing-page incident had.
 *
 * This file asserts, per route:
 *
 *   client-reachable namespaces ⊆ namespaces the route's provider ships
 *
 * "client-reachable" is the load-bearing word. Namespaces consumed by
 * *server* components resolve from the request config and never touch a
 * provider, so counting them would flag `Metadata` (read via
 * `getTranslations` in `[locale]/layout.tsx`, a server file in every
 * route's chain) as a `(main)` consumer — a false alarm that would make
 * the correct `OUTSIDE_APP_NAMESPACES` deny-list look wrong. So the walk
 * tracks the RSC boundary: a module is client-side once a `'use client'`
 * file is reached, and everything it imports from there down is too.
 */

const SRC_DIR = join(process.cwd(), 'src')
const APP_DIR = join(SRC_DIR, 'app')
const MESSAGES_FILE = join(SRC_DIR, 'messages', 'en.json')

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs']

/**
 * Route files that render *inside* the provider of the layout chain they
 * sit in, so their imports belong to the route's reachable set.
 *
 * ⛔ `global-error.tsx` is deliberately absent: it replaces the root
 * `<html>` and renders outside every layout, hence outside every
 * provider. It reads its strings from a raw JSON import instead — see
 * the `GlobalError` note in `messages-split.ts`.
 */
const CHAIN_FILE_NAMES = [
  'layout',
  'template',
  'error',
  'not-found',
  'loading',
  'default',
] as const

const MAIN_GROUP_DIR = 'app/[locale]/(main)'
const LOCALE_DIR = 'app/[locale]'

/* ═══════════════════════ 1. AST primitives ═══════════════════════ */
/* Same modeling as `completeness.test.ts`: literal-or-nothing string
 * resolution, scope-cloned environments, and an explicit "dynamic"
 * outcome instead of a silent skip. */

function getStringValue(expression: ts.Expression | undefined): string | null {
  if (!expression) {
    return null
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text
  }
  return null
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function getCallName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    return `${expression.expression.text}.${expression.name.text}`
  }
  return null
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text
  }
  return null
}

/** `"Foo.bar.baz"` → `"Foo"`. Empty input yields nothing. */
function rootNamespaceOf(value: string): string | null {
  const root = value.split('.')[0]
  return root ? root : null
}

/* ═══════════════════ 2. Namespace resolution ═══════════════════ */

interface StringEnv {
  strings: Map<string, string[]>
}

/** Literal strings an expression can evaluate to, or `[]` if unknowable. */
function staticStrings(
  expression: ts.Expression,
  env: StringEnv,
): string[] | null {
  const current = unwrapExpression(expression)

  const literal = getStringValue(current)
  if (literal !== null) {
    return [literal]
  }

  if (ts.isIdentifier(current)) {
    return env.strings.get(current.text) ?? null
  }

  if (ts.isConditionalExpression(current)) {
    const whenTrue = staticStrings(current.whenTrue, env)
    const whenFalse = staticStrings(current.whenFalse, env)
    if (whenTrue === null || whenFalse === null) {
      return null
    }
    return [...whenTrue, ...whenFalse]
  }

  return null
}

/**
 * Root namespace(s) a `useTranslations` / `getTranslations` argument
 * selects — or `null` when the analyzer cannot prove it.
 *
 * A template literal is only "dynamic" when the substitution can reach
 * the *root* segment. ``useTranslations(`StudioTools.tools.${k}`)`` is
 * fully determined at the root (`StudioTools`) because the head already
 * closed a segment with a dot; ``useTranslations(`${g}.tools`)`` is not.
 */
function namespacesFromArgument(
  argument: ts.Expression,
  env: StringEnv,
): string[] | null {
  const current = unwrapExpression(argument)

  if (ts.isTemplateExpression(current)) {
    const head = current.head.text
    if (!head.includes('.')) {
      return null
    }
    const root = rootNamespaceOf(head)
    return root ? [root] : null
  }

  const literals = staticStrings(current, env)
  if (literals === null) {
    return null
  }

  const roots: string[] = []
  for (const literal of literals) {
    const root = rootNamespaceOf(literal)
    if (root === null) {
      return null
    }
    roots.push(root)
  }
  return roots
}

/* ═══════════════════ 3. Per-module analysis ═══════════════════ */

/**
 * A site the analyzer cannot pin down. Two shapes, both fatal if
 * undeclared:
 *
 * - `dynamic-import` — an `import(expr)` edge the graph cannot follow, so
 *   whatever sits behind it is invisible to the whole walk.
 * - the other three — a `useTranslations`/`getTranslations` whose
 *   namespace cannot be proven.
 */
interface UnresolvedSite {
  /** Posix path relative to `src/`. */
  file: string
  line: number
  /** Normalized source text of the call — the stable identity of the site. */
  code: string
  reason:
    | 'dynamic-import'
    | 'dynamic-namespace'
    | 'dynamic-key'
    | 'translator-escapes'
}

type NamespaceFailure = Exclude<UnresolvedSite['reason'], 'dynamic-import'>

interface AnalyzedModule {
  isClientEntry: boolean
  imports: readonly string[]
  namespaces: readonly string[]
  unresolved: readonly UnresolvedSite[]
}

/**
 * A `useTranslations()` / `getTranslations()` called with no namespace.
 * Its keys carry the namespace instead (`t('Navbar.links.gallery')`), so
 * the root has to be recovered from every call made on the binding.
 */
interface RootTranslatorSite {
  call: ts.CallExpression
  roots: Set<string>
  failure: NamespaceFailure | null
}

type TranslatorBinding =
  | { kind: 'namespaced' }
  | { kind: 'root'; site: RootTranslatorSite }

interface ScanEnv extends StringEnv {
  translators: Map<string, TranslatorBinding>
}

function cloneEnv(env: ScanEnv): ScanEnv {
  return {
    translators: new Map(env.translators),
    strings: new Map(env.strings),
  }
}

function isFunctionWithBody(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
}

/** `t(key)` and `t.rich(key)` are call positions; anything else escapes. */
function isTranslatorCallPosition(identifier: ts.Identifier): boolean {
  const parent = identifier.parent
  if (!parent) {
    return false
  }
  if (ts.isCallExpression(parent) && parent.expression === identifier) {
    return true
  }
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === identifier
  ) {
    const grandParent = parent.parent
    return (
      !!grandParent &&
      ts.isCallExpression(grandParent) &&
      grandParent.expression === parent
    )
  }
  return false
}

function toPosix(absolutePath: string): string {
  return relative(SRC_DIR, absolutePath).split(sep).join('/')
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = join(SRC_DIR, specifier.slice(2))
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = join(dirname(fromFile), specifier)
  } else {
    // Bare specifier — node_modules, `next/*`, virtual modules. Nothing
    // in the app's own namespace graph lives there.
    return null
  }

  for (const extension of MODULE_EXTENSIONS) {
    if (base.endsWith(extension) && existsSync(base)) {
      return base
    }
  }
  for (const extension of MODULE_EXTENSIONS) {
    const candidate = `${base}${extension}`
    if (existsSync(candidate)) {
      return candidate
    }
  }
  for (const extension of MODULE_EXTENSIONS) {
    const candidate = join(base, `index${extension}`)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  // `.css` / `.json` / assets: no imports and no translations to find.
  return null
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    ) {
      return false
    }
    if (statement.expression.text === 'use client') {
      return true
    }
  }
  return false
}

function analyzeModule(filePath: string): AnalyzedModule {
  const source = readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const file = toPosix(filePath)
  const imports = new Set<string>()
  const namespaces = new Set<string>()
  const unresolved: UnresolvedSite[] = []
  const rootSites: RootTranslatorSite[] = []

  function describe(node: ts.Node): { line: number; code: string } {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    )
    return {
      line: position.line + 1,
      code: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 120),
    }
  }

  function flag(node: ts.Node, reason: UnresolvedSite['reason']) {
    const { line, code } = describe(node)
    unresolved.push({ file, line, code, reason })
  }

  function addSpecifier(specifier: ts.Expression | undefined) {
    const literal = getStringValue(specifier)
    if (literal === null) {
      return
    }
    const resolved = resolveImport(filePath, literal)
    if (resolved) {
      imports.add(resolved)
    }
  }

  function collectImports(node: ts.Node) {
    // `import type … from` / `export type … from` erase at build time and
    // cannot drag a component into the client bundle.
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) {
        addSpecifier(node.moduleSpecifier)
      }
      return
    }
    if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly) {
        addSpecifier(node.moduleSpecifier)
      }
      return
    }
    // `await import('…')`, and `next/dynamic`'s `dynamic(() => import('…'))`
    // which is just this node nested in an arrow function.
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = node.arguments[0]
      if (specifier && getStringValue(specifier) === null) {
        flag(node, 'dynamic-import')
      }
      addSpecifier(specifier)
    }
    ts.forEachChild(node, collectImports)
  }

  /**
   * `const t = useTranslations(x)` is reached twice — once by the generic
   * expression walk, once by the declaration handler that needs the
   * binding. Memoizing per call node keeps a single site identity, so an
   * unresolvable namespace is reported once rather than twice.
   */
  const translatorByCall = new Map<ts.CallExpression, TranslatorBinding>()

  function registerTranslator(
    call: ts.CallExpression,
    env: ScanEnv,
  ): TranslatorBinding {
    const memoized = translatorByCall.get(call)
    if (memoized) {
      return memoized
    }
    const binding = buildTranslator(call, env)
    translatorByCall.set(call, binding)
    return binding
  }

  function buildTranslator(
    call: ts.CallExpression,
    env: ScanEnv,
  ): TranslatorBinding {
    const argument = call.arguments[0]

    // `getTranslations({ locale, namespace: 'Foo' })`
    if (argument && ts.isObjectLiteralExpression(unwrapExpression(argument))) {
      const object = unwrapExpression(argument) as ts.ObjectLiteralExpression
      for (const property of object.properties) {
        if (
          !ts.isPropertyAssignment(property) ||
          getPropertyName(property.name) !== 'namespace'
        ) {
          continue
        }
        const roots = namespacesFromArgument(property.initializer, env)
        if (roots === null) {
          flag(call, 'dynamic-namespace')
        } else {
          for (const root of roots) namespaces.add(root)
        }
        return { kind: 'namespaced' }
      }
      // No `namespace` property — behaves like the no-argument form.
      const site: RootTranslatorSite = { call, roots: new Set(), failure: null }
      rootSites.push(site)
      return { kind: 'root', site }
    }

    if (argument) {
      const roots = namespacesFromArgument(argument, env)
      if (roots === null) {
        flag(call, 'dynamic-namespace')
      } else {
        for (const root of roots) namespaces.add(root)
      }
      return { kind: 'namespaced' }
    }

    const site: RootTranslatorSite = { call, roots: new Set(), failure: null }
    rootSites.push(site)
    return { kind: 'root', site }
  }

  function scanTranslatorCall(node: ts.CallExpression, env: ScanEnv) {
    let name: string | null = null
    if (ts.isIdentifier(node.expression)) {
      name = node.expression.text
    } else if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      name = node.expression.expression.text
    }
    if (!name) {
      return
    }

    const binding = env.translators.get(name)
    if (!binding || binding.kind !== 'root') {
      return
    }

    const key = node.arguments[0]
    const literals = key ? staticStrings(key, env) : null
    if (literals === null) {
      binding.site.failure ??= 'dynamic-key'
      return
    }
    for (const literal of literals) {
      const root = rootNamespaceOf(literal)
      if (root === null) {
        binding.site.failure ??= 'dynamic-key'
        continue
      }
      binding.site.roots.add(root)
    }
  }

  function scanNode(node: ts.Node, env: ScanEnv) {
    if (ts.isCallExpression(node)) {
      const callName = getCallName(node.expression)
      if (callName === 'useTranslations' || callName === 'getTranslations') {
        // A bare `useTranslations('Foo')(…)` that is never bound still
        // pulls the namespace in; registering discards the binding.
        registerTranslator(node, env)
      } else {
        scanTranslatorCall(node, env)
      }
    }

    if (ts.isIdentifier(node)) {
      const binding = env.translators.get(node.text)
      if (
        binding?.kind === 'root' &&
        !isTranslatorCallPosition(node) &&
        node.parent &&
        !ts.isPropertyAssignment(node.parent)
      ) {
        binding.site.failure ??= 'translator-escapes'
      }
    }

    if (isFunctionWithBody(node) && node.body) {
      scanNode(node.body, cloneEnv(env))
      return
    }

    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      const scopeEnv = ts.isSourceFile(node) ? env : cloneEnv(env)
      for (const statement of node.statements) {
        scanStatement(statement, scopeEnv)
      }
      return
    }

    ts.forEachChild(node, (child) => scanNode(child, env))
  }

  function scanStatement(statement: ts.Statement, env: ScanEnv) {
    if (!ts.isVariableStatement(statement)) {
      scanNode(statement, env)
      return
    }

    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer) {
        scanNode(declaration.initializer, env)
      }
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue
      }

      const literals = staticStrings(declaration.initializer, env)
      if (literals !== null && literals.length > 0) {
        env.strings.set(declaration.name.text, literals)
      }

      const initializer = unwrapExpression(declaration.initializer)
      if (!ts.isCallExpression(initializer)) {
        continue
      }
      const callName = getCallName(initializer.expression)
      if (callName !== 'useTranslations' && callName !== 'getTranslations') {
        continue
      }
      // `scanNode` above already walked this call; `registerTranslator`
      // is memoized, so this hands back the very same binding.
      env.translators.set(
        declaration.name.text,
        registerTranslator(initializer, env),
      )
    }
  }

  collectImports(sourceFile)
  if (
    source.includes('useTranslations') ||
    source.includes('getTranslations')
  ) {
    scanNode(sourceFile, { translators: new Map(), strings: new Map() })
  }

  for (const site of rootSites) {
    for (const root of site.roots) {
      namespaces.add(root)
    }
    if (site.failure) {
      const { line, code } = describe(site.call)
      unresolved.push({ file, line, code, reason: site.failure })
    }
  }

  return {
    isClientEntry: hasUseClientDirective(sourceFile),
    imports: [...imports],
    namespaces: [...namespaces],
    unresolved,
  }
}

/* ═══════════════════ 4. Module cache + file walk ═══════════════════ */

const moduleCache = new Map<string, AnalyzedModule>()

function getModule(filePath: string): AnalyzedModule {
  const cached = moduleCache.get(filePath)
  if (cached) {
    return cached
  }
  const analyzed = analyzeModule(filePath)
  moduleCache.set(filePath, analyzed)
  return analyzed
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(filePath))
      continue
    }
    if (
      (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) &&
      !filePath.endsWith('.d.ts') &&
      !filePath.includes('.test.')
    ) {
      files.push(filePath)
    }
  }
  return files
}

/* ═══════════════════ 5. Blind-spot ledger ═══════════════════ */

interface DynamicSiteEntry {
  /** Why the AST cannot resolve it, and where the real strings live. */
  reason: string
  /** Normalized call text, one entry per unresolved site in the file. */
  calls: readonly string[]
  /**
   * Namespaces the site actually reaches, read off the constant tables it
   * indexes into. ⚠ These are *declared*, not proven — but they are still
   * folded into the reachable set, so dropping one from a provider turns
   * this ruler red instead of silently passing.
   */
  namespaces: readonly string[]
}

/**
 * Sites where `useTranslations` is called without a resolvable namespace.
 *
 * ⛔ This list must never be used to *skip* a site. Every entry declares
 * the namespaces it reaches; an undeclared site fails the suite. Skipping
 * would blind the ruler exactly where the code is hardest to read.
 */
const KNOWN_DYNAMIC_NAMESPACE_SITES: Readonly<
  Record<string, DynamicSiteEntry>
> = {
  'components/layout/AppSidebar.tsx': {
    // line 160 as of 2026-08-25
    reason:
      'Renders `SHELL_NAV_GO` / `SHELL_NAV_TOOLS` / `SHELL_NAV_LOCKED` from ' +
      '`src/constants/navigation.ts` via `t(item.labelKey)`. Every `labelKey` ' +
      'there is a full dotted path under `Navbar.` or `StudioTools.`.',
    calls: ['useTranslations()'],
    namespaces: ['Navbar', 'StudioTools'],
  },
  'components/layout/MobileShell.tsx': {
    // lines 69 and 169 as of 2026-08-25
    reason:
      'Same `SHELL_NAV_*` tables as AppSidebar, read twice (top bar entry ' +
      'label + the nav sheet grid). See `src/constants/navigation.ts`.',
    calls: ['useTranslations()', 'useTranslations()'],
    namespaces: ['Navbar', 'StudioTools'],
  },
  'components/business/studio-shared/workflow/StudioWorkflowPicker.tsx': {
    // line 32 as of 2026-08-25
    reason:
      'The translator is handed to the module-level `translateWorkflow(t, ' +
      'workflow)` helper, so the keys are resolved one call frame away. They ' +
      'are `workflow.publicNameKey` / `descriptionKey` from ' +
      '`src/constants/workflows.ts`, all under `workflows.`.',
    calls: ['useTranslations()'],
    namespaces: ['workflows'],
  },
  'components/business/studio-shared/workflow/StudioWorkflowSummary.tsx': {
    // line 9 as of 2026-08-25
    reason:
      'Calls `t(workflow.publicNameKey)` / `t(workflow.descriptionKey)` — ' +
      'property reads off `src/constants/workflows.ts`, all under `workflows.`.',
    calls: ['useTranslations()'],
    namespaces: ['workflows'],
  },
}

/**
 * `import(expr)` edges the graph cannot follow. Each one is a hole in the
 * walk — whatever sits behind it contributes no namespaces, so the subset
 * assertion is blind there.
 *
 * ⛔ Only admissible when the target provably contains no
 * `useTranslations` consumer. A dynamically-imported *component* belongs
 * in a real static edge, not here.
 */
const KNOWN_DYNAMIC_IMPORT_SITES: Readonly<
  Record<string, { reason: string; calls: readonly string[] }>
> = {
  'i18n/request.ts': {
    // line 14 as of 2026-08-25
    reason:
      'Loads the locale message bundle itself (`../messages/<locale>.json`). ' +
      'Data, not code — a JSON file has no `useTranslations` call to miss. ' +
      'This is the server-side request config; it never reaches a provider.',
    calls: ['import(`../messages/${locale}.json`)'],
  },
}

/* ═══════════════════ 6. Route model ═══════════════════ */

interface Route {
  /** Posix directory of the page, relative to `src/`. */
  id: string
  /** Page file plus every layout/template/error file wrapping it. */
  entries: readonly string[]
}

function listPageFiles(dir: string): string[] {
  const pages: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name)
    if (entry.isDirectory()) {
      pages.push(...listPageFiles(filePath))
      continue
    }
    if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      pages.push(filePath)
    }
  }
  return pages
}

function layoutChainFor(pageFile: string): string[] {
  const chain: string[] = []
  let dir = dirname(pageFile)
  for (;;) {
    for (const name of CHAIN_FILE_NAMES) {
      for (const extension of ['.tsx', '.ts'] as const) {
        const candidate = join(dir, `${name}${extension}`)
        if (existsSync(candidate)) {
          chain.push(candidate)
        }
      }
    }
    if (dir === APP_DIR) {
      break
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return chain
}

function discoverRoutes(): Route[] {
  return listPageFiles(APP_DIR)
    .map((pageFile) => ({
      id: toPosix(dirname(pageFile)),
      entries: [pageFile, ...layoutChainFor(pageFile)],
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/* ═══════════════════ 7. The replaceable input ═══════════════════ */

const ALL_NAMESPACES: readonly string[] = Object.keys(
  JSON.parse(readFileSync(MESSAGES_FILE, 'utf-8')) as Record<string, unknown>,
)

/**
 * Namespaces the `NextIntlClientProvider` nearest to `routeDir` ships.
 *
 * ⭐ **This is the seam for per-route bundle slicing.** Today there are
 * exactly two providers: the root `[locale]/layout.tsx` (marketing
 * subset) and `(main)/layout.tsx` (everything minus the outside-app
 * deny-list). `use-intl` 4.x *replaces* messages on nesting, so the
 * innermost provider wins outright — no merging.
 *
 * When a route grows its own layout with a narrower `pickMessages(...)`,
 * add the branch here. The assertion below does not change.
 */
function getProvidedNamespaces(routeDir: string): Set<string> {
  if (
    routeDir === MAIN_GROUP_DIR ||
    routeDir.startsWith(`${MAIN_GROUP_DIR}/`)
  ) {
    const omitted = new Set<string>(OUTSIDE_APP_NAMESPACES)
    return new Set(
      ALL_NAMESPACES.filter((namespace) => !omitted.has(namespace)),
    )
  }
  if (routeDir === LOCALE_DIR || routeDir.startsWith(`${LOCALE_DIR}/`)) {
    return new Set<string>(MARKETING_NAMESPACES)
  }
  // `app/page.tsx` sits above every locale layout: no provider at all.
  return new Set<string>()
}

/* ═══════════════════ 8. Reachability walk ═══════════════════ */

interface RouteReach {
  namespaces: Set<string>
  /** Unresolved sites found inside the route's *client* graph. */
  blindSpots: UnresolvedSite[]
  clientModules: number
  totalModules: number
}

function collectReach(route: Route): RouteReach {
  const namespaces = new Set<string>()
  const blindSpots: UnresolvedSite[] = []
  const clientModules = new Set<string>()
  const allModules = new Set<string>()

  // Visit each module twice at most: once on a server path, once on a
  // client path. A module pulled in from both sides is client-bundled, so
  // its namespaces must be provided.
  const seen = new Set<string>()
  const queue: Array<{ file: string; inClient: boolean }> = route.entries.map(
    (file) => ({ file, inClient: false }),
  )

  while (queue.length > 0) {
    const { file, inClient: parentInClient } = queue.pop() as {
      file: string
      inClient: boolean
    }
    if (!existsSync(file)) {
      continue
    }
    const analyzed = getModule(file)
    const inClient = parentInClient || analyzed.isClientEntry
    const marker = `${inClient ? 'c' : 's'}:${file}`
    if (seen.has(marker)) {
      continue
    }
    seen.add(marker)

    allModules.add(file)
    if (inClient) {
      clientModules.add(file)
      for (const namespace of analyzed.namespaces) {
        namespaces.add(namespace)
      }
      for (const site of analyzed.unresolved) {
        blindSpots.push(site)
        for (const namespace of KNOWN_DYNAMIC_NAMESPACE_SITES[site.file]
          ?.namespaces ?? []) {
          namespaces.add(namespace)
        }
      }
    }

    for (const next of analyzed.imports) {
      queue.push({ file: next, inClient })
    }
  }

  return {
    namespaces,
    blindSpots,
    clientModules: clientModules.size,
    totalModules: allModules.size,
  }
}

/* ═══════════════════ 9. Assertions ═══════════════════ */

// 全量闸门下这份文件会扫完整棵 `src/` AST。操作员包把源文件量抬高之后，
// 「动态命名空间位点」那条在满负载里会超过全局 15s（隔离 5.3s / 36 绿）。
describe('i18n namespace coverage', { timeout: 45_000 }, () => {
  const routes = discoverRoutes()
  const reachByRoute = new Map<string, RouteReach>(
    routes.map((route) => [route.id, collectReach(route)]),
  )

  it('discovers every app-router page as a route', () => {
    expect(routes.length).toBeGreaterThan(20)
    expect(routes.map((route) => route.id)).toContain(
      'app/[locale]/(main)/gallery',
    )
    expect(routes.map((route) => route.id)).toContain('app/[locale]')
  })

  /** Every blind spot in `src/`, bucketed by file, newest scan. */
  function findBlindSpots(keep: (site: UnresolvedSite) => boolean) {
    const found = new Map<string, string[]>()
    for (const filePath of listSourceFiles(SRC_DIR)) {
      for (const site of getModule(filePath).unresolved) {
        if (!keep(site)) {
          continue
        }
        const bucket = found.get(site.file) ?? []
        bucket.push(site.code)
        found.set(site.file, bucket)
      }
    }
    return Object.fromEntries(
      [...found.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, calls]) => [file, [...calls].sort()]),
    )
  }

  function declaredCalls(
    ledger: Readonly<Record<string, { calls: readonly string[] }>>,
  ) {
    return Object.fromEntries(
      Object.entries(ledger)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, entry]) => [file, [...entry.calls].sort()]),
    )
  }

  it('every dynamic-namespace site is declared, and no declaration is stale', () => {
    expect(
      findBlindSpots((site) => site.reason !== 'dynamic-import'),
      'A `useTranslations(...)` call whose namespace this analyzer cannot ' +
        'prove. Declare it in KNOWN_DYNAMIC_NAMESPACE_SITES with the ' +
        'namespaces it reaches (read them off the constant table it indexes ' +
        'into) — never delete it to silence this. Line numbers move; the ' +
        'file + call shape is the identity.',
    ).toEqual(declaredCalls(KNOWN_DYNAMIC_NAMESPACE_SITES))
  })

  it('every unfollowable `import()` edge is declared, and no declaration is stale', () => {
    expect(
      findBlindSpots((site) => site.reason === 'dynamic-import'),
      'An `import(expr)` the graph cannot follow — everything behind it is ' +
        'invisible to this ruler. Declare it in KNOWN_DYNAMIC_IMPORT_SITES ' +
        'only if the target provably has no `useTranslations` consumer; ' +
        'otherwise give the import a literal specifier.',
    ).toEqual(declaredCalls(KNOWN_DYNAMIC_IMPORT_SITES))
  })

  it('declared blind-spot namespaces exist in the message bundle', () => {
    for (const [file, entry] of Object.entries(KNOWN_DYNAMIC_NAMESPACE_SITES)) {
      expect(
        entry.namespaces.length,
        `${file} declares no namespace`,
      ).toBeGreaterThan(0)
      for (const namespace of entry.namespaces) {
        expect(
          ALL_NAMESPACES,
          `${file} declares unknown \`${namespace}\``,
        ).toContain(namespace)
      }
    }
  })

  it.each(routes.map((route) => [route.id, route] as const))(
    '%s ships every namespace its client tree reaches',
    (routeId, route) => {
      const reach = reachByRoute.get(route.id) as RouteReach
      const provided = getProvidedNamespaces(route.id)
      const missing = [...reach.namespaces]
        .filter((namespace) => !provided.has(namespace))
        .sort()

      expect(
        missing,
        `Route \`${routeId}\` renders client components that call ` +
          `useTranslations(<ns>) for namespaces its NextIntlClientProvider ` +
          `does not ship. Those calls resolve to the raw message key on ` +
          `screen — no throw, no type error. Either widen the provider in ` +
          `getProvidedNamespaces()'s real counterpart (a layout), or move ` +
          `the consumer out of this route.`,
      ).toEqual([])
    },
  )

  it('the outside-app deny-list has zero client consumers under `(main)`', () => {
    const offenders: string[] = []
    for (const route of routes) {
      if (
        route.id !== MAIN_GROUP_DIR &&
        !route.id.startsWith(`${MAIN_GROUP_DIR}/`)
      ) {
        continue
      }
      const reach = reachByRoute.get(route.id) as RouteReach
      for (const namespace of OUTSIDE_APP_NAMESPACES) {
        if (reach.namespaces.has(namespace)) {
          offenders.push(`${route.id} reaches \`${namespace}\``)
        }
      }
    }

    expect(
      offenders.sort(),
      'OUTSIDE_APP_NAMESPACES claims these namespaces have no consumer ' +
        'inside `(main)`, but the import graph says otherwise. Drop the ' +
        'namespace from the deny-list rather than shipping a page that ' +
        'renders raw message keys.',
    ).toEqual([])
  })

  it('reports the reachable namespace count per route', () => {
    const rows = routes.map((route) => {
      const reach = reachByRoute.get(route.id) as RouteReach
      return {
        route: route.id,
        namespaces: reach.namespaces.size,
        provided: getProvidedNamespaces(route.id).size,
        clientModules: reach.clientModules,
        modules: reach.totalModules,
      }
    })

    // `I18N_NS_REPORT=1 npx vitest run src/i18n/namespace-coverage.test.ts
    //  --disable-console-intercept` prints the per-route budget. That table is
    // the input for narrowing providers — `/gallery` reaches 15 of the 81
    // namespaces its layout currently ships.
    if (process.env.I18N_NS_REPORT) {
      console.table(rows)
      for (const route of routes) {
        const reach = reachByRoute.get(route.id) as RouteReach
        console.log(
          `${route.id}\n  ${[...reach.namespaces].sort().join(', ') || '(none)'}`,
        )
      }
    }

    // Every route must resolve to a non-empty module graph — a zero here
    // means the import resolver silently gave up, which would make the
    // subset assertion above vacuously true.
    for (const row of rows) {
      expect(row.modules, `${row.route} resolved no modules`).toBeGreaterThan(0)
    }
  })
})
