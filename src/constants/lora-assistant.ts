/**
 * LoRA 转换引擎 v2（docs/plans/lora-assistant-nl2tag-2026-07.md §2）配置常量。
 * F1 切片：grounding 上限 + 出参规范化阈值 + 结构化输出校验错误码。
 */

/** 入参侧 grounding（§2.1）：对用户 NL 跑 searchPromptTags 时的候选上限，
 *  注入 `AVAILABLE TAGS` 系统提示块。 */
export const LORA_ASSISTANT_GROUNDING_TAG_LIMIT = 30

/** 出参侧规范化 + 触发词/tray 剔除共用：参与子串匹配的字段/词条最短长度——
 *  短于此长度的 alias/label/promptText/触发词不参与包含关系判定，避免
 *  超短词（如单字符）子串误判导致误命中或误剔除。 */
export const LORA_TAG_NORMALIZE_MIN_FIELD_LENGTH = 2

/** 结构化输出校验失败（JSON 解析失败或 Zod 校验不过，重试一次后仍失败）
 *  时的错误码 + HTTP 状态——沿用 seedance-prompt-plan 的"失败大声暴露"惯例，
 *  复用既有 i18n 键 `errors.provider.invalidStructuredOutput`（零新增 i18n）。 */
export const LORA_ASSISTANT_ERROR_CODES = {
  invalidStructuredOutput: 'LORA_ASSISTANT_INVALID_OUTPUT',
} as const

export const LORA_ASSISTANT_HTTP_STATUS = {
  invalidStructuredOutput: 502,
} as const
