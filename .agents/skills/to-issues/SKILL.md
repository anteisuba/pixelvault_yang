---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices.
disable-model-invocation: true
---

## PixelVault Adapter

This skill is imported from `mattpocock/skills` as an execution loop for Personal AI Gallery.

Before applying the upstream workflow:

1. Project rules win: follow `AGENTS.md` for Codex, `CLAUDE.md` for Claude Code, and the active reading path in `docs/README.md`.
2. Treat this skill as an execution rhythm, not as permission to change architecture, routes, auth, credits, provider behavior, storage, database schema, package scripts, CI, hooks, or product direction.
3. Do not create or update `CONTEXT.md`, `CONTEXT-MAP.md`, `docs/adr/`, `.scratch/`, `.out-of-scope/`, external issues, commits, or PRs unless the user explicitly asks for that exact artifact.
4. When upstream text says to publish to the issue tracker, draft the PRD, issue breakdown, or agent brief in chat first. Only write it to `docs/plans/`, `docs/decisions/`, GitHub, or another target after the user confirms the destination.
5. When upstream text says to commit, do not commit unless the user explicitly requested a commit. If committing is requested, use scoped staging and inspect the cached diff first.
6. For provider, model, API, pricing, auth, storage, database, deployment, or security work, the official-docs gate in `AGENTS.md` is mandatory.
7. For UI-visible work, keep PixelVault's browser/mobile QA evidence rules and i18n requirements.

PixelVault documentation replaces the upstream default domain-doc assumption:

- Domain/product context: `docs/product/mainline.md` and relevant `docs/domains/*.md`.
- Architecture decisions: relevant `docs/architecture/*.md`, `docs/decisions/*.md`, and code source of truth.
- Execution loops: `docs/engineering/agent-loops.md` and `docs/engineering/matt-pocock-skills.md`.

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

<vertical-slice-rules>

- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Any prefactoring should be done first

</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new issue to the issue tracker. Use the issue body template below. These issues are considered ready for AFK agents, so publish them with the correct triage label unless instructed otherwise.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.
