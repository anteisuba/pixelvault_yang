# PixelVault Task Packet Template

Last updated: 2026-07-08

Use this template for non-trivial implementation, UI, architecture, provider,
debugging, QA, and documentation tasks. Keep the packet short enough to execute.

## Source of Truth

- `AGENTS.md`
- `CLAUDE.md`
- `docs/README.md`
- `docs/status.md`
- `docs/engineering/agent-loops.md`

## Last Verified

- Date: 2026-07-08
- Method: documentation workflow update based on current docs taxonomy and the
  Esther personal design system workflow reference

## Template

```md
# Task Packet: <short title>

## Goal

- <one concrete outcome>

## Non-goals

- <what must not be changed>

## Task Scene / Type

- <product | architecture | domain | provider/API | UI | QA | docs | deployment | debugging>

## Read First

- `AGENTS.md`
- `docs/README.md`
- `docs/status.md`
- <relevant product/domain/architecture/integration/design/qa docs>

## Source of Truth

- <code files, schemas, routes, components, services, messages, or docs that define current behavior>

## Allowed File Scope

- <paths Codex may change>

## Forbidden File Scope

- <paths Codex must not change>

## Assumptions / Open Questions

- <confirmed assumptions>
- <questions that require user confirmation before implementation>

## Acceptance Criteria

- <observable outcome 1>
- <observable outcome 2>

## Validation / Evidence

- <commands, browser flow, screenshot evidence, console/log checks, or docs-only review>

## Documentation Sync

- <docs to update, or "none; explain why">
```

## Five Intake Questions

Ask or answer these before implementation when the task packet is incomplete:

1. What is the exact user or developer outcome?
2. Which route, module, provider, data model, or document owns the behavior?
3. What must stay unchanged?
4. What evidence proves the task is done?
5. Which docs need to be updated or explicitly left unchanged?

## Exit Checklist

- The changed slice matches the allowed file scope.
- Source-of-truth files were inspected before editing.
- Stop-worthy uncertainty was surfaced before implementation.
- Validation evidence is recorded, or skipped validation is explained.
- Documentation was updated only where it owns the changed fact.
