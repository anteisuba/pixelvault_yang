import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 空态落点的机器门（ui-defaults.md §7，进度表 33 ①）。
 *
 * 全站空态只有**一种**长相 —— `src/components/ui/empty-state.tsx` 那五段：
 * 灰底虚线框 → 40px 图标位 → 展示槽标题 → 一句话 → 黑丸主动作。这个门守两件事：
 *
 *  1. **落点名册**是写死的。新长出一个空态，测试红 —— 逼着作者要么用原语，
 *     要么把它连同「为什么是例外」一起写进这张表（见 EXCEPTIONS）。
 *  2. 每个落点都**给了一句话和一个动作**，且主动作是黑丸（`rounded-full`）。
 *     §7 的原话是「一句说明 + 一个可点动作；不留白板」——只给标题不算空态，
 *     那是白板加了行字。
 *
 * ⛔ 这个门不解析 JSX：它读源码文本。够用是因为原语的 props 名字是固定的，
 * 而绕过它的唯一办法（手画一个 div）正是第 1 条要拦的事。
 */
const ROOT = join(process.cwd(), 'src')
const PRIMITIVE = 'src/components/ui/empty-state.tsx'

/** 用了原语的落点。改这张表 = 改全站空态的名册，要连文档一起改。 */
const LANDING_POINTS = [
  'src/app/[locale]/(main)/dev/ui-states/UiStateGallery.tsx',
  'src/components/business/GalleryGrid.tsx',
  'src/components/business/KreaAssetBrowser.tsx',
  'src/components/business/assets/AssetStateBlocks.tsx',
  'src/components/business/cards/CharacterCardManager.tsx',
  'src/components/business/cards/SimpleCardManager.tsx',
  'src/components/business/cards/StyleCardManager.tsx',
  'src/components/business/node/NodeCanvasEmptyGuide.tsx',
  'src/components/business/prompts/inspiration/InspirationGrid.tsx',
  'src/components/business/settings/SettingsAssistantSection.tsx',
  'src/components/business/studio/lora/LoraWorkbench.tsx',
  'src/components/business/studio/lora/library/LoraLibraryTypeStates.tsx',
  'src/components/business/studio/lora/training/EmptyState.tsx',
]

/**
 * 长得像空态但**故意不走原语**的几处，每条都得说得出理由。
 *
 * · `StudioEmptyState` / `StudioOperatorEmptyState` —— 不是「一块区域没有内容」，
 *   是 owner 逐条定过的**起手屏**（示例卡 + 最近作品 / 一句话 + 起手药丸）。
 *   D7b ③ 的原话就是「一句话就是一句话，不再是标题 + 说明两段」。
 * · `AssetEmptyFolder` —— 空文件夹那一档随进度表 19 落地，⛔ 不提前收。
 * · 搜索无结果（`AssetEmptySearch` · 各卡片页的 `cardSearchEmpty`）——
 *   它回答的是「你的筛选太窄」，不是「这里还没有东西」，出口也只有一个
 *   「清除筛选」。§7 的空态配方套上去会给它硬造一个不该有的主动作。
 * · `LoraLibraryTypeSparseCard` —— 本页有 1–5 条内容，它是结果流尾部的引导行。
 */
const EXCEPTIONS = [
  'src/components/business/studio/StudioEmptyState.tsx',
  'src/components/business/studio/assistant-operator/StudioOperatorEmptyState.tsx',
]

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectTsx(full, out)
      continue
    }
    if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

function relative(file: string): string {
  return file.replace(`${process.cwd()}/`, '')
}

function importsPrimitive(source: string): boolean {
  return /from '@\/components\/ui\/empty-state'/.test(source)
}

describe('空态 · 全站只有一种长相', () => {
  it('用了原语的文件就是名册上那些，一个不多一个不少', () => {
    const found = collectTsx(ROOT)
      .filter((file) => !file.endsWith('.test.tsx'))
      .filter((file) => relative(file) !== PRIMITIVE)
      .filter((file) => importsPrimitive(readFileSync(file, 'utf8')))
      .map(relative)
      .sort()

    expect(found).toEqual([...LANDING_POINTS].sort())
  })

  it('每个落点都给了一句话 + 一个黑丸主动作（§7：不留白板）', () => {
    const thin: string[] = []

    for (const point of LANDING_POINTS) {
      // dev 展柜按定义要把原语的每种组合都摆出来（含只有标题那一版），
      // 它不是产品里的空态落点。
      if (point.includes('/dev/ui-states/')) continue
      const source = readFileSync(join(process.cwd(), point), 'utf8')
      const hasDescription = /description=\{/.test(source)
      const hasAction = /\n\s+action=\{/.test(source)
      const hasPill = /rounded-full/.test(source)
      if (!hasDescription || !hasAction || !hasPill) thin.push(point)
    }

    expect(thin).toEqual([])
  })

  it('例外名单上的两处确实没有偷偷用原语（它们是起手屏，不是空态）', () => {
    for (const file of EXCEPTIONS) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(importsPrimitive(source)).toBe(false)
    }
  })
})
