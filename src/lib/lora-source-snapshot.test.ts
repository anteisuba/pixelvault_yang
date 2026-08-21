import { describe, expect, it } from 'vitest'

import {
  buildHuggingFaceSourceSnapshot,
  dedupeLoraStrings,
  gradeLoraMetadataCompleteness,
  huggingFaceAuthor,
  resolveLoraFamily,
} from '@/lib/lora-source-snapshot'
import type { HuggingFaceLoraSearchItem } from '@/types'

/**
 * 来源快照的唯一构造点（策略 C）。两个入口共用它：助手推荐卡的导入链（服务端）
 * 与库 modal 的「使用」（浏览器）。这里盯的是**不许猜、不许省略**：
 * 取不到就写 null，别为了「填满」编一个。
 */

function hfItem(
  overrides: Partial<HuggingFaceLoraSearchItem> = {},
): HuggingFaceLoraSearchItem {
  return {
    repoId: 'ostris/ikea-instructions-lora-sdxl',
    name: 'IKEA Instructions',
    modelPageUrl: 'https://huggingface.co/ostris/ikea-instructions-lora-sdxl',
    revision: 'a1b2c3d4e5f6',
    files: [
      {
        filename: 'small.safetensors',
        downloadUrl: 'https://huggingface.co/x/resolve/main/small.safetensors',
        sizeBytes: 1_000,
        baseModelFamily: 'SDXL',
      },
      {
        filename: 'big.safetensors',
        downloadUrl: 'https://huggingface.co/x/resolve/main/big.safetensors',
        sizeBytes: 171_000_000,
        baseModelFamily: 'SDXL',
      },
    ],
    triggerWord: 'ikea instructions, manual style, ikea instructions',
    type: 'style',
    baseModelFamily: 'SDXL',
    coverImageUrl: 'https://huggingface.co/cover.png',
    tags: [],
    downloads: 10,
    likes: 3,
    license: 'creativeml-openrail-m',
    gated: false,
    private: false,
    ...overrides,
  }
}

const RETRIEVED_AT = '2026-08-21T10:00:00.000Z'

describe('buildHuggingFaceSourceSnapshot', () => {
  it('作者从 repoId 前缀切，revision 是 commit sha，时间戳原样带过', () => {
    const item = hfItem()
    const snapshot = buildHuggingFaceSourceSnapshot({
      item,
      file: item.files[0],
      retrievedAt: RETRIEVED_AT,
    })

    expect(snapshot.source).toBe('huggingface')
    expect(snapshot.author).toBe('ostris')
    expect(snapshot.revision).toBe('a1b2c3d4e5f6')
    expect(snapshot.retrievedAt).toBe(RETRIEVED_AT)
    expect(snapshot.pageUrl).toBe(item.modelPageUrl)
  })

  it('⚠ 体积跟着**选中的那个文件**走，不是恒取 files[0]', () => {
    const item = hfItem()
    const snapshot = buildHuggingFaceSourceSnapshot({
      item,
      file: item.files[1],
      retrievedAt: RETRIEVED_AT,
    })

    expect(snapshot.fileSizeBytes).toBe(171_000_000)
  })

  it('repoId 没有命名空间段 = 取不到作者，写 null 而不是编一个', () => {
    const item = hfItem({ repoId: 'sdxl-lora' })
    const snapshot = buildHuggingFaceSourceSnapshot({
      item,
      file: item.files[0],
      retrievedAt: RETRIEVED_AT,
    })

    expect(snapshot.author).toBeNull()
  })

  it('HF 没有逐项权限位 —— 三格恒 null，known 只看 label 有没有', () => {
    const item = hfItem({ license: null })
    const snapshot = buildHuggingFaceSourceSnapshot({
      item,
      file: item.files[0],
      retrievedAt: RETRIEVED_AT,
    })

    expect(snapshot.license).toEqual({
      label: null,
      commercialUse: null,
      allowDerivatives: null,
      allowNoCredit: null,
      known: false,
    })
  })

  it('六个信号全在 = complete；缺得多就如实降档', () => {
    const complete = hfItem()
    expect(
      buildHuggingFaceSourceSnapshot({
        item: complete,
        file: complete.files[0],
        retrievedAt: RETRIEVED_AT,
      }).metadataCompleteness,
    ).toBe('complete')

    // 作者 / 许可 / 家族 / 触发词 / 体积 / 样图 —— 只剩触发词一个。
    const sparse = hfItem({
      repoId: 'nameless',
      license: null,
      coverImageUrl: null,
      files: [
        {
          filename: 'w.safetensors',
          downloadUrl: 'https://huggingface.co/x/resolve/main/w.safetensors',
          sizeBytes: null,
          baseModelFamily: 'other',
        },
      ],
    })
    expect(
      buildHuggingFaceSourceSnapshot({
        item: sparse,
        file: sparse.files[0],
        retrievedAt: RETRIEVED_AT,
      }).metadataCompleteness,
    ).toBe('minimal')
  })
})

describe('resolveLoraFamily', () => {
  it('哨兵值不是家族名 —— unknown / other 一律判 null', () => {
    expect(resolveLoraFamily('unknown')).toBeNull()
    expect(resolveLoraFamily('Other')).toBeNull()
    expect(resolveLoraFamily('  ')).toBeNull()
    expect(resolveLoraFamily(null)).toBeNull()
    expect(resolveLoraFamily(' SDXL ')).toBe('SDXL')
  })
})

describe('dedupeLoraStrings / gradeLoraMetadataCompleteness', () => {
  it('触发词去重去空白，保序', () => {
    expect(dedupeLoraStrings([' a ', 'b', 'a', '', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('三个信号就到 partial（门槛定得高，partial 是常态不是缺陷标签）', () => {
    expect(
      gradeLoraMetadataCompleteness({
        author: 'someone',
        license: {
          label: null,
          commercialUse: null,
          allowDerivatives: null,
          allowNoCredit: null,
          known: false,
        },
        baseModelFamily: 'SDXL',
        triggerWords: ['x'],
        fileSizeBytes: null,
        sampleImageUrls: [],
      }),
    ).toBe('partial')
  })
})

describe('huggingFaceAuthor', () => {
  it('只认命名空间段', () => {
    expect(huggingFaceAuthor('org/repo')).toBe('org')
    expect(huggingFaceAuthor('repo')).toBeNull()
    expect(huggingFaceAuthor('/repo')).toBeNull()
  })
})
