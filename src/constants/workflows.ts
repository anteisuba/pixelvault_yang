import { AI_MODELS } from '@/constants/models'

export const WORKFLOW_IDS = {
  QUICK_IMAGE: 'QUICK_IMAGE',
  ANIME_ILLUSTRATION: 'ANIME_ILLUSTRATION',
  CHARACTER_CONSISTENCY_IMAGE: 'CHARACTER_CONSISTENCY_IMAGE',
  IMAGE_EDIT_REMIX: 'IMAGE_EDIT_REMIX',
  POSTER_LAYOUT: 'POSTER_LAYOUT',
  CINEMATIC_SHORT_VIDEO: 'CINEMATIC_SHORT_VIDEO',
  CHARACTER_TO_VIDEO: 'CHARACTER_TO_VIDEO',
  VOICE_NARRATION_DIALOGUE: 'VOICE_NARRATION_DIALOGUE',
} as const

export const WORKFLOW_MEDIA_GROUPS = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
} as const

export const WORKFLOW_LAUNCH_TIERS = {
  WAVE_1: 'wave-1',
  WAVE_1_5: 'wave-1.5',
  WAVE_2: 'wave-2',
} as const

export const WORKFLOW_MODES = {
  QUICK: 'quick',
  CARD: 'card',
} as const

type WorkflowIdValue = (typeof WORKFLOW_IDS)[keyof typeof WORKFLOW_IDS]
type WorkflowMediaGroupValue =
  (typeof WORKFLOW_MEDIA_GROUPS)[keyof typeof WORKFLOW_MEDIA_GROUPS]
type WorkflowLaunchTierValue =
  (typeof WORKFLOW_LAUNCH_TIERS)[keyof typeof WORKFLOW_LAUNCH_TIERS]

export type WorkflowModeDefault =
  (typeof WORKFLOW_MODES)[keyof typeof WORKFLOW_MODES]

export type WorkflowDefaultOpenPanel =
  | 'cardManagement'
  | 'projectHistory'
  | 'modelSelector'
  | 'civitai'
  | 'enhance'
  | 'reverse'
  | 'advanced'
  | 'refImage'
  | 'layerDecompose'
  | 'aspectRatio'
  | 'voiceSelector'
  | 'voiceTrainer'
  | 'transform'
  | 'videoParams'
  | 'script'

type WorkflowDefinition = {
  id: WorkflowIdValue
  mediaGroup: WorkflowMediaGroupValue
  launchTier: WorkflowLaunchTierValue
  defaultOutputType: WorkflowMediaGroupValue
  publicNameKey: string
  descriptionKey: string
  advancedModeAllowed: boolean
  defaultWorkflowMode?: WorkflowModeDefault
  recommendedModelIds?: readonly string[]
  defaultOpenPanel?: WorkflowDefaultOpenPanel | null
}

export const WORKFLOWS = [
  {
    id: WORKFLOW_IDS.QUICK_IMAGE,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.IMAGE,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.IMAGE,
    publicNameKey: 'workflows.QUICK_IMAGE.name',
    descriptionKey: 'workflows.QUICK_IMAGE.description',
    advancedModeAllowed: true,
  },
  {
    id: WORKFLOW_IDS.ANIME_ILLUSTRATION,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.IMAGE,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.IMAGE,
    publicNameKey: 'workflows.ANIME_ILLUSTRATION.name',
    descriptionKey: 'workflows.ANIME_ILLUSTRATION.description',
    advancedModeAllowed: true,
  },
  {
    id: WORKFLOW_IDS.CHARACTER_CONSISTENCY_IMAGE,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.IMAGE,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.IMAGE,
    publicNameKey: 'workflows.CHARACTER_CONSISTENCY_IMAGE.name',
    descriptionKey: 'workflows.CHARACTER_CONSISTENCY_IMAGE.description',
    advancedModeAllowed: true,
  },
  {
    id: WORKFLOW_IDS.IMAGE_EDIT_REMIX,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.IMAGE,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.IMAGE,
    publicNameKey: 'workflows.IMAGE_EDIT_REMIX.name',
    descriptionKey: 'workflows.IMAGE_EDIT_REMIX.description',
    advancedModeAllowed: true,
  },
  {
    id: WORKFLOW_IDS.POSTER_LAYOUT,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.IMAGE,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.IMAGE,
    publicNameKey: 'workflows.POSTER_LAYOUT.name',
    descriptionKey: 'workflows.POSTER_LAYOUT.description',
    advancedModeAllowed: true,
  },
  {
    id: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.VIDEO,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.VIDEO,
    publicNameKey: 'workflows.CINEMATIC_SHORT_VIDEO.name',
    descriptionKey: 'workflows.CINEMATIC_SHORT_VIDEO.description',
    advancedModeAllowed: true,
  },
  {
    id: WORKFLOW_IDS.CHARACTER_TO_VIDEO,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.VIDEO,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.VIDEO,
    publicNameKey: 'workflows.CHARACTER_TO_VIDEO.name',
    descriptionKey: 'workflows.CHARACTER_TO_VIDEO.description',
    advancedModeAllowed: true,
  },
  {
    id: WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE,
    mediaGroup: WORKFLOW_MEDIA_GROUPS.AUDIO,
    launchTier: WORKFLOW_LAUNCH_TIERS.WAVE_1,
    defaultOutputType: WORKFLOW_MEDIA_GROUPS.AUDIO,
    publicNameKey: 'workflows.VOICE_NARRATION_DIALOGUE.name',
    descriptionKey: 'workflows.VOICE_NARRATION_DIALOGUE.description',
    advancedModeAllowed: true,
  },
] as const satisfies readonly WorkflowDefinition[]

export type Workflow = (typeof WORKFLOWS)[number]
export type WorkflowId = Workflow['id']
export type WorkflowMediaGroup = Workflow['mediaGroup']
export type WorkflowLaunchTier = Workflow['launchTier']

export const DEFAULT_WORKFLOW_ID = WORKFLOW_IDS.QUICK_IMAGE

type WorkflowStudioDefaultOverrides = {
  workflowMode?: WorkflowModeDefault
  openPanel?: WorkflowDefaultOpenPanel | null
  recommendedModelIds?: readonly string[]
}

const WORKFLOW_STUDIO_DEFAULT_OVERRIDES: Partial<
  Record<WorkflowId, WorkflowStudioDefaultOverrides>
> = {
  [WORKFLOW_IDS.ANIME_ILLUSTRATION]: {
    recommendedModelIds: [
      AI_MODELS.ANIMAGINE_XL_4,
      AI_MODELS.ILLUSTRIOUS_XL,
      AI_MODELS.NOVELAI_V45_CURATED,
    ],
  },
  [WORKFLOW_IDS.CHARACTER_CONSISTENCY_IMAGE]: {
    workflowMode: WORKFLOW_MODES.CARD,
    openPanel: 'refImage',
    recommendedModelIds: [AI_MODELS.GEMINI_PRO_IMAGE, AI_MODELS.FLUX_2_PRO],
  },
  [WORKFLOW_IDS.IMAGE_EDIT_REMIX]: {
    openPanel: 'refImage',
    recommendedModelIds: [
      AI_MODELS.FLUX_KONTEXT_PRO,
      AI_MODELS.FLUX_KONTEXT_MAX,
      AI_MODELS.GEMINI_PRO_IMAGE,
    ],
  },
  [WORKFLOW_IDS.POSTER_LAYOUT]: {
    openPanel: 'modelSelector',
    recommendedModelIds: [
      AI_MODELS.IDEOGRAM_3,
      AI_MODELS.RECRAFT_V4_PRO,
      AI_MODELS.OPENAI_GPT_IMAGE_2,
    ],
  },
  [WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO]: {
    openPanel: 'videoParams',
    recommendedModelIds: [
      AI_MODELS.KLING_V3_PRO,
      AI_MODELS.VEO_31,
      AI_MODELS.LUMA_RAY_2,
    ],
  },
  [WORKFLOW_IDS.CHARACTER_TO_VIDEO]: {
    openPanel: 'refImage',
    recommendedModelIds: [
      AI_MODELS.KLING_VIDEO,
      AI_MODELS.SEEDANCE_20,
      AI_MODELS.MINIMAX_VIDEO,
    ],
  },
  [WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE]: {
    openPanel: 'voiceSelector',
    recommendedModelIds: [AI_MODELS.FISH_AUDIO_S2_PRO, AI_MODELS.FAL_F5_TTS],
  },
}

export const getWorkflowById = (workflowId: WorkflowId): Workflow | undefined =>
  WORKFLOWS.find((workflow) => workflow.id === workflowId)

export const getWorkflowStudioDefaults = (workflowId: WorkflowId) => {
  const workflow = getWorkflowById(workflowId)
  const override = WORKFLOW_STUDIO_DEFAULT_OVERRIDES[workflowId]
  const workflowConfig: WorkflowDefinition | undefined = workflow

  return {
    outputType:
      workflowConfig?.defaultOutputType ?? WORKFLOW_MEDIA_GROUPS.IMAGE,
    workflowMode:
      override?.workflowMode ??
      workflowConfig?.defaultWorkflowMode ??
      WORKFLOW_MODES.QUICK,
    openPanel: override?.openPanel ?? workflowConfig?.defaultOpenPanel ?? null,
    recommendedModelIds:
      override?.recommendedModelIds ?? workflowConfig?.recommendedModelIds,
  }
}
