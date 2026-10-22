import { API_ENDPOINTS } from '@/constants/config'
import type { CharacterLoraGroup, FavoriteLoraRequest } from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

interface CharacterLoraGroupsResponse {
  success: boolean
  data?: CharacterLoraGroup[]
  error?: string
}

async function readGroups(
  request: Promise<Response>,
): Promise<CharacterLoraGroupsResponse> {
  try {
    const response = await request
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as CharacterLoraGroupsResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

/** 每个角色收的 LoRA；给 `characterCardId` 只取那一位。 */
export function listCharacterLorasAPI(
  characterCardId?: string,
): Promise<CharacterLoraGroupsResponse> {
  const query = characterCardId
    ? `?characterCardId=${encodeURIComponent(characterCardId)}`
    : ''
  return readGroups(fetch(`${API_ENDPOINTS.CHARACTER_LORAS}${query}`))
}

/** 这个 LoRA 属于哪些角色（整组替换），返回替换后所有角色的分组。 */
export function setLoraCharactersAPI(
  lora: FavoriteLoraRequest,
  characterCardIds: readonly string[],
): Promise<CharacterLoraGroupsResponse> {
  return readGroups(
    fetch(API_ENDPOINTS.CHARACTER_LORAS, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lora, characterCardIds }),
    }),
  )
}
