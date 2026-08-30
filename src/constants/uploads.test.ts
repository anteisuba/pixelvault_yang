import { describe, expect, it } from 'vitest'

import {
  USER_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_VIDEO_UPLOAD_MAX_BYTES,
} from '@/constants/uploads'

describe('user asset upload media support', () => {
  it('allows MP4 videos through the asset-library file picker', () => {
    expect(USER_UPLOAD_ACCEPTED_MIME_TYPES).toContain('video/mp4')
  })

  it('allows MP3 audio through the asset-library file picker', () => {
    expect(USER_UPLOAD_ACCEPTED_MIME_TYPES).toContain('audio/mpeg')
  })

  it('uses the R2 single-PUT limit instead of the old 50 MB cap', () => {
    expect(USER_VIDEO_UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024 * 1024)
  })
})
