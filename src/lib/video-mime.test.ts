import { describe, expect, it } from 'vitest'

import { detectTrustedVideoMime } from '@/lib/video-mime'

function isoBmff(brand: string): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from(`ftyp${brand}`, 'ascii'),
    Buffer.from('mp42video-bytes', 'ascii'),
  ])
}

describe('detectTrustedVideoMime', () => {
  it('recognizes an MP4 from its ISO-BMFF signature', () => {
    expect(detectTrustedVideoMime(isoBmff('isom'))).toBe('video/mp4')
  })

  it('recognizes QuickTime by its `qt  ` brand', () => {
    expect(detectTrustedVideoMime(isoBmff('qt  '))).toBe('video/quicktime')
  })

  it('recognizes WebM by its EBML header and DocType', () => {
    const webm = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from('....webm........', 'ascii'),
    ])
    expect(detectTrustedVideoMime(webm)).toBe('video/webm')
  })

  it('rejects bytes that are not a known container', () => {
    expect(() =>
      detectTrustedVideoMime(Buffer.from('<html>not a video</html>')),
    ).toThrow('Unsupported or invalid video file')
    expect(() => detectTrustedVideoMime(Buffer.from('tiny'))).toThrow(
      'Invalid or empty video file',
    )
  })
})
