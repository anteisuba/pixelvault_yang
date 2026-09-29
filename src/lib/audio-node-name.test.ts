import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  chooseVoiceOps,
  isAutoAudioNodeName,
  renameForVoice,
  voiceTakeNodeName,
} from '@/lib/audio-node-name'

const card = (
  id: string,
  name?: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  data: { ...(name === undefined ? {} : { name }), ...extra },
})

describe('音频卡按音色起名（「音色名 · 语音 N」）', () => {
  it('机器起的名字才换：默认名 · 旧「音频_数字」· 上一次按音色起的', () => {
    expect(isAutoAudioNodeName(undefined)).toBe(true)
    expect(isAutoAudioNodeName('语音')).toBe(true)
    expect(isAutoAudioNodeName('语音3')).toBe(true)
    expect(isAutoAudioNodeName('环境音2')).toBe(true)
    expect(isAutoAudioNodeName('音频_554')).toBe(true)
    expect(isAutoAudioNodeName('秧秧 · 语音 2')).toBe(true)
    expect(isAutoAudioNodeName('开场旁白')).toBe(false)
  })

  it('N 取最小的空号，从 1 起', () => {
    expect(voiceTakeNodeName('弗洛洛', new Set())).toBe('弗洛洛 · 语音 1')
    expect(
      voiceTakeNodeName(
        '弗洛洛',
        new Set(['弗洛洛 · 语音 1', '弗洛洛 · 语音 3']),
      ),
    ).toBe('弗洛洛 · 语音 2')
  })

  it('你起的名字 ⛔ 改；别的卡 @ 着它 ⛔ 改；已经是这副嗓子 ⛔ 改', () => {
    expect(renameForVoice(card('a', '开场旁白'), '弗洛洛', [])).toBeUndefined()
    expect(
      renameForVoice(card('a', '音频_554'), '弗洛洛', [
        card('v', '镜头', { prompt: '让 @音频_554 念这一句' }),
      ]),
    ).toBeUndefined()
    expect(
      renameForVoice(card('a', '弗洛洛 · 语音 2'), '弗洛洛', []),
    ).toBeUndefined()
    expect(
      renameForVoice(card('a', '音频_554'), '弗洛洛', [
        card('b', '弗洛洛 · 语音 1'),
      ]),
    ).toBe('弗洛洛 · 语音 2')
  })

  it('选音色 = 一批两条（写音色 + 改名），一次撤销', () => {
    expect(
      chooseVoiceOps(
        card('a', '语音3'),
        { voiceId: 'v1', voiceName: '秧秧' },
        [],
      ),
    ).toEqual([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
        target: 'a',
        profile: { voiceId: 'v1', voiceName: '秧秧' },
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setField,
        target: 'a',
        field: 'name',
        value: '秧秧 · 语音 1',
      },
    ])
    expect(
      chooseVoiceOps(
        card('a', '开场旁白'),
        { voiceId: 'v1', voiceName: '秧秧' },
        [],
      ),
    ).toHaveLength(1)
  })
})
