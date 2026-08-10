import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_VOICE_CLIP_SOURCE_IDS } from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode, NodeWorkflowState } from '@/types/node-workflow'

function makeState(
  data: Record<string, unknown>,
  type: string = NODE_TYPE_IDS.voice,
): NodeWorkflowState {
  return {
    nodes: [
      {
        id: 'v1',
        type,
        position: { x: 0, y: 0 },
        data: { prompt: '', status: 'idle', ...data },
      } as unknown as NodeWorkflowNode,
    ],
    edges: [],
  } as unknown as NodeWorkflowState
}

import { migrateVoiceClip } from './node-workflow-migrate-voice-clip'

/**
 * 存量项目里那段声音是用户真实资产 —— 迁移错了就是静默清零，比任何显示 bug 都严重。
 */
describe('migrateVoiceClip', () => {
  it('lifts a legacy system-voice sample into the clip field', () => {
    const out = migrateVoiceClip(
      makeState({ voiceSampleUrl: 'https://cdn/sample.mp3' }),
    )
    expect(out.nodes[0]?.data.voiceClipUrl).toBe('https://cdn/sample.mp3')
    expect(out.nodes[0]?.data.voiceClipSource).toBe(
      NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library,
    )
  })

  it('lifts uploaded reference audio and marks it uploaded', () => {
    const out = migrateVoiceClip(
      makeState({ voiceReferenceAudioUrl: 'https://cdn/mine.mp3' }),
    )
    expect(out.nodes[0]?.data.voiceClipUrl).toBe('https://cdn/mine.mp3')
    expect(out.nodes[0]?.data.voiceClipSource).toBe(
      NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.uploaded,
    )
  })

  // 两个字段都有值的老节点：上传的音频是用户自己的东西，优先级高于系统样本 ——
  // 与收敛前 `readVoiceUrl` 的取值顺序一致，迁移不许改变谁被发出去。
  it('prefers the uploaded audio when a legacy node carries both', () => {
    const out = migrateVoiceClip(
      makeState({
        voiceSampleUrl: 'https://cdn/sample.mp3',
        voiceReferenceAudioUrl: 'https://cdn/mine.mp3',
      }),
    )
    expect(out.nodes[0]?.data.voiceClipUrl).toBe('https://cdn/mine.mp3')
  })

  it('is idempotent and preserves the reference when nothing changes', () => {
    const already = makeState({
      voiceClipUrl: 'https://cdn/clip.mp3',
      voiceClipSource: NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library,
      // 旧字段还留着也不许覆盖已收敛的值。
      voiceSampleUrl: 'https://cdn/stale.mp3',
    })
    const out = migrateVoiceClip(already)
    expect(out).toBe(already)
    expect(out.nodes[0]?.data.voiceClipUrl).toBe('https://cdn/clip.mp3')
  })

  it('leaves a voice node with no audio at all untouched', () => {
    const empty = makeState({ voiceId: 'voice-123' })
    const out = migrateVoiceClip(empty)
    expect(out).toBe(empty)
    expect(out.nodes[0]?.data.voiceClipUrl).toBeUndefined()
  })

  it('ignores blank-ish legacy values instead of creating an empty clip', () => {
    const out = migrateVoiceClip(makeState({ voiceSampleUrl: '   ' }))
    expect(out.nodes[0]?.data.voiceClipUrl).toBeUndefined()
    expect(out.nodes[0]?.data.voiceClipSource).toBeUndefined()
  })
})
