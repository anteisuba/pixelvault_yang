import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGET, mockAuthenticated, parseJSON } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/services/civitai-lora.service', () => ({
  resolveCivitaiLoraByReference: vi.fn(),
}))

vi.mock('@/services/lora-asset.service', () => ({
  findLoraAssetByExtraReference: vi.fn(),
}))

import { resolveCivitaiLoraByReference } from '@/services/civitai-lora.service'
import { findLoraAssetByExtraReference } from '@/services/lora-asset.service'

import { GET } from './route'

const mockResolve = vi.mocked(resolveCivitaiLoraByReference)
const mockFindLocal = vi.mocked(findLoraAssetByExtraReference)

const ITEM = {
  id: 'civitai:122359:135867',
  name: 'Detail Tweaker XL',
  loraUrl: 'https://civitai.com/api/download/models/135867',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockFindLocal.mockResolvedValue(null)
  mockResolve.mockResolvedValue(ITEM as never)
})

describe('GET /api/lora-assets/civitai/resolve', () => {
  it('prefers a local library hit and never touches Civitai for it', async () => {
    const LOCAL = { id: 'asset_local', name: 'My Trained LoRA' }
    mockFindLocal.mockResolvedValueOnce(LOCAL as never)

    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', {
        hash: '9c783c8ce46c',
      }),
    )
    const body = await parseJSON<{ success: boolean; data?: typeof LOCAL }>(
      response,
    )

    expect(response.status).toBe(200)
    expect(body.data?.id).toBe('asset_local')
    expect(mockFindLocal).toHaveBeenCalledWith('clerk_test_user', {
      hash: '9c783c8ce46c',
      modelVersionId: undefined,
      name: undefined,
      baseModelFamily: undefined,
    })
    expect(mockResolve).not.toHaveBeenCalled()
    // 用户相关数据绝不能进共享缓存
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('resolves by hash', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', {
        hash: '9c783c8ce46c',
      }),
    )
    const body = await parseJSON<{ success: boolean; data?: typeof ITEM }>(
      response,
    )

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.id).toBe(ITEM.id)
    expect(mockResolve).toHaveBeenCalledWith({
      hash: '9c783c8ce46c',
      modelVersionId: undefined,
      name: undefined,
      baseModelFamily: undefined,
    })
  })

  it('resolves by modelVersionId', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', {
        modelVersionId: '135867',
      }),
    )

    expect(response.status).toBe(200)
    expect(mockResolve).toHaveBeenCalledWith({
      hash: undefined,
      modelVersionId: 135867,
      name: undefined,
      baseModelFamily: undefined,
    })
  })

  it('passes the requested base model family to the resolver', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', {
        name: 'detailed hand focus style illustriousXL v1.1',
        baseModelFamily: 'Illustrious',
      }),
    )

    expect(response.status).toBe(200)
    expect(mockResolve).toHaveBeenCalledWith({
      hash: undefined,
      modelVersionId: undefined,
      name: 'detailed hand focus style illustriousXL v1.1',
      baseModelFamily: 'Illustrious',
    })
  })

  it('rejects requests with neither hash nor modelVersionId', async () => {
    const response = await GET(createGET('/api/lora-assets/civitai/resolve'))
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('rejects malformed hashes', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', { hash: 'not-hex!!' }),
    )

    expect(response.status).toBe(400)
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('ignores a malformed hash when a name fallback is available', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', {
        hash: 'not-hex!!',
        name: 'EnchantingEyesIllustrious',
      }),
    )

    expect(response.status).toBe(200)
    expect(mockFindLocal).toHaveBeenCalledWith('clerk_test_user', {
      hash: undefined,
      modelVersionId: undefined,
      name: 'EnchantingEyesIllustrious',
      baseModelFamily: undefined,
    })
    expect(mockResolve).toHaveBeenCalledWith({
      hash: undefined,
      modelVersionId: undefined,
      name: 'EnchantingEyesIllustrious',
      baseModelFamily: undefined,
    })
  })

  it('returns 404 when the reference cannot be resolved', async () => {
    mockResolve.mockResolvedValueOnce(null)

    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', {
        modelVersionId: '999999',
      }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('returns 502 when the service throws', async () => {
    mockResolve.mockRejectedValueOnce(new Error('Civitai down'))

    const response = await GET(
      createGET('/api/lora-assets/civitai/resolve', {
        modelVersionId: '135867',
      }),
    )

    expect(response.status).toBe(502)
  })
})
