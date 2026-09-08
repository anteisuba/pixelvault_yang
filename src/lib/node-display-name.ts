/**
 * 节点显示名的单一事实源（包 4.5）。
 *
 * ── 为什么需要这个文件 ──────────────────────────────────────────────
 * 在这之前，「这个节点叫什么」在仓里有 **4 套读法、3 套写法**，互相不一致：
 *
 *   读 · `CastDock.getNodeDisplayName`      七字段优先链，最全
 *   读 · `NodeShell` 的来源 chip             按呈现类型分支，漏 mediaLabel/sourceLabel
 *   读 · `LooseImageCard.rawLabel`           只有 mediaLabel ‖ sourceLabel
 *   读 · `StudioNodeAssistantDock.getNodeTitle`  只认 legacy characterImage，其余全给类型标签
 *   写 · `IdentityCollectorCard.commitName`  characterName / backgroundName
 *   写 · `NodeMediaPreview.commitHeaderTitle` shotName / mediaLabel+sourceLabel / …
 *   写 · `LooseImageCard` 与 `ImageSourceStarter`  mediaLabel + sourceLabel
 *
 * 这直接长出两个真 bug：
 *   ① 助手 payload 里的 `title` 是**本地化类型标签**（「图片」），不是名字 ——
 *      因为那条读法只认合并前的 `characterImage`，而角色早已是 `image`+role。
 *   ② **出图会把名字弄丢**：同一个 `role=shot` 静帧，空态由 `NodeMediaPreview`
 *      渲染（读写 `shotName`），一旦有图就换成 `LooseImageCard`（读写
 *      `mediaLabel`）。起完名再生成一张图，卡上就变回「未命名」。
 *
 * ── 所以这里只放两件事，而且必须放在同一个文件里 ────────────────────
 * `resolveNodeDisplayName` 和 `buildDisplayNamePatch` 是一对：**读的优先链**与
 * **写的落点**要能在一屏之内对得上。拆开放两处，正是它们当初分叉的方式。
 *
 * ⚠ 写侧口径（owner 2026-07-31 拍板）：**按 role/type 定，与「有没有媒体」无关**。
 * 同一个节点永远写同一个字段，读写因此天然对齐。旧数据不迁移 —— 读侧的优先链
 * 本来就把所有历史字段都含在内。
 *
 * ── 2026-08-26 画布修法 D1 追加 `resolveNodeAccessibleName` ──────────────
 * 不是第三条独立读法：**内部直接调用上面的 `resolveNodeDisplayName`**，只是
 * 在没名字时退回类型名、有名字时把类型也带上，给 React Flow 的 `Node.ariaLabel`
 * 消费（键盘 Tab 到节点时读屏念的就是这个）。放在同一文件是因为它的正确性
 * 完全依赖那条优先链——链一变它自动跟着变，拆开放就是又一次「读法分叉」的
 * 开始，正是这个文件存在的理由。
 */

import {
  NODE_STUDIO_CHARACTER_IMAGE_OUTPUT,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_DISPLAY_NAME,
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT,
  NODE_V4_NAME,
} from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const next = value.trim()
  return next.length > 0 ? next : undefined
}

/**
 * 上传/拖入的文件名落进显示名字段之前先剥掉扩展名（台账 C5，2026-08-02）。
 *
 * `IMG_2043.png` 当名字尚可，`cbf13d8d9e967d35c185019db8431c8.png` 就是把
 * 机器串当人名。读侧的精确相等守卫接不住这一类（它不等于任何 id 字段），
 * 但至少不要连 `.png` 一起显示；剥完是空串时调用方各自的兜底文案接手。
 *
 * 只剥最后一节，且要求它是 1–8 位字母数字 —— 免得把 `v1.5 概念稿` 这种
 * 带点的正常名字截断。
 */
export function stripFileExtension(fileName: string): string {
  // 先 trim 再剥：`$` 锚点碰上尾部空格就匹配不到扩展名了。
  return fileName
    .trim()
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .trim()
}

/**
 * 任意长文本 → 可以安全落进显示名字段的短标签。**所有把用户/机器文本写进
 * `characterName` / `backgroundName` / `shotName` / `voiceName` / `mediaLabel` /
 * `sourceLabel` / `referenceAssets[].name` 的入口都必须过这里。**
 *
 * ── 为什么必须收成一处（台账 V，2026-08-29 真机实测）─────────────────
 * 这七个字段在 `types/node-workflow.ts` 里全是 `.max(160)`，而写侧有七个入口把
 * `generation.prompt` **原样**写进去 —— 一张用几百字提示词生成的图，只要被选进
 * 参考图 / 落成散图节点，那段提示词就成了它的「名字」。后果不是显示难看，是
 * **整个项目从那一刻起不再落库**：
 *
 *   `[node-workflow] server persist failed {"operation":"update-project-state",
 *    "error":"Too big: expected string to have <=160 characters, ×3"}`
 *
 * 服务端 Zod 拒收整个 payload，客户端却把它报成「连不上云端，请检查网络连接」
 * （已同步修，见 `use-node-workflow-store.ts` 的写失败上报）。用户被
 * 指去修网络，而这轮所有配置只活在浏览器内存里，刷新即失。
 *
 * ⚠ 截断而不是拒绝：这些字段本就该短（是标题不是内容），原文一直都在
 * `data.prompt` / `generationId` 指向的 Generation 记录上，没有信息丢失。
 *
 * ⚠ 空串返回 `undefined` 而不是 `''`：schema 上这批字段是 `.min(1).optional()`，
 * 写空串同样会被服务端拒收 —— 换一个 Zod 报错不算修好。
 */
export function toNodeDisplayLabel(value: unknown): string | undefined {
  const trimmedValue = trimmed(value)
  if (!trimmedValue) return undefined
  const clamped = trimmedValue
    .slice(0, NODE_STUDIO_DISPLAY_NAME.maxLength)
    .trim()
  return clamped.length > 0 ? clamped : undefined
}

/**
 * 这个节点在画布上显示的名字；从没命名过时返回 `undefined`。
 *
 * ⚠ **不带兜底**。类型标签（「图片」「镜头文本」）是**呈现层**的事，各处的
 * fallback 文案不尽相同（卡面用 `未命名`、chip 用类型名），塞进这里会让调用方
 * 分不清「用户起过名」和「我们编了个名」—— 可编辑标签尤其不能混：
 * `LooseImageCard` 的输入框拿到兜底文案后，一次原样回车就会把它**存成真名字**。
 *
 * 优先链沿用 `CastDock` 那条（本来就是最全的一条），顺序即语义：专有身份名 →
 * 通用媒体标签。
 */
/**
 * 给一批节点算出「人能念出来的名字」—— 有真名字用真名字，没有的按**类型 + 序号**
 * 提议一个（`参考视频1` / `角色2`）。
 *
 * ⚠ **这是提议，不是事实。** 序号按传进来的列表顺序算，增删节点会重新编号。所以它
 * 只能用于**当下这一屏的显示**；一旦这个名字要被写进会留存的地方（@ 提及会把字面
 * 文本存进 prompt），调用方必须先把名字**盖回节点**（`buildDisplayNamePatch`），
 * 否则以后重新编号会让 `@参考视频2` 静默指向另一个节点。
 *
 * ⚠ 不改 `resolveNodeDisplayName` 的兜底：它有 9 个调用方，其中好几个**要**靠
 * `undefined` 判断「从没命名过」（见 `use-downstream-uses` 的注释）。加个新函数，
 * 不动老的。
 */
export function buildFallbackNodeNames<
  T extends { id: string; data: NodeWorkflowNodeData },
>(nodes: readonly T[], kindLabelOf: (node: T) => string): Map<string, string> {
  const counters = new Map<string, number>()
  const names = new Map<string, string>()
  for (const node of nodes) {
    const real = resolveNodeDisplayName(node.data)
    if (real) {
      names.set(node.id, real)
      continue
    }
    const kind = kindLabelOf(node)
    const next = (counters.get(kind) ?? 0) + 1
    counters.set(kind, next)
    names.set(node.id, `${kind}${next}`)
  }
  return names
}

/**
 * 已知的「上传备注」机器串 —— `useNodeReferenceUpload` 的 `note` 参数没写
 * 描述时会原样落进 `generation.prompt`（服务端行为，见 A 节改动背景）。之后
 * 「选已有图」一类写入口（`ReferenceLandingTabs.handleSelectAssets` /
 * 画布 workbench 素材库拖拽落图 / `ImageFamilyBody.handleSelectExisting`
 * / `CharacterDetailBody` / `VideoComposer` 同模式）直接拿 `generation.prompt`
 * 当名字，于是这几个常量原样穿透进 `characterName`/`backgroundName`/
 * `shotName`/`mediaLabel`/`sourceLabel` 里的任意一个（画布 workbench.
 * handleSpawnReference` 按 role 决定具体落哪个字段）。
 *
 * import 常量本身，不手抄字符串 —— 串值一旦漂移这里要跟着漂移，硬编码会
 * 悄悄失联。
 */
const KNOWN_UPLOAD_NOTE_LABELS: readonly string[] = [
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT.uploadNote,
  NODE_STUDIO_CHARACTER_IMAGE_OUTPUT.uploadNote,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.uploadNote,
]

export function resolveNodeDisplayName(
  data: NodeWorkflowNodeData,
): string | undefined {
  return (
    notMachineValue(data, trimmed(data.characterName)) ??
    notMachineValue(data, trimmed(data.character?.name)) ??
    notMachineValue(data, trimmed(data.backgroundName)) ??
    notMachineValue(data, trimmed(data.shotName)) ??
    notMachineValue(data, trimmed(data.voiceName)) ??
    notMachineValue(data, trimmed(data.mediaLabel)) ??
    notMachineValue(data, trimmed(data.sourceLabel))
  )
}

/**
 * 丢掉「其实是机器值」的那种标签 —— 上传备注常量、模型 id、generation id
 * 三类。
 *
 * 生成流程曾经把 `generation.model` 直接写进 `mediaLabel`（那是显示名字段），
 * 于是一张从没被命名过的生成图，在助手 payload 与卡匣里都叫
 * `gemini-3.1-flash-image-preview` —— 把系统值当人起的名字。写侧已经不再这么
 * 写了，但**存量项目里那些标签还在**，所以读侧也要挡一道。
 *
 * ⚠ 判据是**与这个节点自己带的那个 id 精确相等**（或是全局共享的已知上传备注
 * 常量），不是「看起来像模型名 / 像 hash」的模式匹配。用户完全可以把一张图就
 * 叫这个名字 —— 只有当它和该节点实际用的模型 / generation id 一字不差时，才
 * 几乎必然是那次写入留下的。
 *
 * ⚠ 这一层接不住的：用户拖入一个 hash 命名的下载文件（`file.name` 不等于任何
 * id 字段）。那要靠写侧剥扩展名 + 兜底文案，不能在这里放宽判据。
 *
 * ⚠ 对全部 7 个字段统一跑这道判据（A 节前是只有 mediaLabel/sourceLabel 过
 * 这道闸）—— `handleSpawnReference` 按 role 把同一个机器串写进
 * characterName/backgroundName/shotName 时，读侧不能只挡后两个字段。
 */
function notMachineValue(
  data: NodeWorkflowNodeData,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined
  if (KNOWN_UPLOAD_NOTE_LABELS.includes(value)) return undefined
  if (value === data.model?.modelId) return undefined
  // 台账 C5（2026-08-02）：generation id 与模型 id 同病 —— 素材库选图那条
  // 路径把机器串写进了显示名字段，用户在快捷编辑面板里看到的是
  // 「正在编辑 [cbf13d8d9e967d35c185019db8431c8…]」。判据同上：**精确相等**
  // 才拦，绝不做「长得像 hash」的模式匹配（用户完全可以给图起 hex 名）。
  if (value === trimmed(data.generationId)) return undefined
  if (value === trimmed(data.sourceGenerationId)) return undefined
  if (value === trimmed(data.derivedFromGenerationId)) return undefined
  return value
}

/**
 * 重命名该写哪个字段。
 *
 * 判据是 **role 优先、type 兜底**，因为统一 `image` 节点的身份在 `data.role`
 * 上而不在 type 上（合并后 `characterImage` 这类 legacy type 只剩历史数据）。
 *
 * `mediaLabel` 与 `sourceLabel` 一起写：两者是老搭档，只写一个会让它们悄悄
 * 分叉（`NodeMediaPreview` 原注释已经记过这条）。
 *
 * ⚠ 值一律过 `toNodeDisplayLabel` 截到 schema 上限（台账 V）。改名输入框本身没有
 * maxLength——粘一段长文进去，落盘时服务端会拒收**整个 project state**，而不是只
 * 拒这一个名字。空名字由 `EditableNodeLabel.applyCommit` 在上游拦掉，这里截完仍
 * 为空只可能是调用方传了纯空白，退化成不写这个字段（返回空补丁）而不是写空串
 * —— schema 上这批字段是 `.min(1)`，写空串同样会让整份状态被拒。
 */
export function buildDisplayNamePatch(
  /**
   * 只收真正决定落点的两样东西，不要整个 `data` —— 调用方里有的（起手卡）
   * 根本拿不到完整 data，有的（散图卡）只有更宽的 token 类型。
   */
  identity: { role?: NodeImageRole; type?: NodeWorkflowNodeType },
  nextValue: string,
): Partial<NodeWorkflowNodeData> {
  const { role, type } = identity
  const value = toNodeDisplayLabel(nextValue)
  if (!value) return {}

  if (
    role === NODE_IMAGE_ROLE_IDS.character ||
    role === NODE_IMAGE_ROLE_IDS.closeup ||
    type === NODE_TYPE_IDS.characterImage
  ) {
    return { characterName: value }
  }
  if (
    role === NODE_IMAGE_ROLE_IDS.background ||
    type === NODE_TYPE_IDS.backgroundImage
  ) {
    return { backgroundName: value }
  }
  if (role === NODE_IMAGE_ROLE_IDS.shot || type === NODE_TYPE_IDS.shot) {
    return { shotName: value }
  }
  if (type === NODE_TYPE_IDS.voice) {
    return { voiceName: value }
  }
  // 无 role 的散图、关键帧、镜头文本、视频合并、参考视频、seedance —— 没有专有
  // 身份字段，用通用媒体标签。
  return { mediaLabel: value, sourceLabel: value }
}

/**
 * 节点的可访问名（画布修法 D1，2026-08-26）——挂到 React Flow 的 `Node.ariaLabel`
 * 上。不设置时 `NodeWrapper` 直接省掉 DOM `aria-label` 属性（node_modules/
 * @xyflow/react 源码里就是 `"aria-label": node.ariaLabel`，没有兜底字符串），
 * 读屏于是退化成「按内容拼可访问名」：卡里唯一带显式 aria-label 的后代通常是
 * 卡头的改名按钮（见 `nodes/v4/NodeV4EditableLabel.tsx`），它的 aria-label
 * 固定是 `StudioNode.nodeToolbar.rename`（"命名"）——这正是「18 个节点读屏都
 * 念成同一个词」的来源。显式给节点自己的 ariaLabel 从根上堵住这条退化路径。
 *
 * 有名字时把类型也带上（"镜头图：镜头1-静帧"）而不是只读名字——同一画布上
 * 大概率不止一个节点叫得出名字，类型前缀让读屏用户能区分「这是哪一种」。
 *
 * `formatNamed` 由调用方传入（next-intl 的 `StudioNode.nodeTypes.typeNameAria`），
 * 分隔符是要被读屏念出来的文案，不在这个纯函数里手拼字面量。
 */
export function resolveNodeAccessibleName(
  data: NodeWorkflowNodeData,
  typeLabel: string,
  formatNamed: (typeLabel: string, name: string) => string,
): string {
  const name = resolveNodeDisplayName(data)
  if (!name) return typeLabel
  // ⚠ 名字本身常常已经带着类型前缀——系统给音色卡的默认命名就是「音色：常客」，
  // 身份卡是「角色：店员小林」。再套一层模板会读成「音色：音色：常客」（真机
  // 2026-08-26 实测）。名字已经以类型词开头时直接用名字，别念两遍。
  return name.startsWith(typeLabel) ? name : formatNamed(typeLabel, name)
}

/* ═════════════════════════════════════════════════════════════════════════
 * v4 · 稳定命名（第三期 · 画布 C1，spec §4.2）
 *
 * ── 它替掉的是什么 ──────────────────────────────────────────────────────
 * 上面 `buildFallbackNodeNames` 自己的注释已经写清：序号按传入列表顺序算，
 * **增删节点就重新编号**，而 `@` 提及会把字面文本存进 prompt——于是今天的
 * `@参考视频2` 会静默指向另一个节点。v4 的答案是「创建即持久化」：任何路径新建
 * 节点（手动、右键、助手 `add_node`、文本派生）都在同一次状态提交里写 `data.name`，
 * 显示时不再编号。
 *
 * ── 为什么标签由调用方传进来 ────────────────────────────────────────────
 * 名字是**要落库的**，所以它是一个具体语言的字符串，不能在纯函数里现取 next-intl。
 * 调用方传 `labelOf(kind, subtype)`（画布域今天只有中文一种落法），这里只负责
 * 格式、序号与冲突。
 *
 * TODO(C3)：v3 的七字段显示名优先链（`resolveNodeDisplayName` / `buildDisplayNamePatch`
 * / `buildFallbackNodeNames`）随 legacy type 一起删，`data.name` 成为唯一名字。
 * ═════════════════════════════════════════════════════════════════════════ */

/** `S02` —— 镜号前缀。两位补零；>99 时原样展开（`S100`），不截断。 */
export function formatShotPrefix(shotNo: number): string {
  return `${NODE_V4_NAME.shotPrefix}${String(shotNo).padStart(2, '0')}`
}

const SHOT_PREFIX_PATTERN = new RegExp(
  `^${NODE_V4_NAME.shotPrefix}\\d{2,}${NODE_V4_NAME.separator}`,
)

export interface StableNodeNameInput {
  readonly kind: NodeWorkflowMediaKind
  readonly subtype: NodeV4Subtype
  /** 有镜号 → `S02·首帧`；无镜号 → `参考图4` 这种散节点名。 */
  readonly shotNo?: number
  /**
   * 专有名优先（§4.2）：角色 / 背景类有专有名时用它，`角色·西格莉卡`。
   * 传进来的值仍然过 `toNodeDisplayLabel` 截到 schema 上限。
   */
  readonly properName?: string
}

export interface StableNodeNameOptions {
  /** 子型标签（`首帧` / `镜头图` / `语音` / `剧本`）——落库的那个字面量。 */
  labelOf(kind: NodeWorkflowMediaKind, subtype: NodeV4Subtype): string
  /** 画布上已被占用的名字。 */
  taken: ReadonlySet<string>
}

/**
 * 新建节点时算一个稳定名。
 *
 * 规则一条（§4.2 两个例子共用同一条）：先试不带序号的基名，被占用就追加最小的
 * `n ≥ 2`。于是同一镜里第三张镜头图是 `S02·镜头图3`，画布上第四张散参考图是
 * `参考图4`——⛔ 不做「按当前列表顺序编号」，那正是要修的那个洞。
 */
export function buildStableNodeName(
  input: StableNodeNameInput,
  { labelOf, taken }: StableNodeNameOptions,
): string {
  const label =
    toNodeDisplayLabel(input.properName) ?? labelOf(input.kind, input.subtype)
  const base =
    input.shotNo === undefined
      ? label
      : `${formatShotPrefix(input.shotNo)}${NODE_V4_NAME.separator}${label}`
  if (!taken.has(base)) return base
  for (let n = 2; n <= NODE_V4_NAME.maxConflictSuffix; n += 1) {
    const candidate = `${base}${n}`
    if (!taken.has(candidate)) return candidate
  }
  // 同名到 999 是数据异常，不静默返回一个已占用的名字。
  throw new Error(`Cannot allocate a stable node name for "${base}"`)
}

export const NODE_RENAME_REJECT_REASON_IDS = {
  taken: 'taken',
  empty: 'empty',
} as const

export type NodeRenameRejectReason =
  (typeof NODE_RENAME_REJECT_REASON_IDS)[keyof typeof NODE_RENAME_REJECT_REASON_IDS]

export type NodeRenameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: NodeRenameRejectReason }

/**
 * 手动改名（§4.2 + C1 契约修正 1）。**改名不改 id**，所以这里只回一个新名字，
 * 边 / op / 快照都不动。
 *
 * ⚠ 镜头节点上改的是 **`label`**，不是带序号的整串：序号是显示前缀，跟着 `shotNo`
 * 走，换序时自己会变。传进来的 `currentName` / `taken` 对镜头就是标签与标签集。
 *
 * ⛔ 冲突时**就地拒绝**，不静默加后缀——加后缀会让用户以为改成功了，而他下次
 * `@` 的是自己以为的那个名字。
 */
export function renameStableNodeName(
  currentName: string,
  nextValue: string,
  taken: ReadonlySet<string>,
): NodeRenameResult {
  const name = toNodeDisplayLabel(nextValue)
  if (!name) return { ok: false, reason: NODE_RENAME_REJECT_REASON_IDS.empty }
  if (name === currentName) return { ok: true, name }
  if (taken.has(name)) {
    return { ok: false, reason: NODE_RENAME_REJECT_REASON_IDS.taken }
  }
  return { ok: true, name }
}

/* ─────────────────────────────────────────────────────────────────────────
 * C1 契约修正 1 · 标签与序号分家
 *
 * 之前这里是 `applyShotNoToNodeName(name, shotNo)`：换序时把名字里的 `S<nn>` 段
 * 重写回存储。⛔ 已删，**不是**换个名字留着。理由是它重写的是稳定名本身——而
 * `@` 提及把字面文本存进了提示词，于是把 S02 拖到第 5 位，用户写下的
 * `@S02·有人还在` 就静默指向了另一个镜头。
 *
 * 现在：`label` 是稳定名（落库、`@` 用它、改名改它），`shotNo` 只是显示序号，
 * 显示串由 `formatShotDisplayName` **临时拼**，⛔ 不落库。换序只动 `shotNo`。
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * 显示名：`S02·有人还在`。⚠ **只用于渲染**——落库的是 `label` 与 `shotNo` 两个
 * 字段，不是这一串。`shotNo` 缺席（未归镜的散节点）时就是标签本身。
 */
export function formatShotDisplayName(label: string, shotNo?: number): string {
  if (shotNo === undefined) return label
  return `${formatShotPrefix(shotNo)}${NODE_V4_NAME.separator}${label}`
}

/**
 * 从提示词取缺省标签（C1 契约修正 1）：**前 8 字**，空提示词兜底 `镜头`。
 *
 * ⚠ 缺省值仍然是**真标签**，创建即落库——不是「显示时才算」。所以它必须是确定的：
 * 同一段提示词永远得到同一个标签，改提示词不会让已经落库的标签跟着变。
 */
export function deriveShotLabel(prompt?: string): string {
  const source = toNodeDisplayLabel(prompt)
  if (!source) return NODE_V4_NAME.shotLabelFallback
  return source.slice(0, NODE_V4_NAME.labelFromPromptLength)
}

export interface ShotLabelInput {
  /** 用户 / 助手给的标签。给了就用它。 */
  readonly given?: string
  /** 没给时从提示词取前 8 字。 */
  readonly prompt?: string
}

/**
 * 新建镜头时算一个**唯一**标签。冲突规则与 `buildStableNodeName` 同：追加最小的
 * `n ≥ 2`。唯一是 `@` 解析的前提——两个「有人还在」会让 `@有人还在` 指谁全靠猜。
 */
export function buildShotLabel(
  input: ShotLabelInput,
  taken: ReadonlySet<string>,
): string {
  const base = toNodeDisplayLabel(input.given) ?? deriveShotLabel(input.prompt)
  if (!taken.has(base)) return base
  for (let n = 2; n <= NODE_V4_NAME.maxConflictSuffix; n += 1) {
    const candidate = `${base}${n}`
    if (!taken.has(candidate)) return candidate
  }
  throw new Error(`Cannot allocate a shot label for "${base}"`)
}

/* ─────────────────────────────────────────────────────────────────────────
 * `@` 解析（C1 契约修正 1）
 *
 * 判据一条：**按标签匹配，序号只作辅助**。用户写 `@S02·有人还在`，我们先把
 * `S02` 剥成一个提示（用来消歧），真正比对的是「有人还在」。于是换序之后同一句
 * `@S02·有人还在` 仍然命中同一个镜头——序号对不上只是少了一个消歧信号，不是没命中。
 * ───────────────────────────────────────────────────────────────────────── */

export interface NodeMentionCandidate {
  readonly id: string
  /** 稳定名：镜头是 `label`，其余节点是 `data.name`。 */
  readonly label: string
  readonly shotNo?: number
}

export const NODE_MENTION_REJECT_REASON_IDS = {
  notFound: 'notFound',
  ambiguous: 'ambiguous',
} as const

export type NodeMentionRejectReason =
  (typeof NODE_MENTION_REJECT_REASON_IDS)[keyof typeof NODE_MENTION_REJECT_REASON_IDS]

export type NodeMentionResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: NodeMentionRejectReason }

/** 把 `S02·有人还在` 拆成 `{ shotNo: 2, label: '有人还在' }`；没前缀就整串是标签。 */
export function parseNodeMention(query: string): {
  readonly label: string
  readonly shotNo?: number
} {
  const raw = query.trim()
  const match = SHOT_PREFIX_PATTERN.exec(raw)
  if (!match) return { label: raw }
  const shotNo = Number.parseInt(
    match[0].slice(NODE_V4_NAME.shotPrefix.length),
    10,
  )
  return { label: raw.slice(match[0].length).trim(), shotNo }
}

/**
 * 解析一个 `@` 提及。精确标签 → 前缀标签，两级都用序号（若给了）作消歧，
 * ⛔ 序号从不单独决定命中：换序会让它过期，而标签不会。
 *
 * 仍然歧义时**报歧义**，不静默取第一个——静默取第一个正是「改了另一个镜头」这类
 * 事故的形状。
 */
export function resolveNodeMention(
  query: string,
  candidates: readonly NodeMentionCandidate[],
): NodeMentionResult {
  const { label, shotNo } = parseNodeMention(query)
  if (!label)
    return { ok: false, reason: NODE_MENTION_REJECT_REASON_IDS.notFound }

  const pick = (
    matches: readonly NodeMentionCandidate[],
  ): NodeMentionResult | undefined => {
    if (matches.length === 0) return undefined
    if (matches.length === 1) return { ok: true, id: matches[0]!.id }
    const hinted =
      shotNo === undefined
        ? []
        : matches.filter((candidate) => candidate.shotNo === shotNo)
    if (hinted.length === 1) return { ok: true, id: hinted[0]!.id }
    return { ok: false, reason: NODE_MENTION_REJECT_REASON_IDS.ambiguous }
  }

  return (
    pick(candidates.filter((candidate) => candidate.label === label)) ??
    pick(
      candidates.filter((candidate) => candidate.label.startsWith(label)),
    ) ?? {
      ok: false,
      reason: NODE_MENTION_REJECT_REASON_IDS.notFound,
    }
  )
}
