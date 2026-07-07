/**
 * Top-level Studio layout — a pass-through segment above the Image /
 * Video / Audio workspace and the LoRA domain.
 *
 * Both session-scoped providers that used to live here have moved down to
 * `studio/lora/layout.tsx`, because both are LoRA-domain concerns that
 * Image Studio must not read:
 *   - LoraStackProvider — the active LoRA stack
 *     (see docs/plans/lora-domain-split-2026-06.md §7).
 *   - PromptTagProvider — the tavern-style prompt-tag stack. Its only
 *     add-UI is the LoRA workbench; keeping it at this level leaked the
 *     selected tags (display + prompt injection) into the Image Studio
 *     compose bar.
 *
 * The (workspace) and edit sub-layouts continue to own their own
 * StudioProvider / EditWorkspaceShell — this layer sits above them.
 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
