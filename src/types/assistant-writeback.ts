import type { AspectRatio } from '@/constants/config'
import type { ImageBatchCount } from '@/constants/studio'

/**
 * 助手动作条的**写回适配器**（方向 A，owner 2026-08-20 拍板）。
 *
 * ── 为什么是一个对象而不是六个松散回调 ────────────────────────────
 * 勘察（2026-08-20）推翻了「六个动作等权重」这个前提：**缺席是按宿主写死的
 * 结构性缺席**，不是「有时候少一个」——
 *
 *   视频 dock  6 项（唯一满负载）
 *   图片 dock  5 项（`negative` 结构性不存在：工作台没有负面框）
 *   音频 dock  5 项（`model` 结构性不存在：模型目录是空数组）
 *   LoRA dock  ≤3 项（比例/模型/张数三个回调一个都没传）
 *
 * 六个可选 prop 表达不了这件事——漏传和「这一档没有」在类型上长得一模一样，
 * 而这正是 `workbenchState` 在 `StudioAssistantDock` 上漏了一整轮没人发现的
 * 原因。收成一个适配器之后，「这一档有哪几项」写在宿主构造它的那一处，
 * 一眼看得见。
 *
 * ⚠ 本类型**不放进 `types/index.ts`**：那个文件 333 个依赖方，而这里只有
 * 助手面板一条链路在用。
 */

/**
 * 一个可写回的表单字段。
 *
 * ⚠ **`isApplied` 是算出来的，不是存下来的**（切片 S3 的核心结论）。判据：
 * `已应用 ⟺ 当前表单值 === 这条建议的值`。底层那五个 action 全是纯 setter、
 * 零 undo，所以「已应用」这个状态如果存在内存里，就必然和真实表单值脱节——
 * 最尖锐的后果是：用户点了「填入提示词」，又手改了几个字，再点撤销，
 * **他后写的内容会被一起抹掉**。改成每帧从 state 算，这条自然消失：
 * 值一被改动，`isApplied` 立刻变 false，撤销随之收起。
 */
export interface AssistantWritebackField<TValue> {
  /**
   * 当前表单值的**展示串**。`undefined` = 这一项还没设置（渲染成「未选」/「空」），
   * 空串和 undefined 有区别，别合并。
   */
  current?: string
  /** 把建议值写进表单，并存下撤销用的快照。 */
  apply: (value: TValue) => void
  /** 见类型头部：算出来的，不存。 */
  isApplied: (value: TValue) => boolean
  /**
   * 撤销。**只在「这一轮确实由动作条写过」时存在**——没写过就没有快照，
   * 刷新 / 切会话后也没有（快照不落库，这是诚实而不是缺陷：那时值可能已经
   * 被别处改过，拿一个不属于这次会话的旧值回滚才是真的危险）。
   */
  undo?: () => void
  /**
   * 应用**之前**要提醒用户的话。今天唯一的消费者是换模型撞上多模型对比名单
   * （owner 拍板第 3 条）：目标模型若已在名单里，运行名单去重会让这一轮
   * 静默少跑一条。返回 undefined = 没什么要提醒的。
   */
  noteFor?: (value: TValue) => string | undefined
  /**
   * 这一项在**本宿主**上结构性不存在时给出原因，此时 `apply` 不该被调用。
   * 只用于缺席原因分类的第 ① 类（宿主没这个能力）——②③④ 一律静默不渲染
   * （切片 S2-A5：②「目录里查不到」需要改数据契约，挡在这一轮之外）。
   */
  unavailableReason?: string
}

/**
 * 一条助手回复能写回工作台的全部东西。**缺席即「这一档没有」**。
 */
export interface AssistantWriteback {
  /** 正面提示词。唯一每个宿主都有的字段，所以它必填。 */
  prompt: AssistantWritebackField<string>
  /**
   * 追加而不是覆盖（owner 2026-08-20 拍板第 4 条：翻案请回来）。
   *
   * ⚠ 它 08-18 被砍过一次（「追加感觉没什么用」），2026-08-20 因为切片 S3
   * 揭示的新事实回归，**语义不同**：撤销的前提是「值没被人动过」，一旦用户
   * 手改就自动失效——那时「追加」是唯一不丢用户已写内容的路。所以它不是
   * 「再来一份」，是「不想被覆盖时的另一条路」。
   */
  appendPrompt?: (text: string) => void
  negative?: AssistantWritebackField<string>
  aspectRatio?: AssistantWritebackField<AspectRatio>
  /** 值是 **modelId**，不是 optionId——助手不该理解路由，翻译在宿主侧。 */
  model?: AssistantWritebackField<string>
  batchCount?: AssistantWritebackField<ImageBatchCount>
  /**
   * modelId → 可显示的名字；**目录里没有就返回 null，那一行不渲染**。
   * 与 `isAspectRatio` / `isImageBatchCount` 同一套纪律：收窄不过就没有按钮。
   */
  resolveModelLabel?: (modelId: string) => string | null
}
