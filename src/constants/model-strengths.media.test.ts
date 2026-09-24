import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AUDIO_MODEL_OPTIONS } from '@/constants/models/audio'
import { VIDEO_MODEL_OPTIONS } from '@/constants/models/video'
import {
  MEDIA_MODEL_STRENGTHS,
  SEEDANCE_20_MODEL_IDS,
  SEEDANCE_25_MODEL_IDS,
  getSeedanceControlRules,
} from '@/constants/model-strengths.media'
import {
  SEEDANCE_20_CONTROL_RULES,
  SEEDANCE_25_CONTROL_RULES,
} from '@/constants/seedance-prompt-plan'

/** 一条 hint 是给系统提示词用的，不是一篇文档。 */
const MAX_HINT_LENGTH = 900

const hintOf = (modelId: string): string => {
  const hint = MEDIA_MODEL_STRENGTHS[modelId as AI_MODELS]?.enhanceHint
  expect(hint, `${modelId} 缺方言说明`).toBeTruthy()
  return hint as string
}

/**
 * ⭐ 名册以目录为准，不以这张表为准。
 *
 * 漏一个模型的表现是「助手对着它写通用散文」，看不出错也看不出对 —— 只有从
 * `VIDEO_MODEL_OPTIONS` / `AUDIO_MODEL_OPTIONS` 反查才抓得到。加模型时这里先红。
 */
describe('目录里每个视频 / 音频模型都有方言说明', () => {
  it.each(VIDEO_MODEL_OPTIONS.map((model) => model.id))(
    '视频模型 %s',
    (modelId) => {
      const hint = hintOf(modelId)
      expect(hint.trim().length).toBeGreaterThan(0)
      expect(hint.length).toBeLessThanOrEqual(MAX_HINT_LENGTH)
    },
  )

  it.each(AUDIO_MODEL_OPTIONS.map((model) => model.id))(
    '音频模型 %s',
    (modelId) => {
      const hint = hintOf(modelId)
      expect(hint.trim().length).toBeGreaterThan(0)
      expect(hint.length).toBeLessThanOrEqual(MAX_HINT_LENGTH)
    },
  )

  it('这张表只管视频和音频，不越界收图片模型', () => {
    const mediaIds = new Set<string>([
      ...VIDEO_MODEL_OPTIONS.map((model) => model.id),
      ...AUDIO_MODEL_OPTIONS.map((model) => model.id),
    ])
    for (const modelId of Object.keys(MEDIA_MODEL_STRENGTHS)) {
      expect(mediaIds.has(modelId), `${modelId} 不是视频 / 音频模型`).toBe(true)
    }
  })
})

/**
 * ⭐ 2.0 与 2.5 的**唯一致命差异**：2.0 只认「镜头N」，2.5 才认整数秒时间戳。
 * owner 09-24 定「两个都写」（镜头1（0-3秒））：2.0 靠标签切、秒数给人看；
 * 只写秒数不写标签在 2.0 上会静默塌成一个镜头 —— 所以标签这条单独锁。
 */
describe('Seedance 分段方言：2.0 认镜头号，2.5 认时间戳', () => {
  it.each([...SEEDANCE_20_MODEL_IDS])(
    '%s 靠镜头号切，秒数只给人看',
    (modelId) => {
      const hint = hintOf(modelId)
      expect(hint).toContain('镜头1（0-3秒）')
      expect(hint).toContain('ignores the seconds')
      expect(hint.toLowerCase()).not.toContain('timestamp')
    },
  )

  it.each([...SEEDANCE_25_MODEL_IDS])('%s 说时间戳', (modelId) => {
    const hint = hintOf(modelId)
    expect(hint.toLowerCase()).toContain('timestamp')
  })

  it('素材写法按渠道：fal 写 @Image1，火山 / BytePlus 写 图片1；段名不进【】', () => {
    for (const modelId of [
      AI_MODELS.SEEDANCE_20,
      AI_MODELS.SEEDANCE_20_REFERENCE,
      AI_MODELS.SEEDANCE_25,
    ]) {
      expect(hintOf(modelId)).toContain('@Image1')
    }
    for (const modelId of [
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
      AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS,
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
    ]) {
      expect(hintOf(modelId)).toContain('将图片1中')
      expect(hintOf(modelId)).not.toContain('@Image1')
    }
    for (const modelId of SEEDANCE_20_MODEL_IDS) {
      expect(hintOf(modelId)).toContain('全局设定：')
      expect(MEDIA_MODEL_STRENGTHS[modelId as AI_MODELS]?.negativePrompt).toBe(
        'unsupported',
      )
    }
  })

  it('两代名册不重叠，且控制规则各归各家', () => {
    for (const modelId of SEEDANCE_20_MODEL_IDS) {
      expect(SEEDANCE_25_MODEL_IDS.has(modelId)).toBe(false)
      expect(getSeedanceControlRules(modelId)).toBe(SEEDANCE_20_CONTROL_RULES)
    }
    for (const modelId of SEEDANCE_25_MODEL_IDS) {
      expect(getSeedanceControlRules(modelId)).toBe(SEEDANCE_25_CONTROL_RULES)
    }
    expect(getSeedanceControlRules(AI_MODELS.KLING_V3_PRO)).toBeNull()
  })

  it('两份控制规则都带素材分工契约，且已知失败写成「写出该有的」而不是负面词', () => {
    for (const rules of [
      SEEDANCE_20_CONTROL_RULES,
      SEEDANCE_25_CONTROL_RULES,
    ]) {
      expect(rules).toContain('REFERENCE ASSET CONTRACT')
      expect(rules).toContain('空气波纹')
      expect(rules).toContain('冻结姿势')
      expect(rules).toContain('字幕')
      expect(rules).not.toContain('belong in the negative prompt')
    }
    // 分段方言的差异也活在控制规则里，不只活在 hint 里。
    expect(SEEDANCE_20_CONTROL_RULES).toContain('镜头1')
    expect(SEEDANCE_25_CONTROL_RULES).toContain('0-6s')
  })
})

/**
 * 逐家模型那条「写错就白跑」的规矩。每条都对应调研里的一处官方文档。
 */
describe('各家模型的关键语法', () => {
  it('Kling 的多镜头写在一条提示词里，编号是 Shot 1；没有固定顺序；负面栏只有 V3', () => {
    for (const modelId of [AI_MODELS.KLING_V3_PRO, AI_MODELS.KLING_O3_PRO]) {
      const hint = hintOf(modelId)
      expect(hint).toContain('Shot 1')
      expect(hint).toContain('2500')
      expect(hint).toContain('no fixed order')
    }
    expect(MEDIA_MODEL_STRENGTHS[AI_MODELS.KLING_V3_PRO]?.negativePrompt).toBe(
      'supported',
    )
    expect(MEDIA_MODEL_STRENGTHS[AI_MODELS.KLING_O3_PRO]?.negativePrompt).toBe(
      'unsupported',
    )
  })

  it("Veo 的 negative 只写名词（写 no / don't 会把它召唤出来）", () => {
    const hint = hintOf(AI_MODELS.VEO_31)
    expect(hint).toContain('nouns')
    expect(MEDIA_MODEL_STRENGTHS[AI_MODELS.VEO_31]?.negativePrompt).toBe(
      'nouns-only',
    )
  })

  it('Wan：镜头标签自带秒区间、没有负面栏（写负向清单）、不写就自己加台词配乐', () => {
    for (const modelId of [AI_MODELS.WAN_30, AI_MODELS.WAN_30_REFERENCE]) {
      const hint = hintOf(modelId)
      expect(hint).toContain('第1个镜头[0-3秒]')
      expect(hint).toContain('负向清单')
      expect(hint).toContain('无台词')
      expect(hint).toContain('enable_prompt_expansion')
      expect(hint).toContain('音色参考音频1')
      expect(MEDIA_MODEL_STRENGTHS[modelId]?.negativePrompt).toBe('unsupported')
    }
  })

  it('MiniMax H3：官方三段英文 + [Shot 2] At 时间 + (S1)<d>；没有 prompt_optimizer', () => {
    for (const modelId of [
      AI_MODELS.MINIMAX_H3,
      AI_MODELS.MINIMAX_H3_REFERENCE,
      AI_MODELS.MINIMAX_H3_CN,
      AI_MODELS.MINIMAX_H3_REFERENCE_CN,
    ]) {
      const hint = hintOf(modelId)
      expect(hint).toContain('overall_soundscape')
      expect(hint).toContain('[Shot 2] At 00:03.000')
      expect(hint).toContain('(S1)')
      expect(hint).toContain('Image 1')
      expect(hint).not.toContain('prompt_optimizer')
    }
  })

  it('Gemini Omni：参考图从 0 起编号，单镜头要明写', () => {
    const hint = hintOf(AI_MODELS.GEMINI_OMNI_FLASH)
    expect(hint).toContain('<IMAGE_REF_0>')
    expect(hint).toContain('No scene cuts')
  })

  it('LTX 是散文不是 tag，且有 200 词上限', () => {
    const hint = hintOf(AI_MODELS.LTX_23)
    expect(hint).toContain('200 words')
    expect(hint).toContain('One flowing English paragraph')
  })

  it('Fish 用方括号情绪 cue，且多说话人是 S2 独有', () => {
    for (const modelId of [
      AI_MODELS.FISH_AUDIO_S2_PRO,
      AI_MODELS.FISH_AUDIO_S2_PRO_FREE,
    ]) {
      const hint = hintOf(modelId)
      expect(hint).toContain('[')
      expect(hint).toContain('<|speaker:0|>')
    }
  })

  it('ElevenLabs v3 明说不支持 SSML（不然助手会去写 <break>）', () => {
    const hint = hintOf(AI_MODELS.ELEVENLABS_V3)
    expect(hint).toContain('SSML')
    expect(hint).toContain('[whispers]')
  })

  it('ElevenLabs SFX 的时长闸是 0.5-30 秒', () => {
    expect(hintOf(AI_MODELS.ELEVENLABS_SFX_V2)).toContain('0.5-30')
  })

  it('ElevenLabs Music 的 prompt 与 composition_plan 互斥', () => {
    expect(hintOf(AI_MODELS.ELEVENLABS_MUSIC_V2)).toContain(
      'mutually exclusive',
    )
  })

  it('HappyHorse 短写、脸手易走样，没有负面栏', () => {
    const hint = hintOf(AI_MODELS.HAPPYHORSE_10)
    expect(hint).toContain('20–60 words')
    expect(hint).toContain('no negative field')
  })
})
