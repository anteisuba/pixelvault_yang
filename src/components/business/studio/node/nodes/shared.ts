import {
  FileText,
  ImageIcon,
  Mic,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react'

import type { NodeWorkflowNodeType } from '@/types'

export const NODE_ICONS: Record<NodeWorkflowNodeType, LucideIcon> = {
  script: FileText,
  text: Type,
  image: ImageIcon,
  video: Video,
  audio: Mic,
}
