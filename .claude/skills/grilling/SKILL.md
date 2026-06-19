---
name: grilling
description: Interview the user relentlessly about a plan or design. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases.
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

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a question can be answered by exploring the codebase, explore the codebase instead.
