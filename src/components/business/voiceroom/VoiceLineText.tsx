import { parseVoiceMarkup } from '@/lib/voice-markup'

/**
 * 气泡里的台词：方括号语气提示（`[laughing]`）淡一档显示——它会被演出来，但不是念出来的字。
 * 切法与工作台的标记编辑器同一份（`parseVoiceMarkup`）。
 */
export function VoiceLineText({ text }: { text: string }) {
  return (
    <>
      {parseVoiceMarkup(text).map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <span key={index} className="vr-cue">
            [{segment.token.raw}]
          </span>
        ),
      )}
    </>
  )
}
