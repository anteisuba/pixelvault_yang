import { ChatPageSkeleton } from '@/components/business/studio/shell/ChatPageSkeleton'

/** 切到具体对话 `/studio/c/[id]` 的加载骨架。 */
export default function StudioConversationDetailLoading() {
  return (
    <div data-shell-loading aria-busy="true" className="h-page">
      <ChatPageSkeleton withHeader withComposer />
    </div>
  )
}
