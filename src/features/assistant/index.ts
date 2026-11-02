/**
 * 助手域的对外入口（客户端）。域外只从这里引，⛔ 直引域内文件
 *（见 docs/design/features-migration.md）。
 */
export { AssistantAvatarGlyph } from './components/operator/AssistantAvatarGlyph'
export { AssistantSettingsDialog } from './components/operator/AssistantSettingsDialog'
export {
  AvatarDisc,
  StudioOperatorAvatarSwitcher,
  StudioOperatorChatModeChip,
  StudioOperatorCurrentAvatar,
} from './components/operator/StudioOperatorAvatarSwitcher'
export { StudioOperatorBenchDock } from './components/operator/StudioOperatorBenchDock'
export { StudioOperatorConfirmCard } from './components/operator/StudioOperatorConfirmCard'
export { StudioOperatorDock } from './components/operator/StudioOperatorDock'
export { StudioOperatorModelChip } from './components/operator/StudioOperatorModelChip'
export { StudioOperatorQueueCard } from './components/operator/StudioOperatorQueueCard'
export { StudioOperatorResultRow } from './components/operator/StudioOperatorResultRow'
export {
  SESSION_ROW_MENU_ATTR,
  StudioOperatorSessionDeleteDialog,
  StudioOperatorSessionRow,
} from './components/operator/StudioOperatorSessionRow'
export {
  ASSISTANT_SETTINGS_SECTIONS,
  AssistantSettings,
  type AssistantSettingsSection,
} from './components/settings/AssistantSettings'
