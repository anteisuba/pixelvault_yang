/**
 * Studio 移动端（`<1024`，`useIsMobile`）画布优先形态的常量。
 *
 * 施工基准：`docs/references/pages/studio-image-mobile-request.md`（owner
 * 2026-09-03 拍板方向 A）。只服务 `/studio/image` 的移动端呈现层 —— 桌面
 * `≥1024` 一个像素都不变，视频 / 音频移动端本轮维持既有纵向栈。
 *
 * ⚠ 这里只放**移动端呈现层自己的数**。模型 / 规格 / 参考图的取值域仍在
 * `constants/studio.ts`（`STUDIO_IMAGE_ASPECT_RATIOS` / `IMAGE_BATCH_COUNTS`），
 * 移动端 sheet 直接读那份，不在这里抄第二份。
 */

/**
 * 底部 composer 的锚点 id。
 *
 * ⚠ 同时是 `#studio-prompt` 那条既有滚动锚点在移动端的落点：
 * `StudioWorkspaceUI` 的两处 `getElementById('studio-prompt')` 与
 * `layout.tsx` 的 skip-link 都指着它。桌面由 `StudioPromptArea` 的
 * `PromptInput` 顶这个 id，移动端 `StudioPromptArea` 整颗不渲染，
 * 所以由 composer 顶上 —— **两者永不同时挂载**，不会出现重复 id。
 */
export const STUDIO_PROMPT_SCROLL_ANCHOR_ID = 'studio-prompt' as const

/** composer 根元素的类名锚点（几何写在 src/styles/studio.css，避免 Tailwind 任意值）。 */
export const STUDIO_MOBILE_COMPOSER_CLASS = 'studio-mobile-composer' as const

/**
 * 视频档 composer 的附加类名 —— 它比图片档多一行 mono 费用，舞台要多让出那点
 * 高度。src/styles/studio.css 里靠 `.studio-layout-v2:has(.studio-mobile-composer--video)`
 * 把 `--studio-mobile-composer-height` 调高。
 *
 * ⚠ 变量必须定义在 `.studio-layout-v2` 上（舞台是它的**子元素**，composer 是
 * 舞台的兄弟）—— 直接写在 composer 上舞台读不到。
 */
export const STUDIO_MOBILE_COMPOSER_VIDEO_CLASS =
  'studio-mobile-composer--video' as const

/**
 * 舞台底部给 composer 让出的高度所对应的类名。src/styles/studio.css 里按
 * `--studio-mobile-composer-height` + 键盘安全区算 padding。
 */
export const STUDIO_MOBILE_STAGE_CLASS = 'studio-mobile-stage' as const

/** 提示词输入最多长到几行（超过后内部滚动）。 */
export const STUDIO_MOBILE_PROMPT_MAX_ROWS = 3

/** 提示词输入的最大高度，与上面的行数一致（`line-height: 1.25rem` × 3 + 内边距）。 */
export const STUDIO_MOBILE_PROMPT_MAX_HEIGHT = '5.25rem' as const

/**
 * 移动端队列卡上进度条的封顶百分比。
 *
 * ⭐ 与 `resolveGenerationProgress` 的渐近线同一个数：**永不到 100%**。视频没有
 * 真进度信号，条子走到头再停在那里等，比停在 95% 更像「卡住了」。
 */
export const STUDIO_MOBILE_QUEUE_PROGRESS_CAP = 95
