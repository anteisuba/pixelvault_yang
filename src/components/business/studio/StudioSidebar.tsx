'use client'

import { memo, useCallback, useState, useRef, useEffect } from 'react'
import {
  Key,
  FolderOpen,
  FolderPlus,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioData } from '@/contexts/studio-context'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { StudioQuickRouteSelector } from './StudioQuickRouteSelector'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export const StudioSidebar = memo(function StudioSidebar() {
  const { projects } = useStudioData()
  const { keys, healthMap } = useApiKeysContext()
  const t = useTranslations('StudioV3')
  const tApiKeys = useTranslations('StudioApiKeys')

  const [sheetOpen, setSheetOpen] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const activeKeys = keys.filter((k) => k.isActive)

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const handleStartRename = useCallback((id: string, currentName: string) => {
    setEditingId(id)
    setEditName(currentName)
    setMenuOpenId(null)
  }, [])

  const handleConfirmRename = useCallback(
    async (id: string) => {
      if (editName.trim()) {
        await projects.update(id, { name: editName.trim() })
      }
      setEditingId(null)
      setEditName('')
    },
    [editName, projects],
  )

  const handleCancelRename = useCallback(() => {
    setEditingId(null)
    setEditName('')
  }, [])

  const handleDelete = useCallback(
    async (id: string) => {
      setMenuOpenId(null)
      await projects.remove(id)
    },
    [projects],
  )

  const handleAddSubProject = useCallback(
    async (parentName: string) => {
      setMenuOpenId(null)
      await projects.create({ name: `${parentName} / ${t('newProject')}` })
    },
    [projects, t],
  )

  return (
    <aside className="studio-sidebar">
      {/* ── Projects ────────────────────────── */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('projects')}
          </span>
          <button
            type="button"
            onClick={() => void projects.create({ name: t('newProject') })}
            className="flex size-6 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-all hover:border-primary/30 hover:text-primary active:scale-90"
            style={{
              transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {/* All Generations */}
        <button
          type="button"
          onClick={() => projects.setActiveProjectId(null)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
            'hover:bg-muted',
            !projects.activeProjectId && 'bg-muted font-medium text-foreground',
            projects.activeProjectId && 'text-muted-foreground',
          )}
        >
          <FolderOpen className="size-3.5 opacity-60" />
          <span>{t('allGenerations')}</span>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
            {projects.historyTotal}
          </span>
        </button>

        {/* Project list with actions */}
        {projects.projects.map((project) => (
          <div key={project.id} className="group relative">
            {editingId === project.id ? (
              /* ── Inline rename ──────────────── */
              <div className="flex items-center gap-1 px-1">
                <input
                  ref={editInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleConfirmRename(project.id)
                    if (e.key === 'Escape') handleCancelRename()
                  }}
                  className="flex-1 rounded-md border border-primary/40 bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => void handleConfirmRename(project.id)}
                  className="flex size-7 items-center justify-center rounded-md text-primary hover:bg-primary/10 active:scale-90"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelRename}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:scale-90"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              /* ── Normal project row ─────────── */
              <button
                type="button"
                onClick={() => projects.setActiveProjectId(project.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  'hover:bg-muted',
                  projects.activeProjectId === project.id &&
                    'bg-muted font-medium text-foreground',
                  projects.activeProjectId !== project.id &&
                    'text-muted-foreground',
                )}
              >
                <FolderOpen className="size-3.5 opacity-60" />
                <span className="truncate flex-1 text-left">
                  {project.name}
                </span>
                {/* Actions button — visible on hover */}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenId(menuOpenId === project.id ? null : project.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      setMenuOpenId(
                        menuOpenId === project.id ? null : project.id,
                      )
                    }
                  }}
                  className="ml-auto flex size-6 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted-foreground/10"
                >
                  <MoreHorizontal className="size-3.5" />
                </span>
              </button>
            )}

            {/* ── Context menu ──────────────── */}
            {menuOpenId === project.id && editingId !== project.id && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpenId(null)}
                />
                <div
                  className="absolute right-2 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-border/60 bg-background py-1 shadow-lg"
                  style={{
                    animation:
                      'studio-dropdown-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleStartRename(project.id, project.name)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    <Pencil className="size-3" />
                    {t('rename')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddSubProject(project.name)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    <FolderPlus className="size-3" />
                    {t('addSubProject')}
                  </button>
                  <div className="my-1 h-px bg-border/50" />
                  <button
                    type="button"
                    onClick={() => void handleDelete(project.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3" />
                    {t('deleteProject')}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </nav>

      {/* ── Spacer ──────────────────────────── */}
      <div className="flex-1" />

      {/* ── API Keys ────────────────────────── */}
      <div className="mx-4 my-2 h-px bg-border/50" />
      <div className="px-3 pb-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          {t('apiKeys')}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-2 pb-3">
        {activeKeys.map((key) => (
          <div
            key={key.id}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-muted"
          >
            <span
              className="size-1.5 rounded-full"
              style={{
                background:
                  healthMap[key.id] === 'failed'
                    ? '#ef4444'
                    : healthMap[key.id] === 'available'
                      ? '#22c55e'
                      : '#a0a0a0',
              }}
            />
            <span className="font-medium text-foreground">{key.label}</span>
            <span className="text-muted-foreground">
              {key.providerConfig.label}
            </span>
            {healthMap[key.id] === 'failed' ? (
              <span className="ml-auto rounded bg-red-50 px-1.5 py-0.5 text-2xs font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                {t('apiError')}
              </span>
            ) : healthMap[key.id] === 'available' ? (
              <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                {t('active')}
              </span>
            ) : (
              <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-2xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {t('apiUnverified')}
              </span>
            )}
          </div>
        ))}

        {/* Add API Key → opens Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:text-primary active:scale-[0.97]"
              style={{
                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <Key className="size-3" />
              {t('addApiKey')}
            </button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{tApiKeys('sheetTitle')}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <StudioQuickRouteSelector managementMode="inline" />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </aside>
  )
})
