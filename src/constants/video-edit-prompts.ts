/**
 * 视频编辑端点（`videoKind: 'edit'`）的固定 prompt 模板。
 *
 * fal 的 Kling O3 video-to-video/edit 要求在 prompt 里用 `@Video1` 指代输入
 * 视频；模板自带这个 token，直接发即可。
 *
 * ⚠ 还没有接 UI —— 动作按钮在设计阶段 D4 之后另行接入。
 */

/**
 * 「转白模」——把一段实拍/成片改写成灰白粘土 blockout 预览，用来看镜头运动、
 * 构图与体块关系，不看材质。
 *
 * 这一版是 2026-09-17 实测通过后修过的措辞：逐条点名「保留什么」（镜头运动、
 * 构图、角色姿态与动作、场景布局）和「剥掉什么」（材质、颜色、纹理、文字、光效、
 * 雨），因为只写「转成白模」时模型会连镜头一起重编。最后一句单独点名眼睛，是因为
 * 不点名时眼珠会保留原色，整帧只剩这一处彩色。
 */
export const VIDEO_EDIT_WHITE_CLAY_PROMPT =
  'Convert @Video1 into a white clay model blockout render: keep the exact same camera motion, framing, character pose and movement, and scene layout; keep background architecture as same-material grey blocks; strip all materials, colors, textures, text, lighting effects and rain; everything becomes matte uniform light-grey clay under flat neutral studio lighting with soft ambient occlusion; eyes the same clay, no eye color.'
