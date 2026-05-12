import { StudioProvider } from '@/contexts/studio-context'
import { StudioWorkspaceUI } from '@/components/business/StudioWorkspaceUI'

/**
 * Studio workspace layout — shared by /studio/image, /studio/video and
 * /studio/audio (the three pages that live under the `(workspace)`
 * route group; tools like /studio/edit / /studio/enhance stay outside
 * this layout because they don't need the workspace context).
 *
 * Lifting StudioProvider here means the form / data / generation
 * contexts survive Next.js route transitions between the three modes.
 * Combined with `StudioWorkspaceUI` rendered once at the layout level,
 * switching modes never remounts the topbar / canvas / dock — only
 * the page-level `<StudioModeSync mode=...>` re-runs, which dispatches
 * the workflow change. The user perceives an instant 0ms switch.
 */
export default function StudioWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <StudioProvider>
      <StudioWorkspaceUI />
      {/* The page renders only <StudioModeSync mode=...> (invisible) — it
          exists in the tree purely so Next.js mounts the right side
          effect when the route segment changes. */}
      {children}
    </StudioProvider>
  )
}
