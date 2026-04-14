import { AI_ADAPTER_TYPES } from '@/constants/providers'

/** Validate API key format based on adapter type prefix patterns */
export function validateKeyFormat(
  adapterType: AI_ADAPTER_TYPES,
  key: string,
): 'valid' | 'invalid' | 'empty' {
  const trimmed = key.trim()
  if (!trimmed) return 'empty'

  switch (adapterType) {
    case AI_ADAPTER_TYPES.HUGGINGFACE:
      return trimmed.startsWith('hf_') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.GEMINI:
      return trimmed.startsWith('AIza') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.OPENAI:
      return trimmed.startsWith('sk-') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.FAL:
      return trimmed.length > 10 ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.REPLICATE:
      return trimmed.startsWith('r8_') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.NOVELAI:
      return trimmed.startsWith('pst-') || trimmed.startsWith('eyJhbGci')
        ? 'valid'
        : 'invalid'
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return trimmed.length > 10 ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.FISH_AUDIO:
      return trimmed.length >= 16 && /^[a-f0-9-]+$/i.test(trimmed)
        ? 'valid'
        : 'invalid'
    default:
      return 'valid'
  }
}
