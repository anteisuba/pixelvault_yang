/**
 * 台输入框的外框（ui-spec §9「输入框」、§5 圆角 / 阴影）：浮起来的柔影白卡 ——
 * 圆角 16、`card` 阴影、⛔ 一圈细边。图像 / 标签 / 视频（`StudioWorkbenchLayout`）、
 * LoRA、配音、3D 六个台同一份，⛔ 各台自己再配圆角 / 内距 / 边框。
 *
 * 内距四边 18（ui-spec §5 疏密「输入框内距 18」，owner 2026-11-11）；只写外框，排布（flex、gap）由宿主自己加。
 */
export const STUDIO_COMPOSER_CARD_CLASS = 'rounded-16 bg-card p-4.5 shadow-card'

/**
 * 手机（<768）底部输入卡的外框：各台统一成图片台那一版（owner 2026-11-18）——
 * 圆角 18（`rounded-2xl`）、左右内距 12、上内距 10、`float` 阴影、无边。
 * 图片 / 视频（`StudioMobileComposer`）、改图（`StudioImageEditWorkspace`）、标签（`StudioTagsPromptArea`）、
 * LoRA（`LoraWorkbench` 手机那支）、配音 / 3D（经下面的 `STUDIO_COMPOSER_CARD_RESPONSIVE_CLASS`）
 * 同一份，⛔ 各台再抄一串。
 * ⚠ 底边内距不在这里：由宿主按自己最后一行给（图片 / 改图 / 配音 / LoRA / 3D `pb-2`；标签台由手机工具行自带的 `pb-2` 给）。
 * `border-0` 是给 `PromptInput` 的（它自带一圈边）。
 */
export const STUDIO_MOBILE_COMPOSER_CARD_CLASS =
  'rounded-2xl border-0 bg-card px-3 pt-2.5 shadow-float'

/**
 * 同一张卡手机与桌面都渲染的宿主（配音台 · 3D 台）：手机档 = 上面那一副，≥768（`lg:`，与 `useIsMobile` 同界）
 * 换回 `STUDIO_COMPOSER_CARD_CLASS`。纯 CSS 断点，⛔ 靠 `useIsMobile()` 挑类（首帧会先画桌面那副再跳）。
 * ⚠ `lg:` 三项与 `STUDIO_COMPOSER_CARD_CLASS` 逐项对应（Tailwind 只认源码里的字面类名，拼不出前缀），改一边必须改另一边。
 */
export const STUDIO_COMPOSER_CARD_RESPONSIVE_CLASS = `${STUDIO_MOBILE_COMPOSER_CARD_CLASS} lg:rounded-16 lg:p-4.5 lg:shadow-card`
