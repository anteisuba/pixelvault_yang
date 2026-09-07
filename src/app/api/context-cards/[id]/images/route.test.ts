import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createPATCH,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_KIND_IDS,
  CONTEXT_CARD_LIMITS,
} from '@/constants/context-cards'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'db_user_1' })),
}))

const mockAdd = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/services/context-cards-avatar.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/context-cards-avatar.service')
  >('@/services/context-cards-avatar.service')
  return {
    ContextCardImageLimitError: actual.ContextCardImageLimitError,
    addContextCardImage: (...args: unknown[]) => mockAdd(...args),
    removeContextCardImage: (...args: unknown[]) => mockRemove(...args),
  }
})

import { POST, DELETE } from './route'
import { ContextCardImageLimitError } from '@/services/context-cards-avatar.service'

const CARD_ID = 'card-1'
const routeParams = { params: Promise.resolve({ id: CARD_ID }) }
const IMAGE_URL = 'https://cdn.example.com/context-cards/db_user_1/a.png'

const CARD = {
  id: CARD_ID,
  kind: CONTEXT_CARD_KIND_IDS.character,
  name: 'Sigrika',
  summary: '',
  body: '',
  images: [
    {
      url: IMAGE_URL,
      role: CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
      sourceRef: null,
    },
  ],
  negative: null,
  pinnedScopes: [],
  createdAt: '2026-09-07T10:00:00.000Z',
  updatedAt: '2026-09-07T10:00:00.000Z',
}

describe('POST /api/context-cards/[id]/images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockAdd.mockResolvedValue(CARD)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await POST(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, {
        imageData: 'data:image/png;base64,AAA',
      }),
      routeParams,
    )
    expect(res.status).toBe(401)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('缺 imageData 400', async () => {
    const res = await POST(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, { role: 'sheet' }),
      routeParams,
    )
    expect(res.status).toBe(400)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('role 缺省是 reference，载荷落到上传服务上', async () => {
    const res = await POST(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, {
        imageData: 'data:image/png;base64,AAA',
      }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(mockAdd).toHaveBeenCalledWith('db_user_1', CARD_ID, {
      imageData: 'data:image/png;base64,AAA',
      role: CONTEXT_CARD_IMAGE_ROLE_IDS.reference,
      sourceRef: null,
    })
  })

  it('卡不属于这个用户时 404', async () => {
    mockAdd.mockResolvedValue(null)
    const res = await POST(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, {
        imageData: 'data:image/png;base64,AAA',
      }),
      routeParams,
    )
    expect(res.status).toBe(404)
  })

  it('这张卡的图满了 409 且带 i18n 键', async () => {
    mockAdd.mockRejectedValue(
      new ContextCardImageLimitError(CONTEXT_CARD_LIMITS.maxImages),
    )
    const res = await POST(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, {
        imageData: 'data:image/png;base64,AAA',
      }),
      routeParams,
    )
    expect(res.status).toBe(409)
    await expect(parseJSON(res)).resolves.toMatchObject({
      success: false,
      errorCode: 'CONTEXT_CARD_IMAGE_LIMIT_REACHED',
      i18nKey: 'errors.contextCard.imageLimitReached',
    })
  })

  it('格式不对 400，复用账户头像那一档的 i18n 键', async () => {
    mockAdd.mockRejectedValue(
      new Error('Unsupported image type. Use JPEG, PNG, or WebP.'),
    )
    const res = await POST(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, {
        imageData: 'data:image/gif;base64,AAA',
      }),
      routeParams,
    )
    expect(res.status).toBe(400)
    await expect(parseJSON(res)).resolves.toMatchObject({
      errorCode: 'UNSUPPORTED_IMAGE_TYPE',
      i18nKey: 'errors.profile.unsupportedImageType',
    })
  })

  it('图太大 400', async () => {
    mockAdd.mockRejectedValue(new Error('Reference image must be under 10 MB'))
    const res = await POST(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, {
        imageData: 'data:image/png;base64,AAA',
      }),
      routeParams,
    )
    expect(res.status).toBe(400)
    await expect(parseJSON(res)).resolves.toMatchObject({
      errorCode: 'CONTEXT_CARD_IMAGE_TOO_LARGE',
    })
  })
})

describe('DELETE /api/context-cards/[id]/images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRemove.mockResolvedValue(CARD)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await DELETE(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, { url: IMAGE_URL }),
      routeParams,
    )
    expect(res.status).toBe(401)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  /** ⚠ 按 URL 摘，⛔ 不按下标 —— 下标在两次请求之间会变。 */
  it('按 URL 摘图', async () => {
    const res = await DELETE(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, { url: IMAGE_URL }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(mockRemove).toHaveBeenCalledWith('db_user_1', CARD_ID, IMAGE_URL)
  })

  it('卡上没有这条 URL 时 404', async () => {
    mockRemove.mockResolvedValue(null)
    const res = await DELETE(
      createPATCH(`/api/context-cards/${CARD_ID}/images`, {
        url: 'https://cdn.example.com/other.png',
      }),
      routeParams,
    )
    expect(res.status).toBe(404)
  })
})
