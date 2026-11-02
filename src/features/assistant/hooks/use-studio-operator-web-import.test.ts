import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'

import { useStudioOperatorWebImport } from './use-studio-operator-web-import'

/**
 * 联网候选「保存」的契约闸（拍板 21 → P4 第 12 项：保存 = 只进素材库）。
 *
 *  ① 按「保存」之前一次网络都不发；只发 URL，⛔ 请求体里没有字节；
 *  ② 存好就是「已存」，⛔ 不挂附件、⛔ 没有上限、⛔ 不删任何东西；
 *  ③ 已存 / 在存的再存一次不重发；失败不静默，再存 = 重试；
 *  ④ 来源不可作输入的那张不发，理由就地说；按 entryId 各记各的；换了作用域旧请求作废。
 */

const importWebImageAPI = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.has = () => false
    return t
  },
}))

vi.mock('@/lib/api-client/web-image-import', () => ({ importWebImageAPI }))

const CANDIDATE_A: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.example.com/a.jpg',
  thumbnailUrl: 'https://tbn.example.com/a.jpg',
  pageUrl: 'https://example.com/a',
  domain: 'example.com',
  publisher: 'Example',
  usableAsInput: true,
  sourceVerdict: 'unknownLicense',
  title: 'candidate A',
}
const CANDIDATE_B: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.other.com/b.jpg',
  pageUrl: 'https://other.com/b',
  domain: 'other.com',
  usableAsInput: true,
  sourceVerdict: 'unknownLicense',
}
const CANDIDATE_C: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.third.com/c.jpg',
  domain: 'third.com',
  usableAsInput: true,
  sourceVerdict: 'unknownLicense',
}
/** 来源判定为 `blocked` 的那一张（切片 3b）——「选用」应当被就地拒掉。 */
const CANDIDATE_BLOCKED: AssistantOperatorWebImage = {
  imageUrl: 'https://i.pinimg.com/blocked.jpg',
  pageUrl: 'https://www.pinterest.com/pin/1',
  domain: 'pinterest.com',
  publisher: 'Pinterest',
  usableAsInput: false,
  sourceVerdict: 'blocked',
}

function generation(id: string): GenerationRecord {
  return {
    id,
    url: `https://cdn.antei.test/${id}.jpg`,
    thumbnailUrl: `https://cdn.antei.test/${id}.thumbnail.webp`,
    outputType: 'IMAGE',
    prompt: '',
    model: 'user-upload',
  } as unknown as GenerationRecord
}

function setup(scopeKey = 'user-a:image-natural:thread-1') {
  return renderHook(
    ({ scope }) => useStudioOperatorWebImport({ scopeKey: scope }),
    { initialProps: { scope: scopeKey } },
  )
}

function picksOf(
  hook: ReturnType<typeof setup>,
  entryId = 'entry-1',
): readonly { imageUrl: string; status: string; generationId?: string }[] {
  return hook.result.current.states[entryId]?.picks ?? []
}

beforeEach(() => {
  vi.clearAllMocks()
  importWebImageAPI.mockResolvedValue({
    success: true,
    data: { generation: generation('gen-a') },
  })
})

describe('联网候选 · 保存才下载（拍板 21 → P4）', () => {
  it('⛔ 没按「保存」之前一次网络都不发', () => {
    const hook = setup()
    expect(hook.result.current.states).toEqual({})
    expect(importWebImageAPI).not.toHaveBeenCalled()
  })

  it('保存 → 只发 URL（⛔ 没有字节）→ 那一张变「已存」，记下素材 id', async () => {
    const hook = setup()
    act(() => hook.result.current.saveCandidates('entry-1', [CANDIDATE_A]))
    expect(importWebImageAPI).toHaveBeenCalledWith({
      imageUrl: CANDIDATE_A.imageUrl,
      pageUrl: CANDIDATE_A.pageUrl,
      domain: CANDIDATE_A.domain,
      title: CANDIDATE_A.title,
    })
    const body = importWebImageAPI.mock.calls[0][0] as Record<string, unknown>
    for (const value of Object.values(body))
      expect(String(value)).not.toMatch(/^data:|^blob:/)
    expect(picksOf(hook)[0]?.status).toBe('saving')
    await waitFor(() =>
      expect(picksOf(hook)).toEqual([
        {
          imageUrl: CANDIDATE_A.imageUrl,
          status: 'saved',
          generationId: 'gen-a',
        },
      ]),
    )
  })

  it('⭐ 一次存好几张，⛔ 没有参考位上限', async () => {
    importWebImageAPI.mockImplementation(({ imageUrl }: { imageUrl: string }) =>
      Promise.resolve({
        success: true,
        data: { generation: generation(imageUrl.slice(-5)) },
      }),
    )
    const hook = setup()
    act(() =>
      hook.result.current.saveCandidates('entry-1', [
        CANDIDATE_A,
        CANDIDATE_B,
        CANDIDATE_C,
      ]),
    )
    expect(importWebImageAPI).toHaveBeenCalledTimes(3)
    await waitFor(() =>
      expect(picksOf(hook).map((pick) => pick.status)).toEqual([
        'saved',
        'saved',
        'saved',
      ]),
    )
  })

  it('已存 / 在存的再存一次不重发（同一帧连点也只发一次）', async () => {
    const hook = setup()
    act(() => {
      hook.result.current.saveCandidates('entry-1', [CANDIDATE_A])
      hook.result.current.saveCandidates('entry-1', [CANDIDATE_A])
    })
    expect(importWebImageAPI).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(picksOf(hook)[0]?.status).toBe('saved'))
    act(() => hook.result.current.saveCandidates('entry-1', [CANDIDATE_A]))
    expect(importWebImageAPI).toHaveBeenCalledTimes(1)
  })
})

describe('联网候选 · 失败与隔离', () => {
  it('⛔ 失败不静默：那一格带原因；再存 = 重试', async () => {
    importWebImageAPI.mockResolvedValueOnce({
      success: false,
      error: '对方站 403',
    })
    const hook = setup()
    act(() => hook.result.current.saveCandidates('entry-1', [CANDIDATE_A]))
    await waitFor(() => expect(picksOf(hook)[0]?.status).toBe('error'))
    expect(picksOf(hook)[0]).toMatchObject({ error: expect.any(String) })
    act(() => hook.result.current.saveCandidates('entry-1', [CANDIDATE_A]))
    expect(importWebImageAPI).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(picksOf(hook)[0]?.status).toBe('saved'))
  })

  it('⛔ 来源不可作输入的那张：一次导入都不发，理由就地说出来；能用的照存', () => {
    const hook = setup()
    act(() =>
      hook.result.current.saveCandidates('entry-1', [
        CANDIDATE_BLOCKED,
        CANDIDATE_B,
      ]),
    )
    expect(importWebImageAPI).toHaveBeenCalledTimes(1)
    expect(importWebImageAPI.mock.calls[0][0]).toMatchObject({
      imageUrl: CANDIDATE_B.imageUrl,
    })
    expect(hook.result.current.states['entry-1']?.refusalError).toBe(
      'web.notUsable',
    )
  })

  it('两条日志条各记各的（按 entryId 存，不串台）', async () => {
    const hook = setup()
    act(() => {
      hook.result.current.saveCandidates('entry-1', [CANDIDATE_A])
      hook.result.current.saveCandidates('entry-2', [CANDIDATE_B])
    })
    await waitFor(() => {
      expect(picksOf(hook, 'entry-1').map((pick) => pick.imageUrl)).toEqual([
        CANDIDATE_A.imageUrl,
      ])
      expect(picksOf(hook, 'entry-2').map((pick) => pick.imageUrl)).toEqual([
        CANDIDATE_B.imageUrl,
      ])
    })
  })
})

it.each([
  'user-a:image-tags:thread-2',
  'user-b:image-natural:thread-1',
  'user-a:image-natural:thread-new',
])('换到 %s 之后，旧的那次保存回来不写进新作用域', async (nextScope) => {
  let finish!: (value: unknown) => void
  importWebImageAPI.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const view = setup()
  act(() => view.result.current.saveCandidates('entry-old', [CANDIDATE_A]))
  view.rerender({ scope: nextScope })
  expect(view.result.current.states).toEqual({})
  await act(async () =>
    finish({ success: true, data: { generation: generation('late') } }),
  )
  expect(view.result.current.states).toEqual({})
})
