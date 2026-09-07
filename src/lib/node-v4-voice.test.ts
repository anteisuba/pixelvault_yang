import { describe, expect, it } from 'vitest'

import {
  buildV4VoiceWaveformPath,
  hasV4VoiceIdentity,
  readV4VoiceAudioUrl,
  resolveV4VoiceSlotState,
  resolveV4VoiceStatus,
  showsV4VoiceSynthesisParams,
  V4_VOICE_WAVEFORM,
  v4VoiceWaveformPlayedWidth,
} from '@/lib/node-v4-voice'
import type { NodeV4AudioData } from '@/types/node-workflow'

const NOW = '2026-09-07T00:00:00.000Z'

function audio(patch: Partial<NodeV4AudioData> = {}): NodeV4AudioData {
  return {
    kind: 'audio',
    subtype: 'voice',
    name: '旁白',
    status: 'idle',
    createdAt: NOW,
    ...patch,
  } as NodeV4AudioData
}

describe('音色四态槽', () => {
  it('什么都没有 = 空', () => {
    expect(resolveV4VoiceSlotState(audio())).toBe('empty')
  })

  it('生成中 / 排队 = 上传中档', () => {
    expect(resolveV4VoiceSlotState(audio({ status: 'running' }))).toBe(
      'loading',
    )
    expect(resolveV4VoiceSlotState(audio({ status: 'queued' }))).toBe('loading')
  })

  it('挑了库里的音色但还没音频 = 已绑（不是空）', () => {
    expect(
      resolveV4VoiceSlotState(audio({ voiceProfile: { voiceId: 'v_1' } })),
    ).toBe('bound')
  })

  it('失败压过一切', () => {
    expect(
      resolveV4VoiceSlotState(
        audio({ status: 'failed', url: 'https://cdn/a.mp3' }),
      ),
    ).toBe('failed')
  })

  it('身份判定不看 status', () => {
    expect(hasV4VoiceIdentity(audio({ ownerName: '阿雪' }))).toBe(true)
    expect(hasV4VoiceIdentity(audio())).toBe(false)
  })
})

describe('status 降级', () => {
  it('没有音频时陈旧的 ready 降回 idle', () => {
    expect(resolveV4VoiceStatus(audio({ status: 'ready' }))).toBe('idle')
  })

  it('有音频就是 ready', () => {
    expect(
      resolveV4VoiceStatus(audio({ status: 'idle', url: 'https://cdn/a.mp3' })),
    ).toBe('ready')
  })

  it('failed / running 原样透传', () => {
    expect(resolveV4VoiceStatus(audio({ status: 'failed' }))).toBe('failed')
    expect(resolveV4VoiceStatus(audio({ status: 'running' }))).toBe('running')
  })

  it('发得出去的判据只有 url', () => {
    expect(readV4VoiceAudioUrl(audio({ voiceProfile: { voiceId: 'v' } }))).toBe(
      undefined,
    )
    expect(readV4VoiceAudioUrl(audio({ url: 'https://cdn/a.mp3' }))).toBe(
      'https://cdn/a.mp3',
    )
  })
})

describe('合成参数露出', () => {
  it('只有挑了库里音色才露语速/音量/情绪', () => {
    expect(showsV4VoiceSynthesisParams(audio())).toBe(false)
    expect(
      showsV4VoiceSynthesisParams(audio({ url: 'https://cdn/a.mp3' })),
    ).toBe(false)
    expect(
      showsV4VoiceSynthesisParams(audio({ voiceProfile: { voiceId: 'v_1' } })),
    ).toBe(true)
  })
})

describe('声纹', () => {
  it('路径由 16 个半周期拼成', () => {
    const path = buildV4VoiceWaveformPath()
    expect(path.startsWith('M 0 16')).toBe(true)
    expect(path.split(' Q ')).toHaveLength(V4_VOICE_WAVEFORM.halfPeriods + 1)
  })

  it('进度越界时钳住', () => {
    expect(v4VoiceWaveformPlayedWidth(-1)).toBe(0)
    expect(v4VoiceWaveformPlayedWidth(2)).toBe(V4_VOICE_WAVEFORM.width)
    expect(v4VoiceWaveformPlayedWidth(Number.NaN)).toBe(0)
    expect(v4VoiceWaveformPlayedWidth(0.5)).toBe(V4_VOICE_WAVEFORM.width / 2)
  })
})
