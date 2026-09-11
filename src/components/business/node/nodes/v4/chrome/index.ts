/**
 * 画布节点的**共用界面件**（v3 spec §9 的 S0 基座）。
 *
 * 四类节点（S2–S6）只从这里拿壳，⛔ 不各自复制一份工具条 / 提示词栏 / 弹层。
 * 这一层**不认识节点**：没有 context、不发 op、不碰槽，全部靠 props 描述。
 */

export { NodeCardShell, type NodeCardShellProps } from './NodeCardShell'
export {
  NodePorts,
  portSpecOf,
  type NodePortsProps,
  type NodePortSpec,
} from './NodePorts'
export {
  NodeToolbar,
  type NodeToolbarProps,
  type NodeToolbarAction,
  type NodeToolbarGroup,
} from './NodeToolbar'
export {
  NodePromptBar,
  type NodePromptBarProps,
  type PromptBarSelection,
} from './NodePromptBar'
export {
  PromptBarMark,
  PromptBarMarkHidden,
  PROMPT_BAR_MARK_VARIANTS,
  type PromptBarMarkProps,
  type PromptBarMarkVariant,
} from './PromptBarMark'
export { ChipPopover, type ChipPopoverProps } from './ChipPopover'
export {
  MentionChip,
  type MentionChipProps,
  type MentionChipMedia,
} from './MentionChip'
export {
  MentionPicker,
  readMentionQuery,
  matchMentionOptions,
  type MentionPickerProps,
  type MentionPickerOption,
  type MentionQuery,
} from './MentionPicker'
export {
  parseMentions,
  mentionDeletionRangeAt,
  type MentionSegment,
  type MentionSegmentMention,
  type MentionSegmentText,
  type ParseMentionsOptions,
} from './parse-mentions'
export {
  renderPromptMentions,
  renderVoicePromptValue,
} from './render-prompt-value'
export { VersionDots, type VersionDotsProps } from './VersionDots'
export {
  NodeFrameProgress,
  type NodeFrameProgressProps,
} from './NodeFrameProgress'
export { QuickLook, type QuickLookProps } from './QuickLook'
export { NodeFrame, type NodeFrameProps } from './NodeFrame'
export {
  ConnectToShotPopover,
  CONNECT_TO_SHOT_FRAME_SLOTS,
  type ConnectToShotPopoverProps,
  type ConnectToShotSourceKind,
  type ConnectToShotTarget,
} from './ConnectToShotPopover'
export {
  flashNodeCard,
  resetNodeCardFlash,
  useNodeCardFlash,
} from './node-card-flash'
export { NodeModelChip, type NodeModelChipProps } from './NodeModelChip'
export {
  useNodeGenerateDraft,
  type NodeGenerateDraft,
  type NodeGenerateDraftOptions,
} from './use-node-generate-draft'
