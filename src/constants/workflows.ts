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
] as const

export type Workflow = (typeof WORKFLOWS)[number]
export type WorkflowId = Workflow['id']
export type WorkflowMediaGroup = Workflow['mediaGroup']
export type WorkflowLaunchTier = Workflow['launchTier']

export const DEFAULT_WORKFLOW_ID = WORKFLOW_IDS.QUICK_IMAGE

export const getWorkflowById = (workflowId: WorkflowId): Workflow | undefined =>
  WORKFLOWS.find((workflow) => workflow.id === workflowId)

export const getWorkflowStudioDefaults = (workflowId: WorkflowId) => {
  const workflow = getWorkflowById(workflowId)

  return {
    outputType: workflow?.defaultOutputType ?? WORKFLOW_MEDIA_GROUPS.IMAGE,
  }
}
