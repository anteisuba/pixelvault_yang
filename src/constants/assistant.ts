import { AI_ADAPTER_TYPES } from '@/constants/providers'

export const ASSISTANT_MEDIA_LIMITS = {
  maxReferences: 8,
  maxUrlLength: 4000,
  maxLabelLength: 160,
  maxVideoBytes: 50 * 1024 * 1024,
  geminiInlineMaxBytes: 20 * 1024 * 1024,
  geminiFilePollIntervalMs: 1000,
  geminiFilePollTimeoutMs: 60_000,
} as const

export const ASSISTANT_MEDIA_CAPABILITIES: Record<
  AI_ADAPTER_TYPES,
  { image: boolean; video: boolean }
> = {
  [AI_ADAPTER_TYPES.OPENAI]: { image: true, video: false },
  [AI_ADAPTER_TYPES.GEMINI]: { image: true, video: true },
  [AI_ADAPTER_TYPES.DEEPSEEK]: { image: false, video: false },
  [AI_ADAPTER_TYPES.ANTHROPIC]: { image: false, video: false },
  [AI_ADAPTER_TYPES.DASHSCOPE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.VOLCENGINE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.BYTEPLUS]: { image: false, video: false },
  [AI_ADAPTER_TYPES.MINIMAX]: { image: false, video: false },
  [AI_ADAPTER_TYPES.MINIMAX_CN]: { image: false, video: false },
  [AI_ADAPTER_TYPES.HUGGINGFACE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.FAL]: { image: false, video: false },
  [AI_ADAPTER_TYPES.RUNWAY]: { image: false, video: false },
  [AI_ADAPTER_TYPES.REPLICATE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.NOVELAI]: { image: false, video: false },
  [AI_ADAPTER_TYPES.FISH_AUDIO]: { image: false, video: false },
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: { image: false, video: false },
  [AI_ADAPTER_TYPES.RUNNER]: { image: false, video: false },
  [AI_ADAPTER_TYPES.ELEVENLABS]: { image: false, video: false },
}

export function assistantAdapterSupportsMedia(
  adapterType: AI_ADAPTER_TYPES,
  kind: 'image' | 'video',
): boolean {
  return ASSISTANT_MEDIA_CAPABILITIES[adapterType][kind]
}

export type AssistantMediaCapabilityLabel =
  'imageVideo' | 'imageOnly' | 'textOnly'

export function getAssistantMediaCapabilityLabel(
  adapterType: AI_ADAPTER_TYPES,
): AssistantMediaCapabilityLabel {
  const capability = ASSISTANT_MEDIA_CAPABILITIES[adapterType]
  if (capability.video) return 'imageVideo'
  if (capability.image) return 'imageOnly'
  return 'textOnly'
}
