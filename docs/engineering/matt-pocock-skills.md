# Matt Pocock Skills Integration

Last updated: 2026-06-18

This document defines how Personal AI Gallery uses the selected
`mattpocock/skills` workflows across Codex and Claude Code.

## Source of Truth

- `AGENTS.md`
- `CLAUDE.md`
- `docs/README.md`
- `docs/engineering/agent-loops.md`
- `.agents/skills/*/SKILL.md`
- `.claude/skills/*/SKILL.md`
- https://github.com/mattpocock/skills

## Last Verified

- Date: 2026-06-18
- Method: inspected upstream `README.md`, `.claude-plugin/plugin.json`,
  `docs/invocation.md`, and selected `SKILL.md` files before copying them into
  both local agent surfaces.

## Position

Matt Pocock's skills are execution loops. They help agents ask better
questions, build tighter feedback loops, use TDD, triage work, and split plans
into vertical slices.

They do not override this repository's architecture, documentation taxonomy,
validation gates, security rules, provider documentation gates, i18n rules, or
commit hygiene.

## Installed For Both Agents

The following skills are installed in both `.agents/skills/` for Codex and
`.claude/skills/` for Claude Code:

| Skill                           | Use it for                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| `diagnosing-bugs`               | Repro-first debugging, performance regressions, hard runtime failures |
| `tdd`                           | Test-first implementation through public behavior seams               |
| `grill-with-docs`               | Pre-implementation questioning and plan sharpening                    |
| `grilling`                      | One-question-at-a-time design interrogation                           |
| `domain-modeling`               | Naming and domain boundary clarification                              |
| `codebase-design`               | Deep-module vocabulary, seams, interfaces, testability                |
| `to-prd`                        | Turning settled conversation into a PRD draft                         |
| `to-issues`                     | Splitting a plan into tracer-bullet vertical slices                   |
| `triage`                        | Issue or task triage into ready/not-ready states                      |
| `improve-codebase-architecture` | Architecture friction scans and deepening candidates                  |
| `setup-matt-pocock-skills`      | Re-checking this integration if the workflow changes                  |

## Project Adapter Rules

Every imported skill has a PixelVault adapter block inserted after its
frontmatter. The adapter is intentionally duplicated in each skill so direct
invocation stays safe in both agents.

The adapter rules are:

1. Project rules win: `AGENTS.md` for Codex, `CLAUDE.md` for Claude Code, and
   the active reading path in `docs/README.md`.
2. The skill is an execution rhythm, not permission to change architecture,
   route structure, auth, credits, provider behavior, storage, database schema,
   package scripts, CI, hooks, or product direction.
3. Do not create or update `CONTEXT.md`, `CONTEXT-MAP.md`, `docs/adr/`,
   `.scratch/`, `.out-of-scope/`, external issues, commits, or PRs unless the
   user explicitly asks for that exact artifact.
4. If upstream text says to publish to the issue tracker, draft in chat first.
   Only write to `docs/plans/`, `docs/decisions/`, GitHub, or another target
   after the user confirms the destination.
5. If upstream text says to commit, do not commit unless the user explicitly
   requested a commit.
6. Provider/model/API/pricing/auth/storage/database/deployment/security work
   must pass the official-docs gate from `AGENTS.md`.
7. UI-visible work must keep PixelVault browser/mobile QA evidence rules and
   i18n requirements.

## Default Mapping

- Planning unclear work: start with `grill-with-docs`.
- Debugging: use `diagnosing-bugs`, then keep PixelVault runtime triage and
  provider gates if the failure crosses those boundaries.
- Feature implementation: use `tdd` when there is a meaningful behavior seam;
  otherwise use the PixelVault Task Packet Loop from `agent-loops.md`.
- PRD or task-packet synthesis: use `to-prd`, then confirm the destination
  before writing files.
- Work splitting: use `to-issues`, but keep vertical slices aligned with
  `docs/plans/` task packets unless the user explicitly chooses GitHub Issues.
- Architecture review: use `improve-codebase-architecture`, but treat output as
  advisory until the user chooses a candidate.

## Not Installed

The upstream repository includes other skills and misc helpers. These were not
installed in this pass:

- `git-guardrails-claude-code` and `setup-pre-commit`, because they can affect
  hooks or local enforcement.
- `implement`, because upstream text says to commit automatically.
- `ask-matt`, `grill-me`, `handoff`, `teach`, `writing-great-skills`, and
  `prototype`, because they are not required for the current execution-loop
  integration.

Install or adapt any of these only after inspecting their files and confirming
the exact scope with the user.
