'use client'

/**
 * 操作员面板在**画布**（`/canvas/[projectId]`）这个宿主上的实现（进度表 22）。
 *
 * ── 它与另外两份的关系 ─────────────────────────────────────────────
 * 同一个契约（`contexts/studio-operator-host.tsx`）的第三份实现。工作台那份读写
 * `studio-context` 的 reducer，装配台那份读写 `GenerateBranch` 的局部 state，
 * 这一份读写 **v4 图引擎**（`useNodeGraphV4`）。三份的差别正好就是契约里那三样
 * （域 / 快照 / 落笔的手），别的一律没动。
 *
 * 参考图属于当前项目的助手上下文：画布图片与用户添加的图片共同组成列表。
 * 添加或移除助手参考图不修改画布节点；生成表单的其它写入口仍由域工具表隔离。
 *
 * ── 撤销为什么是「撤到这一步为止」而不是「只撤这一步」 ────────────────
 * 画布的撤销栈是**线性**的（`useNodeGraphV4` 的 `undo()`）。一条线建好之后用户
 * 或助手又在它上面接了三个节点，此时单独抽掉那条线得到的是一张谁都没见过的图。
 * 所以 `revertOp(stepId)` 一路撤到那一步为止 —— 与用户自己按 ⌘Z 的语义一致，
 * ⛔ 不另起一套「只撤中间那一格」的画布撤销（那需要第二份图历史）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import {
  STUDIO_OPERATOR_SHELL,
  type StudioOperatorShellAnchor,
} from '@/constants/studio-assistant-operator'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import { useStudioOperatorFace } from '@/hooks/use-studio-operator-face'
import { collectDownstream } from '@/lib/node-downstream'
import { flashAssistantTouchedNode } from '@/hooks/node/node-ingest-dom'
import { buildCanvasOperatorSnapshot } from '@/lib/studio-operator-canvas-snapshot'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'
import type { StudioOperatorResultItem } from '@/types/studio-assistant-operator'

/**
 * **画布这个宿主的两个锚点**（D7b ④ · 画板 `DesignD7bToggle`）。
 *
 * ⚠ 画布**有顶栏**，所以它与另外三处不同：头像排在「剪辑台」胶囊右侧（顶栏那一行
 * 里，与胶囊同高 36），面板顶边 = 顶栏底 + 6（⛔ 不再压顶栏 —— 此前贴 `top: 24`
 * 正好盖住那排胶囊的下半截）。
 * ⚠ 这是**宿主的性质**，所以它住在这里而不是 Dock 里：⛔ 别在外壳里按
 *   `domain === 'canvas'` 硬判，判据与 `collapseOnOutsidePointer` 逐字同源。
 */
const CANVAS_ANCHOR: StudioOperatorShellAnchor = {
  avatarTopPx:
    CANVAS_SHELL_LAYOUT.edgeInsetPx +
    (CANVAS_SHELL_LAYOUT.pillHeightPx - STUDIO_OPERATOR_SHELL.avatarSizePx) / 2,
  avatarRightPx: CANVAS_SHELL_LAYOUT.edgeInsetPx,
  panelTopPx:
    CANVAS_SHELL_LAYOUT.edgeInsetPx +
    CANVAS_SHELL_LAYOUT.pillHeightPx +
    CANVAS_SHELL_LAYOUT.assistantPanelGapPx,
  panelRightPx: CANVAS_SHELL_LAYOUT.edgeInsetPx,
}

/** ⚠ 常量化：空数组字面量每次 render 换引用，会把下面那个 `useMemo` 打穿。 */
const NO_RESULTS: readonly StudioOperatorResultItem[] = []

export interface UseCanvasOperatorHostInput {
  readonly projectId: string
  /** ⚠ 现读：事件循环跨很多次 render，第 5 步用的必须是此刻这张图。 */
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  readonly selectedNodeIds: readonly string[]
  /** 当前项目名 —— 只给头部域标记那一句用（「{项目名} · 选中 {n} 个节点」）。 */
  readonly projectName: string
  /** 每个节点选得动的模型（`useWorkflowModelOptions` 现给）。 */
  readonly availableModelsByNodeId?: Readonly<Record<string, readonly string[]>>
  /** 落一条 op。⚠ 就是图引擎的 `dispatch` —— ⛔ 别在这里另调执行器。 */
  applyOp(op: NodeAssistantOpV4): boolean
  /** 撤一步（图引擎的线性撤销栈）。 */
  undo(): void
  readonly canUndo: boolean
  /** 让一个节点出图 / 出片 —— **用户自己那颗生成键的同一条路**。 */
  generateNodes(nodeIds: readonly string[]): void
  open: boolean
  setOpen(open: boolean): void
}

export function useCanvasOperatorHost({
  projectId,
  nodes,
  edges,
  selectedNodeIds,
  projectName,
  availableModelsByNodeId,
  applyOp,
  undo,
  canUndo,
  generateNodes,
  open,
  setOpen,
}: UseCanvasOperatorHostInput): StudioOperatorHost {
  const [referenceState, setReferenceState] = useState({
    projectId,
    order: [] as string[],
    added: [] as string[],
    removed: [] as string[],
  })
  if (referenceState.projectId !== projectId) {
    setReferenceState({ projectId, order: [], added: [], removed: [] })
  }
  const referenceImages = useMemo(() => {
    const urls = nodes.flatMap((node) =>
      node.data.kind === NODE_MEDIA_KIND_IDS.image && node.data.url
        ? [node.data.url]
        : [],
    )
    const available = new Set(
      [...urls, ...referenceState.added].filter(
        (url) => !referenceState.removed.includes(url),
      ),
    )
    const ordered = referenceState.order.filter((url) => available.has(url))
    for (const url of available) {
      if (!ordered.includes(url)) ordered.push(url)
    }
    return ordered.map((url) => ({ url }))
  }, [nodes, referenceState])
  if (
    referenceState.projectId === projectId &&
    (referenceImages.length !== referenceState.order.length ||
      referenceImages.some(
        (entry, index) => entry.url !== referenceState.order[index],
      ))
  ) {
    setReferenceState({
      ...referenceState,
      order: referenceImages.map((entry) => entry.url),
    })
  }
  const addReference = useCallback((url: string) => {
    setReferenceState((current) => ({
      ...current,
      added: current.added.includes(url)
        ? current.added
        : [...current.added, url],
      removed: current.removed.filter((entry) => entry !== url),
    }))
  }, [])
  const removeReference = useCallback((url: string) => {
    setReferenceState((current) => ({
      ...current,
      added: current.added.filter((entry) => entry !== url),
      removed: current.removed.includes(url)
        ? current.removed
        : [...current.removed, url],
    }))
  }, [])

  /**
   * 现读用的 ref —— ⚠ 与工作台那份 `getState()` 同一条纪律：`buildSnapshot` 每次
   * 调用都要读**此刻**这张图，而不是发消息那一刻 render 里捕获的那一份。
   */
  const graphRef = useRef({
    nodes,
    edges,
    selectedNodeIds,
    currentShotNo: null as number | null,
  })
  // ⚠ 同步写在 effect 里（本仓 latest-ref 的既有写法）：render 阶段改 ref 会被
  //   `react-hooks/refs` 拦下来。事件循环两次 SSE 之间隔着一次网络宏任务，
  //   effect 早就冲干净了。
  useEffect(() => {
    graphRef.current = {
      ...graphRef.current,
      nodes,
      edges,
      selectedNodeIds,
    }
  }, [nodes, edges, selectedNodeIds])

  /**
   * 本轮落成的那几步，按落地顺序。
   *
   * ⚠ 它存在的唯一理由是撤销要知道「这一步之后还发生过几步」（见文件头注）。
   * ⛔ 不在这里存逆载荷：那份由图引擎自己的撤销栈扣着，存第二份必然漂。
   */
  const landedStepIdsRef = useRef<string[]>([])

  /** 焦点镜 = 选中的第一个节点所在的镜；没选中就交给快照去展开最前面三面。 */
  const currentShotNo = useMemo(() => {
    const first = selectedNodeIds[0]
    if (first === undefined) return null
    return nodes.find((node) => node.id === first)?.data.shotNo ?? null
  }, [nodes, selectedNodeIds])
  useEffect(() => {
    graphRef.current = { ...graphRef.current, currentShotNo }
  }, [currentShotNo])

  const buildSnapshot = useCallback((): AssistantOperatorSnapshot => {
    const graph = graphRef.current
    return {
      /**
       * ⚠ 画布上**没有**那张表单，所以 `prompt` 恒空、其余控件一格都不给 ——
       * 「字段缺席 = 没有这个控件」是快照契约里写死的那条（2026-08-22 真机实证）。
       * 提示词在画布上住在节点身上，它在 `canvas` 那一格里。
       */
      prompt: '',
      availableModels: [],
      canvas: buildCanvasOperatorSnapshot({
        nodes: graph.nodes,
        edges: graph.edges,
        currentShotNo: graph.currentShotNo,
        selectedNodeIds: graph.selectedNodeIds,
        ...(availableModelsByNodeId ? { availableModelsByNodeId } : {}),
      }),
    }
  }, [availableModelsByNodeId])

  const canvasApply = useCallback(
    (stepId: string, op: NodeAssistantOpV4): boolean => {
      const landed = applyOp(op)
      if (!landed) return false
      landedStepIdsRef.current.push(stepId)
      /**
       * 回执的第二只眼（D7 Q4）：被改的那张卡闪一次 outline。面板里那行
       * 「已改 N 项」说的是**多少**，这一闪说的是**哪几个**。
       *
       * ⚠ 排到下一帧再闪：这一跳刚提交完图，那张卡此刻正要重渲染，而 React 那
       * 一侧的 className 会在同一拍把 class 覆盖掉 —— 表现是「有时闪有时不闪」。
       * ⚠ `add_node` 那一条**闪不到**：新节点的 id 是执行器现铸的，这里拿不到。
       *   ⛔ 不为它去差集算一遍图 —— 新卡本来就会自己出现在画布上，那比闪一下
       *   更明显；如实记在任务包里。
       */
      /**
       * ⚠ `project_script` 指的是**剧本卡**（`scriptNodeId`）——闪的那一下落在
       * 它身上。新建出来的那几面镜闪不到（id 是执行器现铸的），⛔ 不为它去差集
       * 算一遍图：一整排卡凭空出现本来就比闪一下更响（§13.5 `add_node` 同理）。
       */
      const touched =
        'target' in op
          ? op.target
          : 'scriptNodeId' in op
            ? op.scriptNodeId
            : null
      if (typeof touched === 'string' && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => flashAssistantTouchedNode(touched))
      }
      return true
    },
    [applyOp],
  )

  const canvasRevert = useCallback(
    (stepId: string): void => {
      const landed = landedStepIdsRef.current
      const index = landed.lastIndexOf(stepId)
      // 没记在册上 = 这一步当时就没落成，撤销无从谈起（⛔ 不盲撤一格）。
      if (index < 0) return
      // 撤到这一步为止（含它）—— 见文件头注那条线性撤销栈的论据。
      for (let i = landed.length - 1; i >= index; i -= 1) {
        if (!canUndo) break
        undo()
      }
      landed.length = index
    },
    [canUndo, undo],
  )

  const canvasPlanRerun = useCallback(
    (nodeId: string, includeSelf: boolean): readonly string[] => {
      const downstream = collectDownstream(nodeId, graphRef.current.edges)
      return includeSelf ? [nodeId, ...downstream] : downstream
    },
    [],
  )

  const canvasGenerate = useCallback(
    (nodeId: string): void => {
      generateNodes([nodeId])
    },
    [generateNodes],
  )

  const apply = useMemo((): StudioOperatorApplyContext => {
    /**
     * ⚠ 表单那几只手在画布上无处可去 —— 见文件头注。它们**到不了**（域工具表
     * 拦在前面），写在这里是为了满足契约的形状。
     */
    const noForm = (): void => {}
    return {
      getState: () => ({ prompt: '', advancedParams: {} }),
      dispatch: noForm,
      resolveOptionId: () => null,
      addReference,
      removeReference,
      addAudioReference: noForm,
      removeAudioReference: noForm,
      setSound: noForm,
      mountUserUrl: noForm,
      unmountUserUrl: noForm,
      setPrimed: noForm,
      canvas: {
        applyOp: canvasApply,
        revertOp: canvasRevert,
        generate: canvasGenerate,
        planRerunDownstream: canvasPlanRerun,
      },
    }
  }, [
    addReference,
    removeReference,
    canvasApply,
    canvasRevert,
    canvasGenerate,
    canvasPlanRerun,
  ])

  /**
   * **画布那张脸的那一句**（D7b ③）——「{项目名} · 选中 {n} 个节点」。
   *
   * ⚠ 读的是 render 期的 `selectedNodeIds` 而不是 `graphRef`：胶囊要**跟着选择
   * 变**（画板「随宿主变化实时刷」），而那只 ref 是给「现读」用的，它变了不会
   * 触发重渲染 —— 用它的表现是「框选了几个节点胶囊不动」。
   */
  const t = useTranslations('StudioOperator')
  const selectedCount = selectedNodeIds.length
  const contextLine = useCallback(
    () =>
      t('face.canvas.context', { project: projectName, count: selectedCount }),
    [projectName, selectedCount, t],
  )
  const face = useStudioOperatorFace(
    ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
    contextLine,
  )

  return useMemo(
    (): StudioOperatorHost => ({
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
      face,
      buildSnapshot,
      apply,
      /**
       * ⚠ 结果行卡在画布上**不出现**：画布的产出落在卡自己的版本表里，那才是
       * 用户回头找它的地方。⛔ 不在面板里造一份第二处结果列。
       */
      results: NO_RESULTS,
      referenceImages,
      referenceLimit: Infinity,
      open,
      setOpen,
      /**
       * **画布整体豁免注意力收放法则**（2026-09-19 owner 拍板）。
       *
       * ⚠ 那条法则的前提是「面板外面是表单」，而画布的面板外面就是**工作面**：
       * 平移、框选、拖节点、点空白取消选择，每一下都会收掉助手 —— 真机上表现为
       * 「助手一点就关、根本没法用」。
       * ⚠ 于是画布上助手的开合**只认**右上角那颗 toggle（`ShellTopBar` 的
       * `onOpenAssistant`）与 Esc 梯（`NodeWorkbenchV4` 的 `onEscape`，两级：
       * 先收 expanded 再收 open）。⛔ 别再往画布上加第三条收起路。
       */
      collapseOnOutsidePointer: false,
      anchor: CANVAS_ANCHOR,
    }),
    [apply, buildSnapshot, face, referenceImages, open, setOpen],
  )
}
