/**
 * 工作台助手操作员化的**客户端视图模型**（P2）。
 *
 * ── 为什么不是 Zod ─────────────────────────────────────────────────
 * `types/assistant-operator.ts` 那三张 schema 管的是**跨进程边界**的东西
 * （请求 / 模型输出 / 事件），必须运行时校验。这里的类型一个都不过边界：它们是
 * 客户端自己攒出来的线程条目与改动登记簿。给它们配 schema 只会多一份要同步的
 * 副本，而 `AssistantOperatorEvent` 已经在入口处校验过了。
 *
 * ⚠ 一条纪律：**线程条目一律带 `id`**。日志条的 `running` → `done` 是**同一个
 * id 的两次事件**（见 `constants/assistant-operator.ts` 的 `step` 注释），客户端
 * 按 id 覆盖；漏了 id 就变成追加，表现是每一步在日志流里出现两遍。
 */

import type {
  StudioOperatorField,
  StudioOperatorSystemCode,
} from '@/constants/studio-assistant-operator'
import type {
  AssistantOperatorAppliedStep,
  AssistantOperatorAskOption,
  AssistantOperatorConfirmRequestEvent,
  AssistantOperatorStep,
} from '@/types/assistant-operator'

/** 用户说的话（含本地附件的展示名）。 */
export interface StudioOperatorUserEntry {
  kind: 'user'
  id: string
  text: string
  attachments: readonly StudioOperatorAttachment[]
}

/** 助手说的话。 */
export interface StudioOperatorMessageEntry {
  kind: 'message'
  id: string
  text: string
}

/** 计划条（一轮最多一条）。 */
export interface StudioOperatorPlanEntry {
  kind: 'plan'
  id: string
  steps: readonly string[]
}

/**
 * 一条日志。`step` 就是服务端那份契约本身 —— 不再转译一层：转译层是 P1 与 P2
 * 之间最容易漂的地方，而 `tool` 的判别联合已经把每一支该有什么字段说清楚了。
 */
export interface StudioOperatorStepEntry {
  kind: 'step'
  id: string
  step: AssistantOperatorStep
  /**
   * 这一条属于**哪一轮**（P3-C 的「还原这轮」按它成组）。
   *
   * ⚠ 显式存一份，⛔ 别去劈 `id`（它是 `runKey:stepId` 拼的）：那种字符串手术
   * 会在 runKey 里哪天多一个冒号时静默失效，而表现是「还原这轮什么都没还原」。
   */
  runKey: string
  /** 用户点了撤销 —— 条目划线，且**不再计入改动数**。 */
  undone: boolean
}

/**
 * 系统行 —— 「你撤销了：××（助手已知晓）」（拍板 18）。
 *
 * ⚠ 它不只是给人看的：撤销后的下一次请求会把这条也带进 `priorSteps` 的语境里，
 * 所以助手**不会下一轮又把它改回来**。只画线不通报是本条最容易漏的一半。
 */
export interface StudioOperatorSystemEntry {
  kind: 'system'
  id: string
  /**
   * i18n 键的后缀（`StudioOperator.system.*`），文案不在这里落地。
   *
   * ⚠ `resultArrived` 是**看图闭环的开场白**（P3-C，拍板 4）：助手会因为它
   * 突然自己动起来，线程里必须有一行说清楚「为什么现在开始干活」。少了它，
   * 用户看到的是一个无缘无故自己说话的助手。
   *
   * ⚠ `urlImportFailed` 是**拍板 22 的失败面**（P3-D）：助手接下了用户递来的
   * 链接、日志条已经写着「已挂上」，而取图那一跳在几秒后失败了。没有这一行的话
   * 界面上就是「说挂上了，参考位却是空的」—— 本仓最难查的那一类。
   *
   * ⚠ 值域住在 `constants/studio-assistant-operator.ts`（`STUDIO_OPERATOR_SYSTEM_CODES`）
   * 而不是就地写一个联合：落库的历史条目要用同一张表做 `z.enum()` 校验（P4-B），
   * 两份会分叉。
   */
  code: StudioOperatorSystemCode
  /** 填进文案的那个名字（被撤销的那一步 / 字段）。 */
  subject?: string
  count?: number
}

/**
 * 助手的**结构化反问**（C3，附录 E 拍板「选项卡 + 自由输入」）。
 *
 * ⭐ 它是线程里唯一一种**等着用户回答**的条目：流已经停了
 * （`stopped` / `awaiting_answer`），面板渲染出至多三个选项按钮加一句后果，
 * 用户点一个或者自己打字，答案作为下一条 user 消息带 `answeredAskId` 发出。
 * ⚠ `answer` 落在这里而不是只留一条 user 气泡：那颗按钮点过之后要变成「已选：××」，
 * 而不是一排还能再点一次的按钮（再点一次 = 又发一条消息）。
 */
export interface StudioOperatorAskEntry {
  kind: 'ask'
  id: string
  /** 服务端分配的反问 id —— 回答时原样带回请求（`answeredAskId`）。 */
  askId: string
  question: string
  options: readonly AssistantOperatorAskOption[]
  /** 缺席 = 还没回答。有值 = 用户选的标签或自己打的那句话。 */
  answer?: string
}

/** 切域标记（拍板 8：切域换工具不断会话）。 */
export interface StudioOperatorDomainMarkEntry {
  kind: 'domainMark'
  id: string
  domain: string
}

export type StudioOperatorThreadEntry =
  | StudioOperatorUserEntry
  | StudioOperatorMessageEntry
  | StudioOperatorPlanEntry
  | StudioOperatorStepEntry
  | StudioOperatorSystemEntry
  | StudioOperatorAskEntry
  | StudioOperatorDomainMarkEntry

/**
 * 改动登记簿的一格。
 *
 * ⭐ **按字段存，不是按步存**：同一个字段被改两次时，用户要撤的是「助手对这个
 * 字段做过的事」，一路回到他自己写的那版 —— 所以 `inverse` 始终保留**最早那次**
 * 的逆操作（`firstInverse`），而 `stepId` / `reason` 跟着最近一次走（归属标记
 * 上要显示的是「它最后为什么这么改」）。
 * 只留最近一次的 inverse，撤销会停在助手的中间版本上，用户以为撤了其实没撤干净。
 */
export interface StudioOperatorChange {
  field: StudioOperatorField
  /** 最近一次改它的那一步 —— 归属标记点进去能定位到日志条。 */
  stepId: string
  /** 最近一次的理由（hover 显示）。 */
  reason?: string
  /** 最早那次的逆操作载荷 —— 撤销的本钱。 */
  firstInverse: AssistantOperatorAppliedStep
  /** 助手改之前那个字段长什么样（hover 里显示「原值」）。 */
  previousLabel: string
}

/**
 * 📎 挂在下一条消息上的附件（P2 只做素材库就地挂载，上传/粘贴是 P3）。
 *
 * ⚠ `kind` 覆盖**素材库里真实存在的四种**，不是只有图与视频：拍板 20 之后
 * 「打开完整素材库」是就地弹层而不是跳页，弹层没有按类型上锁（锁 = 不渲染，
 * 那会让 6 格里看得见的视频在完整库里消失），所以用户点得到音频与 3D。
 * 收窄到两种的下场是 `as` 一个谎进来，或者点了没反应。
 *
 * ⚠ `thumbnailUrl` 与 `url` 必须分开：视频 / 音频的 `url` 是媒体文件本身，
 * 拿它喂 `next/image` 只会得到一个碎图标（P2 半成品里就是这样）。没有缩略图时
 * 这里给 `undefined`，宿主画一枚类型字形 —— ⛔ 别回落到 `url`。
 */
export interface StudioOperatorAttachment {
  id: string
  url: string
  label: string
  kind: 'image' | 'video' | 'audio' | 'model3d'
  /** 能拿来当预览的静态图；没有就没有。 */
  thumbnailUrl?: string
}

/**
 * 一件**还没变成附件**的上传（P3-A，拍板 16 的上传三通道）。
 *
 * ⭐ **它与 `StudioOperatorAttachment` 是两个类型，不是一个类型的两个状态** ——
 * 这是本片最重要的一条结构约束：附件必须有 `url`，而在飞的上传只有一个
 * `blob:` 的本地预览。把两者合成一个「带 `status` 的附件」，那个 blob URL 就会
 * 跟着 `send()` 进消息体，助手拿到一个它永远取不到的地址（台账 BG 那条 413 的
 * 近亲：区别只是这次它连 4.5MB 都不到，就是纯粹的错）。
 * 分开之后这件事**在类型上不可能发生**：只有拿到 https URL 的那一刻，它才被
 * 转成 `StudioOperatorAttachment` 进入附件数组 —— 与素材库挑的那些同一条链。
 *
 * ⚠ 没有 `done` 这一档：成功即出列（变成附件）。留一个 `done` 只会制造
 * 「chip 出现了两次」这种要靠去重来修的问题。
 */
export interface StudioOperatorUpload {
  id: string
  /** chip 上写的名字 —— 上传阶段只有文件名可写。 */
  fileName: string
  kind: 'image' | 'video' | 'audio'
  /**
   * 本地 `URL.createObjectURL()` 的预览图（只有图片有）。
   * ⛔ 它**只用于渲染**，绝不进消息体 —— 见上面那段。
   */
  previewUrl?: string
  /** 0–100，来自 R2 直传的 XHR 真进度（不是假动画）。 */
  progress: number
  status: 'uploading' | 'error'
  /** 失败原因 —— 大声说出来，⛔ 不静默丢掉。 */
  error?: string
}

/** 就地确认条（拍板 3）—— 直接复用事件载荷，不另立形状。 */
export type StudioOperatorConfirm = Omit<
  AssistantOperatorConfirmRequestEvent,
  'type'
>

export type StudioOperatorStatus =
  /** 没在跑。 */
  | 'idle'
  /** 流开着。 */
  | 'working'
  /** 流停在就地确认上，等用户选（拍板 3）。 */
  | 'awaitingConfirm'
  /**
   * 流停在助手的反问上，等用户回答（C3）。
   * ⚠ 与 `awaitingConfirm` **分开**：那是一个字段的三选一（覆盖 / 追加 / 保留），
   * 这是一句开放问题 —— 胶囊要说的话与要渲染的卡都不是同一张。
   */
  | 'awaitingAnswer'
  /** 这一轮失败了 —— 线程里已经有一条错误消息。 */
  | 'error'
