'use client'

import { useMemo, useState } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Image as ImageIcon, ListTree, User } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import { isIdentityCardNode } from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { CastCard } from './CastCard'
import { CastDock, type CastSectionId } from './CastDock'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

/**
 * 名册 rail —— 左栏的 `cast` 视图，**定位器 + 收集器两段**
 * （总包阶段 8-c，owner 2026-08-10 拍板「rail 一统，CastDock 退役」）。
 *
 * ── 为什么是「组合」而不是「重写定位器」 ────────────────────────────
 * owner 拍的是**职责边界**：新 rail 把定位器**并入**，不与它并存（并存要额外
 * 发明一套「什么时候用哪个」的解释）。而定位器那半今天就是 `CastDock`，它能跑、
 * 有测试。把它照抄一遍只为了让文件名变一变，是拿回归风险换一个词 —— 用户看到的
 * 「一个面板两段」这里已经成立。
 * ⚠ 如果日后要重做的是定位器**本身的形态**（分组方式、行长相），那是另一件事，
 * 得单独走设计环节，不是这一片。
 *
 * ── 下段为什么不是「再列一遍卡」 ──────────────────────────────────
 * 收集器卡在上段的定位器里本来就出现过（它们也是节点）。下段要成立，必须带来
 * 定位器给不了的东西 —— **把卡喂给一个节点**：拖到画布节点上落槽，长按进快投
 * 模式点选目标。否则就是两段长得像的列表，正是这次拍板要避免的。
 *
 * ⭐ 那套手势**不用新造**：`CastCard` + `use-cast-ingest` 引擎整套都在，
 * `IngestDragProvider` 也一直挂在 `StudioNodeWorkbench` 上 —— 只是 `CastCard`
 * 自 2026-07 卡匣改版后**没有任何挂载点**，成了孤儿（全仓只有它自己的测试引用
 * 它）。这一段就是把源接回去。
 * ⚠ 别与 `CANVAS_INGEST_DRAG_GESTURE_ENABLED = false` 搞混：那个 flag 管的是
 * **画布节点拖到画布节点**（已退役的「吞噬」），与这里的**面板卡拖到画布节点**
 * 不是同一条通路。
 *
 * ⚠ 卡**没有搬家**（owner 同批拍板）：画布上照旧有卡、素材边照旧画。下段是卡的
 * **快捷入口**，不是卡的家。B 方向原设计里的「素材无线 + 卡只住 rail」仍未实现，
 * 那是独立的一片（见总包阶段 8 的两读法表）。
 *
 * ── 2026-08-26 画布修法 G1/G3 追加 ──────────────────────────────────────
 * G1：搜索框原来是 `CastDock` 内部私有的 `useState`，只过滤上段；下段的收集器
 * 卡区完全不知道有这个 query。搜「镜头1」时上段收窄、下段 4 张卡纹丝不动，
 * 正是「同一个搜索框只过滤半个面板」的 bug。query 现在提到这里持有，下发给
 * `CastDock` 当 controlled prop，同时用来过滤 `cards`——判据复用
 * `resolveNodeDisplayName`（全仓单一事实源），不手写第二套匹配。
 * G3：两段标题原来是「节点」（外层 `CanvasLeftPanel` 头部chrome）+「卡片」
 * （本组件下段），关系不明显——卡片本身也是节点，同一张角色卡在两段里各出现
 * 一次。这里给上段补一句「画布上的全部节点」标题（不重复外层已经显示过的计数），
 * 下段标题改成更具体的「可复用的角色与场景」，读两个标题就能猜到下段是上段的
 * 一个子集，不做结构重排（两段位置、内容来源全部不变）。
 */

/** 收集器卡在 `CastCard` 里的分区 id —— 只有角色/背景两族是收集器。 */
const SECTION_BY_ROLE: Record<
  string,
  { id: CastSectionId; Icon: typeof User }
> = {
  [NODE_IMAGE_ROLE_IDS.character]: {
    id: NODE_IMAGE_ROLE_IDS.character,
    Icon: User,
  },
  [NODE_IMAGE_ROLE_IDS.background]: {
    id: NODE_IMAGE_ROLE_IDS.background,
    Icon: ImageIcon,
  },
}

/**
 * 卡的分区 —— 统一 `image` 节点看 role，两个 legacy 类型按名字认。
 * ⚠ 与 `isIdentityCardNode` 判的是同一件事（它的头注写着为什么必须按 role 而不
 * 是按媒体种类），这里只是把「是不是卡」的布尔升级成「是哪一族卡」。
 */
function resolveCardSection(
  node: NodeWorkflowNode,
): { id: CastSectionId; Icon: typeof User } | undefined {
  if (node.type === NODE_TYPE_IDS.characterImage) {
    return SECTION_BY_ROLE[NODE_IMAGE_ROLE_IDS.character]
  }
  if (node.type === NODE_TYPE_IDS.backgroundImage) {
    return SECTION_BY_ROLE[NODE_IMAGE_ROLE_IDS.background]
  }
  return node.data.role ? SECTION_BY_ROLE[node.data.role] : undefined
}

export function CanvasRosterRail() {
  const t = useTranslations('StudioNode.castDock')
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { focusNode } = useNodeWorkflowActions()
  // G1：唯一一份 query——上段的 `CastDock` 与下段的卡片区都读它。
  const [query, setQuery] = useState('')

  /**
   * 三个计数**一次遍历算完再分发**给每张卡 —— `CastCard` 的 `referenceCount`
   * 头注原话就是这条纪律（避免每张卡各自查一遍全图边）。
   */
  const cards = useMemo(() => {
    const performance = new Map<string, number>()
    const closeups = new Map<string, number>()
    const voiced = new Set<string>()
    for (const edge of edges) {
      performance.set(edge.source, (performance.get(edge.source) ?? 0) + 1)
      const source = nodes.find((node) => node.id === edge.source)
      if (!source) continue
      if (source.type === NODE_TYPE_IDS.voice) voiced.add(edge.target)
      if (source.data.role === NODE_IMAGE_ROLE_IDS.closeup) {
        closeups.set(edge.target, (closeups.get(edge.target) ?? 0) + 1)
      }
    }

    return nodes.flatMap((node) => {
      if (!isIdentityCardNode(node)) return []
      const section = resolveCardSection(node)
      if (!section) return []
      return [
        {
          node,
          section,
          performanceCount: performance.get(node.id) ?? 0,
          referenceCount:
            (node.data.referenceAssets?.length ?? 0) +
            (closeups.get(node.id) ?? 0),
          hasVoice: voiced.has(node.id),
        },
      ]
    })
  }, [edges, nodes])

  // G1：卡片段用与上段完全相同的判据过滤——不新写第二套匹配，直接问
  // `resolveNodeDisplayName`（全仓显示名单一事实源）当前这张卡的名字里有没有
  // 这个 query。没命名过的卡退回它的分区标签（「角色」/「场景」）再判——与
  // `CastDock` 自己的 `name ?? typeLabel` 是同一条退让逻辑，不是另起一套。
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredCards = normalizedQuery
    ? cards.filter((card) => {
        const name =
          resolveNodeDisplayName(card.node.data) ??
          t(`sections.${card.section.id}`)
        return name.toLocaleLowerCase().includes(normalizedQuery)
      })
    : cards

  return (
    <div className="flex flex-col gap-4">
      {/* 上段：G3 补的标题。不重复外层 `CanvasLeftPanel` 头部 chrome 已经显示
        过的「节点」+ 计数，只加一句更具体的说明，让两段的关系读得出来。 */}
      <div className="flex flex-col gap-1.5">
        <div
          className="flex items-center gap-1.5 px-1"
          style={{ color: 'var(--canvas-ink-muted)' }}
        >
          <ListTree className="size-3.5 shrink-0" aria-hidden />
          <h3 className="min-w-0 truncate text-2xs font-semibold">
            {t('locatorTitle')}
          </h3>
        </div>
        <CastDock query={query} onQueryChange={setQuery} />
      </div>

      {/* 下段：收集器卡区。⚠ 一张卡都没有时**整段不渲染** —— 空标题 + 空网格是
        「伪装能力」（域定义禁区），而这一段的价值全在「有卡可拖」。这个门槛看
        **未过滤的** `cards`：项目里压根没有卡与「搜索把卡全滤掉了」是两件事，
        前者不渲染，后者要渲染出「没有匹配」（见下方 `filteredCards` 分支）。 */}
      {cards.length > 0 ? (
        <section className="flex flex-col gap-1.5 border-t border-node-panel-inner pt-3">
          <div
            className="flex items-center gap-1.5 px-1"
            style={{ color: 'var(--canvas-ink-muted)' }}
          >
            <User className="size-3.5 shrink-0" aria-hidden />
            <h3 className="min-w-0 truncate text-2xs font-semibold">
              {t('rosterTitle')}
            </h3>
            <span className="ml-auto shrink-0 text-2xs tabular-nums">
              {filteredCards.length}
            </span>
          </div>
          <p className="px-1 text-2xs text-node-subtle">{t('rosterHint')}</p>

          {filteredCards.length > 0 ? (
            /* ⚠ `px-1.5 pt-1.5` 不是留白偏好，是**给卡的 hover 徽章让位**：
              `CastCard` 的删除钮定位在 `-right-1.5 -top-1.5`（绝对定位仍计入
              滚动宽度），不留这圈余量整个左栏会多出一条 7px 的横滚条 —— 真机实测
              `section.scrollWidth 235 > clientWidth 228`。
              ⚠ 别用 `-mx-1.5` 把余量「还回去」—— 那等于没留，徽章照样顶出去
              （试过，`scrollWidth` 一点没变）。列宽窄 16px 是这圈余量的真实代价。 */
            <div className="grid grid-cols-2 gap-1.5 px-2 pt-1.5">
              {filteredCards.map((card) => (
                /* ⚠ 这一层 wrapper 只为一件事：给阶段 8-b 的命中检测一个标记
                  （`StudioNodeWorkbench` 的 `findRosterCardAt` 按这个属性找落点）。
                  ⚠ 标记打在**外层**不打在 `CastCard` 上 —— 那张卡自己已经是
                  「面板 → 画布」那条手势的**拖拽源**，把落点属性塞进同一个元素，
                  两条方向相反的手势就共用一个 DOM 身份，读代码的人分不清哪条在用它。 */
                <div key={card.node.id} data-roster-card-id={card.node.id}>
                  <CastCard
                    node={card.node}
                    sectionId={card.section.id}
                    Icon={card.section.Icon}
                    performanceCount={card.performanceCount}
                    referenceCount={card.referenceCount}
                    hasVoice={card.hasVoice}
                    selected={Boolean(card.node.selected)}
                    onSelect={() => focusNode?.(card.node.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            // G1：搜索把卡全滤掉时不能整段静默消失（那会和「项目里根本没有
            // 卡」两种状态混在一起分不清），复用 `noResults`——卡本身就是节点。
            <p className="px-1 py-4 text-center text-2xs text-node-subtle">
              {t('noResults')}
            </p>
          )}
        </section>
      ) : null}
    </div>
  )
}
