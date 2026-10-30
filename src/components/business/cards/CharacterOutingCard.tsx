'use client'

import { useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Plus } from '@/components/icons'
import { assistantAdapterSupportsImage } from '@/constants/assistant'
import {
  ASSISTANT_ROUTE_MODEL_AUTO,
  getAssistantRouteModelEntry,
  type AssistantRouteModel,
} from '@/constants/assistant-persona'
import {
  CHARACTER_BROWSE_SOURCE_IDS,
  CHARACTER_OUTING,
  type CharacterBrowseSource,
} from '@/constants/character-browse'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { CharacterOutingRun } from '@/types/character-growth'
import { StudioOperatorModelChip } from '@/components/business/studio/assistant-operator/StudioOperatorModelChip'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Progress } from '@/components/ui/progress'
import type { useCharacterGrowth } from '@/hooks/cards'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { cn } from '@/lib/utils'

/**
 * **「现在」卡 + 出门调查弹框**（角色大项目第 ⑤ 步，`docs/design/character-redesign.md`「出门调查」）。
 *
 * ⭐ 没出门：「上次调查：…」+「出门调查」（白钮：「和她聊」才是这块板唯一的黑钮）。
 * ⭐ 调查中：在看什么 · 用了几点 / 共几点 · 进度条 ·「结束」（看到的照样留着）。
 * ⭐ 弹框一次性：模型（记住上次，下面挂能看什么的小签）· 来源（自动 + 内置站 + 她常去的网址 + ＋添加网址）·
 *   额度 10 / 30 / 60 / 自定。⛔ 开关、⛔ 每天自动。
 */

type Growth = ReturnType<typeof useCharacterGrowth>

export const SOURCE_KEYS: Record<CharacterBrowseSource, string> = {
  bilibili: 'sourceBilibili',
  danbooru: 'sourceDanbooru',
  civitai: 'sourceCivitai',
  x: 'sourceX',
  web: 'sourceWeb',
}

const SITE_PREFIX = 'site:'

/** 「bilibili」→「B 站」，`site:pixiv.net` →「pixiv.net」。 */
export function useOutingSourceLabel() {
  const t = useTranslations('CharacterRoster.recent')
  return (source: string) =>
    source.startsWith(SITE_PREFIX)
      ? source.slice(SITE_PREFIX.length)
      : source in SOURCE_KEYS
        ? t(SOURCE_KEYS[source as CharacterBrowseSource])
        : source
}

export const tokensToPoints = (tokens: number) =>
  Math.round(tokens / CHARACTER_OUTING.tokensPerPoint)

/** 你添加的网址规整成域名（服务端还会再规整一遍）；认不出 → `null`。 */
function siteOf(raw: string): string | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null
  try {
    const host = new URL(
      /^[a-z]+:\/\//.test(text) ? text : `https://${text}`,
    ).hostname.replace(/^www\./, '')
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null
  } catch {
    return null
  }
}

function Chip({
  selected,
  onClick,
  children,
  label,
}: {
  selected: boolean
  onClick(): void
  children: ReactNode
  label?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-1 rounded-full px-3.5 text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-ink-2 hover:tint-hover',
      )}
    >
      {children}
    </button>
  )
}

function OutingDialog({
  open,
  onOpenChange,
  growth: data,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  growth: Growth
}) {
  const t = useTranslations('CharacterRoster.recent')
  const tOuting = useTranslations('CharacterRoster.recent.outing')
  const tErrors = useTranslations('Errors')
  const outing = data.growth?.outing
  const last = outing?.recent[0] ?? null
  // 记住上次那个；下架了回落「自动」。
  const [model, setModel] = useState<AssistantRouteModel>(
    getAssistantRouteModelEntry(last?.model)?.modelId ??
      ASSISTANT_ROUTE_MODEL_AUTO,
  )
  const [modelOpen, setModelOpen] = useState(false)
  const [sources, setSources] = useState<CharacterBrowseSource[]>(
    (last?.sources ?? []) as CharacterBrowseSource[],
  )
  const [sites, setSites] = useState<string[]>(last?.sites ?? [])
  const [extraSites, setExtraSites] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [siteText, setSiteText] = useState('')
  const lastBudget = last?.budgetPoints ?? CHARACTER_OUTING.defaultBudget
  const preset = (CHARACTER_OUTING.budgetChoices as readonly number[]).includes(
    lastBudget,
  )
  const [budget, setBudget] = useState(lastBudget)
  const [custom, setCustom] = useState(!preset)
  const [customText, setCustomText] = useState(preset ? '' : String(lastBudget))
  const [starting, setStarting] = useState(false)

  const entry = getAssistantRouteModelEntry(model)
  const adapter = entry?.adapterType
  const builtIn = [
    CHARACTER_BROWSE_SOURCE_IDS.bilibili,
    CHARACTER_BROWSE_SOURCE_IDS.danbooru,
    CHARACTER_BROWSE_SOURCE_IDS.civitai,
    // X 只有 Grok 搜得到（Grok 自带 X 搜索），别家不出这一颗。
    ...(adapter === AI_ADAPTER_TYPES.XAI
      ? [CHARACTER_BROWSE_SOURCE_IDS.x]
      : []),
    CHARACTER_BROWSE_SOURCE_IDS.web,
  ]
  const siteChips = [
    ...new Set([...(outing?.frequentSites ?? []), ...sites, ...extraSites]),
  ]
  const auto = sources.length === 0 && sites.length === 0
  const capabilities = entry
    ? [
        tOuting('capText'),
        ...(assistantAdapterSupportsImage(entry.adapterType, entry.modelId)
          ? [tOuting('capImage')]
          : []),
      ]
    : []
  const customBudget = Number.parseInt(customText, 10)
  const points = custom
    ? Number.isFinite(customBudget)
      ? Math.min(
          CHARACTER_OUTING.maxBudget,
          Math.max(CHARACTER_OUTING.minBudget, customBudget),
        )
      : null
    : budget
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  const addSite = () => {
    const site = siteOf(siteText)
    if (!siteText.trim()) {
      setAdding(false)
      return
    }
    if (!site) {
      toast.error(tOuting('siteInvalid'))
      return
    }
    setExtraSites((list) => (list.includes(site) ? list : [...list, site]))
    setSites((list) =>
      list.includes(site)
        ? list
        : [...list, site].slice(-CHARACTER_OUTING.maxSites),
    )
    setSiteText('')
    setAdding(false)
  }

  const start = async () => {
    if (points === null) return
    setStarting(true)
    const result = await data.startOuting({
      model,
      sources: sources.filter((source) => builtIn.includes(source)),
      sites,
      budgetPoints: points,
    })
    setStarting(false)
    if (result.ok) {
      onOpenChange(false)
      return
    }
    toast.error(
      getApiErrorMessage(
        tErrors,
        { i18nKey: result.i18nKey },
        tOuting('startFailed'),
      ),
    )
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="flex flex-col gap-5 sm:max-w-md"
        data-testid="character-outing-dialog"
      >
        <ResponsiveDialogHeader className="p-0 text-left">
          <ResponsiveDialogTitle className="text-base font-semibold">
            {tOuting('title')}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">{tOuting('model')}</h3>
          <div>
            <StudioOperatorModelChip
              value={model}
              open={modelOpen}
              onOpenChange={setModelOpen}
              onChange={setModel}
            />
          </div>
          {capabilities.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {capabilities.map((capability) => (
                <li
                  key={capability}
                  className="flex h-6 items-center rounded-md bg-muted px-2 text-xs text-ink-2"
                >
                  {capability}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">
            {tOuting('sources')}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              selected={auto}
              onClick={() => {
                setSources([])
                setSites([])
              }}
            >
              {tOuting('auto')}
            </Chip>
            {builtIn.map((source) => (
              <Chip
                key={source}
                selected={sources.includes(source)}
                onClick={() => setSources((list) => toggle(list, source))}
              >
                {t(SOURCE_KEYS[source])}
              </Chip>
            ))}
            {siteChips.map((site) => (
              <Chip
                key={site}
                selected={sites.includes(site)}
                onClick={() => setSites((list) => toggle(list, site))}
              >
                {site}
              </Chip>
            ))}
            {adding ? (
              <input
                autoFocus
                value={siteText}
                maxLength={CHARACTER_OUTING.siteChars}
                placeholder={tOuting('sitePlaceholder')}
                aria-label={tOuting('addSite')}
                onChange={(event) => setSiteText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addSite()
                  }
                  if (event.key === 'Escape') {
                    // 只收起输入框：⛔ 把弹框一起关掉。
                    event.stopPropagation()
                    setSiteText('')
                    setAdding(false)
                  }
                }}
                onBlur={() => {
                  if (!siteText.trim()) setAdding(false)
                }}
                className="h-8 w-44 rounded-full bg-muted px-3.5 text-base outline-none focus-visible:shadow-focus lg:text-2sm"
              />
            ) : sites.length < CHARACTER_OUTING.maxSites ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3.5 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
              >
                <Plus className="size-3.5" aria-hidden />
                {tOuting('addSite')}
              </button>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">{tOuting('budget')}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {CHARACTER_OUTING.budgetChoices.map((choice) => (
              <Chip
                key={choice}
                selected={!custom && budget === choice}
                onClick={() => {
                  setCustom(false)
                  setBudget(choice)
                }}
              >
                {choice}
              </Chip>
            ))}
            {custom ? (
              <input
                autoFocus
                inputMode="numeric"
                value={customText}
                aria-label={tOuting('customLabel')}
                placeholder={`${CHARACTER_OUTING.minBudget}–${CHARACTER_OUTING.maxBudget}`}
                onChange={(event) =>
                  setCustomText(event.target.value.replace(/\D/g, ''))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setCustom(false)
                  }
                }}
                className="h-8 w-20 rounded-full bg-muted px-3.5 text-base tabular-nums outline-none focus-visible:shadow-focus lg:text-2sm"
              />
            ) : (
              <Chip selected={false} onClick={() => setCustom(true)}>
                {tOuting('custom')}
              </Chip>
            )}
          </div>
          {points !== null ? (
            <p className="text-xs text-muted-foreground">
              {tOuting('articles', {
                count: Math.max(
                  1,
                  Math.floor(
                    (points * CHARACTER_OUTING.tokensPerPoint) /
                      CHARACTER_OUTING.tokensPerArticle,
                  ),
                ),
              })}
            </p>
          ) : null}
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={starting || points === null}
            onClick={() => void start()}
            className="h-9 rounded-full bg-primary px-5 text-2sm font-semibold text-primary-foreground transition-transform duration-fast ease-standard hover:tint-hover active:scale-[.98] focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-45"
          >
            {tOuting('start')}
          </button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function WhiteButton({
  onClick,
  disabled,
  children,
}: {
  onClick(): void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 shrink-0 rounded-full bg-muted px-3.5 text-2sm font-medium transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-45 motion-reduce:transition-none"
    >
      {children}
    </button>
  )
}

function RunningNow({
  run,
  growth,
}: {
  run: CharacterOutingRun
  growth: Growth
}) {
  const tOuting = useTranslations('CharacterRoster.recent.outing')
  const sourceLabel = useOutingSourceLabel()
  const [stopping, setStopping] = useState(false)
  const [source, query] = run.nowLabel?.split('\n') ?? []
  const used = Math.min(run.budgetPoints, tokensToPoints(run.usedTokens))
  const budgetTokens = run.budgetPoints * CHARACTER_OUTING.tokensPerPoint
  return (
    <div
      className="flex flex-col gap-2.5"
      data-testid="character-outing-running"
    >
      <p className="text-2sm">
        <span>
          {source && query
            ? tOuting('looking', { where: sourceLabel(source), query })
            : tOuting('thinking')}
        </span>
        <span className="text-muted-foreground">
          {' · '}
          {tOuting('points', { used, total: run.budgetPoints })}
        </span>
      </p>
      <Progress
        value={Math.min(run.usedTokens, budgetTokens)}
        max={budgetTokens}
        aria-label={tOuting('points', { used, total: run.budgetPoints })}
        className="h-1 bg-muted"
      />
      <div className="flex justify-end">
        <WhiteButton
          disabled={stopping}
          onClick={() => {
            setStopping(true)
            void growth.stopOuting().then((result) => {
              setStopping(false)
              if (!result.ok) toast.error(tOuting('stopFailed'))
            })
          }}
        >
          {tOuting('stop')}
        </WhiteButton>
      </div>
    </div>
  )
}

export function OutingCard({ growth: data }: { growth: Growth }) {
  const t = useTranslations('CharacterRoster.recent')
  const tOuting = useTranslations('CharacterRoster.recent.outing')
  const format = useFormatter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const outing = data.growth?.outing
  if (!outing) return null
  const last = outing.recent[0]
  const lastAt = last?.endedAt ?? last?.startedAt
  const when = lastAt
    ? (() => {
        const ago = Math.round(
          (new Date().setHours(0, 0, 0, 0) -
            new Date(lastAt).setHours(0, 0, 0, 0)) /
            86_400_000,
        )
        return ago <= 0
          ? t('today')
          : ago === 1
            ? t('yesterday')
            : format.dateTime(new Date(lastAt), {
                month: 'long',
                day: 'numeric',
              })
      })()
    : null

  return (
    <section
      aria-label={tOuting('title')}
      className="rounded-20 bg-card px-4.5 py-3.5 shadow-card"
      data-testid="character-outing-card"
    >
      {outing.running ? (
        <RunningNow run={outing.running} growth={data} />
      ) : (
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-2sm">
            {when ? tOuting('lastOut', { when }) : tOuting('never')}
          </span>
          <WhiteButton onClick={() => setDialogOpen(true)}>
            {tOuting('title')}
          </WhiteButton>
        </div>
      )}
      {dialogOpen ? (
        <OutingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          growth={data}
        />
      ) : null}
    </section>
  )
}
