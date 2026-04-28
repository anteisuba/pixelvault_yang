import type { ImageIntent } from '@/types'

export const TASK_TYPES = [
  'portrait',
  'landscape',
  'anime',
  'artistic',
  'product',
  'architecture',
  'general',
] as const

export type TaskType = (typeof TASK_TYPES)[number]

export function classifyPromptTaskType(prompt: string): TaskType {
  const p = prompt.toLowerCase()

  if (/portrait|person|woman|man|face|selfie/.test(p)) return 'portrait'
  if (/landscape|mountain|forest|ocean|sky|nature/.test(p)) {
    return 'landscape'
  }
  if (/anime|manga|cartoon|chibi/.test(p)) return 'anime'
  if (/product|logo|commercial|brand/.test(p)) return 'product'
  if (/architecture|building|interior|room/.test(p)) return 'architecture'
  if (/paint|illustrat|art|sketch|watercolor/.test(p)) return 'artistic'

  return 'general'
}

export function classifyImageIntentTaskType(intent: ImageIntent): TaskType {
  return classifyPromptTaskType(
    [intent.subject, intent.style, intent.mood].filter(Boolean).join(' '),
  )
}
