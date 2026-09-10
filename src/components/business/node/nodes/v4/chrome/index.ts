/**
 * 画布节点的**共用界面件**（v3 spec §9 的 S0 基座）。
 *
 * 四类节点（S2–S6）只从这里拿壳，⛔ 不各自复制一份工具条 / 提示词栏 / 弹层。
 * 这一层**不认识节点**：没有 context、不发 op、不碰槽，全部靠 props 描述。
 */

export { NodeCardShell, type NodeCardShellProps } from './NodeCardShell'
export {
  NodeToolbar,
  type NodeToolbarProps,
  type NodeToolbarAction,
  type NodeToolbarGroup,
} from './NodeToolbar'
export { NodePromptBar, type NodePromptBarProps } from './NodePromptBar'
export { ChipPopover, type ChipPopoverProps } from './ChipPopover'
export {
  MentionChip,
  type MentionChipProps,
  type MentionChipMedia,
} from './MentionChip'
export {
  parseMentions,
  mentionDeletionRangeAt,
  type MentionSegment,
  type MentionSegmentMention,
  type MentionSegmentText,
  type ParseMentionsOptions,
} from './parse-mentions'
export { VersionDots, type VersionDotsProps } from './VersionDots'
export {
  NodeFrameProgress,
  type NodeFrameProgressProps,
} from './NodeFrameProgress'
export { QuickLook, type QuickLookProps } from './QuickLook'
export { NodeFrame, type NodeFrameProps } from './NodeFrame'
