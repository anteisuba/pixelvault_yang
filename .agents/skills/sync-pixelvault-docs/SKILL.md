---
name: sync-pixelvault-docs
description: PixelVault documentation and context synchronization workflow. Use after meaningful code changes, architecture changes, model/provider updates, UI workflow changes, status audits, handoff preparation, or when the user asks to update docs, maps, plans, project memory, AGENTS.md, or implementation status for the Personal AI Gallery project.
---

# Sync PixelVault Docs

## Overview

Keep PixelVault's planning maps, progress notes, and operating context aligned with code. This skill captures the repeated "read docs, update current status, record what changed, prepare handoff" workflow.

## Workflow

1. Determine whether documentation is required:
   - Required for meaningful code changes, model/provider catalog changes, architecture changes, workflow changes, route or schema changes, and completed task packets.
   - Usually unnecessary for tiny typo fixes, sub-10-line mechanical changes, or pure local experiments unless the user asks.

2. Load context in project order:
   - Read `AGENTS.md`.
   - Read relevant `docs/guides/*.md`.
   - Read the closest current-state map: `docs/plans/ui/02-現狀映射.md`, `docs/plans/feature/02-現狀映射.md`, `docs/plans/qa/functional/02-現狀映射.md`, `docs/plans/qa/ui/02-現狀映射.md`, or `docs/progress/current-status-audit.md`.
   - Inspect the actual diff before writing docs.

3. Update only the narrow docs that own the changed fact:
   - `docs/progress/` for current implementation status and shipped/verified changes.
   - `docs/plans/ui/` for UI state maps, visual workflow decisions, and page-level status.
   - `docs/plans/feature/` for product or feature implementation state.
   - `docs/plans/qa/` for test coverage, known gaps, and QA state.
   - `docs/guides/` for stable operating workflows.
   - `AGENTS.md` only for durable project rules, not transient task notes.

4. Keep docs factual:
   - Record what changed, where it changed, why it matters, and what validation ran.
   - Use exact file/module names and dates when status changed.
   - Do not claim work was tested unless it was.
   - Do not rewrite broad historical sections when appending a focused status update is enough.

5. Respect planning/execution split:
   - Codex may update execution-facing docs when asked or when project rules require it.
   - Preserve Claude Code planning ownership for long-term plans, maps, and AGENTS changes unless the user explicitly asks Codex to edit them.
   - For handoff, write a concise implementation summary with remaining risks instead of broad speculative plans.

6. Finalize:
   - Review the documentation diff for stale claims, duplicate status entries, and accidental roadmap drift.
   - Mention docs updated in the final response.

## Common Triggers

- "Update the current project status."
- "Record what changed after this implementation."
- "Prepare a handoff/task packet."
- "Sync docs after model/provider/UI changes."
- "Review docs against the current codebase."
