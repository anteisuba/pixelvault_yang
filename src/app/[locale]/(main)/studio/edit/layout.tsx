import { EditWorkspaceShell } from '@/components/business/studio/edit/EditWorkspaceShell'

/**
 * Shared layout for every /studio/edit/* task page.
 *
 * Renders the page header, dismissible error banner, and the source-image
 * preview card (kept pinned at the top per design decision so source state
 * survives navigation between task subpages). Children render below as the
 * task-specific tools / results area.
 */
export default function StudioEditLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <EditWorkspaceShell>{children}</EditWorkspaceShell>
}
