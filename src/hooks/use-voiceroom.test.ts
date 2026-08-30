import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createVoiceLineAPI,
  createVoiceRoomAPI,
  getVoiceRoomAPI,
  listVoiceRoomsAPI,
  retakeVoiceLineAPI,
} from '@/lib/api-client/voiceroom'
import { useVoiceRoom } from '@/hooks/use-voiceroom'
import type { VoiceLineRecord, VoiceRoomDetail } from '@/types/voiceroom'

/**
 * 配音间客户端状态的单元测试。
 *
 * 锁的是**念法参数怎么跟着请求走**（切片②）：它是会话级设置，不落库，所以
 * 「它到底有没有进请求体」在数据库里查不到——只有在这一层能证。
 *
 * ⚠ 这个模块只有深导入一个来路（`@/lib/api-client/voiceroom` 不在 barrel 里），
 * 所以 mock 的说明符必须与 hook 里写的**逐字一致**。
 */
vi.mock('@/lib/api-client/voiceroom', () => ({
  listVoiceRoomsAPI: vi.fn(),
  createVoiceRoomAPI: vi.fn(),
  getVoiceRoomAPI: vi.fn(),
  updateVoiceRoomAPI: vi.fn(),
  deleteVoiceRoomAPI: vi.fn(),
  createVoiceLineAPI: vi.fn(),
  retakeVoiceLineAPI: vi.fn(),
}))

const mockListRooms = vi.mocked(listVoiceRoomsAPI)
const mockCreateRoom = vi.mocked(createVoiceRoomAPI)
const mockGetRoom = vi.mocked(getVoiceRoomAPI)
const mockCreateLine = vi.mocked(createVoiceLineAPI)
const mockRetakeLine = vi.mocked(retakeVoiceLineAPI)

const ROOM_ID = 'room-1'
const SPEAKER_ID = 'card-qing'

function makeDetail(lines: VoiceLineRecord[] = []): VoiceRoomDetail {
  return {
    id: ROOM_ID,
    name: null,
    cast: [{ id: SPEAKER_ID, kind: 'voice', name: '晴', coverImage: null }],
    bed: null,
    lines,
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }
}

function makeLine(overrides?: Partial<VoiceLineRecord>): VoiceLineRecord {
  return {
    id: 'line-1',
    order: 0,
    speakerId: SPEAKER_ID,
    speakerKind: 'voice',
    speakerName: '晴',
    speakerCover: null,
    text: '别回头。',
    emotion: null,
    // COMPLETED：轮询只在有台词在飞时才转，测试里不该让它转起来。
    audio: {
      jobId: 'job-1',
      status: 'COMPLETED',
      url: 'https://cdn.example.com/a.mp3',
      duration: 3,
      errorMessage: null,
    },
    createdAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListRooms.mockResolvedValue({
    success: true,
    data: [
      {
        id: ROOM_ID,
        name: null,
        cast: makeDetail().cast,
        bed: null,
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
    ],
  })
  mockGetRoom.mockResolvedValue({ success: true, data: makeDetail() })
  mockCreateLine.mockResolvedValue({ success: true, data: makeLine() })
  mockRetakeLine.mockResolvedValue({
    success: true,
    data: makeLine({ emotion: 'whisper' }),
  })
})

/** 拿到一个已经打开了房间的 hook。 */
async function openedRoom() {
  const rendered = renderHook(() => useVoiceRoom())
  await waitFor(() => expect(rendered.result.current.loadingRooms).toBe(false))
  await act(async () => {
    await rendered.result.current.openRoom(ROOM_ID)
  })
  return rendered
}

describe('useVoiceRoom 念法参数', () => {
  /**
   * 出厂档必须是**精确的空操作**：`normal` 在服务端映射到 speed 1，`auto` 让
   * 表现力从情感推导。这两个值一旦漂了，「什么都没调」就会变成一次静默的改写。
   */
  it('出厂就是正常语速 + 自动表现力', async () => {
    const { result } = await openedRoom()
    expect(result.current.delivery).toEqual({
      pace: 'normal',
      expressiveness: 'auto',
      // null = 还没选过模型，由服务端挑目录里第一个可用的。
      modelId: null,
    })
  })

  it('说一句话时把当下的念法一起发出去', async () => {
    const { result } = await openedRoom()

    act(() => result.current.setDelivery({ pace: 'slow' }))
    await waitFor(() => expect(result.current.delivery.pace).toBe('slow'))

    await act(async () => {
      await result.current.say(SPEAKER_ID, '（耳语）别回头。')
    })

    expect(mockCreateLine).toHaveBeenCalledTimes(1)
    expect(mockCreateLine.mock.calls[0][0]).toEqual({
      roomId: ROOM_ID,
      speakerId: SPEAKER_ID,
      text: '（耳语）别回头。',
      pace: 'slow',
      expressiveness: 'auto',
    })
  })

  /** 面板里改一项不该把另一项打回出厂值。 */
  it('改一项，另一项原样留着', async () => {
    const { result } = await openedRoom()

    act(() => result.current.setDelivery({ pace: 'fast' }))
    await waitFor(() => expect(result.current.delivery.pace).toBe('fast'))
    act(() => result.current.setDelivery({ expressiveness: 'dramatic' }))

    await waitFor(() =>
      expect(result.current.delivery).toEqual({
        pace: 'fast',
        expressiveness: 'dramatic',
        modelId: null,
      }),
    )
  })

  /**
   * ⭐ 重录沿用**当下**的念法，不是这条台词当初生成时用的那一套。
   *
   * 参数的语义是「接下来怎么念」——调慢语速再去纠一句的情感，理应连语速一起
   * 生效；否则用户得先纠情感、再想办法让语速也追上，而界面上根本没有那条路。
   */
  it('重录沿用当下的念法，情感由入参压过', async () => {
    const { result } = await openedRoom()

    act(() => result.current.setDelivery({ expressiveness: 'restrained' }))
    await waitFor(() =>
      expect(result.current.delivery.expressiveness).toBe('restrained'),
    )

    await act(async () => {
      await result.current.retake('line-1', { emotion: 'whisper' })
    })

    expect(mockRetakeLine).toHaveBeenCalledTimes(1)
    expect(mockRetakeLine.mock.calls[0][0]).toEqual({
      lineId: 'line-1',
      pace: 'normal',
      expressiveness: 'restrained',
      emotion: 'whisper',
    })
  })

  /**
   * ⭐ 没选过模型时，请求体里**不能出现 `modelId` 这个键**。
   *
   * schema 只收 `string | undefined`，而「没选过」的语义是让服务端去挑目录里第一个
   * 可用的——塞个 null 进去既过不了校验，也把意思说反了。
   */
  it('没选模型时请求体里不带 modelId', async () => {
    const { result } = await openedRoom()

    await act(async () => {
      await result.current.say(SPEAKER_ID, '喂。')
    })

    expect(mockCreateLine.mock.calls[0][0]).not.toHaveProperty('modelId')
  })

  it('选了模型就带上，重录也跟着走', async () => {
    const { result } = await openedRoom()

    act(() => result.current.setDelivery({ modelId: 'fish-audio-s2-pro' }))
    await waitFor(() =>
      expect(result.current.delivery.modelId).toBe('fish-audio-s2-pro'),
    )

    await act(async () => {
      await result.current.say(SPEAKER_ID, '喂。')
    })
    expect(mockCreateLine.mock.calls[0][0].modelId).toBe('fish-audio-s2-pro')

    await act(async () => {
      await result.current.retake('line-1', { emotion: 'sad' })
    })
    expect(mockRetakeLine.mock.calls[0][0].modelId).toBe('fish-audio-s2-pro')
  })

  it('房间里没有台词时不建房间也不多拉一次', async () => {
    const { result } = await openedRoom()
    expect(mockCreateRoom).not.toHaveBeenCalled()
    expect(result.current.detail?.id).toBe(ROOM_ID)
  })
})
