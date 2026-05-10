'use client'

import { Folder, FolderX, FolderOpen, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useProjects } from '@/hooks/use-projects'
import { cn } from '@/lib/utils'
import { ProjectCreateDialog } from '@/components/business/ProjectCreateDialog'

interface ProjectChipFilterProps {
  /**
   * Selected project sentinel:
   * - ''      → all projects
   * - 'none'  → only generations without a project
   * - <uuid>  → that specific project
   */
  selectedProjectId: string
  onChange: (projectId: string) => void
  className?: string
}

/**
 * ProjectChipFilter — horizontal chip row for narrowing a generation feed
 * to a specific project. Always renders the trailing "+ New project" chip
 * (via ProjectCreateDialog) so brand-new accounts have an obvious entry
 * point; the All / Unassigned / per-project chips show up alongside it as
 * soon as the user has at least one project.
 */
export function ProjectChipFilter({
  selectedProjectId,
  onChange,
  className,
}: ProjectChipFilterProps) {
  const t = useTranslations('LibraryPage')
  const { projects, refresh } = useProjects()
  const hasProjects = projects.length > 0

  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      role="group"
      aria-label={t('projectFilterLabel')}
    >
      <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {t('projectFilterLabel')}
      </span>
      {hasProjects && (
        <>
          <ProjectChip
            active={selectedProjectId === ''}
            onClick={() => onChange('')}
            icon={<FolderOpen className="size-3.5" />}
            label={t('projectAll')}
          />
          <ProjectChip
            active={selectedProjectId === 'none'}
            onClick={() => onChange('none')}
            icon={<FolderX className="size-3.5" />}
            label={t('projectNone')}
          />
          {projects.map((project) => (
            <ProjectChip
              key={project.id}
              active={selectedProjectId === project.id}
              onClick={() => onChange(project.id)}
              icon={<Folder className="size-3.5" />}
              label={project.name}
            />
          ))}
        </>
      )}
      <ProjectCreateDialog
        onCreated={(project) => {
          void refresh()
          onChange(project.id)
        }}
        trigger={
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-all duration-200',
              'hover:border-primary/40 hover:text-foreground',
            )}
          >
            <Plus className="size-3.5" />
            <span>{t('projectCreate')}</span>
          </button>
        }
      />
    </div>
  )
}

interface ProjectChipProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function ProjectChip({ active, onClick, icon, label }: ProjectChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
        active
          ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
          : 'border border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
      )}
    >
      {icon}
      <span className="max-w-[140px] truncate">{label}</span>
    </button>
  )
}
