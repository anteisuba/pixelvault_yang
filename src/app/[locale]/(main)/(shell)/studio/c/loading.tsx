import { ChatPageSkeleton } from '@/components/business/studio/shell/ChatPageSkeleton'

/** 切到对话路由 `/studio/c` 的加载骨架。 */
export default function StudioConversationIndexLoading() {
  return (
    <div data-shell-loading aria-busy="true" className="h-page">
      <ChatPageSkeleton withHeader withComposer />
    </div>
  )
}
