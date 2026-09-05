import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationRecord } from '@/types'
import {
  useAssetUploadQueue,
  type UploadResult,
} from './use-asset-upload-queue'

const generation: GenerationRecord = {
  id: 'uploaded',
  createdAt: new Date(),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://cdn.example.com/image.png',
  storageKey: 'image.png',
  mimeType: 'image/png',
  width: 10,
  height: 10,
  prompt: '',
  model: 'user-upload',
  provider: 'user-upload',
  requestCount: 0,
  isPublic: false,
  isPromptPublic: false,
  likeCount: 0,
  isLiked: false,
}
const success: UploadResult = { ok: true, generation }
const files = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => new File(['test'], `${i}.wav`, { type: 'audio/wav' }),
  )
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
)
beforeEach(() => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:test')
      static revokeObjectURL = vi.fn()
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('asset upload queue', () => {
  it('keeps all 20 uploads in the selected folder under batched StrictMode updates', async () => {
    const upload = vi.fn().mockResolvedValue(success)
    const { result } = renderHook(() => useAssetUploadQueue({ upload }), {
      wrapper,
    })
    act(() => result.current.enqueue(files(20), 'folder-a'))
    await waitFor(() => expect(result.current.doneCount).toBe(20))
    expect(upload).toHaveBeenCalledTimes(20)
    for (const call of upload.mock.calls)
      expect(call[1].projectId).toBe('folder-a')
  })
  it('changes only queued destinations and preserves the active upload destination', async () => {
    let finish!: (value: UploadResult) => void
    const upload = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<UploadResult>((r) => {
            finish = r
          }),
      )
      .mockResolvedValue(success)
    const { result } = renderHook(() => useAssetUploadQueue({ upload }), {
      wrapper,
    })
    act(() => {
      result.current.enqueue(files(2), 'folder-a')
      result.current.changeTarget('folder-b')
    })
    expect(result.current.items.map((i) => i.targetProjectId)).toEqual([
      'folder-a',
      'folder-b',
    ])
    await act(async () => finish(success))
    await waitFor(() => expect(result.current.doneCount).toBe(2))
    expect(upload.mock.calls.map((c) => c[1].projectId)).toEqual([
      'folder-a',
      'folder-b',
    ])
  })
  it('continues after a thrown upload and retries failures once without duplicating successful uploads', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(success)
    const { result } = renderHook(() => useAssetUploadQueue({ upload }), {
      wrapper,
    })
    act(() => result.current.enqueue(files(3), 'folder-a'))
    await waitFor(() => expect(result.current.doneCount).toBe(2))
    expect(result.current.errorCount).toBe(1)
    act(() => {
      result.current.retryAll()
      result.current.retryAll()
    })
    await waitFor(() => expect(result.current.doneCount).toBe(3))
    expect(upload).toHaveBeenCalledTimes(4)
    expect(upload.mock.calls[3][1].projectId).toBe('folder-a')
  })
})
