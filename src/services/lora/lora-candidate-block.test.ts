import { describe, expect, it } from 'vitest'

import { buildLoraCandidateBlock } from '@/services/lora/lora-candidate-block'
import type { LoraCandidate } from '@/types/lora-candidate'

function candidate(overrides: Partial<LoraCandidate> = {}): LoraCandidate {
  return {
    candidateId: 'civitai:122359:135867',
    source: 'civitai',
    name: 'Changli Wuthering Waves',
    author: 'someauthor',
    license: {
      label: null,
      commercialUse: ['Image', 'Rent'],
      allowDerivatives: true,
      allowNoCredit: false,
      known: true,
    },
    baseModelFamily: 'Illustrious',
    type: 'subject',
    triggerWords: [
      'changli',
      'changli casual',
      'changli battle',
      'changli 4th',
    ],
    sampleImageUrls: [
      'https://image.civitai.com/p1.jpeg',
      'https://image.civitai.com/p2.jpeg',
    ],
    fileSizeBytes: 57_420_828,
    pageUrl: 'https://civitai.com/models/122359?modelVersionId=135867',
    downloads: 4200,
    metadataCompleteness: 'complete',
    importable: true,
    alreadyMounted: false,
    alreadyImported: false,
    importPayload: null,
    ...overrides,
  }
}

describe('buildLoraCandidateBlock', () => {
  it('没有候选就不塞空壳', () => {
    expect(buildLoraCandidateBlock([], 'changli')).toBe('')
  })

  it('⛔ 样图 URL 与下载链接不进提示词 —— 那些字段客户端直接从候选对象渲染', () => {
    const block = buildLoraCandidateBlock([candidate()], 'changli')

    expect(block).not.toContain('image.civitai.com')
    expect(block).not.toContain('civitai.com/api/download')
    // id、名字、作者、家族、触发词、许可、类型 —— 模型判断得上的才喂。
    expect(block).toContain('civitai:122359:135867')
    expect(block).toContain('by someauthor')
    expect(block).toContain('base model: Illustrious')
  })

  it('触发词按上限截断 —— 多 outfit 的 LoRA 一条能有十几个', () => {
    const block = buildLoraCandidateBlock([candidate()], 'changli')
    expect(block).toContain(
      'trigger words: changli, changli casual, changli battle',
    )
    expect(block).not.toContain('changli 4th')
  })

  it('Civitai 没有许可名时如实说是「作者权限声明」，不冒充 licence name', () => {
    const block = buildLoraCandidateBlock([candidate()], 'changli')
    expect(block).toContain('no licence name upstream')
    expect(block).toContain('commercial use: Image, Rent')
    expect(block).toContain('derivatives: allowed')
    expect(block).toContain('credit: required')
  })

  it('⚠ 许可未知时必须写出 unknown —— 省略会被读成「没有限制」', () => {
    const block = buildLoraCandidateBlock(
      [
        candidate({
          license: {
            label: null,
            commercialUse: null,
            allowDerivatives: null,
            allowNoCredit: null,
            known: false,
          },
        }),
      ],
      'changli',
    )
    expect(block).toContain('licence: unknown')
  })

  it('已挂载的点名说出来 —— 推荐一个他正挂着的最刺眼', () => {
    const block = buildLoraCandidateBlock(
      [candidate({ alreadyMounted: true })],
      'changli',
    )
    expect(block).toContain('ALREADY MOUNTED')
  })

  it('不可导入的照样列出来，带原因码（策略 C：不阻断，如实说明）', () => {
    const block = buildLoraCandidateBlock(
      [
        candidate({
          baseModelFamily: null,
          importable: false,
          notImportableReason: 'unknown_base_model',
        }),
      ],
      'changli',
    )
    expect(block).toContain('CANNOT BE IMPORTED (unknown_base_model)')
    expect(block).toContain('base model: could not be determined')
  })

  it('没有触发词时明说 none published，不留空', () => {
    const block = buildLoraCandidateBlock(
      [candidate({ triggerWords: [] })],
      'changli',
    )
    expect(block).toContain('trigger words: none published')
  })
})
