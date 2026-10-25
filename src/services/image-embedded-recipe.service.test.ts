import { crc32, gzipSync } from 'node:zlib'

import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  embeddedRecipeFields,
  readEmbeddedRecipe,
  readPngTextChunks,
} from './image-embedded-recipe.service'

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** 一张 PNG，在 IHDR 后面插进几块 tEXt。 */
async function pngWithText(texts: Record<string, string>): Promise<Buffer> {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#888' },
  })
    .png()
    .toBuffer()
  const ihdrEnd = 8 + 4 + 4 + 13 + 4
  const extra = Object.entries(texts).map(([key, value]) =>
    chunk(
      'tEXt',
      Buffer.concat([
        Buffer.from(key, 'latin1'),
        Buffer.from([0]),
        Buffer.from(value),
      ]),
    ),
  )
  return Buffer.concat([
    png.subarray(0, ihdrEnd),
    ...extra,
    png.subarray(ihdrEnd),
  ])
}

const NAI_COMMENT = JSON.stringify({
  prompt: '1girl, artist:wlop, silver hair',
  steps: 28,
  scale: 5,
  seed: 1234567890,
  sampler: 'k_euler_ancestral',
  uc: 'lowres, bad anatomy',
  v4_prompt: {
    caption: {
      base_caption: '1girl, artist:wlop, silver hair',
      char_captions: [{ char_caption: 'girl, silver hair, red eyes' }],
    },
  },
})

describe('readEmbeddedRecipe', () => {
  it('reads a NovelAI picture: prompt, negative, settings, model and characters', async () => {
    const recipe = await readEmbeddedRecipe(
      await pngWithText({
        Software: 'NovelAI',
        Source: 'NovelAI Diffusion V4.5 4BDE2A90',
        Comment: NAI_COMMENT,
      }),
    )
    expect(recipe).toEqual({
      source: 'novelai',
      prompt: '1girl, artist:wlop, silver hair',
      negative: 'lowres, bad anatomy',
      model: 'NovelAI Diffusion V4.5',
      seed: BigInt(1234567890),
      steps: 28,
      cfg: 5,
      sampler: 'k_euler_ancestral',
      characters: ['girl, silver hair, red eyes'],
    })
  })

  it('reads an A1111 / Forge picture from its parameters text', async () => {
    const recipe = await readEmbeddedRecipe(
      await pngWithText({
        parameters:
          'masterpiece, 1girl, <lora:style_a:0.8>\nsecond line\nNegative prompt: worst quality, lowres\nSteps: 30, Sampler: DPM++ 2M, CFG scale: 6.5, Seed: 42, Size: 832x1216, Model: waiIllustriousSDXL_v150, Lora hashes: "style_a: abc, b: def"',
      }),
    )
    expect(recipe).toMatchObject({
      source: 'a1111',
      prompt: 'masterpiece, 1girl, <lora:style_a:0.8>\nsecond line',
      negative: 'worst quality, lowres',
      model: 'waiIllustriousSDXL_v150',
      seed: BigInt(42),
      steps: 30,
      cfg: 6.5,
      sampler: 'DPM++ 2M',
    })
  })

  it('reads the copy NovelAI hides in the alpha channel when the text chunks are gone', async () => {
    const width = 64
    const height = 64
    const payload = gzipSync(
      Buffer.from(
        JSON.stringify({
          Source: 'NovelAI Diffusion V4.5 4BDE2A90',
          Comment: NAI_COMMENT,
        }),
      ),
    )
    const bits: number[] = []
    const pushBytes = (bytes: Buffer) => {
      for (const byte of bytes)
        for (let bit = 7; bit >= 0; bit -= 1) bits.push((byte >> bit) & 1)
    }
    pushBytes(Buffer.from('stealth_pngcomp', 'latin1'))
    const length = payload.length * 8
    for (let bit = 31; bit >= 0; bit -= 1)
      bits.push(Math.floor(length / 2 ** bit) % 2)
    pushBytes(payload)
    expect(bits.length).toBeLessThan(width * height)
    const raw = Buffer.alloc(width * height * 4, 200)
    // 按列写：第 i 位落在 (x = i / height, y = i % height)。
    for (let i = 0; i < width * height; i += 1) {
      const x = Math.floor(i / height)
      const y = i % height
      raw[(y * width + x) * 4 + 3] = 254 | (bits[i] ?? 0)
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer()
    expect(readPngTextChunks(png).size).toBe(0)

    const recipe = await readEmbeddedRecipe(png)
    expect(recipe?.source).toBe('novelai')
    expect(recipe?.prompt).toBe('1girl, artist:wlop, silver hair')
    expect(recipe?.model).toBe('NovelAI Diffusion V4.5')
  })

  it('returns null for a screenshot, a JPEG or a broken file instead of throwing', async () => {
    expect(await readEmbeddedRecipe(await pngWithText({}))).toBeNull()
    const jpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#888' },
    })
      .jpeg()
      .toBuffer()
    expect(await readEmbeddedRecipe(jpeg)).toBeNull()
    expect(
      await readEmbeddedRecipe(await pngWithText({ Comment: '{not json' })),
    ).toBeNull()
  })
})

describe('embeddedRecipeFields', () => {
  it('puts the recipe where the asset viewer and the assistant read it', () => {
    expect(
      embeddedRecipeFields({
        source: 'novelai',
        prompt: 'p',
        negative: 'n',
        model: 'NovelAI Diffusion V4.5',
        seed: BigInt(7),
        steps: 28,
        cfg: 5,
        sampler: 'k_euler',
        characters: ['c1'],
      }),
    ).toEqual({
      prompt: 'p',
      negativePrompt: 'n',
      seed: BigInt(7),
      snapshot: {
        advancedParams: {
          steps: 28,
          guidanceScale: 5,
          runnerSampler: 'k_euler',
        },
        embeddedRecipe: {
          source: 'novelai',
          model: 'NovelAI Diffusion V4.5',
          characters: ['c1'],
        },
      },
    })
  })
})
