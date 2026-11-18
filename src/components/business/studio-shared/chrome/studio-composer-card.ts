/**
 * 台输入框的外框（ui-spec §9「输入框」、§5 圆角 / 阴影）：浮起来的柔影白卡 ——
 * 圆角 16、`card` 阴影、⛔ 一圈细边。图像 / 标签 / 视频（`StudioWorkbenchLayout`）、
 * LoRA、配音、3D 六个台同一份，⛔ 各台自己再配圆角 / 内距 / 边框。
 *
 * 内距四边 18（ui-spec §5 疏密「输入框内距 18」，owner 2026-11-11）；只写外框，排布（flex、gap）由宿主自己加。
 */
export const STUDIO_COMPOSER_CARD_CLASS = 'rounded-16 bg-card p-4.5 shadow-card'
