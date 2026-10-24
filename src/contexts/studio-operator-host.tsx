'use client'

/**
 * 操作员面板的**宿主契约**（P4-C）。
 *
 * ── 这个文件为什么在 P4-C 才出现 ───────────────────────────────────
 * P1–P4-B 期间操作员只有**一个**宿主（`/studio/image|video`），所以驱动 hook 直接
 * `useStudioForm()` / `useStudioData()` 是最省事也最诚实的写法。P4-C 要把它挂到
 * `/studio/lora` 上，而那条路由**故意不挂 `<StudioProvider>`**（`studio/lora/layout.tsx`
 * 顶部写着；装配台的底模 / 挂载栈 / 比例 / 参考图全是 `GenerateBranch` 的局部
 * state）。于是「面板从哪读表单、往哪写」必须变成一个参数。
 *
 * ⚠ 这**不是**预防性抽象：它是第二个宿主真的出现了才抽的，而且抽的正好是两个
 * 宿主之间唯一不同的那三样（域 / 快照 / 落笔的手），别的一律没动。
 *
 * ── ⛔ 为什么不是「给 LoRA 页也挂上 StudioProvider」 ───────────────────
 * `studio-context.tsx` 是 47 个文件的高危件，而它的表单模型里没有「挂载栈」
 * 「底模」这些概念 —— 挂上去等于往一个不适配的 reducer 里塞第二套语义，
 * 而装配台那边还得把 40 个局部 state 搬过去。代价与收益完全不成比例。
 *
 * ── ⛔ 为什么不是模块级 registry ──────────────────────────────────────
 * `registerOperatorRunner` 那个模块口是有理由的（就地确认条与面板分属两棵树，
 * 中间没有共同 Provider）。这里不一样：**面板与宿主永远在同一棵树里**
 * （工作台是 `StudioWorkspaceUI`，装配台是 `GenerateBranch`），context 直接够得着。
 * 模块单例反而会在两个页面之间留一份陈旧的手 —— 而那是没人会去查的失败。
 */

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { LucideIcon } from '@/components/icons'
import type { StudioOperatorHistoryRestore } from '@/hooks/use-studio-operator-history'

import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import type { NodeWorkflowStatus } from '@/constants/node-types'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import type { CanvasNodeGenerationState } from '@/lib/studio-operator-canvas-snapshot'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type {
  AssistantMentionCandidate,
  AssistantMentionGroupId,
  AssistantMentionRole,
} from '@/types/assistant-mention'
import type { AssistantWorkspace } from '@/types/assistant-workspace'
import type { SearchGroundingRailState } from '@/components/business/studio-shared/search-grounding/SearchGroundingRail'
import type { StudioOperatorShellAnchor } from '@/constants/studio-assistant-operator'
import type {
  StudioOperatorGenerationControls,
  StudioOperatorGenerationDraft,
  StudioOperatorResultItem,
  StudioOperatorResultRun,
} from '@/types/studio-assistant-operator'

/**
 * **这个宿主的那张脸**（D7b ③ · 画板 `DesignD7bFaces`，owner 2026-09-20）。
 *
 * ⭐ 「一个壳，四张脸」的全部落点：骨架 / 输入区 / 卡片形状 / 宽高 / 动效 / 人设与
 * 口吻四处**同一份**，每张脸只换这三样（外加输入框占位词）。四份宿主各自实现，
 * 面板只读它 —— ⛔ 组件里不许按 `domain` 分叉硬编码，那正是这个契约要消掉的东西。
 *
 * ⛔ **不上色**：域标记是灰底小胶囊，颜色不能当身份用 —— 脊柱 §2.1 把模态色留给
 * prompts 域（`ui-defaults.md`）。
 */
/** 宿主给确认卡的那一颗「先搜再画」（读写工作台那一份开关）。 */
export interface StudioOperatorSearchGroundingControl {
  /** 这一轮名单里有支持的型号。 */
  available: boolean
  on: boolean
  setOn(on: boolean): void
}

export interface StudioOperatorFace {
  /** 规格行（输入框上方那一行）左边那枚图标。 */
  domainIcon: LucideIcon
  /**
   * 规格行里那**一句当前上下文**，已翻译。
   *
   * ⭐ 它是**函数**不是值，但调用方在 render 里调：宿主每次把用到的那几格算进
   * `useMemo` 的依赖，所以状态一变就换一份新的 `face`，胶囊跟着刷 —— 这正是画板
   * 「随宿主变化实时刷」那条。⛔ 别改成一个在宿主里提前拼好的字符串常量：那会
   * 让「改了张数胶囊不动」这种失败静默通过。
   */
  contextLine(): string
  /** 空态那句话（已翻译）。⛔ 不重复人设名字 —— 名字在头部已经有了。 */
  emptyLine: string
  /**
   * 起手药丸的**文案**（已翻译，≤ `STUDIO_OPERATOR_FACE_PILL_LIMIT`）。
   * ⚠ 点一颗 = **直接发这句话**（拍板 15），所以这里给的就是要发出去的那句原文。
   */
  starterPills: readonly string[]
  /** 输入框占位词 —— 四处各写各的，这是输入区唯一的文案差异。 */
  inputPlaceholder: string
}

/** 宿主自己带进 `@` 菜单的那几组（见 `StudioOperatorHost.mentions`）。 */
export interface StudioOperatorMentionSources {
  readonly groups: readonly {
    readonly id: AssistantMentionGroupId
    readonly items: readonly AssistantMentionCandidate[]
  }[]
  readonly omit?: readonly AssistantMentionGroupId[]
  readonly roles?: readonly AssistantMentionRole[]
}

export interface StudioOperatorHost {
  workspace: AssistantWorkspace
  /**
   * 这个宿主此刻在哪个域。
   *
   * ⚠ 工作台会随模态在 `image` / `video` 之间变（切域机制见 `claimOperatorThreadScope`）；
   * 装配台恒 `lora`。⛔ 别在面板里按路由猜域 —— 域是宿主说了算的。
   */
  domain: AssistantOperatorDomain
  /**
   * **会话按哪个画布项目分**（D12 U7）—— 只有画布给。
   *
   * 与 workspace 一起标识当前工作区；画布项目之间不共享会话或执行许可。
   */
  projectId?: string
  /** 这个宿主那张脸（D7b ③）—— 见 `StudioOperatorFace` 的头注。 */
  face: StudioOperatorFace
  /**
   * 当前表单快照 —— `read_state` 的唯一数据源，服务端一个字段都不查库。
   *
   * ⚠ 必须是**每次调用现读**（不是渲染时算好的对象）：事件循环跨很多次 render，
   * 应用第 5 步时用的必须是此刻的表单，不是发消息那一刻的。
   * `latestMessage` = 这一轮用户刚说的那句；`mentionedNodeIds` = 这句话 `@` 到的卡
   * （统一引用模型按 id 解析好的，§10b）—— 画布据此展开那几张、给文本卡全文。
   * ⛔ 别再按名字从正文里猜：三张同名「镜头1」只认得第一张。
   */
  buildSnapshot(options?: {
    latestMessage?: string
    mentionedNodeIds?: readonly string[]
  }): AssistantOperatorSnapshot
  /**
   * op 往哪落、撤销从哪撤 —— 应用与撤销共用同一份判据的两侧。
   *
   * ⭐ **「扣扳机的手」也住在这里**（`apply.triggerGeneration`，§6 花钱档，切片 2a）：
   * `request_generation` 那一步由 `applyOperatorStep` 分派，而它只拿得到这份
   * apply 上下文（它是个脱离 React 的纯函数，两个调用方谁都不该为它变成 async）。
   * 把扳机挂在宿主根上、再从面板往下传一条线，只会让同一只手有两个入口。
   * ⚠ 它**可选**：没有生成键的宿主就不接 —— 缺席是诚实，实现成空函数才是「点了
   * 没反应、三绿」的失败。工作台与 LoRA 装配台都接了（后者 2026-09-29 起）。
   */
  apply: StudioOperatorApplyContext
  /**
   * **这一批刚出来的结果**（§2.11 结果行卡 / §3.3 `@` 选择器「最近生成在前」）。
   *
   * ⭐ 从宿主来而不是面板自己去 context 摸（切片 3a）：面板同时挂在工作台与 LoRA
   * 装配台上，而 `/studio/lora` 故意不挂 `<StudioProvider>` —— 面板里那句
   * `useStudioGenOptional()` 在装配台上恒空，于是结果行卡在那边**结构性地**永远
   * 不可能出现。宿主各自把自己的结果列映射成同一个形状，两边就都有了。
   * ⚠ **只读**：面板不往里写，选中态住在 store（`selectedResultId`）。
   * ⚠ 空数组 = 这一轮还没有结果，结果行卡整块不渲染（⛔ 不做空占位）。
   */
  results: readonly StudioOperatorResultItem[]
  /**
   * **这一批的在飞读数**（v2 §6.3，commit #10）—— 结果卡「正在出图 · 1 / 3」
   * 与占位格数的数据源。
   *
   * ⭐ 与上面那份 `results` 的分工：那一份只收**跑完的**（`@` 选择器挑的就是它们），
   * 而结果卡还得说得出没跑完的那几张 —— 否则占位格数只能靠猜。
   * ⚠ **可选**：装配台那条结果列没有「一批」的概念（一次一张），缺席时结果卡的
   * 生成中态不出现 —— ⛔ 别在那边造一个假的一批。
   */
  resultRun?: StudioOperatorResultRun
  /**
   * **生成确认卡那四颗旋钮的真值**（v2 §5.2，commit #9）。
   *
   * ⭐ 它与 `buildSnapshot` 的分工是「现读」对「随表单变」：快照是每次调用现算的
   * （事件循环跨很多次 render），而这一份必须**跟着表单一起重渲染** —— §5.2 第三行
   * 「卡未确认时用户改工作台，卡上对应项跟着变」就是靠它成立的。所以它是一个值
   * 而不是一个函数，⛔ 别改成 `buildGenerationControls()`。
   * ⚠ **可选**：LoRA 装配台一次只出一张图、也没有比例 / 清晰度那两颗旋钮，缺席
   *   时确认卡退回只读读数（⛔ 不摆一颗点了没反应的下拉）。
   */
  generationControls?: StudioOperatorGenerationControls
  /**
   * 首页那份小配方（第 9g 步）：卡上直接改提示词与参考图、「去图片台接着改」。
   * ⚠ 只有首页给（台开着时那两格就在台上）；缺席 = 卡上只有旋钮。
   */
  generationDraft?: StudioOperatorGenerationDraft
  /**
   * 「先搜再画」开关（B 定稿 2026-10-07：确认卡上的开关就是图片台那一份）。
   * ⚠ **可选**：只有图片工作台给；缺席 = 确认卡上没有这一颗。
   */
  searchGrounding?: StudioOperatorSearchGroundingControl
  /**
   * 某一批结果（按结果条目 id）的「先搜再画」资料 —— 只读工作台这一轮的运行状态，
   * ⛔ 不进对话历史；那一批已经不是工作台当前这一轮了 / 刷新过 = `null`。
   */
  searchGroundingForResult?(resultId: string): SearchGroundingRailState | null
  /** 工作台此刻挂着的参考图（助手看得见、能 @）。 */
  referenceImages: readonly {
    url: string
    name?: string
    disabledReason?: string | null
    /**
     * 宿主自己内容里带出来的（画布上的图），不是用户挂上的：助手看得见、能 @，
     * 但面板**不摆成 chip**（画布一多就是一整墙）。没有这个字段 = 用户挂的，照常摆。
     */
    implicit?: boolean
  }[]
  /**
   * 面板开合。
   *
   * ⚠ 归宿主管而不是面板自己存：工作台挂在 `panels.enhance` 上（与小屏抽屉那条路
   * 共用一个槽，两份状态不会漂），装配台是 `LoraWorkbench` 根上的 `assistantOpen`
   * （tab 行那颗按钮与移动端操作条按的都是它）。面板自己存一份的表现是「点标题栏
   * 的助手按钮没反应」。
   */
  open: boolean
  setOpen(open: boolean): void
  /**
   * 面板外的 pointerdown 收不收面板 —— 即「注意力收放法则」（拍板 7）在这个宿主
   * 上成不成立。
   *
   * ⚠ **缺省 = `true`（收）**：工作台与 LoRA 装配台一个字都不用改，新宿主接进来
   * 也默认继承现有法则；要豁免必须显式写出来。
   *
   * ⭐ 为什么是**宿主**的性质而不是域的性质：法则的前提是「面板外面是表单」——
   * 点表单说明用户不在跟助手说话。画布（`/studio/node`）的面板外面是**工作面**
   * 本身：平移、框选、拖节点、点空白取消选择，每一下都会命中那条监听，助手因此
   * 一点就关（2026-09-19 owner 真机 `/zh/studio/node` 复现）。所以判据是「这个宿主
   * 的面板外面是不是工作面」，⛔ 别在面板里按 `domain === 'canvas'` 硬判 ——
   * 第四个宿主该由它自己说了算。
   *
   * ⚠ 置为 `false` 的宿主必须自己给出开合的路（画布是右上角那颗 toggle + Esc 梯），
   * 否则面板开了就收不回去。
   */
  collapseOnOutsidePointer?: boolean
  /**
   * **头像与面板落在视口哪两个角**（D7b ④ · 头像开关，owner 2026-09-20）。
   *
   * ⭐ 与 `collapseOnOutsidePointer` 同一条判据：这是**宿主的性质**不是域的性质。
   * 画布有顶栏（面板顶边 = 顶栏底 + 6，头像排在「剪辑台」胶囊右侧），工作台与
   * LoRA 装配台没有（头像与面板同贴右上那 24px 留白）。⛔ 别在 Dock 里按
   * `domain === 'canvas'` 硬判 —— 第四个宿主该由它自己说了算。
   *
   * ⚠ **缺省 = `STUDIO_OPERATOR_DEFAULT_ANCHOR`**（24/24 四角）：工作台与装配台
   * 一个字都不用写，新宿主接进来也默认继承。
   * ⚠ 开关的位移由这四个数**算**出来（见 `operatorAvatarShift`），⛔ 不量 DOM。
   */
  anchor?: StudioOperatorShellAnchor
  /**
   * 助手输入框里递上来的图（📎 / 素材库 / @）是不是**直接挂进这个宿主的参考列表**。
   *
   * ⭐ **缺省 = 不挂**（owner 2026-10-07「只给助手看」）：工作台与 LoRA 装配台的参考
   * 列表就是出图的参考输入，附图一挂上去下一次出图就带着它，而递图多半只是想问一句。
   * 图于是只跟着这条消息走（`mentionedAssets`），助手看得见；要当参考由用户说一声，
   * 助手走 `mount_reference`（过程行可撤销）。
   * ⚠ 画布置 `true`：那边的参考列表本来就只是助手上下文（不是哪张卡的出图输入），
   * 画布工具还要靠它把图接进节点。⛔ 别在 Dock 里按 `domain === 'canvas'` 硬判 ——
   * 与 `collapseOnOutsidePointer` 同一条判据。
   */
  attachmentsMountReferences?: boolean
  /**
   * 这张脸在 `@` 菜单里**自己带的**候选（§10b「候选来源插件化」）。面板统一渲染、
   * 统一搜索；参考位 / 结果 / 📎 / 素材库 / 角色这几组由面板自己从契约里现成的东西拼。
   *
   * - 画布：「选中的卡」+「画布上的卡」（图 / 视频 / 音频 / 文本，含还没产出的）；
   * - LoRA 台：挂着的 LoRA；角色页：页上的角色。
   * ⚠ `omit`：这张脸不出哪几组通用候选（LoRA 台不 `@` 角色；画布的参考位就是画布上
   *   的卡，不另列一组）。⚠ `roles`：胶囊小卡片上能定的参考用途，缺省 = 不给。
   */
  mentions?: StudioOperatorMentionSources
  /**
   * 改动清单（node-canvas-v2 §1 第 4 条 · 方向 B）：这一轮改了哪几张卡，点一行 = 镜头
   * 移过去、卡面闪一下。只有画布给 —— 其余宿主没有「卡」，回执下面就不列清单。
   */
  canvasTargets?: {
    /** 这张卡现在叫什么；卡已经不在了 = `undefined`（那一行不列）。 */
    nameOf(nodeId: string): string | undefined
    /**
     * 这一步建出来的卡的真 id（`add_node.ref` → id）；不是这一步建的 = `undefined`。
     * 改动清单靠它把 `new1` 这类临时名换回画布上的卡。
     */
    createdIdOf?(stepId: string, ref: string): string | undefined
    locate(nodeId: string): void
    generationStateOf?(nodeId: string): CanvasNodeGenerationState | undefined
    /** 这张卡此刻的产出图（出图后自动看一眼认它变没变）；没有图 = `undefined`。 */
    outputOf?(nodeId: string): { url: string; name: string } | undefined
    /**
     * 这张卡在跑没跑、有没有可看的一帧（队列条那几格的进度与结果，方向 C）。
     * `previewUrl` = 图片卡的图 / 视频卡的封面；卡不在了 = `undefined`。
     */
    runOf?(
      nodeId: string,
    ): { status: NodeWorkflowStatus; previewUrl?: string } | undefined
  }
}

const StudioOperatorHostContext = createContext<StudioOperatorHost | null>(null)

/**
 * **台登记口**（第 9f 步，方向 E）：`/studio` 外壳只挂**一份**面板，台反过来把自己交给它。
 *
 * ⭐ 台照旧用 `StudioOperatorHostProvider` 包住自己（台里的 ✦ 归属标记、就地确认条读的
 *   还是最近那一层）；外壳在的时候，同一个 Provider 顺手把宿主登记上去 —— 进场登记、
 *   每次换新宿主就换上去、离场注销。外壳里的面板读登记口最新那一份。
 * ⚠ 嵌套时取**最里面**那一份（按层数，同层取后登记的）。
 * ⚠ 没有外壳（`/cards` 角色页）时 Provider 只做原来那件事，面板照旧挂在页面里。
 */
interface StudioOperatorHostSlot {
  set(token: string, host: StudioOperatorHost, depth: number): void
  remove(token: string): void
}

/** 第几层台（外层 1、嵌进去的 2…）：子组件的 layout effect 先跑，挂载顺序说明不了谁在里面。 */
const StudioOperatorHostDepthContext = createContext(0)

const StudioOperatorHostSlotContext =
  createContext<StudioOperatorHostSlot | null>(null)

/** 此刻在场的是哪一次登记（`null` = 首页，没有台）。换了 = 换了台。 */
const StudioOperatorBenchKeyContext = createContext<string | null>(null)

export function StudioOperatorHostProvider({
  host,
  children,
}: {
  host: StudioOperatorHost
  children: ReactNode
}) {
  const slot = useContext(StudioOperatorHostSlotContext)
  const depth = useContext(StudioOperatorHostDepthContext) + 1
  const token = useId()
  // ⚠ layout effect：台挂上的那一帧面板就该换到这个台，⛔ 不先画一帧「首页」。
  useLayoutEffect(() => {
    slot?.set(token, host, depth)
  }, [slot, token, host, depth])
  useLayoutEffect(() => () => slot?.remove(token), [slot, token])
  return (
    <StudioOperatorHostDepthContext.Provider value={depth}>
      <StudioOperatorHostContext.Provider value={host}>
        {children}
      </StudioOperatorHostContext.Provider>
    </StudioOperatorHostDepthContext.Provider>
  )
}

/**
 * 外壳那一层：收台登记、把**此刻在场的台**（没有台 = `fallback`，首页那张脸）交给
 * `children` 里的面板。返回值的 `bench` = 有没有台登记着。
 */
export function StudioOperatorHostSlotProvider({
  fallback,
  children,
}: {
  fallback: StudioOperatorHost
  children: (state: { host: StudioOperatorHost; bench: boolean }) => ReactNode
}) {
  const [entries, setEntries] = useState<
    readonly { token: string; host: StudioOperatorHost; depth: number }[]
  >([])
  const set = useCallback(
    (token: string, host: StudioOperatorHost, depth: number) => {
      setEntries((current) => {
        const index = current.findIndex((entry) => entry.token === token)
        if (index === -1) return [...current, { token, host, depth }]
        const existing = current[index]!
        if (existing.host === host && existing.depth === depth) return current
        const next = [...current]
        next[index] = { token, host, depth }
        return next
      })
    },
    [],
  )
  const remove = useCallback((token: string) => {
    setEntries((current) =>
      current.some((entry) => entry.token === token)
        ? current.filter((entry) => entry.token !== token)
        : current,
    )
  }, [])
  const slot = useMemo(() => ({ set, remove }), [set, remove])
  const active = entries.reduce<(typeof entries)[number] | null>(
    (best, entry) => (!best || entry.depth >= best.depth ? entry : best),
    null,
  )
  const host = active?.host ?? fallback
  return (
    <StudioOperatorHostSlotContext.Provider value={slot}>
      <StudioOperatorBenchKeyContext.Provider value={active?.token ?? null}>
        <StudioOperatorHostContext.Provider value={host}>
          {children({ host, bench: active !== null })}
        </StudioOperatorHostContext.Provider>
      </StudioOperatorBenchKeyContext.Provider>
    </StudioOperatorHostSlotContext.Provider>
  )
}

/**
 * ⚠ **抛而不是回落**：没有宿主时面板读不到表单也写不回去，静默降级的表现是
 * 「助手一切正常，就是什么都没改」—— 本仓最讨厌的那种失败。
 */
export function useStudioOperatorHost(): StudioOperatorHost {
  const host = useContext(StudioOperatorHostContext)
  if (!host) {
    throw new Error(
      'useStudioOperatorHost must be used within <StudioOperatorHostProvider>',
    )
  }
  return host
}

/**
 * 外壳里此刻是哪个台（登记号）；不在外壳里 = `undefined`。
 * ⚠ 面板只挂一份之后换台不再卸载面板 —— 「换台就掐掉在飞的流」靠它判。
 */
export function useStudioOperatorBenchKey(): string | null | undefined {
  const inShell = useContext(StudioOperatorHostSlotContext) !== null
  const key = useContext(StudioOperatorBenchKeyContext)
  return inShell ? key : undefined
}

/** 这一层在不在 `/studio` 外壳里（在的话面板由外壳挂，台上别再挂一份）。 */
export function useInStudioOperatorShell(): boolean {
  return useContext(StudioOperatorHostSlotContext) !== null
}

/**
 * 面板这一份挂在哪儿（第 9f 步）：
 * - `shell`：≥1024，外壳中间那一栏挂着 —— 台上 ⛔ 再挂；
 * - `bench`：更窄（或不在外壳里，如 `/cards`）—— 台照旧自己挂（浮起的那一颗）；
 * - `pending`：外壳还没量出屏宽 —— 哪边都先别挂。
 * `restore` = 这次页面加载一进来载回哪一段（地址说了算），挂在哪儿都按它水化。
 */
export interface StudioOperatorDockPlacement {
  owner: 'shell' | 'bench' | 'pending'
  restore: StudioOperatorHistoryRestore
}

const StudioOperatorDockPlacementContext =
  createContext<StudioOperatorDockPlacement>({
    owner: 'bench',
    restore: 'latest',
  })

export const StudioOperatorDockPlacementProvider =
  StudioOperatorDockPlacementContext.Provider

export function useStudioOperatorDockPlacement(): StudioOperatorDockPlacement {
  return useContext(StudioOperatorDockPlacementContext)
}

/**
 * 库叠层里的那一块（第 9f 步 9f-2a）：叠层里的页面（如角色页）自己也包着宿主 Provider、
 * 挂着一颗面板 —— 在这里一律**不登记、不挂**：库只是拿东西的地方，面板仍是外壳那一份、
 * 宿主仍是底下那个台（⛔ 一打开库就把台上在跑的那一轮掐掉）。
 */
export function StudioOperatorDetachedScope({
  children,
}: {
  children: ReactNode
}) {
  const placement = useContext(StudioOperatorDockPlacementContext)
  const detached = useMemo<StudioOperatorDockPlacement>(
    () => ({ owner: 'shell', restore: placement.restore }),
    [placement.restore],
  )
  return (
    <StudioOperatorHostSlotContext.Provider value={null}>
      <StudioOperatorDockPlacementContext.Provider value={detached}>
        {children}
      </StudioOperatorDockPlacementContext.Provider>
    </StudioOperatorHostSlotContext.Provider>
  )
}
