'use client'

import { memo, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { CardDropdown } from '@/components/business/CardDropdown'
import { modelSupportsLora } from '@/constants/models'
import { buildStudioCardUsageMap } from '@/lib/studio-history'

/**
 * StudioCardSlots — a lightweight row of three card dropdowns
 * (character / background / style) rendered above the prompt in
 * quick image mode. This is the always-visible echo of which cards
 * are active, so users know what is being auto-injected into their
 * generation without having to open the card drawer.
 *
 * Character selection is single-select here (toggle adapter), to
 * keep the slot row visually compact. Multi-character composition
 * still goes through the card drawer.
 */
export const StudioCardSlots = memo(function StudioCardSlots() {
  const { state, dispatch } = useStudioForm()
  const { characters, backgrounds, styles, projects } = useStudioData()
  const t = useTranslations('StudioV2')
  const tBg = useTranslations('BackgroundCard')
  const tV3 = useTranslations('StudioV3')

  const projectHistory = projects.history
  const cardUsage = useMemo(
    () => buildStudioCardUsageMap(projectHistory),
    [projectHistory],
  )

  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null

  const handleCharSelect = useCallback(
    (id: string | null) => {
      if (selectedCharId) characters.toggleCardSelection(selectedCharId)
      if (id) characters.toggleCardSelection(id)
    },
    [selectedCharId, characters],
  )

  const handleManage = useCallback(() => {
    dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
  }, [dispatch])

  const characterCards = useMemo(
    () =>
      characters.cards.map((c) => ({
        id: c.id,
        name: c.name,
        sourceImageUrl: c.sourceImageUrl,
        tags: c.tags,
        createdAt: c.createdAt,
        lastUsedAt: cardUsage.character[c.id] ?? null,
      })),
    [characters.cards, cardUsage.character],
  )

  const backgroundCards = useMemo(
    () =>
      backgrounds.cards.map((c) => ({
        id: c.id,
        name: c.name,
        sourceImageUrl: c.sourceImageUrl ?? null,
        tags: c.tags,
        createdAt: c.createdAt,
        lastUsedAt: cardUsage.background[c.id] ?? null,
      })),
    [backgrounds.cards, cardUsage.background],
  )

  const styleCards = useMemo(
    () =>
      styles.cards.map((c) => ({
        id: c.id,
        name: c.modelId
          ? `${c.name} · ${
              modelSupportsLora(c.modelId)
                ? tV3('loraBadge')
                : tV3('referenceBadge')
            }`
          : c.name,
        sourceImageUrl: c.sourceImageUrl ?? null,
        tags: c.tags,
        createdAt: c.createdAt,
        lastUsedAt: cardUsage.style[c.id] ?? null,
      })),
    [styles.cards, cardUsage.style, tV3],
  )

  return (
    <div
      data-testid="studio-card-slots"
      className="flex flex-wrap items-center gap-2"
    >
      <CardDropdown
        label={t('character')}
        cards={characterCards}
        selectedId={selectedCharId}
        onSelect={handleCharSelect}
        onManage={handleManage}
        isLoading={characters.isLoading}
      />
      <CardDropdown
        label={t('background')}
        cards={backgroundCards}
        selectedId={backgrounds.activeCardId}
        onSelect={backgrounds.setActiveCardId}
        onManage={handleManage}
        isLoading={backgrounds.isLoading}
      />
      <CardDropdown
        label={t('style')}
        cards={styleCards}
        selectedId={styles.activeCardId}
        onSelect={styles.setActiveCardId}
        onManage={handleManage}
        isLoading={styles.isLoading}
      />
    </div>
  )
})
