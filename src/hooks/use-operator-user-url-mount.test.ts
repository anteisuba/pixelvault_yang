import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const importWebImageAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/web-image-import', () => ({ importWebImageAPI }))
vi.mock('@/hooks/use-studio-operator-store', () => ({
  appendOperatorEntry: vi.fn(),
  nextOperatorEntryId: () => 'error',
}))

import { useOperatorUserUrlMount } from './use-operator-user-url-mount'

it('只有图片实际挂载后 settle 才完成', async () => {
  let finish!: (value: unknown) => void
  importWebImageAPI.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const addReferenceImage = vi.fn()
  const { result } = renderHook(() =>
    useOperatorUserUrlMount({
      referenceEntries: [],
      addReferenceImage,
      removeReferenceImage: vi.fn(),
    }),
  )
  act(() => result.current.mountUserUrl('https://source.test/first.png'))
  let settled = false
  const done = result.current.settle().then((success) => {
    settled = success
  })
  expect(settled).toBe(false)
  expect(addReferenceImage).not.toHaveBeenCalled()
  await act(async () => {
    finish({
      success: true,
      data: { generation: { url: 'https://cdn.test/imported.png' } },
    })
    await done
  })
  expect(settled).toBe(true)
  expect(addReferenceImage).toHaveBeenCalledExactlyOnceWith(
    'https://cdn.test/imported.png',
  )
})

it('恢复快照后迟到的导入不能修改参考图', async () => {
  let finish!: (value: unknown) => void
  importWebImageAPI.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const addReferenceImage = vi.fn()
  const { result } = renderHook(() =>
    useOperatorUserUrlMount({
      referenceEntries: [],
      addReferenceImage,
      removeReferenceImage: vi.fn(),
    }),
  )
  act(() => result.current.mountUserUrl('https://source.test/late.png'))
  act(() => result.current.cancelPending())
  let success: boolean | undefined
  await act(async () => {
    finish({
      success: true,
      data: { generation: { url: 'https://cdn.test/late.png' } },
    })
    success = await result.current.settle()
  })
  expect(success).toBe(false)
  expect(addReferenceImage).not.toHaveBeenCalled()
})

describe('导入失败不产生成功快照', () => {
  it.each([false, true])('网络异常=%s', async (reject) => {
    if (reject) importWebImageAPI.mockRejectedValueOnce(new Error('network'))
    else importWebImageAPI.mockResolvedValueOnce({ success: false })
    const addReferenceImage = vi.fn()
    const { result } = renderHook(() =>
      useOperatorUserUrlMount({
        referenceEntries: [],
        addReferenceImage,
        removeReferenceImage: vi.fn(),
      }),
    )
    act(() =>
      result.current.mountUserUrl(`https://source.test/failure-${reject}.png`),
    )
    expect(await result.current.settle()).toBe(false)
    expect(addReferenceImage).not.toHaveBeenCalled()
  })
})
