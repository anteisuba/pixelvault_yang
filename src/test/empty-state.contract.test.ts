import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 空态落点的机器门（ui-defaults.md §7，进度表 33 ①）。
 *
 * 全站空态只有**一种**长相 —— `src/components/ui/empty-state.tsx` 那张柔影白卡
 * （ui-spec.md §9「空状态」⑱）：图标格在左 → 15 加粗标题 → 一句话 → 黑色主钮。这个门守两件事：
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
  // 404 与出错也走同一个模板（owner 2026-10-08「提示与弹窗」第 3 题 B）。
  'src/app/[locale]/not-found.tsx',
  'src/components/business/RouteErrorState.tsx',
  // 整页加载失败（画廊 / 素材库共用，owner 2026-10-08 加载中）。
  'src/components/business/PageLoadError.tsx',
  // 我的主页作品格：还没有公开作品（骨架对齐，u-audit-skeleton）。
  'src/components/business/PolaroidGrid.tsx',
  'src/components/business/studio-shared/chrome/StudioErrorBoundary.tsx',
  'src/features/gallery/components/GalleryGrid.tsx',
  'src/features/gallery/components/GalleryPromptList.tsx',
  'src/features/assets/components/KreaAssetBrowser.tsx',
  'src/features/assets/components/AssetStateBlocks.tsx',
  // 角色页卡库：chub 没回时整块出错（owner 2026-10-14 卡库）。
  'src/features/cards/components/CharacterLibrary.tsx',
  'src/features/cards/components/CharacterMemoryPane.tsx',
  'src/features/cards/components/CharacterRoster.tsx',
  // 角色页右栏「最近」：她还没出过门 / 没读出来（方向 B，owner 2026-10-28）。
  'src/features/cards/components/CharacterRecentDiary.tsx',
  'src/features/canvas/components/NodeCanvasEmptyGuide.tsx',
  'src/features/assistant/components/settings/AssistantHerPane.tsx',
  'src/features/assistant/components/settings/AssistantMemoryPane.tsx',
  'src/features/lora/components/LoraWorkbench.tsx',
  'src/features/lora/components/library/LoraLibraryTypeStates.tsx',
  'src/features/lora/components/training/EmptyState.tsx',
  // 音色库（手机桌面同一副库骨架，ui-spec §9）：还没收藏；没克隆时第一格就是「克隆音色」。
  'src/components/business/voices/VoicesLibraryDesk.tsx',
  // 提示词库桌面：还没收藏（库骨架，ui-spec §9）。
  'src/features/prompts/components/PromptLibraryDesk.tsx',
  // 配音台：默认助手没有嗓子（先换个角色）/ 台词没读出来（③，10-26）。
  'src/features/studio/components/voice-bench/VoiceBench.tsx',
]

/**
 * 主动作由**调用方**造好再递进来（`action={emptyAction}`）的落点 → 那颗黑丸写在哪个文件。
 * 画廊（11-18）：网格与提示词列表共用 `GalleryFeed` 里的同一颗——没结果时它是「清除筛选」，
 * 真空时是「去工作台」，落点自己不知道该是哪一颗。⚠ 只是把「去哪查黑丸」改指过去，
 * 一句话与 `action=` 仍然要求写在落点里。
 */
const DELEGATED_ACTION: Record<string, string> = {
  'src/features/gallery/components/GalleryGrid.tsx':
    'src/features/gallery/components/GalleryFeed.tsx',
  'src/features/gallery/components/GalleryPromptList.tsx':
    'src/features/gallery/components/GalleryFeed.tsx',
}

/**
 * 长得像空态但**故意不走原语**的几处，每条都得说得出理由。
 *
 * · `StudioStarterState`（工作台起手屏，图片 / 标签 / 视频经 `StudioEmptyState`、
 *   LoRA / 配音 / 3D 直接挂）/ `StudioOperatorEmptyState` —— 不是「一块区域没有内容」，
 *   是**起手屏**：回答「从哪下手」，给的是能点的例子（白药丸，点了只填输入），
 *   ⛔ 黑色主钮 —— 台上唯一的主钮是生成键（11-18 手机第一轮）。助手空态仍是一句话。
 * · `AssetEmptyFolder` —— 空文件夹那一档随进度表 19 落地，⛔ 不提前收。
 * · 搜索无结果（`AssetEmptySearch` · 各卡片页的 `cardSearchEmpty`）——
 *   它回答的是「你的筛选太窄」，不是「这里还没有东西」，出口也只有一个
 *   「清除筛选」。§7 的空态配方套上去会给它硬造一个不该有的主动作。
 * · `LoraLibraryTypeSparseCard` —— 本页有 1–5 条内容，它是结果流尾部的引导行。
 */
const EXCEPTIONS = [
  'src/features/studio/components/StudioEmptyState.tsx',
  'src/components/business/studio-shared/chrome/StudioStarterState.tsx',
  'src/features/assistant/components/operator/StudioOperatorEmptyState.tsx',
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
      const delegate = DELEGATED_ACTION[point]
      const pillSource = delegate
        ? readFileSync(join(process.cwd(), delegate), 'utf8')
        : source
      const hasPill = delegate
        ? /<Button[^>]*className="[^"]*rounded-full/.test(pillSource)
        : /rounded-full/.test(pillSource)
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
