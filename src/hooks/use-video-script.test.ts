import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  createVideoScriptAPI: vi.fn(),
  deleteVideoScriptAPI: vi.fn(),
  getVideoScriptAPI: vi.fn(),
  listVideoScriptsAPI: vi.fn(),
  updateVideoScriptAPI: vi.fn(),
}))

import {
  createVideoScriptAPI,
  deleteVideoScriptAPI,
  getVideoScriptAPI,
  listVideoScriptsAPI,
  updateVideoScriptAPI,
} from '@/lib/api-client'
import {
  useCreateVideoScript,
  useVideoScript,
  useVideoScriptList,
} from '@/hooks/use-video-script'
import { VideoScriptStatus } from '@/lib/generated/prisma/client'
import type { VideoScriptRecord } from '@/types/video-script'

const SCRIPT_ID = 'script-1'

const FAKE_SCRIPT: VideoScriptRecord = {
  id: SCRIPT_ID,
  userId: 'user-1',
  topic: 'cat flight',
  targetDuration: 30,
  totalScenes: 5,
  status: VideoScriptStatus.DRAFT,
  consistencyMode: 'first_frame_ref',
  characterCardId: null,
  styleCardId: null,
  videoModelId: 'seedance-2-fast',
  finalVideoUrl: null,
  scenes: [],
  createdAt: new Date('2026-04-19').toISOString(),
  updatedAt: new Date('2026-04-19').toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useVideoScript', () => {
  it('loads script on mount and exposes it', async () => {
    vi.mocked(getVideoScriptAPI).mockResolvedValue({
      success: true,
      data: FAKE_SCRIPT,
    })

    const { result } = renderHook(() => useVideoScript(SCRIPT_ID))

    await waitFor(() => expect(result.current.script?.id).toBe(SCRIPT_ID))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error when load fails', async () => {
    vi.mocked(getVideoScriptAPI).mockResolvedValue({
      success: false,
      error: 'Not found',
    })

    const { result } = renderHook(() => useVideoScript(SCRIPT_ID))
    await waitFor(() => expect(result.current.error).toBe('Not found'))
  })

  it('save() sends scenes and updates local state', async () => {
    vi.mocked(getVideoScriptAPI).mockResolvedValue({
      success: true,
      data: FAKE_SCRIPT,
    })
    vi.mocked(updateVideoScriptAPI).mockResolvedValue({
      success: true,
      data: { ...FAKE_SCRIPT, updatedAt: new Date('2026-04-20').toISOString() },
    })

    const { result } = renderHook(() => useVideoScript(SCRIPT_ID))
    await waitFor(() => expect(result.current.script).toBeTruthy())

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.save([])
    })

    expect(ok).toBe(true)
    expect(updateVideoScriptAPI).toHaveBeenCalledWith(SCRIPT_ID, {
      scenes: [],
    })
  })

  it('confirm() patches with SCRIPT_READY status', async () => {
    vi.mocked(getVideoScriptAPI).mockResolvedValue({
      success: true,
      data: FAKE_SCRIPT,
    })
    vi.mocked(updateVideoScriptAPI).mockResolvedValue({
      success: true,
      data: { ...FAKE_SCRIPT, status: VideoScriptStatus.SCRIPT_READY },
    })

    const { result } = renderHook(() => useVideoScript(SCRIPT_ID))
    await waitFor(() => expect(result.current.script).toBeTruthy())

    await act(async () => {
      await result.current.confirm()
    })

    expect(updateVideoScriptAPI).toHaveBeenCalledWith(SCRIPT_ID, {
      status: VideoScriptStatus.SCRIPT_READY,
    })
    expect(result.current.script?.status).toBe(VideoScriptStatus.SCRIPT_READY)
  })

  it('remove() clears local state on success', async () => {
    vi.mocked(getVideoScriptAPI).mockResolvedValue({
      success: true,
      data: FAKE_SCRIPT,
    })
    vi.mocked(deleteVideoScriptAPI).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useVideoScript(SCRIPT_ID))
    await waitFor(() => expect(result.current.script).toBeTruthy())

    await act(async () => {
      await result.current.remove()
    })

    expect(result.current.script).toBeNull()
  })

  it('null id skips loading', async () => {
    const { result } = renderHook(() => useVideoScript(null))
    expect(result.current.script).toBeNull()
    expect(getVideoScriptAPI).not.toHaveBeenCalled()
  })
})

describe('useVideoScriptList', () => {
  it('loads first page on mount', async () => {
    vi.mocked(listVideoScriptsAPI).mockResolvedValue({
      success: true,
      data: { scripts: [FAKE_SCRIPT], page: 1, size: 20, total: 1 },
    })

    const { result } = renderHook(() => useVideoScriptList())
    await waitFor(() => expect(result.current.scripts).toHaveLength(1))
    expect(result.current.hasMore).toBe(false)
  })

  it('loadMore appends next page', async () => {
    const second: VideoScriptRecord = { ...FAKE_SCRIPT, id: 'script-2' }
    vi.mocked(listVideoScriptsAPI)
      .mockResolvedValueOnce({
        success: true,
        data: { scripts: [FAKE_SCRIPT], page: 1, size: 20, total: 2 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { scripts: [second], page: 2, size: 20, total: 2 },
      })

    const { result } = renderHook(() => useVideoScriptList())
    await waitFor(() => expect(result.current.scripts).toHaveLength(1))

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.scripts.map((s) => s.id)).toEqual([
      SCRIPT_ID,
      'script-2',
    ])
  })

  it('surfaces API errors', async () => {
    vi.mocked(listVideoScriptsAPI).mockResolvedValue({
      success: false,
      error: 'db down',
    })

    const { result } = renderHook(() => useVideoScriptList())
    await waitFor(() => expect(result.current.error).toBe('db down'))
  })
})

describe('useCreateVideoScript', () => {
  it('returns created script on success', async () => {
    vi.mocked(createVideoScriptAPI).mockResolvedValue({
      success: true,
      data: FAKE_SCRIPT,
    })

    const { result } = renderHook(() => useCreateVideoScript())

    let created: VideoScriptRecord | null = null
    await act(async () => {
      created = await result.current.create({
        topic: 'cat flight',
        targetDuration: 30,
        consistencyMode: 'first_frame_ref',
        videoModelId: 'seedance-2-fast',
      })
    })

    expect(created).toEqual(FAKE_SCRIPT)
    expect(result.current.error).toBeNull()
  })

  it('surfaces error on failure', async () => {
    vi.mocked(createVideoScriptAPI).mockResolvedValue({
      success: false,
      error: 'LLM provider down',
    })

    const { result } = renderHook(() => useCreateVideoScript())
    let created: VideoScriptRecord | null = null
    await act(async () => {
      created = await result.current.create({
        topic: 'cat flight',
        targetDuration: 30,
        consistencyMode: 'first_frame_ref',
        videoModelId: 'seedance-2-fast',
      })
    })

    expect(created).toBeNull()
    expect(result.current.error).toBe('LLM provider down')
  })
})
