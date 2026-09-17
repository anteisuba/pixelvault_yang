'use client'

/**
 * 输入区「+」菜单（v2 §4.4 · 画板 BCards「+」展开态）。
 *
 * ⭐ **三项，不多不少**：提及素材 / 上下文卡 / 指定来源。
 * ⛔ **「附件」不在这里**：上传搬到了下行那颗回形针按钮上（v2 §4.4 的「上行文本框 /
 * 下行 `+` · 上传 · 模型 chip · 发送」）—— 最常用的一下不该藏在两跳之后。
 *
 * ⭐ **提及素材不另造选择器**：它插一个 `@` 再把焦点还给输入框，弹出来的是
 * `MentionInput` 现有的那一颗（v1 的五入口一条管线，见 `use-studio-operator-mention`）。
 * 在这里再画一份「挑一张图」的界面，就是第二条会分叉的引用链。
 *
 * ⭐ **上下文卡就地列**：`useContextCards()` 的那一份，点一张 = `pickCard` 挂上
 * 并关掉菜单，与 chip 的摘除钮是同一排。一张都没有时给的是「新建一张」这条
 * 下一步（`ContextCardDialog`），⛔ 不摆白板。
 *
 * ⭐ **指定来源就地选**（v2 §9.3，commit #17）：四个连接器 + 一个域名框，
 * 选中的那几个**只作用于本轮**（随请求上送，⛔ 不写库）。要一直生效的那份住在
 * 设置弹层的规则页里 —— 这一页有意不提供「保存为规则」：临时与常设是两个决定，
 * 一颗按钮同时干两件事的表现是用户以为自己只指了这一轮，结果改了往后每一轮。
 * ⚠ 服务端把它与库里的名单并起来时**临时的优先**，黑名单照旧永远生效。
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AtSign, Check, IdCard, Plus, Search } from '@/components/icons'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_PLUS_CARD_LIMIT,
  STUDIO_OPERATOR_PLUS_MENU_IDS,
  STUDIO_OPERATOR_PLUS_MENU_ITEMS,
  type StudioOperatorPlusMenuId,
} from '@/constants/studio-assistant-operator'
import {
  ASSISTANT_RESEARCH_SOURCES,
  ASSISTANT_SOURCE_ALLOWLIST_LIMITS,
} from '@/constants/assistant-operator'
import {
  setOperatorSourceAllowlist,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { normalizeProjectRuleSourceToken } from '@/types/assistant-persona'
import { ContextCardChip } from '@/components/business/studio/assistant-operator/ContextCardChip'
import { ContextCardDialog } from '@/components/business/studio/assistant-operator/ContextCardDialog'
import { useContextCards } from '@/hooks/use-context-cards'
import { Spinner } from '@/components/ui/spinner'
import { motionTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'
import type { ContextCard } from '@/types/context-cards'
import type { StudioOperatorCardMention } from '@/types/studio-assistant-operator'

export const STUDIO_OPERATOR_PLUS_MENU_ID = 'studio-operator-plus-menu'

const MENU_ICONS: Record<StudioOperatorPlusMenuId, typeof AtSign> = {
  [STUDIO_OPERATOR_PLUS_MENU_IDS.mention]: AtSign,
  [STUDIO_OPERATOR_PLUS_MENU_IDS.contextCard]: IdCard,
  [STUDIO_OPERATOR_PLUS_MENU_IDS.source]: Search,
}

interface StudioOperatorPlusMenuProps {
  onDismiss(): void
  triggerRef: RefObject<HTMLButtonElement | null>
  /** 唤出 `@` 选择器（插 `@` + 聚焦输入框）。 */
  onPickMention(): void
  /** 挂一张上下文卡 —— 落到 `useStudioOperatorMention().pickCard` 那一条。 */
  onPickCard(card: StudioOperatorCardMention): void
  /** 当前工作台的域 id —— 新建卡时的「常挂到这里」认它。 */
  scope?: string
}

function toCardMention(card: ContextCard): StudioOperatorCardMention {
  return {
    cardId: card.id,
    name: card.name,
    kind: card.kind,
    ...(card.images?.length ? { images: card.images } : {}),
  }
}

export function StudioOperatorPlusMenu({
  onDismiss,
  triggerRef,
  onPickMention,
  onPickCard,
  scope,
}: StudioOperatorPlusMenuProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  const menuRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'root' | 'cards' | 'sources'>('root')
  /**
   * ⚠ 名单的真值在 store（它要跟着**这条还没发出去的消息**走，而菜单一关就卸载）；
   * 这里只存域名框里正在打的那几个字。
   */
  const { sourceAllowlist } = useStudioOperatorState()
  const [domainDraft, setDomainDraft] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  /**
   * ⚠ `enabled` 跟着 `view`：菜单一打开就拉一遍卡表，等于每点一次「+」都打一发
   * 请求，而绝大多数点开只是为了 `@`。进了卡片档再拉。
   */
  const cards = useContextCards({ enabled: view === 'cards' })
  const visibleCards = useMemo(
    () => cards.cards.slice(0, STUDIO_OPERATOR_PLUS_CARD_LIMIT),
    [cards.cards],
  )

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>('button:not(:disabled), [href], [tabindex]')
      ?.focus()
  }, [view])

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      if (
        target instanceof Element &&
        (target.closest('[data-operator-plus-trigger]') ||
          target.closest('[data-slot^="dialog-"]'))
      ) {
        return
      }
      onDismiss()
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      // Studio 在 window 上还有一层 Escape 快捷键；这里已经消费了这一下，
      // 必须截断冒泡，否则会关完菜单后顺手把整个助手也收起。
      event.stopPropagation()
      onDismiss()
      // 等宿主完成浮层卸载后再聚焦，避免焦点跟着已移除节点一起掉回 body。
      window.setTimeout(() => {
        const trigger =
          triggerRef.current ??
          document.querySelector<HTMLButtonElement>(
            '[data-operator-plus-trigger]',
          )
        trigger?.focus()
      }, 0)
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      )
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onDismiss, triggerRef])

  return (
    <motion.div
      ref={menuRef}
      id={STUDIO_OPERATOR_PLUS_MENU_ID}
      role="dialog"
      aria-label={t('plusMenu.label')}
      data-testid="operator-plus-menu"
      data-view={view}
      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={motionTransition('base', reduceMotion)}
      /* 三层玻璃③：**浮层**（§12.1）——唯一真正半透 + 模糊的一层 + 强投影。 */
      className="absolute bottom-24 left-3 z-20 w-56 origin-bottom-left rounded-xl border border-assistant-line-strong p-1.5 assistant-glass-overlay shadow-assistant-overlay"
    >
      {view === 'root' ? (
        <div className="flex flex-col gap-0.5">
          {STUDIO_OPERATOR_PLUS_MENU_ITEMS.map((id) => {
            const Icon = MENU_ICONS[id]
            const picked =
              id === STUDIO_OPERATOR_PLUS_MENU_IDS.source
                ? sourceAllowlist.length
                : 0
            return (
              <button
                key={id}
                type="button"
                data-testid={`operator-plus-item-${id}`}
                onClick={() => {
                  if (id === STUDIO_OPERATOR_PLUS_MENU_IDS.mention) {
                    onPickMention()
                    onDismiss()
                    return
                  }
                  if (id === STUDIO_OPERATOR_PLUS_MENU_IDS.contextCard) {
                    setView('cards')
                    return
                  }
                  setView('sources')
                }}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">{t(`plusMenu.items.${id}`)}</span>
                {picked > 0 ? (
                  <span
                    data-testid="operator-plus-source-count"
                    className="text-3xs text-muted-foreground"
                  >
                    {t('plusMenu.sourcesPicked', { count: picked })}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : view === 'sources' ? (
        /*
          ⭐ **单轮临时白名单**（§9.3）：四个连接器 + 一个域名框。
          ⚠ 一条都没选 = 不限来源（助手照常按题选源），⛔ 不是「什么都不许打」——
            一个空名单在用户眼里就是「我还没指定」。
        */
        <div
          data-testid="operator-plus-sources"
          className="flex flex-col gap-1.5"
        >
          <button
            type="button"
            data-testid="operator-plus-sources-back"
            onClick={() => setView('root')}
            className="self-start rounded-md px-1.5 py-1 text-3xs uppercase tracking-nav text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground"
          >
            {t('plusMenu.back')}
          </button>
          <p className="px-1.5 text-3xs text-muted-foreground">
            {t('plusMenu.sourcesHint')}
          </p>
          {ASSISTANT_RESEARCH_SOURCES.map((source) => {
            const checked = sourceAllowlist.includes(source)
            return (
              <button
                key={source}
                type="button"
                role="checkbox"
                aria-checked={checked}
                data-testid={`operator-plus-source-${source}`}
                onClick={() =>
                  setOperatorSourceAllowlist(
                    checked
                      ? sourceAllowlist.filter((item) => item !== source)
                      : [...sourceAllowlist, source],
                  )
                }
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-sm border border-border',
                    checked &&
                      'border-primary bg-primary text-primary-foreground',
                  )}
                  aria-hidden
                >
                  {checked ? <Check className="size-3" /> : null}
                </span>
                <span className="flex-1">
                  {t(`plusMenu.sources.${source}`)}
                </span>
              </button>
            )
          })}
          {/* 名单里那些**域名** —— 与四个连接器同一份名单，只是来源不同。 */}
          {sourceAllowlist
            .filter(
              (item) =>
                !ASSISTANT_RESEARCH_SOURCES.some((source) => source === item),
            )
            .map((domain) => (
              <button
                key={domain}
                type="button"
                data-testid={`operator-plus-source-domain-${domain}`}
                aria-label={t('plusMenu.sourcesRemove', { source: domain })}
                onClick={() =>
                  setOperatorSourceAllowlist(
                    sourceAllowlist.filter((item) => item !== domain),
                  )
                }
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground"
                  aria-hidden
                >
                  <Check className="size-3" />
                </span>
                <span className="flex-1 truncate">{domain}</span>
              </button>
            ))}
          <form
            className="flex items-center gap-1.5 px-1.5 pb-1"
            onSubmit={(event) => {
              event.preventDefault()
              const token = normalizeProjectRuleSourceToken(domainDraft)
              if (!token) return
              setDomainDraft('')
              if (
                sourceAllowlist.length >=
                ASSISTANT_SOURCE_ALLOWLIST_LIMITS.maxPerTurn
              ) {
                return
              }
              setOperatorSourceAllowlist([...sourceAllowlist, token])
            }}
          >
            <input
              type="text"
              inputMode="url"
              data-testid="operator-plus-source-domain-input"
              aria-label={t('plusMenu.sourcesDomainLabel')}
              placeholder={t('plusMenu.sourcesDomainPlaceholder')}
              value={domainDraft}
              maxLength={ASSISTANT_SOURCE_ALLOWLIST_LIMITS.maxTokenChars}
              onChange={(event) => setDomainDraft(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-2sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              data-testid="operator-plus-source-domain-add"
              className="rounded-md px-2 py-1 text-3xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('plusMenu.sourcesDomainAdd')}
            </button>
          </form>
          {sourceAllowlist.length > 0 ? (
            <button
              type="button"
              data-testid="operator-plus-sources-clear"
              onClick={() => setOperatorSourceAllowlist([])}
              className="self-start rounded-md px-1.5 py-1 text-3xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('plusMenu.sourcesClear')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            data-testid="operator-plus-cards-back"
            onClick={() => setView('root')}
            className="self-start rounded-md px-1.5 py-1 text-3xs uppercase tracking-nav text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground"
          >
            {t('plusMenu.back')}
          </button>
          {cards.isLoading ? (
            <div className="flex h-16 items-center justify-center">
              <Spinner size="sm" className="text-muted-foreground" />
            </div>
          ) : visibleCards.length === 0 ? (
            <p className="px-1.5 pb-1 text-2sm text-muted-foreground">
              {t('plusMenu.cardsEmpty')}
            </p>
          ) : (
            <div className="flex max-h-56 flex-col items-start gap-1 overflow-y-auto">
              {visibleCards.map((card) => (
                <ContextCardChip
                  key={card.id}
                  cardId={card.id}
                  name={card.name}
                  kind={card.kind}
                  images={card.images}
                  onSelect={() => {
                    onPickCard(toCardMention(card))
                    onDismiss()
                  }}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            data-testid="operator-plus-card-create"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4 text-muted-foreground" aria-hidden />
            {t('plusMenu.cardsCreate')}
          </button>
          {/*
            ⚠ 先挂上再关菜单：`onPickCard` 会让宿主把整块菜单收掉，连带卸载这颗
              弹层 —— 反过来写的话，弹层内部随后那句 `onOpenChange(false)` 落在
              一个已经卸载的组件上。
          */}
          <ContextCardDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            {...(scope ? { scope } : {})}
            onSaved={(card) => {
              setCreateOpen(false)
              onPickCard(toCardMention(card))
              onDismiss()
            }}
          />
        </div>
      )}
    </motion.div>
  )
}
