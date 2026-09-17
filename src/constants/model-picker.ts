/**
 * 模型选择器（方案 A）的常量。
 *
 * 设计见 D2 ④ 画板（`docs/design/roadmap-canvas/gen/DesignD2Picker.dc.html`）：列表
 * 只有型号，渠道要用户自己点（**没有「自动」**），点过的**按型号记住**；顶部
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

/**
 * 「选了型号但还没选渠道」的记忆。值是 `{ [scope]: modelKey }`。
 *
 * ⚠ 2026-09-17 owner 在 D2 Q1 删掉「自动渠道」之后，**未选渠道是一个要留在界面上
 * 的状态**：触发器写「先选渠道」，行上的价格位写「—」。它不是 `optionId`（那一层
 * 说的已经是某一条渠道了），所以单独存一份，与手选渠道、最近一样是纯本地偏好。
 */
export const MODEL_PICKER_PENDING_STORAGE_KEY = 'pv:model-picker:pending'
