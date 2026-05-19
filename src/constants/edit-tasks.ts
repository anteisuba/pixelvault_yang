import type { LucideIcon } from 'lucide-react'
import {
  Eraser,
  Expand,
  Layers,
  Palette,
  Replace,
  Sparkles,
  Type,
  Wand2,
} from 'lucide-react'

import type { EditTaskKind } from '@/contexts/image-edit-context'

export type EditTaskProvider = 'fal' | 'gemini' | 'openai'

/**
 * A single model option for a task. `id` is what the API receives as
 * `modelId`; `displayName` is the short label shown in the picker.
 *
 * Stays in `src/constants` because both client picker code and server-side
 * route validation may want to consult the same allowlist.
 */
export interface EditModelOption {
  id: string
  provider: EditTaskProvider
  displayName: string
}

export const EDIT_MODELS: Record<string, EditModelOption> = {
  'fal-ai/aura-sr': {
    id: 'fal-ai/aura-sr',
    provider: 'fal',
    displayName: 'Aura SR (4x)',
  },
  'fal-ai/birefnet/v2': {
    id: 'fal-ai/birefnet/v2',
    provider: 'fal',
    displayName: 'BiRefNet v2',
  },
  'fal-ai/flux-pro/v1/fill': {
    id: 'fal-ai/flux-pro/v1/fill',
    provider: 'fal',
    displayName: 'FLUX Pro Fill',
  },
  'fal-ai/image-apps-v2/outpaint': {
    id: 'fal-ai/image-apps-v2/outpaint',
    provider: 'fal',
    displayName: 'Image Apps Outpaint',
  },
  'xiuruisu/see-through': {
    id: 'xiuruisu/see-through',
    provider: 'fal',
    displayName: 'See-Through (HF)',
  },
}

/**
 * Static metadata for every editing task surfaced on /studio/edit. The grid on
 * the overview page renders one card per entry; each task has its own subroute
 * under /studio/edit/<task> with the matching provider picker.
 *
 * `providers` order matters — the first entry is the recommended default in
 * the picker (chosen for quality / cost balance per task). `models` lists the
 * registered model IDs (must exist as EDIT_MODELS keys); `defaultModelId` is
 * the picker's initial selection.
 */
export interface EditTaskMetadata {
  task: EditTaskKind
  icon: LucideIcon
  providers: readonly EditTaskProvider[]
  models: readonly string[]
  defaultModelId: string | null
}

export const EDIT_TASKS: readonly EditTaskMetadata[] = [
  {
    task: 'upscale',
    icon: Wand2,
    providers: ['fal'],
    models: ['fal-ai/aura-sr'],
    defaultModelId: 'fal-ai/aura-sr',
  },
  {
    task: 'remove-background',
    icon: Eraser,
    providers: ['fal'],
    models: ['fal-ai/birefnet/v2'],
    defaultModelId: 'fal-ai/birefnet/v2',
  },
  {
    task: 'inpaint',
    icon: Sparkles,
    providers: ['fal', 'gemini', 'openai'],
    models: ['fal-ai/flux-pro/v1/fill'],
    defaultModelId: 'fal-ai/flux-pro/v1/fill',
  },
  {
    task: 'outpaint',
    icon: Expand,
    providers: ['fal', 'gemini'],
    models: ['fal-ai/image-apps-v2/outpaint'],
    defaultModelId: 'fal-ai/image-apps-v2/outpaint',
  },
  {
    task: 'object-replace',
    icon: Replace,
    providers: ['gemini', 'fal', 'openai'],
    models: [],
    defaultModelId: null,
  },
  {
    task: 'style-transfer',
    icon: Palette,
    providers: ['gemini', 'fal', 'openai'],
    models: [],
    defaultModelId: null,
  },
  {
    task: 'text-render',
    icon: Type,
    providers: ['openai'],
    models: [],
    defaultModelId: null,
  },
  {
    task: 'decompose',
    icon: Layers,
    providers: ['fal'],
    models: ['xiuruisu/see-through'],
    defaultModelId: 'xiuruisu/see-through',
  },
]

export function getEditTaskMeta(
  task: EditTaskKind,
): EditTaskMetadata | undefined {
  return EDIT_TASKS.find((entry) => entry.task === task)
}

/**
 * URL segment for a task — used by both the grid links and child page routing.
 * Kept identical to EditTaskKind so route === kind at all call sites.
 */
export function editTaskRoute(task: EditTaskKind): string {
  return `/studio/edit/${task}`
}

export const EDIT_TASK_LIST = EDIT_TASKS.map((t) => t.task)
