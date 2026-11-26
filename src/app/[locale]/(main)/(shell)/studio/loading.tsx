import { ChatPageSkeleton } from '@/components/business/studio/shell/ChatPageSkeleton'

/**
 * 换台 / 开台时新台还没到的那一拍：桌面保持轻空（避免闪旧侧栏，10-26 约定）；
 * 手机端切进对话/工作台时展示 Apple 风格骨架，避免白屏闪动。
 */
export default function StudioLoading() {
  return (
    <div data-shell-loading aria-busy="true" className="h-full">
      <div className="h-full lg:hidden">
        <ChatPageSkeleton withHeader withComposer />
      </div>
    </div>
  )
}
