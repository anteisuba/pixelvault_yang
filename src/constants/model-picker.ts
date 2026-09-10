/**
 * 模型选择器（方案 A）的常量。
 *
 * 设计见 `docs/references/pages/node-canvas-v2.md` §1.6：列表只有型号，
 * 渠道由 `resolveModelChannel` 自动选，用户手改过的渠道**按型号记住**；顶部
 * 「最近」由使用记录来。两样都是纯前端偏好，落 localStorage。
 */

/** 手选渠道的记忆。值是 `{ [scope:modelKey]: channelId }`。 */
export const MODEL_PICKER_CHANNEL_STORAGE_KEY = 'pv:model-picker:channel'

/** 最近用过的型号。值是 `{ [scope]: modelKey[] }`，最近的在前。 */
export const MODEL_PICKER_RECENT_STORAGE_KEY = 'pv:model-picker:recent'

/** 「最近」段最多几行（画板：三条）。 */
export const MODEL_PICKER_RECENT_LIMIT = 3

/** 记忆的默认作用域；调用方按模态传 `image` / `video` / … 分开记。 */
export const MODEL_PICKER_DEFAULT_SCOPE = 'default'
