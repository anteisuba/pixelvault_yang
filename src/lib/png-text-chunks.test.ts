import { inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  isPng,
  readPngTextChunks,
  stripPngTextChunks,
} from '@/lib/png-text-chunks'
import { extractTavernCardJson } from '@/lib/tavern-card'
import { iTXt, png, tEXt, zTXt } from '@/test/png-fixture'

const inflate = (data: Uint8Array) => new Uint8Array(inflateSync(data))

describe('readPngTextChunks', () => {
  it('不是 PNG 是空', () => {
    expect(isPng(new Uint8Array([1, 2, 3]))).toBe(false)
    expect(readPngTextChunks(new Uint8Array([1, 2, 3]))).toEqual([])
  })

  it('tEXt：latin1 按 latin1 读，直接塞进去的 UTF-8 按 UTF-8 读', () => {
    const bytes = png(
      tEXt('Title', 'café'),
      tEXt('parameters', '雨夜, 1girl', 'utf8'),
    )
    expect(readPngTextChunks(bytes)).toEqual([
      { keyword: 'Title', text: 'café' },
      { keyword: 'parameters', text: '雨夜, 1girl' },
    ])
  })

  it('iTXt：不压缩直接读，压缩的要给解压', () => {
    const bytes = png(
      iTXt('plain', '时夜'),
      iTXt('packed', '压缩的正文', { compressed: true }),
    )
    expect(readPngTextChunks(bytes, inflate)).toEqual([
      { keyword: 'plain', text: '时夜' },
      { keyword: 'packed', text: '压缩的正文' },
    ])
  })

  it('zTXt 要给解压', () => {
    expect(readPngTextChunks(png(zTXt('prompt', '{"1":{}}')), inflate)).toEqual(
      [{ keyword: 'prompt', text: '{"1":{}}' }],
    )
  })

  it('没给解压就跳过压缩的块，其余照读', () => {
    const bytes = png(
      zTXt('prompt', '{}'),
      iTXt('packed', 'x', { compressed: true }),
      tEXt('Software', 'NovelAI'),
    )
    expect(readPngTextChunks(bytes)).toEqual([
      { keyword: 'Software', text: 'NovelAI' },
    ])
  })

  it('解不开的压缩块跳过', () => {
    const broken = () => {
      throw new Error('bad zlib')
    }
    expect(readPngTextChunks(png(zTXt('prompt', '{}')), broken)).toEqual([])
  })
})

describe('stripPngTextChunks', () => {
  it('去掉文本块，图像块原样保留', () => {
    const bytes = png(
      tEXt('chara', Buffer.from('{"name":"x"}').toString('base64')),
      iTXt('parameters', 'a'),
    )
    const stripped = stripPngTextChunks(bytes)
    expect(extractTavernCardJson(stripped)).toBeNull()
    expect(readPngTextChunks(stripped)).toEqual([])
    expect(stripped).toEqual(png())
  })
})
