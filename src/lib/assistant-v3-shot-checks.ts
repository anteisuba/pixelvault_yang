import { ASSISTANT_V3_LIMITS } from '@/constants/assistant-v3'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'

/**
 * 镜头卡出片前的核对（v3 回放 T16：带台词的镜没开声音、一句 19 个词塞进 3 秒）。
 * 只看卡上写着的东西 —— 提示词里的分段时间码、`{角色：台词}` / 引号里的英文台词、
 * 声音开关；⛔ 不猜画面。返回给模型看的英文短句，空 = 没问题。
 */

const SEGMENT_HEADER =
  /镜头\s*\d+\s*[（(]\s*(\d+(?:\.\d+)?)\s*[-–~至]\s*(\d+(?:\.\d+)?)\s*秒\s*[）)]/g
const SPOKEN = /\{([^{}]*)\}|["“]([^"”]*)["”]/g
const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g

/** 提示词里分段时间码最晚到第几秒（`镜头2（2-5秒）` → 5）；没写分段 = `null`。 */
export function promptTimelineEnd(text: string): number | null {
  const ends = [...text.matchAll(SEGMENT_HEADER)].map((match) =>
    Number(match[2]),
  )
  return ends.length > 0 ? Math.max(...ends) : null
}

function spokenWords(text: string): number {
  let words = 0
  for (const match of text.matchAll(SPOKEN)) {
    const braced = match[1]
    const line =
      braced === undefined
        ? (match[2] ?? '')
        : braced.replace(/^[^：:]*[：:]/, '')
    words += line.match(WORD)?.length ?? 0
  }
  return words
}

function fits(seconds: number): number {
  return Math.floor(seconds * ASSISTANT_V3_LIMITS.dialogueWordsPerSecond)
}

export function checkShotBeforeGenerate(
  node: AssistantOperatorCanvasNode,
): string[] {
  if (node.kind !== NODE_MEDIA_KIND_IDS.video) return []
  const text = node.text ?? ''
  const issues: string[] = []
  const headers = [...text.matchAll(SEGMENT_HEADER)]
  if (headers.length > 0) {
    headers.forEach((header, index) => {
      const start = Number(header[1])
      const end = Number(header[2])
      const body = text.slice(
        (header.index ?? 0) + header[0].length,
        headers[index + 1]?.index ?? text.length,
      )
      const words = spokenWords(body)
      const seconds = end - start
      if (words > 0 && seconds > 0 && words > fits(seconds))
        issues.push(
          `the spoken line in the part from ${start} to ${end} s has ${words} words; about ${fits(seconds)} fit in ${seconds} s`,
        )
    })
  } else {
    const words = spokenWords(text)
    const seconds = Number(node.parameters?.values.duration)
    if (words > 0 && seconds > 0 && words > fits(seconds))
      issues.push(
        `the spoken lines have ${words} words; about ${fits(seconds)} fit in ${seconds} s`,
      )
  }
  const canSound = node.parameters?.options.generateAudio?.includes(true)
  if (
    canSound &&
    node.parameters?.values.generateAudio !== true &&
    spokenWords(text) > 0
  )
    issues.push('it has a spoken line but sound is off')
  return issues
}
