/**
 * 旧剧本笺 ScriptDoc 的常量 —— **只剩 v3 读端在用**（`types/script-doc.ts` 与 v3
 * 状态 schema）。起草接口、提示词与 v4 投影 2026-11-01 删（`p-canvas-shotlist`）；
 * 随 v3 读端一起删（node-canvas-v2 §14.4）。
 */

import { PROMPT_TEXT_GUARD_MAX_CHARS } from '@/constants/config'
import { NODE_V4_PROMPT_MAX_LENGTH } from '@/constants/node-studio'

export const SCRIPT_DOC_LIMITS = {
  /** Conversation turns fed into the structured draft call. */
  maxMessages: 16,
  /**
   * 一条对话消息 —— 只剩防滥用护栏（owner 2026-09-27：剧本放开，此前 4000）。
   * 一次请求装得下多少由 `SCRIPT_DOC_PROMPT_BUDGET` 管，装不下就明说，不截断。
   */
  maxMessageLength: PROMPT_TEXT_GUARD_MAX_CHARS,
  maxRoles: 8,
  maxShots: 24,
  /** Dialogue lines per shot — keeps a single shot's voice fan-out sane. */
  maxDialoguePerShot: 6,
  /**
   * 每镜显式时长上限（秒）—— 画布对齐三梁之一。取自 Seedance 2.5 的硬顶
   * （`SEEDANCE_25_DURATIONS`，见 `constants/video-model-capabilities.ts`）。
   * 数值型，与自由文本的文档级 `targetDuration` 不同，好让 seedance 节点的
   * `duration` 字段能在两边之间直接互转，不必解析散文。
   */
  maxShotDurationSeconds: 30,
  /** Clarifying questions the assistant may ask before drafting an outline. */
  maxClarifyQuestions: 4,
  maxClarifyOptions: 6,
  titleMaxLength: 120,
  /** 角色名 —— 名字不放开（owner 2026-09-27）。 */
  roleNameMaxLength: 700,
  /**
   * 剧本正文（梗概 · 风格 · 背景 · 角色描述 / 性格 / 目标 / 声线 · 镜头的场景 /
   * 摘要 / 机位 / 构图 · 台词）—— owner 2026-09-27 剧本放开，此前各是 400–700。
   *
   * ⚠ 取画布节点提示词的落库护栏，⛔ 不能再大：镜头摘要 / 机位会投影成节点提示词，
   * 超了整份画布存不进库；ScriptDoc 自己在项目状态里是 `.catch(undefined)`，超了
   * 整份剧本会被悄悄丢掉。
   */
  textMaxLength: NODE_V4_PROMPT_MAX_LENGTH,
  /** Optional target duration hint, e.g. "8s" or "12-15s". */
  targetDurationMaxLength: 40,
  /** Optional per-shot dual-emotion tag (surface · undercurrent). */
  emotionMaxLength: 160,
  idMaxLength: 80,
  llmTimeoutMs: 60_000,
  maxTokens: 6000,
} as const

/**
 * Kinds a spawned node can be tagged with via `node.data.scriptRef`. The
 * projection matches on `${kind}:${sourceId}` to stay idempotent across
 * re-projections (re-drafting the outline must not duplicate nodes).
 */
export const SCRIPT_DOC_REF_KIND_IDS = {
  character: 'character',
  shotText: 'shotText',
  /**
   * 分镜静帧（包 3 · Q5「默认开 · 项目级可关」）: the per-shot still image —
   * an `image` node with `role=shot`. It needs its OWN kind because the match
   * key is `${kind}:${sourceId}` and `sourceId` is the same `shot.id` that
   * `shotText` / `seedance` already use; reusing a kind would collapse three
   * nodes onto one refKey.
   */
  shotStill: 'shotStill',
  seedance: 'seedance',
  voice: 'voice',
  merge: 'merge',
} as const

export const SCRIPT_DOC_REF_KINDS = [
  SCRIPT_DOC_REF_KIND_IDS.character,
  SCRIPT_DOC_REF_KIND_IDS.shotText,
  SCRIPT_DOC_REF_KIND_IDS.shotStill,
  SCRIPT_DOC_REF_KIND_IDS.seedance,
  SCRIPT_DOC_REF_KIND_IDS.voice,
  SCRIPT_DOC_REF_KIND_IDS.merge,
] as const

export type ScriptDocRefKind = (typeof SCRIPT_DOC_REF_KINDS)[number]

export const SCRIPT_DOC_STAGE_IDS = {
  outline: 'outline',
  shots: 'shots',
} as const

export const SCRIPT_DOC_STAGES = [
  SCRIPT_DOC_STAGE_IDS.outline,
  SCRIPT_DOC_STAGE_IDS.shots,
] as const

export type ScriptDocStage = (typeof SCRIPT_DOC_STAGES)[number]

export const SCRIPT_DOC_DEPTH_IDS = {
  simple: 'simple',
  standard: 'standard',
  cinematic: 'cinematic',
} as const

export const SCRIPT_DOC_DEPTHS = [
  SCRIPT_DOC_DEPTH_IDS.simple,
  SCRIPT_DOC_DEPTH_IDS.standard,
  SCRIPT_DOC_DEPTH_IDS.cinematic,
] as const

export type ScriptDocDepth = (typeof SCRIPT_DOC_DEPTHS)[number]
