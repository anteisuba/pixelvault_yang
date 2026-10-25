'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CHUB_LIBRARY } from '@/constants/cards/chub-library'
import { cardManagementPath } from '@/constants/routes'
import { LayoutGrid } from '@/components/icons'
import { LibraryRail, LibraryRailRow } from '@/components/ui/library-kit'
import {
  CharacterLibrary,
  CharacterLibraryToolbar,
} from '@/components/business/cards/CharacterLibrary'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useChubLibrary } from '@/hooks/cards/use-chub-library'
import { useRouter } from '@/i18n/navigation'

/**
 * 酒馆库（`/library/tavern`，用户 10-25）：chub.ai 上的公开酒馆卡，从角色库里拆出来单独成库 ——
 * 库只放公开来源那几样（LoRA · 酒馆 · 标签 · 音色）。同一副库骨架：左栏（来源写在计数位）·
 * 搜索 + 筛选 · 格子；点「做成角色」建好就去角色页打开她。
 */
export function TavernLibraryDesk() {
  const t = useTranslations('CharacterRoster')
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
    <main className="flex h-page gap-8 bg-background pt-3 pr-5.5 text-foreground max-md:px-4">
      <LibraryRail label={t('tabLibrary')} className="pt-0.5 max-md:hidden">
        <LibraryRailRow
          icon={<LayoutGrid aria-hidden />}
          label={t('library.all')}
          trailing={CHUB_LIBRARY.SOURCE_LABEL}
          active
          onSelect={() => undefined}
        />
      </LibraryRail>
      <div className="flex min-w-0 flex-1 flex-col">
        <CharacterLibraryToolbar library={library} />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
          <CharacterLibrary
            library={library}
            importingPath={importing}
            onImport={(fullPath) => void importFromLibrary(fullPath)}
          />
        </div>
      </div>
    </main>
  )
}
