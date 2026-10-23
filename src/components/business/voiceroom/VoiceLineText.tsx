import { Fragment } from 'react'

import { DRAMA_PAIRED_TAGS } from '@/constants/voiceroom'
import { parseVoiceMarkup } from '@/lib/voice-markup'

/** Drama 3 的成对标签（开、合都算）。 */
const PAIRED_TAG_PATTERN = new RegExp(
  `(</?(?:${DRAMA_PAIRED_TAGS.join('|')})>)`,
  'g',
)

/**
 * 气泡里的台词：方括号语气提示（`[laughing]`）和 Drama 3 的成对标签（`<whisper>`）淡一档显示——
 * 它们会被演出来，但不是念出来的字。方括号的切法与工作台的标记编辑器同一份（`parseVoiceMarkup`）。
 */
export function VoiceLineText({ text }: { text: string }) {
  return (
    <>
      {parseVoiceMarkup(text).map((segment, index) =>
        segment.kind === 'text' ? (
          <Fragment key={index}>
            {segment.text.split(PAIRED_TAG_PATTERN).map((part, partIndex) =>
              partIndex % 2 === 1 ? (
                <span key={partIndex} className="vr-cue">
                  {part}
                </span>
              ) : (
                part
              ),
            )}
          </Fragment>
        ) : (
          <span key={index} className="vr-cue">
            [{segment.token.raw}]
          </span>
        ),
      )}
    </>
  )
}
