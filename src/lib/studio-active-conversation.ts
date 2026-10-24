/**
 * 外壳此刻开着哪段助手对话（第 9f 步 9f-3）。外壳挂着时由它写（`StudioShell`），出图 / 视频 /
 * 3D 的 api-client 发请求时读，把编号带给服务端记到任务上 —— 左边列表的封面、进度圈、小点
 * 都靠这条关联。
 *
 * ⭐ 为什么是模块级的一格而不是一路传参：出图入口散在各台、助手代出、画布（十来处），对话编号
 *   只有外壳知道；一路传参等于让每一台都认识「对话」。这里只有外壳写、api-client 读两处。
 * ⚠ 不在外壳里（外壳没挂）= `null`，请求就不带，任务照旧只是没有对话。
 */
let activeConversationId: string | null = null

export function setActiveStudioConversation(id: string | null): void {
  activeConversationId = id
}

export function activeStudioConversation(): string | null {
  return activeConversationId
}

/** 服务端建好任务大约要这么久；同步出图的请求要等出完才回来，这一拍先让列表看见进度圈。 */
const JOB_CREATED_GRACE_MS = 1500

/** 请求体带上当前对话（调用方自己写了就用它的）。 */
export function withActiveStudioConversation<
  T extends { conversationId?: string },
>(params: T): T {
  if (params.conversationId || !activeConversationId) return params
  setTimeout(notifyStudioConversationActivity, JOB_CREATED_GRACE_MS)
  return { ...params, conversationId: activeConversationId }
}

type Listener = () => void
const activityListeners = new Set<Listener>()

/** 对话里刚发出一枪（请求回来了）：左边列表立刻去问一次进度，⛔ 等下一轮。 */
export function notifyStudioConversationActivity(): void {
  for (const listener of activityListeners) listener()
}

export function onStudioConversationActivity(listener: Listener): () => void {
  activityListeners.add(listener)
  return () => activityListeners.delete(listener)
}
