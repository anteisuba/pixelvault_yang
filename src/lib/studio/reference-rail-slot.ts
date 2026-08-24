import type { VideoNodeMode } from '@/constants/video-node-modes'

/**
 * 参考轨那条槽位到底是什么 —— 三选一，供参数轨的标签与可访问名共用。
 *
 * - `first-frame` 视频关键帧档：这张图是**视频的第一帧**；
 * - `content-reference` 视频的图像参考 / 全能参考档：这张图是「像这个」的内容参考；
 * - `image-reference` 图片模态：老意义上的参考图。
 */
export type ReferenceRailSlot =
  | 'first-frame'
  | 'content-reference'
  | 'image-reference'

/**
 * ⚠ 这是一条**判据**，不是文案选择：同一个槽、同一张图，在关键帧档下会被当成
 * 首帧发出去，在图像参考档下会被当成内容参考。轨上不写清，用户只能靠猜 ——
 * 用途档本身在参数栏栏首，那在另一列，扫不到一起。
 *
 * 提成纯函数是为了能钉住：宿主 `StudioCanvas` 拖着生成态、拖放、编辑舞台一堆
 * 东西，在那里断言这三行要铺一整页 mock。
 */
export function resolveReferenceRailSlot(
  outputType: 'image' | 'video' | 'audio',
  videoMode: VideoNodeMode,
): ReferenceRailSlot {
  if (outputType !== 'video') return 'image-reference'
  return videoMode === 'keyframe' ? 'first-frame' : 'content-reference'
}
