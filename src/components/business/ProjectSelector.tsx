'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  Plus,
  ChevronDown,
  Pencil,
  Trash2,
  Check,
  X,
  Layers,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { ProjectRecord, CreateProjectRequest } from '@/types'
import { PROJECT } from '@/constants/config'
import { cn } from '@/lib/utils'

interface ProjectSelectorProps {
  projects: ProjectRecord[]
  activeProjectId: string | null
  isLoading: boolean
  onSelect: (id: string | null) => void
  onCreate: (data: CreateProjectRequest) => Promise<ProjectRecord | null>
  onRename: (id: string, name: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

export function ProjectSelector({
  projects,
  activeProjectId,
  isLoading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('Projects')

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setIsCreating(false)
        setEditingId(null)
        setConfirmDeleteId(null)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isCreating])

  // Focus input when editing
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingId])

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const result = await onCreate({ name: trimmed })
    if (result) {
      onSelect(result.id)
      setNewName('')
      setIsCreating(false)
    }
  }, [newName, onCreate, onSelect])

  const handleRename = useCallback(
    async (id: string) => {
      const trimmed = editName.trim()
      if (!trimmed) return
      const ok = await onRename(id, trimmed)
      if (ok) {
        setEditingId(null)
        setEditName('')
      }
    },
    [editName, onRename],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await onDelete(id)
      setConfirmDeleteId(null)
    },
    [onDelete],
  )

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm transition-colors',
          'hover:border-primary/20 hover:bg-primary/5',
          isOpen && 'border-primary/30 bg-primary/5',
        )}
      >
        <FolderOpen className="size-4 text-muted-foreground" />
        <span className="flex-1 truncate text-left font-medium">
          {activeProject ? activeProject.name : t('allGenerations')}
        </span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border/60 bg-background shadow-lg">
          <div className="max-h-64 overflow-y-auto p-1">
            {/* All Generations */}
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                setIsOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                'hover:bg-accent',
                activeProjectId === null &&
                  'bg-primary/10 font-medium text-primary',
              )}
            >
              <Layers className="size-4" />
              <span className="flex-1 text-left">{t('allGenerations')}</span>
            </button>

            {/* Project list */}
            {projects.map((project) => (
              <div key={project.id} className="group relative">
                {editingId === project.id ? (
                  /* Inline rename */
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(project.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      maxLength={PROJECT.NAME_MAX_LENGTH}
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary/40"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRename(project.id)}
                      className="rounded p-1 text-primary hover:bg-primary/10"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : confirmDeleteId === project.id ? (
                  /* Delete confirmation */
                  <div className="space-y-1.5 px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {t('deleteConfirm', { name: project.name })}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(project.id)}
                        className="rounded bg-destructive px-2 py-1 text-xs text-white hover:bg-destructive/90"
                      >
                        {t('delete')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded bg-secondary px-2 py-1 text-xs hover:bg-secondary/80"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal item */
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(project.id)
                      setIsOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      'hover:bg-accent',
                      activeProjectId === project.id &&
                        'bg-primary/10 font-medium text-primary',
                    )}
                  >
                    <FolderOpen className="size-4" />
                    <span className="flex-1 truncate text-left">
                      {project.name}
                    </span>
                    <span className="text-2xs text-muted-foreground">
                      {t('generationCount', {
                        count: project.generationCount,
                      })}
                    </span>
                    {/* Action buttons (show on hover) */}
                    <span
                      className="hidden items-center gap-0.5 group-hover:flex"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(project.id)
                          setEditName(project.name)
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(project.id)
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  </button>
                )}
              </div>
            ))}

            {/* Loading skeleton */}
            {isLoading && projects.length === 0 && (
              <div className="space-y-1 px-3 py-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded bg-muted/50"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Create new project */}
          <div className="border-t border-border/40 p-1">
            {isCreating ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate()
                    if (e.key === 'Escape') {
                      setIsCreating(false)
                      setNewName('')
                    }
                  }}
                  placeholder={t('newProjectPlaceholder')}
                  maxLength={PROJECT.NAME_MAX_LENGTH}
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary/40"
                />
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={!newName.trim()}
                  className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-40"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false)
                    setNewName('')
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-accent"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-4" />
                {t('newProject')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
