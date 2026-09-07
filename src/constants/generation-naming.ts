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
 * ── 序号就是「第几件」 ────────────────────────────────────────────
 * `图_012` 读作**这个用户的第 12 件产物** —— `Generation.seq`，写入时在事务里
 * 取号（`generation.service.ts`），存量行由迁移
 * `20260907140000_generation_seq` 的 `ROW_NUMBER()` 一次性回填。
 *
 * ⚠ 曾经这里是 id 的 FNV 哈希取模（「零迁移」换来的），2026-09-07 owner 拍板作废：
 * 用户念出 `图_012` 时想说的是第 12 张，一个哈希值只会让这句话是错的。⛔ 别再
 * 把序号做成派生值。
 *
 * ⚠ `seq` 可空（迁移前的行、匿名行）。缺席时名字**不编号**，只留摘要 ——
 * ⛔ 不临时编一个号：一个编出来的号和一个真号长得一模一样。
 *
 * ⚠ 名字仍然**不是权限**：服务端永远在候选名单（`mentionedAssets`）内解析，
 * 解析不到就拒。
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
  /** 序号最少几位（`012`）。⚠ 只是**补零下限** —— 第 1000 件自然写成 `1000`。 */
  serialDigits: 3,
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
