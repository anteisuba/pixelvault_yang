/**
 * 服务端项目列表 **合并**进本地快照（S11b）。
 *
 * ── 它补的是哪个洞 ──────────────────────────────────────────────────────
 * 服务端水化原本是**整份替换**：`{ ...projects: serverProjects, currentProjectId:
 * projects[0].id }`。于是首屏那一小段窗口（localStorage 已经读出来、`GET
 * /api/node-workflow/projects` 还没回）里做的任何事都会被无声抹掉 —— 建了三张卡、
 * 拖了一条线、改了个名，列表一回来全没了；更糟的是**当前项目会跳**到服务端
 * `lastActiveAt` 最新的那个，用户正在看的那张画布换成了另一张。
 *
 * ── 谁赢 ────────────────────────────────────────────────────────────────
 * 服务端仍然是**成员名单**的事实源（有哪些项目、叫什么顺序）；本地只在两种情况下
 * 顶掉某一个项目的 `state`：
 *
 *   1. 这个项目**在本会话、服务端水化之前被改过**（`editedBeforeHydration`）——
 *      那就是上面说的窗口，本地一定比服务端新，⛔ 不许用时间戳去赌；
 *   2. 本地 `updatedAt` **严格晚于**服务端 —— 上一次会话写盘了但防抖的那次 PUT
 *      没发出去（关标签页 / 断网）。
 *
 * ⚠ **只读记录一律用服务端的**：v3 备份失败的项目进只读闸，本地那份 v4 是升级
 * 结果，让它顶上去等于绕过「备份不成功就不写」这条纪律。
 *
 * ⚠ **本地独有的项目只保留窗口里改过的那些**。理由是对称的：窗口里新建的项目是
 * 用户刚做的东西（localStorage 空的新浏览器就是这条路），不留就等于清空；而没被
 * 改过的本地独有项目多半是**在另一台设备上删掉了**的残留，留着会变成一张写不回
 * 服务端的僵尸卡。
 *
 * ⛔ 纯函数：不读时钟、不碰 storage、不发请求。
 */

import type {
  NodeWorkflowProjectV4,
  NodeWorkflowStorageV4Snapshot,
} from '@/types/node-workflow'

export interface AdoptMergeOptions {
  /** 合并前的本地快照（localStorage 水化 + 窗口里的改动）。 */
  readonly local: NodeWorkflowStorageV4Snapshot
  /** 服务端记录，**已经过 v3 → v4 升级**，顺序即服务端顺序（lastActiveAt 倒序）。 */
  readonly server: readonly NodeWorkflowProjectV4[]
  /** 当前登录用户 —— 本地快照不属于他时整份忽略。 */
  readonly ownerClerkId: string
  /** 本会话在服务端水化之前被改过的项目 id。 */
  readonly editedBeforeHydration: ReadonlySet<string>
  /** 升级失败 → 只读的服务端记录 id。 */
  readonly readOnlyIds: ReadonlySet<string>
}

/** `undefined` = 读不出时间（坏数据 / 空串）——读不出就不许它赢。 */
function timeOf(value: string): number | undefined {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function localWins(
  local: NodeWorkflowProjectV4,
  server: NodeWorkflowProjectV4,
  editedBeforeHydration: ReadonlySet<string>,
): boolean {
  if (editedBeforeHydration.has(local.id)) return true
  const localAt = timeOf(local.updatedAt)
  const serverAt = timeOf(server.updatedAt)
  if (localAt === undefined || serverAt === undefined) return false
  return localAt > serverAt
}

export function mergeAdoptedProjects(
  options: AdoptMergeOptions,
): NodeWorkflowStorageV4Snapshot {
  const { local, server, ownerClerkId, editedBeforeHydration, readOnlyIds } =
    options

  const base = (): NodeWorkflowStorageV4Snapshot => ({
    ...local,
    ownerClerkId,
    currentProjectId: server[0]?.id ?? local.currentProjectId,
    projects: [...server],
  })

  // 上一个账号留在这台机器上的快照 —— 一个字都不合并。
  if (local.ownerClerkId !== ownerClerkId) return base()
  if (server.length === 0) return base()

  const localById = new Map(local.projects.map((p) => [p.id, p]))

  const merged: NodeWorkflowProjectV4[] = server.map((serverProject) => {
    if (readOnlyIds.has(serverProject.id)) return serverProject
    const localProject = localById.get(serverProject.id)
    if (!localProject) return serverProject
    if (!localWins(localProject, serverProject, editedBeforeHydration)) {
      return serverProject
    }
    // ⚠ 只把**内容**留在本地这一侧（名字 / state / updatedAt）：`id` 与
    // `createdAt` 是服务端的身份，⛔ 不让本地那份把它们改写掉。
    return {
      ...serverProject,
      name: localProject.name,
      state: localProject.state,
      updatedAt: localProject.updatedAt,
    }
  })

  const serverIds = new Set(server.map((p) => p.id))
  const keptLocalOnly = local.projects.filter(
    (p) => !serverIds.has(p.id) && editedBeforeHydration.has(p.id),
  )
  const projects = [...merged, ...keptLocalOnly]

  // 当前项目**不跳**：本地那个还在名单上就一动不动。
  const keepsCurrent = projects.some((p) => p.id === local.currentProjectId)

  return {
    ...local,
    ownerClerkId,
    currentProjectId: keepsCurrent
      ? local.currentProjectId
      : (projects[0]?.id ?? local.currentProjectId),
    projects,
  }
}
