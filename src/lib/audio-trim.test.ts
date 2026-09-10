import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  encodeWav16BitPcm,
  resolveTrimSampleRange,
  sliceChannels,
  trimmedFileName,
  decodeAudioFromUrl,
} from './audio-trim'

function readAscii(view: DataView, offset: number, length: number): string {
  let out = ''
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(view.getUint8(offset + index))
  }
  return out
}

describe('resolveTrimSampleRange', () => {
  it('秒 → 采样下标，并夹进 [0, length]', () => {
    expect(
      resolveTrimSampleRange({ startSec: 0.5, endSec: 1.5 }, 1000, 4000),
    ).toEqual({ start: 500, end: 1500 })
    // 越界的一端夹住，⛔ 不抛。
    expect(
      resolveTrimSampleRange({ startSec: -3, endSec: 99 }, 1000, 4000),
    ).toEqual({ start: 0, end: 4000 })
  })

  it('出点不大于入点 = 没有区间（0 采样的一版不是一段声音）', () => {
    expect(
      resolveTrimSampleRange({ startSec: 2, endSec: 2 }, 1000, 4000),
    ).toBeNull()
    expect(
      resolveTrimSampleRange({ startSec: 3, endSec: 1 }, 1000, 4000),
    ).toBeNull()
    expect(
      resolveTrimSampleRange({ startSec: 0, endSec: 1 }, 0, 4000),
    ).toBeNull()
  })
})

describe('sliceChannels', () => {
  it('每条声道切同一段', () => {
    const left = Float32Array.from([0, 0.1, 0.2, 0.3, 0.4])
    const right = Float32Array.from([1, 0.9, 0.8, 0.7, 0.6])
    const [a, b] = sliceChannels([left, right], { start: 1, end: 4 })
    expect(Array.from(a ?? [])).toHaveLength(3)
    expect(a?.[0]).toBeCloseTo(0.1, 5)
    expect(b?.[2]).toBeCloseTo(0.7, 5)
  })
})

describe('encodeWav16BitPcm', () => {
  it('WAV 头逐字段正确，字节数 = 44 + 帧数 × 声道 × 2', () => {
    const mono = Float32Array.from([0, 0.5, -0.5, 1])
    const buffer = encodeWav16BitPcm([mono], 8000)
    expect(buffer.byteLength).toBe(44 + 4 * 1 * 2)

    const view = new DataView(buffer)
    expect(readAscii(view, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8)
    expect(readAscii(view, 8, 4)).toBe('WAVE')
    expect(readAscii(view, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(8000)
    expect(view.getUint32(28, true)).toBe(8000 * 2)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(readAscii(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(8)
  })

  it('采样被夹在 16-bit 两端，⛔ 不绕回', () => {
    const clipped = encodeWav16BitPcm([Float32Array.from([2, -2])], 8000)
    const view = new DataView(clipped)
    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
  })

  it('多声道交错存（L R L R…）', () => {
    const left = Float32Array.from([1, 0])
    const right = Float32Array.from([0, -1])
    const buffer = encodeWav16BitPcm([left, right], 44100)
    const view = new DataView(buffer)
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint16(32, true)).toBe(4)
    expect(buffer.byteLength).toBe(44 + 2 * 2 * 2)
    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(0)
    expect(view.getInt16(48, true)).toBe(0)
    // -1.0 × 32767 = -32767：满刻度按正峰算，⛔ 不为了凑 -32768 给负半轴另一个系数。
    expect(view.getInt16(50, true)).toBe(-32767)
  })
})

describe('trimmedFileName', () => {
  it('换成 .wav 扩展名', () => {
    expect(trimmedFileName('莫宁 · 独白.mp3')).toBe('莫宁 · 独白.wav')
    expect(trimmedFileName('  ')).toBe('audio.wav')
  })
})

describe('decodeAudioFromUrl 的取字节这一步', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('绕开 HTTP 缓存取（⚠ 卡上那只 <audio> 先缓存了一条不透明记录，命中它就跨域失败）', async () => {
    // 真机 2026-09-10：默认 fetch 一律 `Failed to fetch`，只有 `cache: 'reload'`
    // 那一次成功 —— 这是「裁剪」在真机上唯一的死因，所以它值一条闸。
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }))
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('window', {
      AudioContext: class {
        async decodeAudioData() {
          return {
            numberOfChannels: 1,
            sampleRate: 8000,
            duration: 1,
            getChannelData: () => new Float32Array(8000),
          }
        }
        close() {}
      },
    })
    await decodeAudioFromUrl('https://cdn.test/a.mp3')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cdn.test/a.mp3',
      expect.objectContaining({ cache: 'reload' }),
    )
  })
})
