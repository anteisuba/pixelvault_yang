import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'

import {
  MARKETING_NAMESPACES,
  omitMessages,
  OUTSIDE_APP_NAMESPACES,
  pickMessages,
} from '@/i18n/messages-split'

const SRC_DIR = join(process.cwd(), 'src')
const LOCALES = ['en', 'ja', 'zh'] as const

/**
 * Every client component allowed to reach an `OUTSIDE_APP_NAMESPACES`
 * namespace. All of these render on surfaces *above* or *beside* the
 * `(main)` route group — the marketing homepage, `/privacy`, `/terms`,
 * and the `(auth)` group — so `(main)`'s provider can drop the strings.
 *
 * ⚠ Adding a file here is a claim that it never renders inside `(main)`.
 * If it does, `useTranslations(<ns>)` silently resolves to the literal
 * key string in production — no throw, no test failure anywhere else.
 */
const ALLOWED_CONSUMERS: Readonly<Record<string, readonly string[]>> = {
  Auth: [
    'components/business/auth/AuthCard.tsx',
    'components/business/auth/AuthDialog.tsx',
    'components/business/home-v4/HomeV4Topbar.tsx',
  ],
  // Read as a plain JSON import in `app/global-error.tsx`, which renders
  // outside every locale layout and therefore outside every provider.
  GlobalError: [],
  Homepage: [
    'components/business/home-v4/HomeV4Deck.tsx',
    'components/business/home-v4/HomeV4Finale.tsx',
    'components/business/home-v4/HomeV4FnAudio.tsx',
    'components/business/home-v4/HomeV4FnCanvas.tsx',
    'components/business/home-v4/HomeV4FnImage.tsx',
    'components/business/home-v4/HomeV4FnLora.tsx',
    'components/business/home-v4/HomeV4FnVault.tsx',
    'components/business/home-v4/HomeV4FnVideo.tsx',
    'components/business/home-v4/HomeV4ModelPage.tsx',
    'components/business/home-v4/HomeV4ModelSheet.tsx',
    'components/business/home-v4/HomeV4ModelStrip.tsx',
    'components/business/home-v4/HomeV4Opening.tsx',
  ],
  Legal: ['components/business/LegalPage.tsx'],
  // Server-only: consumed via `getTranslations` inside `generateMetadata`,
  // which never crosses the client boundary.
  Metadata: [],
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

function toPosix(filePath: string): string {
  return relative(SRC_DIR, filePath).split('\\').join('/')
}

/** Files calling `useTranslations('<ns>')` or `useTranslations('<ns>.sub')`. */
function findClientConsumers(namespace: string, files: string[]): string[] {
  const pattern = new RegExp(
    `useTranslations\\(\\s*['"\`]${namespace}(?:['"\`]|\\.)`,
  )
  return files
    .filter((filePath) => pattern.test(readFileSync(filePath, 'utf-8')))
    .map(toPosix)
    .sort()
}

describe('messages-split', () => {
  const sourceFiles = listSourceFiles(SRC_DIR)

  it('omitMessages drops exactly the listed namespaces', () => {
    const input = { A: { x: '1' }, B: { y: '2' }, C: { z: '3' } }
    expect(omitMessages(input, ['B'])).toEqual({ A: { x: '1' }, C: { z: '3' } })
    expect(omitMessages(input, [])).toEqual(input)
    expect(omitMessages(input, ['Nope'])).toEqual(input)
    expect(pickMessages(input, ['B'])).toEqual({ B: { y: '2' } })
  })

  it.each(LOCALES)(
    '`(main)` bundle for %s keeps every namespace except the outside-app ones',
    (locale) => {
      const messages = JSON.parse(
        readFileSync(join(SRC_DIR, 'messages', `${locale}.json`), 'utf-8'),
      ) as AbstractIntlMessages

      const appMessages = omitMessages(messages, OUTSIDE_APP_NAMESPACES)
      const kept = Object.keys(appMessages)

      for (const namespace of OUTSIDE_APP_NAMESPACES) {
        expect(kept, `${namespace} must not ship to (main)`).not.toContain(
          namespace,
        )
      }
      expect(kept).toHaveLength(
        Object.keys(messages).length - OUTSIDE_APP_NAMESPACES.length,
      )
    },
  )

  it('every outside-app namespace exists in the message bundle', () => {
    const messages = JSON.parse(
      readFileSync(join(SRC_DIR, 'messages', 'en.json'), 'utf-8'),
    ) as Record<string, unknown>
    for (const namespace of OUTSIDE_APP_NAMESPACES) {
      expect(Object.keys(messages)).toContain(namespace)
    }
  })

  it('outside-app namespaces are only consumed by pinned outside-`(main)` files', () => {
    for (const namespace of OUTSIDE_APP_NAMESPACES) {
      const consumers = findClientConsumers(namespace, sourceFiles)
      expect(
        consumers,
        `\`${namespace}\` is omitted from the (main) provider. A new consumer ` +
          `would render raw message keys there. Either move the consumer out ` +
          `of (main), or drop \`${namespace}\` from OUTSIDE_APP_NAMESPACES.`,
      ).toEqual([...(ALLOWED_CONSUMERS[namespace] ?? [])].sort())
    }
  })

  it('no file under the `(main)` route group consumes an outside-app namespace', () => {
    const mainFiles = sourceFiles.filter((filePath) =>
      toPosix(filePath).startsWith('app/[locale]/(main)/'),
    )
    for (const namespace of OUTSIDE_APP_NAMESPACES) {
      expect(findClientConsumers(namespace, mainFiles)).toEqual([])
    }
  })

  it('the marketing subset stays a subset of the full bundle', () => {
    const messages = JSON.parse(
      readFileSync(join(SRC_DIR, 'messages', 'en.json'), 'utf-8'),
    ) as Record<string, unknown>
    for (const namespace of MARKETING_NAMESPACES) {
      expect(Object.keys(messages)).toContain(namespace)
    }
  })
})
