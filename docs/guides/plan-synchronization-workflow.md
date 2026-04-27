# Plan Synchronization Workflow

## Purpose

Plans drift when they try to mirror the entire codebase. In this repository,
code is the source of truth. A plan is an execution contract: it records intent,
scope, decisions, risks, and validation.

Use this workflow whenever a task depends on an existing document under
`docs/plans/**`, or whenever a new non-trivial task packet is created.

## Core Rule

Do not trust an old plan blindly.

Before implementation, compare the plan's verified commit with the current code.
After implementation, record whether the plan still matches the code.

## Required Plan Status Block

Every active or newly updated plan should start with this block:

```md
## Plan Status

- Status: active | stale | completed | superseded
- Last verified commit: <git sha>
- Last verified date: YYYY-MM-DD
- Code areas:
  - `src/...`
  - `prisma/...`
- Owner thread: 探索 | 前端 | 后端 | 规范
- Next sync trigger:
  - before implementation
  - after cross-layer changes
  - after merge/pull
```

Status meanings:

- `active`: the plan was checked against the listed code areas and can guide work.
- `stale`: relevant code changed since the last verified commit and the plan has not been reconciled.
- `completed`: the planned work is done and the final state was written back.
- `superseded`: another plan or guide now owns the decision.

## Delta Log

Do not rewrite large plans after every code change. Append a short delta entry
instead:

```md
## Delta Log

### YYYY-MM-DD

- Checked commit: `<current git sha>`
- Code changed:
  - `src/...`
- Impact:
  - Plan still valid | Plan needs update | Plan superseded
- Decision changes:
  - None
- Remaining:
  - ...
```

The delta log is the cheap sync mechanism. It should explain only what changed
since the previous verified commit and whether the plan remains usable.

## Pre-Implementation Sync

Before Codex changes code from a plan:

1. Read the plan status block.
2. Run:

```bash
git rev-parse --short HEAD
git diff --name-only <last-verified-commit>..HEAD -- <code-area-1> <code-area-2>
```

3. If no relevant files changed, continue.
4. If relevant files changed, inspect those files before implementation.
5. If the plan's goal or scope is no longer correct, mark the plan `stale` or ask for a refreshed task packet.
6. If the drift is small, proceed and record the delta after implementation.

If a plan does not have a status block yet, treat it as unverified and add one
during the next planning or map writeback pass.

## Post-Implementation Sync

After meaningful implementation, the executing agent must answer exactly one of
these in the completion summary:

- `No related plan exists`
- `Plan still matches`
- `Plan delta should be updated`
- `Plan marked stale`
- `Plan completed`

If the execution thread is allowed to edit docs for the task, it may update the
plan directly. Otherwise, hand the diff back to the planning surface for map
writeback.

## Merge And Pull Sync

After a pull or merge that changes relevant code areas:

1. Do not mass-edit every plan.
2. Check only plans tied to the changed code areas.
3. Mark a plan `stale` if it depends on code that changed and cannot be quickly reconciled.
4. Append a delta if the change is understood.

This keeps plan maintenance proportional to real work.

## Task Packet Addition

New task packets should include:

```md
- Related plan:
- Plan status before execution: active | stale | none
- Last verified commit:
- Required sync check:
```

This makes drift visible before implementation starts.

## What Belongs In Plans

Plans should contain:

- goal and non-goals
- decisions and tradeoffs
- allowed file scope
- layer order
- risk points
- validation commands
- task packets
- delta log

Plans should not contain:

- full file inventories
- copied source code
- detailed descriptions of every current component state
- API contracts duplicated from source schemas
- anything that can only stay true by constantly mirroring code

When information must remain permanently true, move it to `docs/guides/**`.
When information describes one execution slice, keep it in `docs/plans/**`.
