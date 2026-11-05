import type { CharacterCardRecord } from '@/types'
import { QUERY_KEYS } from '@/constants/query'
import { listCharacterCardsAPI } from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-client/error-fields'
import { queryClient } from '@/lib/query-client'

/**
 * 你的角色卡列表那一份共用查询（`QUERY_KEYS.characterCards`）：`useCharacterCards`
 * （角色页 / 工作台，带增删改）、`useCharacterLibrary`（画布，只读）、`useChatCharacters`
 * （换人菜单）都读它 —— 切页、多处同时挂只拉一次。
 */
async function fetchCharacterCards(): Promise<CharacterCardRecord[]> {
  const response = await listCharacterCardsAPI()
  if (!response.success || !response.data) throw new ApiClientError(response)
  return response.data
}

export const characterCardsQuery = {
  queryKey: QUERY_KEYS.characterCards,
  queryFn: fetchCharacterCards,
}

/** 不管新不新都现拉一次（同一时刻只有一个请求）；失败留着手里那份，不往外抛。 */
export async function refreshCharacterCards(): Promise<void> {
  try {
    await queryClient.fetchQuery({ ...characterCardsQuery, staleTime: 0 })
  } catch {
    // 查询自己记着错误，挂着的地方从 `isError` 读。
  }
}

/**
 * 写请求回来改那一份，所有挂着的地方一起变。还没拉回来过就不凭空造一份残的列表
 * —— 让它重拉（正在飞的那次可能没带上刚写的这张）。
 */
export function updateCharacterCardsCache(
  update: (cards: CharacterCardRecord[]) => CharacterCardRecord[],
): void {
  if (queryClient.getQueryData(QUERY_KEYS.characterCards) === undefined) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characterCards })
    return
  }
  queryClient.setQueryData<CharacterCardRecord[]>(
    QUERY_KEYS.characterCards,
    (prev) => (prev ? update(prev) : prev),
  )
}
