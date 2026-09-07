/**
 * 产物名的词法（第三期 · 工作台 N1）。
 *
 * ── 它解决的是什么 ────────────────────────────────────────────────
 * 在这之前，工作台里一张产物在对话里**没有名字**：用户要指认「刚才那张银发的」
 * 只能靠 `@` 弹选择器点一下，或者报一串 uuid 给模型（模型转手就会抄错）。竞品
 * Lovart 的做法是每个产物一落地就叫 `Product_01`，之后所有跨步指认都用名字。
 * 这里做同一件事，词法与画布域 v4 稳定名（`lib/node-display-name.ts`）对齐：
 * **同一个分隔符 `NODE_V4_NAME.separator`**，⛔ 不发明第二套。
 *
 * ── 为什么序号不是「按用户递增的计数器」 ──────────────────────────
 * 名字要在**三处同时算得出同一个值**：写入时（服务端）、助手看素材时
 * （`search_assets` 走画廊列表口）、选择器与结果行卡上（客户端列表口）。而
 * 列表口的 `LIST_GENERATION_SELECT` **故意不带 `snapshot`**（单行快照能到 7MB，
 * 见 `generation.service.ts` 的头注），也就没有任何地方能把一个存在 snapshot
 * 里的计数器便宜地读回来 —— 除非加列，而本片的硬约束是**零迁移**。
 *
 * 所以序号取**行自己的稳定派生**（`deriveGenerationSerial`，id 的哈希），
 * 于是「同一行永远算出同一个号」在四个入口天然成立，存量行也立刻有名字。
 * ⚠ 代价说清楚：它**不是**「第 12 张」的意思，且两行撞号是可能的 —— 所以
 * 真正的指认凭证是 `图_012` 这个**标签整体**加上候选名单（`mentionedAssets`），
 * ⛔ 名字从来不是权限：服务端永远在名单内解析，解析不到就拒。
 */

import { NODE_V4_NAME } from '@/constants/node-studio'

/** 域前缀 —— 落进名字里的那个字面量，按产物类型分。 */
export const GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE = {
  IMAGE: '图',
  VIDEO: '视频',
  AUDIO: '音频',
  MODEL_3D: '模型',
} as const

export type GenerationNameOutputType =
  keyof typeof GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE

export const GENERATION_NAME = {
  /** `图` 与 `012` 之间那一横。 */
  prefixSeparator: '_',
  /**
   * `图_012` 与摘要之间那一点 —— **复用画布域的分隔符常量**。
   * 两个域的名字会同时出现在同一句话里（`@S02·首帧` 与 `@图_012·银发少女`），
   * 分隔符不一样的表现是用户以为它们是两种东西。
   */
  separator: NODE_V4_NAME.separator,
  /** 序号位数（`012`）。 */
  serialDigits: 3,
  /** 序号取值域 —— 位数变了这里跟着变，⛔ 别在别处手写 1000。 */
  serialModulo: 1000,
  /** 摘要取提示词前几个字。 */
  summaryChars: 8,
  /** 名字整体上限（写进 snapshot 的那个值）。 */
  maxLength: 40,
} as const

/**
 * 正文里 `@名字` 的上限（切片 N1）。
 *
 * ⚠ 与 chip 数量上限**不是一回事**：chip 侧 owner 2026-09-06 定过「不设硬上限，
 * 只提示」（见 `use-studio-operator-mention.ts` 头注），这里限的是**一条消息的
 * 正文里自动解析出多少个名字**。理由不同：正文解析是我们替用户做的动作，一句
 * 话里粘进 50 个名字时静默挂 50 张图，用户既没看见也没同意。
 */
export const ASSISTANT_MENTION_LIMITS = {
  maxPerMessage: 10,
} as const
