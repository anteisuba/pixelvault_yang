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
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT,
} from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
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
 * `StudioNodeWorkbench` 素材库拖拽落图 / `ImageFamilyBody.handleSelectExisting`
 * / `CharacterDetailBody` / `VideoComposer` 同模式）直接拿 `generation.prompt`
 * 当名字，于是这几个常量原样穿透进 `characterName`/`backgroundName`/
 * `shotName`/`mediaLabel`/`sourceLabel` 里的任意一个（`StudioNodeWorkbench.
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
  const value = nextValue.trim()

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
 * 卡头的改名按钮（`EditableNodeLabel`，见 NodeShell.tsx），它的 aria-label
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
