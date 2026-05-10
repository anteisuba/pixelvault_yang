'use client'

import { Folder, FolderX, FolderOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useProjects } from '@/hooks/use-projects'
import { cn } from '@/lib/utils'

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
 * to a specific project. Hidden entirely when the user has no projects yet
 * (so brand-new accounts don't see a confusing single "All" pill); the
 * Krea-style asset browser folders are introduced incrementally as the
 * user creates their first project (Phase 5.2 adds the create flow).
 */
export function ProjectChipFilter({
  selectedProjectId,
  onChange,
  className,
}: ProjectChipFilterProps) {
  const t = useTranslations('LibraryPage')
  const { projects, isLoading } = useProjects()

  if (!isLoading && projects.length === 0) {
    return null
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      role="group"
      aria-label={t('projectFilterLabel')}
    >
      <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {t('projectFilterLabel')}
      </span>
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
