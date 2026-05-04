import { WORKFLOW_IDS } from './workflows'

/**
 * Maps each workflow ID to its i18n key under the StudioPromptArea namespace.
 * Used to prefill the prompt textarea on first Studio visit.
 */
export const SAMPLE_PROMPT_KEYS: Record<string, string> = {
  [WORKFLOW_IDS.QUICK_IMAGE]: 'samplePrompts.quickImage',
  [WORKFLOW_IDS.ANIME_ILLUSTRATION]: 'samplePrompts.animeIllustration',
  [WORKFLOW_IDS.CHARACTER_CONSISTENCY_IMAGE]:
    'samplePrompts.characterConsistency',
  [WORKFLOW_IDS.IMAGE_EDIT_REMIX]: 'samplePrompts.imageEditRemix',
  [WORKFLOW_IDS.POSTER_LAYOUT]: 'samplePrompts.posterLayout',
  [WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO]: 'samplePrompts.cinematicVideo',
  [WORKFLOW_IDS.CHARACTER_TO_VIDEO]: 'samplePrompts.characterToVideo',
  [WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE]: 'samplePrompts.voiceNarration',
}

export const SAMPLE_PROMPT_STORAGE_KEY = 'pv:studio-sample-shown'
