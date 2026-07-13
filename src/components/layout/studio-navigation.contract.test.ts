import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const NAVIGATION_SOURCES = [
  'src/components/layout/AppSidebar.tsx',
  'src/components/layout/MobileTabBar.tsx',
] as const

const EXPECTED_COPY = {
  en: {
    label: 'Canvas',
    metadataTitle: 'Canvas — PixelVault',
    guideLabel: 'Canvas guide',
    oldBrand: /Node (?:Studio|Editor|workflow)/,
  },
  ja: {
    label: 'キャンバス',
    metadataTitle: 'キャンバス — PixelVault',
    guideLabel: 'キャンバスガイド',
    oldBrand: /ノード(?:スタジオ|エディター|ワークフロー)/,
  },
  zh: {
    label: '画布',
    metadataTitle: '画布 — PixelVault',
    guideLabel: '画布操作教程',
    oldBrand: /节点(?:工作台|编辑器|工作流)/,
  },
} as const

interface CanvasNavigationMessages {
  Metadata: { studio: { node: { title: string; description: string } } }
  StudioTools: {
    tools: { node: { label: string; title: string; description: string } }
  }
  StudioNode: {
    eyebrow: string
    topbar: { deleteProjectConfirm: string }
  }
  XiaoheiGuide: { node: { label: string } }
}

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

function readMessages(locale: keyof typeof EXPECTED_COPY) {
  return JSON.parse(
    readSource(`src/messages/${locale}.json`),
  ) as CanvasNavigationMessages
}

describe('Canvas navigation contract', () => {
  it('keeps the legacy Edit route out of desktop and mobile navigation', () => {
    for (const sourcePath of NAVIGATION_SOURCES) {
      const source = readSource(sourcePath)
      expect(source).not.toContain('ROUTES.STUDIO_EDIT')
      expect(source).toContain('ROUTES.STUDIO_NODE')
    }
  })

  it.each(Object.entries(EXPECTED_COPY))(
    'uses the Canvas product name in %s',
    (locale, expected) => {
      const messages = readMessages(locale as keyof typeof EXPECTED_COPY)
      const visibleCopy = [
        messages.Metadata.studio.node.title,
        messages.Metadata.studio.node.description,
        messages.StudioTools.tools.node.label,
        messages.StudioTools.tools.node.title,
        messages.StudioTools.tools.node.description,
        messages.StudioNode.eyebrow,
        messages.StudioNode.topbar.deleteProjectConfirm,
        messages.XiaoheiGuide.node.label,
      ].join('\n')

      expect(messages.StudioTools.tools.node.label).toBe(expected.label)
      expect(messages.StudioTools.tools.node.title).toBe(expected.label)
      expect(messages.Metadata.studio.node.title).toBe(expected.metadataTitle)
      expect(messages.XiaoheiGuide.node.label).toBe(expected.guideLabel)
      expect(visibleCopy).not.toMatch(expected.oldBrand)
    },
  )
})
