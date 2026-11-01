/**
 * 设置域的对外入口（客户端）。域外只从这里引，⛔ 直引域内文件
 *（见 docs/design/features-migration.md）。
 */
export { SettingsIndexView } from './components/SettingsIndexView'
export { SettingsSectionView } from './components/SettingsSectionView'
export { SettingsLayoutFrame } from './components/SettingsShell'
export { isSettingsSection } from './constants'
