/**
 * 音频卡的名字：选了音色就叫「音色名 · 语音 N」（owner 2026-09-29，与图片卡
 * 「Denia · 图 14」同一种写法；原来满画布都是「语音3」「音频_554」）。
 *
 * ⚠ 只替换**机器起的**名字（子型标签 + 序号、旧的「音频_数字」、上一次按音色起的名）：
 * 你手动改过的名字⛔ 动。被别的卡 `@` 着的也⛔ 动 —— `@` 按字面引用名字，改了就断。
 */

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_V4_SUBTYPE_LABELS } from '@/constants/node-studio'
import { toNodeDisplayLabel } from '@/lib/node-display-name'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'

/** 名字里的「语音」—— 与子型标签同一个词（名字创建即落库，⛔ 跟着界面语言变）。 */
const VOICE_TAKE_WORD = NODE_V4_SUBTYPE_LABELS['audio.voice'] ?? '语音'
const VOICE_TAKE_SEPARATOR = ' · '
/** 同一副嗓子最多编到几号；到顶是数据异常，不复用已占用的名字。 */
const VOICE_TAKE_MAX = 999

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const AUDIO_SUBTYPE_LABELS = Object.entries(NODE_V4_SUBTYPE_LABELS)
  .filter(([key]) => key.startsWith('audio.'))
  .map(([, label]) => escapeRegExp(label))

/** 「语音」「语音3」「环境音2」这类新建时的默认名。 */
const DEFAULT_NAME = new RegExp(`^(?:${AUDIO_SUBTYPE_LABELS.join('|')})\\d*$`)
/** 旧画布 / 素材库带来的「音频_554」。 */
const LEGACY_NAME = /^音频_?\d+$/
/** 上一次按音色起的名（换音色时跟着换）。 */
const VOICE_TAKE_NAME = new RegExp(
  `${escapeRegExp(VOICE_TAKE_SEPARATOR)}${escapeRegExp(VOICE_TAKE_WORD)} \\d+$`,
)

/** 这个名字是机器起的吗（能被音色名替换）。 */
export function isAutoAudioNodeName(name: string | undefined): boolean {
  const value = name?.trim()
  if (!value) return true
  return (
    DEFAULT_NAME.test(value) ||
    LEGACY_NAME.test(value) ||
    VOICE_TAKE_NAME.test(value)
  )
}

/**
 * 「音色名 · 语音 N」，N 取最小的空号（从 1 起）。音色名读不出来返回 `undefined`。
 */
export function voiceTakeNodeName(
  voiceName: string,
  taken: ReadonlySet<string>,
): string | undefined {
  const label = toNodeDisplayLabel(voiceName)
  if (!label) return undefined
  for (let n = 1; n <= VOICE_TAKE_MAX; n += 1) {
    const candidate = `${label}${VOICE_TAKE_SEPARATOR}${VOICE_TAKE_WORD} ${n}`
    if (!taken.has(candidate)) return candidate
  }
  return undefined
}

interface NamedNode {
  readonly id: string
  readonly data: {
    readonly name?: string | undefined
    readonly nameEdited?: boolean | undefined
  }
}

/**
 * 换了音色之后这张卡该叫什么；不该改名时返回 `undefined`。
 *
 * 不改名的三种情况：名字是你起的 · 别的卡正 `@` 着它 · 已经是这副嗓子的名字。
 */
export function renameForVoice(
  node: NamedNode,
  voiceName: string,
  nodes: readonly NamedNode[],
): string | undefined {
  const current = node.data.name?.trim()
  if (node.data.nameEdited) return undefined
  if (!isAutoAudioNodeName(current)) return undefined
  const label = toNodeDisplayLabel(voiceName)
  if (!label) return undefined
  if (current?.startsWith(`${label}${VOICE_TAKE_SEPARATOR}${VOICE_TAKE_WORD} `))
    return undefined
  const others = nodes.filter((item) => item.id !== node.id)
  if (current && others.some((item) => mentions(item, current))) {
    return undefined
  }
  const taken = new Set(
    others.flatMap((item) => (item.data.name ? [item.data.name] : [])),
  )
  return voiceTakeNodeName(label, taken)
}

/** 这张卡的任一段文字里有没有 `@名字`。 */
function mentions(node: NamedNode, name: string): boolean {
  return JSON.stringify(node.data).includes(`@${name}`)
}

/** 按音色自动改名并保留自动名来源（不该改名时空表）。 */
export function renameForVoiceOps(
  node: NamedNode,
  voiceName: string,
  nodes: readonly NamedNode[],
): NodeAssistantOpV4[] {
  const name = renameForVoice(node, voiceName, nodes)
  return name
    ? [
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setField,
          target: node.id,
          field: 'name',
          value: name,
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setField,
          target: node.id,
          field: 'nameEdited',
          value: false,
        },
      ]
    : []
}

/**
 * 选音色 = 写 `voiceProfile`（名字一起记，收起的 chip 靠它显示）+ 名字还是机器起的就
 * 一起改成「音色名 · 语音 N」。同一批落下 = 一次撤销。
 */
export function chooseVoiceOps(
  node: NamedNode,
  voice: { readonly voiceId: string; readonly voiceName: string },
  nodes: readonly NamedNode[],
): NodeAssistantOpV4[] {
  return [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
      target: node.id,
      profile: { voiceId: voice.voiceId, voiceName: voice.voiceName },
    },
    ...renameForVoiceOps(node, voice.voiceName, nodes),
  ]
}
