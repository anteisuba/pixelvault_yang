import { API_ENDPOINTS } from '@/constants/config'
import {
  DEFAULT_LORA_NSFW_FILTER,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type CivitaiSearchBackend,
  type LoraNsfwFilter,
} from '@/constants/lora'
import type {
  CivitaiLoraLibraryResult,
  CivitaiMinedPromptsResult,
  CivitaiModelDescriptionResult,
  RunnerUsageResult,
  FavoriteLoraRequest,
  LoraAssetRecord,
} from '@/types'

import { normalizeOptionalCivitaiHash } from '@/lib/civitai-lora-reference'
import { getErrorMessage } from '@/lib/api-client/shared'

interface ListResponse {
  success: boolean
  data?: LoraAssetRecord[]
  error?: string
}

interface SingleResponse {
  success: boolean
  data?: LoraAssetRecord
  error?: string
  errorCode?: string
}

interface CivitaiListResponse {
  success: boolean
  data?: CivitaiLoraLibraryResult
  error?: string
}

export async function listLoraAssetsAPI(): Promise<ListResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LORA_ASSETS)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as ListResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function listDiscoverLoraAssetsAPI(): Promise<ListResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.LORA_ASSETS}/discover`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as ListResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function listCivitaiLoraAssetsAPI(params: {
  page?: number
  pageSize?: number
  cursor?: string | null
  search?: string
  baseModel?: CivitaiLoraBaseModel
  sort?: CivitaiLoraSort
  nsfwFilter?: LoraNsfwFilter
  /**
   * Issue C（docs/plans/lora-search-image-audit-2026-07.md）：本次搜索会话
   * 内锁定的 meilisearch/REST 后端选择，由 useCivitaiLoraLibrary 在首页拿
   * 到结果后回填，第 2+ 页原样带上，防止会话中途换后端打乱分页契约。
   */
  source?: CivitaiSearchBackend
}): Promise<CivitaiListResponse> {
  try {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.cursor) query.set('cursor', params.cursor)
    if (params.search) query.set('search', params.search)
    if (params.baseModel) query.set('baseModel', params.baseModel)
    if (params.sort) query.set('sort', params.sort)
    if (params.nsfwFilter && params.nsfwFilter !== DEFAULT_LORA_NSFW_FILTER) {
      query.set('nsfw', params.nsfwFilter)
    }
    if (params.source) query.set('source', params.source)

    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS_CIVITAI}?${query.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as CivitaiListResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

interface CivitaiMinedPromptsResponse {
  success: boolean
  data?: CivitaiMinedPromptsResult
  error?: string
}

export async function mineCivitaiLoraPromptsAPI(params: {
  modelId: number
  modelVersionId?: number
  // Optional — search-hit LoRAs (meilisearch path) never carry a file hash.
  // See Issue A, docs/plans/lora-search-image-audit-2026-07.md.
  fileHash?: string
}): Promise<CivitaiMinedPromptsResponse> {
  try {
    const query = new URLSearchParams()
    query.set('modelId', String(params.modelId))
    if (params.modelVersionId !== undefined) {
      query.set('modelVersionId', String(params.modelVersionId))
    }
    if (params.fileHash) {
      query.set('fileHash', params.fileHash)
    }

    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS_CIVITAI_MINED_PROMPTS}?${query.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as CivitaiMinedPromptsResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

interface CivitaiModelDescriptionResponse {
  success: boolean
  data?: CivitaiModelDescriptionResult
  error?: string
}

// 方向 A：LoRA 详情面板懒加载作者描述（strip 后的纯文本）。任何 LoRA 都可拉。
export async function fetchCivitaiModelDescriptionAPI(
  modelId: number,
): Promise<CivitaiModelDescriptionResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS_CIVITAI_DESCRIPTION}?modelId=${modelId}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as CivitaiModelDescriptionResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

interface RunnerUsageResponse {
  success: boolean
  data?: RunnerUsageResult
  error?: string
}

// 全站 runner 月度额度快照（「本月剩余 N/300」主动提示）。
export async function fetchRunnerUsageAPI(): Promise<RunnerUsageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.RUNNER_USAGE)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as RunnerUsageResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

interface ResolveCivitaiLoraResponse {
  success: boolean
  // 本地库命中返回 LoraAssetRecord；Civitai 命中返回其超集
  // CivitaiLoraLibraryItem — 统一按基类型消费。
  data?: LoraAssetRecord
  error?: string
}

/**
 * 把配方里的"其它 LoRA"解析成可挂载条目（一键补挂）：本地库优先
 * （hash/versionId/名字归一），未命中再走 Civitai（by-id → by-hash →
 * 拆词搜索）。三个参数至少给一个。
 */
export async function resolveCivitaiLoraAPI(params: {
  hash?: string
  modelVersionId?: number
  name?: string
  baseModelFamily?: string
}): Promise<ResolveCivitaiLoraResponse> {
  try {
    const query = new URLSearchParams()
    const hash = normalizeOptionalCivitaiHash(params.hash)
    if (hash) query.set('hash', hash)
    if (params.modelVersionId !== undefined) {
      query.set('modelVersionId', String(params.modelVersionId))
    }
    if (params.name) query.set('name', params.name)
    if (params.baseModelFamily) {
      query.set('baseModelFamily', params.baseModelFamily)
    }

    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS_CIVITAI_RESOLVE}?${query.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as ResolveCivitaiLoraResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

interface SingleAssetResponse {
  success: boolean
  data?: LoraAssetRecord
  error?: string
  errorCode?: string
}

export async function setLoraAssetVisibilityAPI(
  loraAssetId: string,
  isPublic: boolean,
): Promise<SingleAssetResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS}/${encodeURIComponent(loraAssetId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic }),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as SingleAssetResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function updateLoraAssetCoverAPI(
  loraAssetId: string,
  coverImageUrl: string,
): Promise<SingleAssetResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS}/${encodeURIComponent(loraAssetId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverImageUrl }),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as SingleAssetResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function favoriteLoraAPI(
  input: FavoriteLoraRequest,
): Promise<SingleAssetResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LORA_ASSETS_FAVORITE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as SingleAssetResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function unfavoriteLoraAPI(
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS_FAVORITE}?assetId=${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

/**
 * Permanently delete a self-trained LoRA asset.
 * Only owner + source==='trained' is allowed by the backend; UI must
 * gate the call so users never see a 403.
 */
export async function deleteLoraAssetAPI(
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS}/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function getLoraAssetByCodeAPI(
  code: string,
): Promise<SingleResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSET_BY_CODE}/${encodeURIComponent(code)}`,
    )
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Not found', errorCode: 'NOT_FOUND' }
      }
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as SingleResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}
