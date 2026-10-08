import { SettingsLayoutFrame } from '@/components/business/settings/SettingsShell'

/**
 * `/settings` 的外壳挂在**布局**上，不在分区页里（owner 2026-10-08 设置页原型 v1）：
 * `[section]` 页按参数整段重挂，外壳放在页里的话每次换分区导航都是新的一份，
 * 选中灰块就没法从上一行滑过来。一级列表（`/settings` 本身）不套外壳。
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SettingsLayoutFrame>{children}</SettingsLayoutFrame>
}
