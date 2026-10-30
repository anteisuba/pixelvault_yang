// @vitest-environment node
import sharp from 'sharp'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { fetchAsBuffer, uploadToR2 } = vi.hoisted(() => ({
  fetchAsBuffer: vi.fn(),
  uploadToR2: vi.fn(
    async ({ key }: { key: string }) => `https://cdn.example.com/${key}`,
  ),
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer,
  uploadToR2,
  isOwnedStorageUrl: (url: string) =>
    new URL(url).hostname === 'cdn.example.com',
}))

import { buildScreenSheet, isScreenThumbAllowed } from './screen.service'

let red: Buffer
beforeAll(async () => {
  red = await sharp({
    create: {
      width: 60,
      height: 80,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer()
})

beforeEach(() => {
  fetchAsBuffer.mockReset()
  uploadToR2.mockClear()
})

describe('看屏：缩略图从哪拿（10-30）', () => {
  it('只认白名单里的图床', () => {
    expect(isScreenThumbAllowed('https://cdn.example.com/a.jpg')).toBe(true)
    expect(isScreenThumbAllowed('https://image.civitai.com/x/y.jpeg')).toBe(
      true,
    )
    expect(isScreenThumbAllowed('https://avatars.charhub.io/a/b.webp')).toBe(
      true,
    )
    expect(isScreenThumbAllowed('https://cdn.donmai.us/x.jpg')).toBe(true)
    expect(isScreenThumbAllowed('https://evil.example.org/a.jpg')).toBe(false)
    expect(isScreenThumbAllowed('http://169.254.169.254/latest')).toBe(false)
    expect(isScreenThumbAllowed('not a url')).toBe(false)
  })
})

describe('看屏：拼小样图（10-30）', () => {
  it('库没开：说去读台', async () => {
    const sheet = await buildScreenSheet({ userId: 'u1', view: undefined })
    expect(sheet.picture).toBeNull()
    expect(sheet.text).toContain('no library is open')
  })

  it('没图的库（音色、提示词）：只给按位置编号的名单', async () => {
    const sheet = await buildScreenSheet({
      userId: 'u1',
      view: {
        library: 'voices',
        screen: { kind: 'voice', visible: ['Aemeath', 'Denia'] },
      },
    })
    expect(sheet.picture).toBeNull()
    expect(sheet.text).toContain('1 = 音色·Aemeath · 2 = 音色·Denia')
    expect(fetchAsBuffer).not.toHaveBeenCalled()
  })

  it('照屏上位置拼成一张，标号对上名单；下不来 / 不在白名单的点名不画', async () => {
    fetchAsBuffer.mockImplementation(async (url: string) => {
      if (url.includes('broken')) throw new Error('404')
      return { buffer: red, mimeType: 'image/png' }
    })
    const sheet = await buildScreenSheet({
      userId: 'u1',
      view: {
        library: 'gallery',
        screen: {
          kind: 'gallery',
          visible: ['g1', 'g2', 'g3', 'g4'],
          tiles: [
            { thumb: 'https://cdn.example.com/1.jpg', box: [0, 0, 0.2, 0.4] },
            { thumb: 'https://cdn.example.com/2.jpg', box: [0.2, 0, 0.2, 0.4] },
            {
              thumb: 'https://cdn.example.com/broken.jpg',
              box: [0.4, 0, 0.2, 0.4],
            },
            {
              thumb: 'https://evil.example.org/4.jpg',
              box: [0, 0.5, 0.2, 0.4],
            },
          ],
          viewport: { width: 1600, height: 900 },
        },
      },
    })
    expect(fetchAsBuffer).toHaveBeenCalledTimes(3)
    expect(sheet.picture?.label).toBe('屏幕')
    expect(sheet.picture?.url).toMatch(
      /^https:\/\/cdn\.example\.com\/assistant-screens\/u1\/[0-9a-f]{32}\.jpg$/,
    )
    expect(sheet.text).toContain(
      '1 = 画廊·g1 · 2 = 画廊·g2 · 3 = 画廊·g3 · 4 = 画廊·g4',
    )
    expect(sheet.text).toContain(
      'Not drawn (no picture or could not load): 3, 4.',
    )
    const { data } = uploadToR2.mock.calls[0]![0] as unknown as { data: Buffer }
    const meta = await sharp(data).metadata()
    expect(meta.format).toBe('jpeg')
    // 宽 1280；高裁到格子占的那一段（视口 900 → 720，格子占上面 0.4 ≈ 288 加边）。
    expect(meta.width).toBe(1280)
    expect(meta.height).toBeLessThan(400)
  })

  it('同一屏同一个键（重看不重拼出新文件）', async () => {
    fetchAsBuffer.mockResolvedValue({ buffer: red, mimeType: 'image/png' })
    const view = {
      library: 'assets' as const,
      screen: {
        kind: 'picture' as const,
        visible: ['图_001'],
        tiles: [{ thumb: 'https://cdn.example.com/1.jpg' }],
      },
    }
    const first = await buildScreenSheet({ userId: 'u1', view })
    const second = await buildScreenSheet({ userId: 'u1', view })
    expect(first.picture?.url).toBe(second.picture?.url)
    expect(first.text).toContain('1 = 图_001')
  })
})

describe('看屏：台上（10-30「整个台一起拼」）', () => {
  it('台上没图：说读表单', async () => {
    const { buildBenchScreenSheet } = await import('./screen.service')
    const sheet = await buildBenchScreenSheet({
      userId: 'u1',
      references: [],
      results: [],
    })
    expect(sheet.picture).toBeNull()
    expect(sheet.text).toContain('no pictures on the bench')
  })

  it('参考图一排在上、结果在下，按号对上 ref-N / result-N，选中的那张点名', async () => {
    fetchAsBuffer.mockResolvedValue({ buffer: red, mimeType: 'image/png' })
    const { buildBenchScreenSheet } = await import('./screen.service')
    const sheet = await buildBenchScreenSheet({
      userId: 'u1',
      references: [
        {
          name: 'ref-1',
          url: 'https://cdn.example.com/r1.png',
          label: '图_012',
        },
      ],
      results: [
        { name: 'result-1', url: 'https://cdn.example.com/a.png' },
        {
          name: 'result-2',
          url: 'https://cdn.example.com/b.png',
          selected: true,
        },
      ],
    })
    expect(sheet.picture?.label).toBe('屏幕')
    expect(sheet.text).toContain(
      '1 = ref-1 图_012 · 2 = result-1 · 3 = result-2 (selected — "this one")',
    )
    expect(sheet.text).toContain('the top row is their reference pictures')
    const { data } = uploadToR2.mock.calls.at(-1)![0] as unknown as {
      data: Buffer
    }
    const meta = await sharp(data).metadata()
    // 两格宽、两排高（参考一排 + 结果一排，中间隔开）。
    expect(meta.width).toBe(2 * 248 - 8)
    expect(meta.height).toBe(248 + 32 + 240)
  })
})
