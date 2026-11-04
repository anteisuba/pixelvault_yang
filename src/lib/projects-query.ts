import type { ProjectRecord } from '@/types'
import { QUERY_KEYS } from '@/constants/query'
import { listProjectsAPI } from '@/lib/api-client/projects'
import { ApiClientError } from '@/lib/api-client/error-fields'
import { queryClient } from '@/lib/query-client'

/**
 * 项目（= 素材文件夹）列表那一份共用查询（`QUERY_KEYS.projects`）：工作台
 * `useProjects`、素材页左栏 `useAssetFolders`、挑素材弹层 `useAssetPickerNavigation`
 * 都读它 —— 切页、多处同时挂只拉一次。
 */
async function fetchProjects(): Promise<ProjectRecord[]> {
  const response = await listProjectsAPI()
  if (!response.success || !response.data) throw new ApiClientError(response)
  return response.data
}

export const projectsQuery = {
  queryKey: QUERY_KEYS.projects,
  queryFn: fetchProjects,
}

/** 不管新不新都现拉一次（同一时刻只有一个请求）；失败留着手里那份，不往外抛。 */
export async function refreshProjects(): Promise<void> {
  try {
    await queryClient.fetchQuery({ ...projectsQuery, staleTime: 0 })
  } catch {
    // 查询自己记着错误，挂着的地方从 `isError` 读。
  }
}

/**
 * 本地先改 / 写请求回来改那一份，所有挂着的地方一起变。还没拉回来过就不凭空造一份
 * 残的列表 —— 让它重拉。
 */
export function updateProjectsCache(
  update: (projects: ProjectRecord[]) => ProjectRecord[],
): void {
  if (queryClient.getQueryData(QUERY_KEYS.projects) === undefined) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects })
    return
  }
  queryClient.setQueryData<ProjectRecord[]>(QUERY_KEYS.projects, (prev) =>
    prev ? update(prev) : prev,
  )
}
