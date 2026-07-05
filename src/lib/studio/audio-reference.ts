/**
 * Resolve the inline reference-audio pair for a TTS request.
 *
 * Fish Audio's `references` payload — and the request schema's refine — require
 * the audio clip and its transcript to travel as a COHERENT PAIR (both present
 * or both absent). Both halves must come from the SAME source: mixing a saved
 * card's clip with an ad-hoc transcript (or vice versa) either 400s the request
 * (half a pair) or feeds a transcript that doesn't match the clip. Prefer a
 * saved voice card, fall back to the ad-hoc upload, and drop the pair entirely
 * when either half is missing — such a card is consumed via its voiceId instead.
 */
export interface InlineAudioReferenceSources {
  cardReferenceAudioUrl?: string | null
  cardSampleText?: string | null
  adHocReferenceUrl?: string | null
  adHocReferenceText?: string
}

export interface ResolvedInlineAudioReference {
  referenceAudioUrl: string | undefined
  referenceText: string | undefined
}

export function resolveInlineAudioReference(
  sources: InlineAudioReferenceSources,
): ResolvedInlineAudioReference {
  const cardText = sources.cardSampleText?.trim()
  if (sources.cardReferenceAudioUrl && cardText) {
    return {
      referenceAudioUrl: sources.cardReferenceAudioUrl,
      referenceText: cardText,
    }
  }

  const adHocText = sources.adHocReferenceText?.trim()
  if (sources.adHocReferenceUrl && adHocText) {
    return {
      referenceAudioUrl: sources.adHocReferenceUrl,
      referenceText: adHocText,
    }
  }

  return { referenceAudioUrl: undefined, referenceText: undefined }
}
