'use client'

import { CharacterRoster } from '@/components/business/cards/CharacterRoster'

/**
 * /cards 页面内容：卡片重设计 K3（网格 + 侧栏，owner 09-26）。
 *
 * ⚠ 只剩角色卡：画风卡、背景卡两个页签下线（owner 09-25「卡片收敛到只剩角色卡」）。
 *   它们的数据与工作台里的卡片模式照旧，只是不再从这里管理。
 */
export function CardsPageContent() {
  return (
    <main className="flex h-[calc(100svh-3rem)] flex-col bg-surface-workbench p-4 text-foreground">
      <CharacterRoster />
    </main>
  )
}
