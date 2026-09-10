/**
 * `timeline` 帧的**进出**（S10）：服务端成帧 → 客户端读帧，一份提案原样过去。
 *
 * ⚠ 顺序也钉住：提案必须排在第一个 `text` 之前 —— 剪辑台要在助手开口的同时就把
 * 幽灵段摆上轨道。
 */

import { describe, expect, it } from 'vitest'

import { EDIT_TRANSITION_IDS } from '@/constants/edit-desk'
import { readAssistantStream } from '@/lib/assistant-stream-client'
import { toAssistantSseResponse } from '@/lib/assistant-stream'
import type { TimelineProposal } from '@/types/edit-desk-plan'

const proposal: TimelineProposal = {
  project: {
    name: 'cut',
    tracks: {
      video: [
        {
          id: 'clip_1',
          sourceNodeId: 'v1',
          in: 1,
          out: 6,
          speed: 1,
          muted: false,
          transitionOut: EDIT_TRANSITION_IDS.crossfade,
        },
      ],
      audio: [],
      music: [],
    },
    settings: { aspect: '16:9', resolution: '1080p', magnetic: true },
  },
  rationale: [
    {
      clipId: 'clip_1',
      nodeId: 'v1',
      take: 'middle',
      inSec: 1,
      outSec: 6,
      sourceDurationSec: 7,
      reason: '前一秒在抖',
    },
  ],
  summary: '按剧本顺序拼，各取中间 5 秒。',
  counts: { clipsChanged: 1, tracksAdded: 0 },
  cost: 'free',
}

async function collect(response: Response) {
  const messages = []
  for await (const message of readAssistantStream(response.body!)) {
    messages.push(message)
  }
  return messages
}

describe('assistant stream · timeline 帧', () => {
  it('一份提案原样过去，且排在第一个 text 之前', async () => {
    const response = toAssistantSseResponse({
      text: (async function* () {
        yield '好'
      })(),
      timelineProposal: proposal,
      routeName: 'test',
    })
    const messages = await collect(response)
    expect(messages[0]).toEqual({ type: 'timeline', proposal })
    expect(messages[1]).toEqual({ type: 'text', delta: '好' })
  })

  it('没有提案的轮次一帧都不发', async () => {
    const response = toAssistantSseResponse({
      text: (async function* () {
        yield '好'
      })(),
      routeName: 'test',
    })
    const messages = await collect(response)
    expect(messages.some((message) => message.type === 'timeline')).toBe(false)
  })

  it('坏载荷只丢这一帧，正文照读（⛔ 不让一帧毁掉整条对话）', async () => {
    const response = toAssistantSseResponse({
      text: (async function* () {
        yield '好'
      })(),
      // 缺 `cost` / `project` 的半份提案 —— 客户端 safeParse 后丢掉。
      timelineProposal: { summary: 'x' } as unknown as TimelineProposal,
      routeName: 'test',
    })
    const messages = await collect(response)
    expect(messages).toEqual([{ type: 'text', delta: '好' }])
  })
})
