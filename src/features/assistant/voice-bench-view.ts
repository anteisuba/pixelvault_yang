import type { AssistantVoiceBenchView } from '@/types/assistant-operator'

/**
 * 配音台此刻的样子 → 板子上的一段（11-17：配音台没有宿主，助手看不见台词框）。
 *
 * ⚠ 只读：配音台不是一个域，没有写台词框 / 念的工具。念一句要花钱，由创作者自己按「念」；
 *   助手能做的是在回话里给出改好的台词让他贴进去。缺席 = 不在配音台，返回空串。
 */
export function renderVoiceBenchView(
  view: AssistantVoiceBenchView | undefined,
): string {
  if (!view) return ''
  const lines = [
    '\nThey are on the voice bench (text-to-speech) right now:',
    `- voice: ${view.voice ?? 'none picked yet'}`,
    `- model tier: ${view.model}`,
    `- speed: ${view.speed.toFixed(1)}×`,
    view.draft.trim()
      ? `- line box (what they are about to speak, one line per sentence):\n"""\n${view.draft}\n"""`
      : '- line box: empty',
  ]
  if (view.recent.length > 0) {
    lines.push(
      `- last lines spoken here, oldest first:\n${view.recent
        .map((line, index) => `  ${index + 1}. ${line}`)
        .join('\n')}`,
    )
  }
  lines.push(
    'You cannot type into the line box, change the voice / tier / speed, or press speak here — speaking costs money and is theirs to press. When they ask to change a line or its tone marks, reply with the rewritten line(s) ready to paste, and say which setting to change if one should.',
  )
  return lines.join('\n')
}
