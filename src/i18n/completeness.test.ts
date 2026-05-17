import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_MESSAGE_KEYS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const LOCALES = ['en', 'ja', 'zh'] as const
const SRC_DIR = join(process.cwd(), 'src')
const MESSAGES_DIR = join(process.cwd(), 'src', 'messages')

function loadMessages(locale: string): Record<string, unknown> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf-8')
  return JSON.parse(raw)
}

/**
 * Recursively collect all leaf-level key paths from a nested object.
 * e.g. { a: { b: "x", c: "y" } } => ["a.b", "a.c"]
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

interface StaticTranslatorBinding {
  type: 'static'
  namespace: string
}

interface DynamicTranslatorBinding {
  type: 'dynamic'
}

type TranslatorBinding = StaticTranslatorBinding | DynamicTranslatorBinding

interface ScanEnvironment {
  translators: Map<string, TranslatorBinding>
  strings: Map<string, string[]>
}

interface MissingTranslationUsage {
  filePath: string
  line: number
  key: string
  usage: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function messageKeyExists(
  messages: Record<string, unknown>,
  keyPath: string,
): boolean {
  let current: unknown = messages
  for (const part of keyPath.split('.')) {
    if (!isRecord(current) || !(part in current)) {
      return false
    }
    current = current[part]
  }

  return !isRecord(current)
}

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

function namespaceFromUseTranslations(
  call: ts.CallExpression,
): TranslatorBinding {
  const arg = call.arguments[0]
  if (!arg) {
    return { type: 'static', namespace: '' }
  }

  const namespace = getStringValue(arg)
  return namespace === null
    ? { type: 'dynamic' }
    : { type: 'static', namespace }
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text
  }

  return null
}

function namespaceFromGetTranslations(
  call: ts.CallExpression,
): TranslatorBinding {
  const arg = call.arguments[0]
  if (!arg) {
    return { type: 'static', namespace: '' }
  }

  const namespace = getStringValue(arg)
  if (namespace !== null) {
    return { type: 'static', namespace }
  }

  if (!ts.isObjectLiteralExpression(arg)) {
    return { type: 'dynamic' }
  }

  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue
    }

    if (getPropertyName(prop.name) !== 'namespace') {
      continue
    }

    const namespaceValue = getStringValue(prop.initializer)
    return namespaceValue === null
      ? { type: 'dynamic' }
      : { type: 'static', namespace: namespaceValue }
  }

  return { type: 'static', namespace: '' }
}

function cloneEnvironment(env: ScanEnvironment): ScanEnvironment {
  return {
    translators: new Map(env.translators),
    strings: new Map(env.strings),
  }
}

function isFunctionWithBody(
  node: ts.Node,
): node is
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration {
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

function staticStringsFromExpression(
  expression: ts.Expression,
  env: ScanEnvironment,
): string[] {
  const current = unwrapExpression(expression)
  const literal = getStringValue(current)
  if (literal !== null) {
    return [literal]
  }

  if (ts.isIdentifier(current)) {
    return env.strings.get(current.text) ?? []
  }

  if (ts.isConditionalExpression(current)) {
    return [
      ...staticStringsFromExpression(current.whenTrue, env),
      ...staticStringsFromExpression(current.whenFalse, env),
    ]
  }

  return []
}

function scanStaticTranslationUsage(
  filePath: string,
  messages: Record<string, unknown>,
): MissingTranslationUsage[] {
  const source = readFileSync(filePath, 'utf-8')
  if (
    !source.includes('useTranslations') &&
    !source.includes('getTranslations')
  ) {
    return []
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const missing: MissingTranslationUsage[] = []

  function scanTranslationCall(node: ts.CallExpression, env: ScanEnvironment) {
    let translatorName: string | null = null
    let methodName: string | null = null

    if (ts.isIdentifier(node.expression)) {
      translatorName = node.expression.text
    }

    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      translatorName = node.expression.expression.text
      methodName = node.expression.name.text
    }

    if (!translatorName || methodName === 'has') {
      return
    }

    const translator = env.translators.get(translatorName)
    if (!translator || translator.type === 'dynamic') {
      return
    }

    const arg = node.arguments[0]
    if (!arg) {
      return
    }

    for (const key of staticStringsFromExpression(arg, env)) {
      const fullKey = translator.namespace
        ? `${translator.namespace}.${key}`
        : key
      if (messageKeyExists(messages, fullKey)) {
        continue
      }

      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      )
      missing.push({
        filePath: relative(process.cwd(), filePath),
        line: position.line + 1,
        key: fullKey,
        usage: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 160),
      })
    }
  }

  function scanNode(node: ts.Node, env: ScanEnvironment) {
    if (ts.isCallExpression(node)) {
      scanTranslationCall(node, env)
    }

    if (isFunctionWithBody(node) && node.body) {
      scanNode(node.body, cloneEnvironment(env))
      return
    }

    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      const localEnv = ts.isSourceFile(node) ? env : cloneEnvironment(env)
      for (const statement of node.statements) {
        scanStatement(statement, localEnv)
      }
      return
    }

    ts.forEachChild(node, (child) => scanNode(child, env))
  }

  function scanStatement(statement: ts.Statement, env: ScanEnvironment) {
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

      const staticStrings = staticStringsFromExpression(
        declaration.initializer,
        env,
      )
      if (staticStrings.length > 0) {
        env.strings.set(declaration.name.text, staticStrings)
      }

      const initializer = unwrapExpression(declaration.initializer)
      if (!ts.isCallExpression(initializer)) {
        continue
      }

      const callName = getCallName(initializer.expression)
      if (callName === 'useTranslations') {
        env.translators.set(
          declaration.name.text,
          namespaceFromUseTranslations(initializer),
        )
      }

      if (callName === 'getTranslations') {
        env.translators.set(
          declaration.name.text,
          namespaceFromGetTranslations(initializer),
        )
      }
    }
  }

  scanNode(sourceFile, { translators: new Map(), strings: new Map() })

  return missing
}

describe('i18n completeness', () => {
  const messagesByLocale = Object.fromEntries(
    LOCALES.map((locale) => [locale, loadMessages(locale)]),
  )

  it('all locales have the same top-level key set', () => {
    const enKeys = collectKeys(messagesByLocale.en).sort()
    for (const locale of ['ja', 'zh'] as const) {
      const localeKeys = collectKeys(messagesByLocale[locale]).sort()
      const missingInLocale = enKeys.filter((k) => !localeKeys.includes(k))
      const extraInLocale = localeKeys.filter((k) => !enKeys.includes(k))

      expect(
        missingInLocale,
        `Keys in en.json missing from ${locale}.json`,
      ).toEqual([])
      expect(
        extraInLocale,
        `Keys in ${locale}.json not found in en.json`,
      ).toEqual([])
    }
  })

  it('all static next-intl calls reference existing message keys', () => {
    const missing = listSourceFiles(SRC_DIR).flatMap((filePath) =>
      scanStaticTranslationUsage(filePath, messagesByLocale.en),
    )

    expect(
      missing.map(
        (item) => `${item.filePath}:${item.line} ${item.key} via ${item.usage}`,
      ),
    ).toEqual([])
  })

  it('every AI_MODELS entry has a Models.<messageKey>.label translation', () => {
    const models = Object.values(AI_MODELS)
    for (const modelId of models) {
      const messageKey = MODEL_MESSAGE_KEYS[modelId]
      expect(
        messageKey,
        `MODEL_MESSAGE_KEYS is missing entry for ${modelId}`,
      ).toBeDefined()

      for (const locale of LOCALES) {
        const modelsSection = messagesByLocale[locale] as Record<
          string,
          Record<string, Record<string, string>>
        >
        const modelEntry = modelsSection.Models?.[messageKey]
        expect(
          modelEntry?.label,
          `Models.${messageKey}.label missing in ${locale}.json`,
        ).toBeDefined()
        expect(
          modelEntry?.description,
          `Models.${messageKey}.description missing in ${locale}.json`,
        ).toBeDefined()
      }
    }
  })

  it('every AI_ADAPTER_TYPES entry has StudioApiKeys.providers.<type> translations', () => {
    const adapterTypes = Object.values(AI_ADAPTER_TYPES)
    for (const adapterType of adapterTypes) {
      for (const locale of LOCALES) {
        const messages = messagesByLocale[locale] as Record<
          string,
          Record<string, Record<string, Record<string, string>>>
        >
        const providerEntry = messages.StudioApiKeys?.providers?.[adapterType]
        expect(
          providerEntry?.label,
          `StudioApiKeys.providers.${adapterType}.label missing in ${locale}.json`,
        ).toBeDefined()
        expect(
          providerEntry?.description,
          `StudioApiKeys.providers.${adapterType}.description missing in ${locale}.json`,
        ).toBeDefined()
      }
    }
  })

  it('every locale has a non-empty Onboarding.steps.samplePrompt.title', () => {
    for (const locale of LOCALES) {
      const onboarding = messagesByLocale[locale].Onboarding
      expect(isRecord(onboarding)).toBe(true)
      if (!isRecord(onboarding)) {
        throw new Error(`Onboarding namespace missing in ${locale}.json`)
      }

      const steps = onboarding.steps
      expect(isRecord(steps)).toBe(true)
      if (!isRecord(steps)) {
        throw new Error(`Onboarding.steps missing in ${locale}.json`)
      }

      const prompt = steps.samplePrompt
      expect(isRecord(prompt)).toBe(true)
      if (!isRecord(prompt)) {
        throw new Error(
          `Onboarding.steps.samplePrompt missing in ${locale}.json`,
        )
      }

      const title = prompt.title
      expect(typeof title).toBe('string')
      if (typeof title !== 'string') {
        throw new Error(
          `Onboarding.steps.samplePrompt.title missing in ${locale}.json`,
        )
      }
      expect(title.trim().length).toBeGreaterThan(0)
    }
  })
})
