'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { LIQUID_SPRING } from '@/constants/motion'
import {
  CANVAS_NEW_PROJECT_QUERY_VALUE,
  canvasWithCharacterPath,
  studioImageWithCharacterPath,
} from '@/constants/routes'
import type { CharacterCardRecord } from '@/types'
import { withAssistantCharacter } from '@/types/assistant-persona'
import { Check, ChevronDown, ChevronRight } from '@/components/icons'
import { Spinner } from '@/components/ui/spinner'
import { useRecentCanvases } from '@/hooks/node/use-recent-canvases'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useLiquidReveal, type LiquidRect } from '@/hooks/use-liquid-reveal'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * **用她 ▾**（角色详情右上，卡片重设计第 5 片）：一个角色三处用——出图 · 助手人设 ·
 * 画布。「放进画布 ›」在菜单里往下展开最近几块画布 + 新画布；选一块 = 打开它，她落在
 * 视口中间并选中（画布用角色 ④ 画板 S5，深链见 `canvasWithCharacterPath`）。
 *
 * ⭐ 菜单**从按钮长出来**（interaction.md §2.1，`useLiquidReveal`）：先横成一条
 *   （按钮那么高、菜单那么宽），再往下落；收回反过来。菜单顶上那一行就是按钮本身，
 *   所以形状起步时看上去是按钮在变形。
 * ⭐ 设为助手人设 = 头像 + 名字 + 说话方式都从这个角色来（助手设置 B 的同一份
 *   `withAssistantCharacter`，⛔ 不另拼请求）。已经在用她就打勾，不重复写。
 * ⚠ Esc / 点外面收起；Esc 先 `preventDefault`，别把底下的整页详情也一起关了。
 */

const TRIGGER_HEIGHT_PX = 36
const TRIGGER_RADIUS_PX = 18
const MENU_RADIUS_PX = 14

export function UseCharacterMenu({ card }: { card: CharacterCardRecord }) {
  const t = useTranslations('CharacterRoster')
  const router = useRouter()
  const reducedMotion = useReducedMotion() ?? false
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const recent = useRecentCanvases()
  const format = useFormatter()
  // `relativeTime` 的参照时刻取一次（同 `ShellProjectPill`）：不传会每行报一次 fallback。
  const [now] = useState(() => new Date())
  const assistant = useAssistantPersona({ enabled: mounted })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const reveal = useLiquidReveal({
    reducedMotion,
    stripHeightPx: TRIGGER_HEIGHT_PX,
    originRadiusPx: TRIGGER_RADIUS_PX,
    targetRadiusPx: MENU_RADIUS_PX,
  })

  // 收完（相位回到 closed）就卸掉：⛔ 不在 effect 里清状态。
  const visible = mounted && !(closing && reveal.phase === 'closed')
  const isPersona = assistant.persona.character?.id === card.id

  const rects = useCallback((): {
    origin: LiquidRect
    target: LiquidRect
  } | null => {
    const layer = layerRef.current?.getBoundingClientRect()
    const trigger = triggerRef.current?.getBoundingClientRect()
    if (!layer || !trigger) return null
    return {
      origin: {
        left: trigger.left - layer.left,
        top: trigger.top - layer.top,
        right: trigger.right - layer.left,
        bottom: trigger.bottom - layer.top,
      },
      target: { left: 0, top: 0, right: layer.width, bottom: layer.height },
    }
  }, [])

  // 层挂上之后才量得到尺寸：挂上的那一帧开始长。
  useLayoutEffect(() => {
    if (!mounted || closing || reveal.phase !== 'closed') return
    const geometry = rects()
    if (geometry) reveal.open(geometry.origin, geometry.target)
  }, [closing, mounted, rects, reveal])

  const close = useCallback(() => {
    if (!visible || closing) return
    const geometry = rects()
    setClosing(true)
    if (geometry) reveal.close(geometry.origin, geometry.target)
    else reveal.reset()
  }, [closing, rects, reveal, visible])

  const open = () => {
    setClosing(false)
    setCanvasOpen(false)
    setMounted(true)
  }

  const toggleCanvases = () => {
    const next = !canvasOpen
    setCanvasOpen(next)
    if (next && (recent.status === 'idle' || recent.status === 'failed')) {
      void recent.load()
    }
  }

  const putOnCanvas = (projectId: string) => {
    close()
    router.push(canvasWithCharacterPath(card.id, projectId))
  }

  useEffect(() => {
    if (!visible) return
    const onPointer = (event: PointerEvent) => {
      if (!layerRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [close, visible])

  const setAsPersona = async () => {
    if (isPersona || saving) return
    setSaving(true)
    const ok = await assistant.save(
      withAssistantCharacter(assistant.persona, card.id),
    )
    setSaving(false)
    if (ok) {
      toast.success(t('useAsPersonaDone', { name: card.name }))
      close()
    } else {
      toast.error(t('useAsPersonaFailed'))
    }
  }

  const label = (
    <>
      {t('useCharacter')}
      <ChevronDown className="size-3.5" aria-hidden />
    </>
  )

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={visible}
        onClick={visible ? close : open}
        className={cn(
          'flex h-9 items-center gap-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity duration-fast',
          visible && 'opacity-0',
        )}
      >
        {label}
      </button>

      {visible ? (
        <motion.div
          ref={layerRef}
          style={{ clipPath: reveal.clipPath }}
          className="absolute right-0 top-0 z-30 w-72 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl"
        >
          <div className="flex h-9 justify-end">
            <button
              type="button"
              onClick={close}
              className="flex h-9 items-center gap-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {label}
            </button>
          </div>
          <div role="menu" aria-label={t('useCharacter')} className="p-1.5">
            <MenuItem
              title={t('useInStudio')}
              hint={t('useInStudioHint')}
              onSelect={() => {
                close()
                router.push(studioImageWithCharacterPath(card.id))
              }}
            />
            <MenuItem
              title={isPersona ? t('useAsPersonaActive') : t('useAsPersona')}
              hint={t('useAsPersonaHint')}
              trailing={
                saving || assistant.isLoading ? (
                  <Spinner size="sm" />
                ) : isPersona ? (
                  <Check className="size-4" aria-hidden />
                ) : null
              }
              disabled={isPersona || assistant.isLoading}
              onSelect={() => void setAsPersona()}
            />
            <MenuItem
              title={t('placeOnCanvas')}
              hint={t('placeOnCanvasHint')}
              expanded={canvasOpen}
              trailing={
                <ChevronRight
                  aria-hidden
                  className={cn(
                    'size-4 text-muted-foreground transition-transform duration-fast',
                    canvasOpen && 'rotate-90',
                  )}
                />
              }
              onSelect={toggleCanvases}
            />
            <AnimatePresence initial={false}>
              {canvasOpen ? (
                <motion.div
                  key="canvases"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transition: LIQUID_SPRING.unfold,
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: LIQUID_SPRING.retract,
                  }}
                  className="overflow-hidden"
                >
                  <div className="mx-3 my-1 h-px bg-border" />
                  {recent.status === 'loading' || recent.status === 'idle' ? (
                    <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Spinner size="sm" />
                      {t('canvasesLoading')}
                    </p>
                  ) : recent.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => void recent.load()}
                      className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('canvasesFailed')}
                    </button>
                  ) : (
                    recent.projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        role="menuitem"
                        onClick={() => putOnCanvas(project.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-fast hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t('canvasMeta', {
                            count: project.nodeCount,
                            time: format.relativeTime(
                              new Date(project.updatedAt),
                              now,
                            ),
                          })}
                        </span>
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => putOnCanvas(CANVAS_NEW_PROJECT_QUERY_VALUE)}
                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-accent"
                  >
                    {t('newCanvas')}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </div>
  )
}

function MenuItem({
  title,
  hint,
  trailing,
  disabled,
  expanded,
  onSelect,
}: {
  title: string
  hint: string
  trailing?: React.ReactNode
  disabled?: boolean
  /** 有二级（「放进画布 ›」）时标开合。 */
  expanded?: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-expanded={expanded}
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-fast hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      {trailing}
    </button>
  )
}
