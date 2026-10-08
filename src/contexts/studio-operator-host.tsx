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

import { createContext, useContext, type ReactNode } from 'react'

import type { LucideIcon } from '@/components/icons'

import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import type { CanvasNodeGenerationState } from '@/lib/studio-operator-canvas-snapshot'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type { AssistantWorkspace } from '@/types/assistant-workspace'
import type { SearchGroundingRailState } from '@/components/business/studio-shared/search-grounding/SearchGroundingRail'
import type { StudioOperatorShellAnchor } from '@/constants/studio-assistant-operator'
import type {
  StudioOperatorGenerationControls,
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
   * `latestMessage` = 这一轮用户刚说的那句：画布据它认出 `@` 到的节点（文本节点给全文）。
   */
  buildSnapshot(options?: { latestMessage?: string }): AssistantOperatorSnapshot
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
   * 「先搜再画」开关（B 定稿 2026-10-07：确认卡上的开关就是图片台那一份）。
   * ⚠ **可选**：只有图片工作台给；缺席 = 确认卡上没有这一颗。
   */
  searchGrounding?: StudioOperatorSearchGroundingControl
  /**
   * 某一批结果（按结果条目 id）的「先搜再画」资料 —— 只读工作台这一轮的运行状态，
   * ⛔ 不进对话历史；那一批已经不是工作台当前这一轮了 / 刷新过 = `null`。
   */
  searchGroundingForResult?(resultId: string): SearchGroundingRailState | null
  /**
   * 参考位上限（拍板 21：联网候选一行能选几张）。
   *
   * ⚠ 宿主自己兜底 `Infinity`：工作台那边是 `StudioDockPanelArea` 的 effect 跑到
   * 之前的中间态，装配台那边是「这个底模不吃参考图」（0）。
   */
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
  referenceLimit: number
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
   * `@` 选择器里可以点名的文本节点（只有画布给）。选中 = 在正文里写下 `@名字`，
   * ⛔ 不粘原文：要的是「指着它让助手读 / 改」，不是把它倒进这句话里。
   */
  mentionTextNodes?: readonly { id: string; name: string; preview: string }[]
  /**
   * 改动清单（node-canvas-v2 §1 第 4 条 · 方向 B）：这一轮改了哪几张卡，点一行 = 镜头
   * 移过去、卡面闪一下。只有画布给 —— 其余宿主没有「卡」，回执下面就不列清单。
   */
  canvasTargets?: {
    /** 这张卡现在叫什么；卡已经不在了 = `undefined`（那一行不列）。 */
    nameOf(nodeId: string): string | undefined
    locate(nodeId: string): void
    generationStateOf?(nodeId: string): CanvasNodeGenerationState | undefined
    /** 这张卡此刻的产出图（出图后自动看一眼认它变没变）；没有图 = `undefined`。 */
    outputOf?(nodeId: string): { url: string; name: string } | undefined
  }
}

const StudioOperatorHostContext = createContext<StudioOperatorHost | null>(null)

export function StudioOperatorHostProvider({
  host,
  children,
}: {
  host: StudioOperatorHost
  children: ReactNode
}) {
  return (
    <StudioOperatorHostContext.Provider value={host}>
      {children}
    </StudioOperatorHostContext.Provider>
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
