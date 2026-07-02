import { PromptTagProvider } from '@/hooks/use-prompt-tag-stack'

/**
 * Top-level Studio layout — wraps every /studio/* route in
 * PromptTagProvider, which keeps selected prompt tags scoped to the
 * signed-in user.
 *
 * LoraStackProvider used to live here too, but LoRA generation now owns
 * its own domain at /studio/lora (see docs/plans/lora-domain-split-2026-06.md
 * §7) — Image Studio no longer reads the active LoRA stack. The provider
 * moved down to `studio/lora/layout.tsx` so it only wraps the surface that
 * actually needs it.
 *
 * The (workspace) and edit sub-layouts continue to own their own
 * StudioProvider / EditWorkspaceShell — this layer sits above them.
 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PromptTagProvider>{children}</PromptTagProvider>
}
