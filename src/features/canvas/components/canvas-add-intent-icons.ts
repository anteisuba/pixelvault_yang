import type { ComponentType } from 'react'
import {
  Clapperboard,
  FileText,
  Film,
  ImagePlus,
  Mic2,
  Mountain,
  ScrollText,
  StickyNote,
  UserRound,
  Video,
} from '@/components/icons'

import {
  CANVAS_ADD_INTENT_IDS,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'

/** 添加目录每一项的图标 —— 画布「添加节点」面板用这一份。 */
export const CANVAS_ADD_INTENT_ICONS: Record<
  CanvasAddIntentId,
  ComponentType<{ className?: string }>
> = {
  [CANVAS_ADD_INTENT_IDS.textScript]: FileText,
  [CANVAS_ADD_INTENT_IDS.textRule]: ScrollText,
  [CANVAS_ADD_INTENT_IDS.textNote]: StickyNote,
  [CANVAS_ADD_INTENT_IDS.imageShot]: Clapperboard,
  [CANVAS_ADD_INTENT_IDS.imageCharacter]: UserRound,
  [CANVAS_ADD_INTENT_IDS.imageBackground]: Mountain,
  [CANVAS_ADD_INTENT_IDS.imageResult]: ImagePlus,
  [CANVAS_ADD_INTENT_IDS.audioVoice]: Mic2,
  // 面板里已并进「语音 / 音色」，只为助手载荷的别名留一个图标位。
  [CANVAS_ADD_INTENT_IDS.audioTimbre]: Mic2,
  [CANVAS_ADD_INTENT_IDS.videoShot]: Video,
  [CANVAS_ADD_INTENT_IDS.videoClip]: Film,
}
