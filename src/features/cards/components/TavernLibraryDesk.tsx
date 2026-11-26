'use client'

import { useState } from 'react'

import { cardManagementPath } from '@/constants/routes'
import {
  CharacterLibrary,
  CharacterLibraryToolbar,
} from '@/features/cards/components/CharacterLibrary'
import { useCharacterCards } from '@/features/cards/hooks/use-character-cards'
import { useChubLibrary } from '@/features/cards/hooks/use-chub-library'
import { useRouter } from '@/i18n/navigation'

/**
 * 酒馆库（`/library/tavern`，用户 10-25）：chub.ai 上的公开酒馆卡，从角色库里拆出来单独成库 ——
 * 库只放公开来源那几样（LoRA · 酒馆 · 标签 · 音色）。同一副库骨架：一行工具行（分级 · 标签 ………
 * 搜索 · 排序）· 格子 —— 只有一个分组，不画分组药丸。点「做成角色」建好就去角色页打开她。
 */
export function TavernLibraryDesk() {
  const library = useChubLibrary(true)
  const characters = useCharacterCards()
  const router = useRouter()
  /** 正在建成角色的那一张（一次一张）。 */
  const [importing, setImporting] = useState<string | null>(null)

  const importFromLibrary = async (fullPath: string) => {
    if (importing) return
    setImporting(fullPath)
    const card = await characters.importChub(fullPath)
    setImporting(null)
    if (card) router.push(cardManagementPath({ character: card.id }))
  }

  return (
    <main className="flex h-page bg-background px-3 pt-2.5 text-foreground md:px-5.5 md:pt-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <CharacterLibraryToolbar library={library} />
        <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto pb-6 md:mt-3">
          <CharacterLibrary
            library={library}
            sortChips={false}
            importingPath={importing}
            onImport={(fullPath) => void importFromLibrary(fullPath)}
          />
        </div>
      </div>
    </main>
  )
}
