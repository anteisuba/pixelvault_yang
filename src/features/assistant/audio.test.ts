import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/kernel/assistant-v3-bench.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-steps.service', () => ({
  TITLE_TEXT: {},
}))
const findVoiceCards = vi.fn()
const findCharacters = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    voiceCard: { findMany: (...args: unknown[]) => findVoiceCards(...args) },
    characterCard: {
      findMany: (...args: unknown[]) => findCharacters(...args),
    },
  },
}))

import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'
import type { AssistantOperatorSnapshotAudio } from '@/types/assistant-operator'

import { loadAudioVoices, renderAudioBench, toAudioPatch } from './audio'

const AUDIO: AssistantOperatorSnapshotAudio = {
  kind: 'speech',
  models: [
    { id: 'workspace:fish-s1', label: 'Fish S1', kind: 'speech' },
    { id: 'workspace:sfx-v2', label: 'Sound FX', kind: 'sfx' },
    { id: 'workspace:music-1', label: 'Music One', kind: 'music' },
  ],
  voice: { cardId: null, voiceId: null },
  speakerVoiceIds: [],
  pronunciationDictionary: {},
  reference: null,
  style: 'none',
  expressiveness: 'auto',
  pace: 'normal',
  pauseMarkers: [],
  sfxDurationSeconds: 5,
  musicDurationSeconds: 30,
  sfxLoop: false,
  sfxVariantCount: 1,
  volume: 0,
  temperature: 0.7,
  topP: 0.7,
  format: 'mp3',
}

function contextWith(
  audio: Partial<AssistantOperatorSnapshotAudio> = {},
): V3Context {
  return {
    language: 'chinese',
    prepared: {
      user: { id: 'user-1' },
      run: {
        state: {
          prompt: '你好',
          modelId: 'workspace:fish-s1',
          audio: { ...AUDIO, ...audio },
        },
      },
    },
  } as unknown as V3Context
}

beforeEach(() => {
  findVoiceCards.mockResolvedValue([
    {
      id: 'card-malfoy',
      name: 'Malfoy',
      voiceId: 'voice-malfoy',
      modelId: 'fish-s1',
      pace: 'slow',
      pronunciationDictionary: { Draco: 'DRAY-koh' },
    },
    {
      id: 'card-clone',
      name: 'Clone only',
      voiceId: null,
      modelId: null,
      pace: 'normal',
      pronunciationDictionary: null,
    },
  ])
  findCharacters.mockResolvedValue([
    { name: '德拉科', voiceCardId: 'card-malfoy' },
  ])
})

describe('配音台的一条改动 → set_audio', () => {
  it('角色名认她绑的那张卡：音色、语速、发音表一起跟上', async () => {
    const context = contextWith()
    await loadAudioVoices(context)
    expect(
      toAudioPatch(context, { op: 'voice', voice: '角色·德拉科' }),
    ).toEqual({
      ok: true,
      value: {
        voice: { cardId: 'card-malfoy', voiceId: 'voice-malfoy' },
        pronunciationDictionary: { Draco: 'DRAY-koh' },
        pace: 'slow',
      },
    })
  })

  it('在音效档点音色：切回念台词；"none" 清掉音色', async () => {
    const context = contextWith({ kind: 'sfx' })
    await loadAudioVoices(context)
    const picked = toAudioPatch(context, { op: 'voice', voice: 'malfoy' })
    expect(picked.ok && picked.value.kind).toBe('speech')
    expect(toAudioPatch(context, { op: 'voice', voice: 'none' })).toEqual({
      ok: true,
      value: { voice: { cardId: null, voiceId: null } },
    })
  })

  it('不在库里的名字回一句说明（⛔ 不编 id）', async () => {
    const context = contextWith()
    await loadAudioVoices(context)
    const result = toAudioPatch(context, { op: 'voice', voice: 'Hermione' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('No voice called')
  })

  it('多人对话：只有克隆片段的卡不能当说话人', async () => {
    const context = contextWith()
    await loadAudioVoices(context)
    expect(
      toAudioPatch(context, { op: 'speakers', voices: ['Malfoy'] }),
    ).toEqual({ ok: true, value: { speakerVoiceIds: ['voice-malfoy'] } })
    expect(
      toAudioPatch(context, { op: 'speakers', voices: ['Clone only'] }).ok,
    ).toBe(false)
  })

  it('换档：模型跟着换到那一档的第一个', () => {
    expect(
      toAudioPatch(contextWith(), { op: 'audio_kind', value: 'music' }),
    ).toEqual({
      ok: true,
      value: { kind: 'music', optionId: 'workspace:music-1' },
    })
  })

  it('换模型：别档的模型顺手换档', () => {
    expect(
      toAudioPatch(contextWith(), { op: 'model', model: 'Sound FX' }),
    ).toEqual({
      ok: true,
      value: { optionId: 'workspace:sfx-v2', kind: 'sfx' },
    })
  })

  it('时长：音效按步长取整、音乐越界拒；念台词没有时长', () => {
    const sfx = toAudioPatch(contextWith({ kind: 'sfx' }), {
      op: 'duration',
      duration: 3.26,
    })
    expect(sfx.ok && sfx.value.sfxDurationSeconds).toBe(3.5)
    expect(
      toAudioPatch(contextWith({ kind: 'music' }), {
        op: 'duration',
        duration: 9999,
      }).ok,
    ).toBe(false)
    expect(
      toAudioPatch(contextWith(), { op: 'duration', duration: 4 }).ok,
    ).toBe(false)
  })

  it('怎么念：只带给了的那几格；一格都没给就拒', () => {
    expect(
      toAudioPatch(contextWith(), { op: 'reading', pace: 'fast' }),
    ).toEqual({ ok: true, value: { pace: 'fast' } })
    expect(toAudioPatch(contextWith(), { op: 'reading' }).ok).toBe(false)
  })

  it('高级参数：认得的键落一格，不认得的说清有哪些', () => {
    expect(
      toAudioPatch(contextWith(), { op: 'option', key: 'loop', value: true }),
    ).toEqual({ ok: true, value: { sfxLoop: true } })
    const bad = toAudioPatch(contextWith(), {
      op: 'option',
      key: 'speed',
      value: 2,
    })
    expect(!bad.ok && bad.error).toContain('loop, variants')
  })

  it('别台的改法在配音台上回一句说明', () => {
    const result = toAudioPatch(contextWith(), { op: 'count', count: 2 })
    expect(!result.ok && result.error).toContain('not a control on the audio')
  })
})

describe('配音台板子', () => {
  it('写出音色库与有声音的角色，出声一律确认卡', async () => {
    const context = contextWith()
    await loadAudioVoices(context)
    const bench = renderAudioBench(context, [], '')
    expect(bench).toContain('Malfoy')
    expect(bench).toContain('德拉科')
    expect(bench).toContain('confirm card')
  })
})
