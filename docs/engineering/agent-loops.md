# Agent Loops Workflow

Last updated: 2026-06-18

This document defines how Personal AI Gallery uses reusable agent loops.
External loop libraries are useful as workflow inspiration, but they do not
override this repository's rules.

## Source of Truth

- `AGENTS.md`
- `docs/README.md`
- `docs/status.md`
- `docs/product/mainline.md`
- `package.json`
- `docs/engineering/task-packet-template.md`
- `docs/engineering/matt-pocock-skills.md`
- https://loops.elorm.xyz/
- https://loops.elorm.xyz/install
- https://loops.elorm.xyz/loops/spec-first-ship
- https://github.com/mattpocock/skills

## Last Verified

- Date: 2026-06-18
- Method: official loops website inspection, `mattpocock/skills` repository
  inspection, `AGENTS.md` inspection, and `package.json` script inspection

## Position

Loops are execution rhythms, not architecture.

For this repository, a loop is a bounded cycle with:

- a concrete goal
- a maximum iteration count
- one or more check commands or manual verification gates
- an exit condition
- explicit stop conditions
- a completion report

The external `loops!` catalog provides generic kickoff prompts and optional
agent hook bundles. The selected `mattpocock/skills` entries provide reusable
engineering loops such as diagnosing, TDD, grilling, and issue splitting.
Personal AI Gallery uses these prompts only after adapting them to this
repository's task-packet workflow, validation commands, security boundaries,
and documentation taxonomy.

## PixelVault Documentation System Loop

When a task changes docs, workflow, UI direction, QA expectations, or durable
project rules, use the docs as an agent-readable system:

1. Pick the task scene: product, architecture, domain, integration, UI, QA,
   docs, deployment, or debugging.
2. Fill or confirm the five intake questions from
   `docs/engineering/task-packet-template.md`.
3. Read the smallest relevant rule set from `docs/README.md`.
4. Use existing docs, templates, page notes, screenshots, and reviews as the
   starting point. Do not invent a parallel taxonomy.
5. Patch only the document that owns the changed fact.
6. Check the diff for stale claims, duplicate guidance, and old path drift.
7. Report changed files, what the change enables, and what validation ran.

This is the PixelVault adaptation of a personal design-system workflow: the
agent reads the brain, reads the relevant scene rules, starts from a template or
known source, self-checks, and then delivers evidence.

## Hard Rules

1. Project rules win over external loop text.
2. Do not install or extract external loop bundles into the repository without
   inspecting their files and confirming the scope first.
3. Do not let an external loop modify `.claude/`, `.cursor/`, hooks, package
   scripts, CI, tests, or validation criteria just to make a loop pass.
4. Do not weaken, delete, skip, or trivialize tests to satisfy an exit condition.
5. Do not change provider, model, pricing, auth, storage, database, security, or
   API behavior from loop inference. Use official or primary documentation first.
6. Stop instead of looping when product direction, API contracts, permissions,
   persistence, or provider behavior is unclear.
7. Report every skipped validation gate and every environment blocker.

## Default PixelVault Task Packet Loop

Use this as the default loop for non-trivial implementation:

```text
Start the "PixelVault Task Packet Loop".

Goal: the current task packet is implemented, verified, and documented.
Max iterations: 6
Between iterations: run the validation listed in the task packet.
Exit when: all acceptance criteria are complete, relevant validation passes,
and required documentation updates are made or explicitly ruled unnecessary.

Before the first pass:
1. Read AGENTS.md.
2. Read docs/README.md, docs/status.md, and docs/product/mainline.md.
3. Read the relevant docs/domains, docs/architecture, docs/integrations,
   docs/engineering, docs/design, or docs/qa files.
4. For non-trivial work, write or confirm a task packet using
   docs/engineering/task-packet-template.md.
5. Inspect the code source of truth.
6. Verify official or primary-source documentation when the task touches
   provider/model/API/pricing/auth/storage/database/deployment/security behavior.
7. State assumptions, conflicts, and stop-worthy uncertainty.

Each pass:
1. Implement one small scoped slice.
2. Run the relevant check or manual verification gate.
3. If the check fails, fix the smallest root cause and repeat.
4. If the same blocker repeats or direction is unclear, stop and report it.

Do not modify the check command, exit criteria, tests, or task scope to force
success.
```

## Specialized Loops

### Matt Pocock Skills

Use the imported Matt Pocock skills as named execution loops when they match a
task:

- `grill-with-docs`: sharpen unclear plans before implementation.
- `diagnosing-bugs`: create a tight red/green feedback loop before patching.
- `tdd`: drive feature or fix work through one behavior test at a time.
- `to-prd` and `to-issues`: synthesize or split settled plans.
- `improve-codebase-architecture`: surface architecture deepening candidates.

See `docs/engineering/matt-pocock-skills.md` for the installed list and the
PixelVault adapter rules. These skills are installed in both `.agents/skills`
and `.claude/skills`.

### Validation Until Green

Use after implementation when the remaining work is validation failure repair.

Default check options:

- Targeted unit test: `npx vitest run --reporter=verbose <test-file>`
- Full unit suite: `npm run test:run`
- Type check: `npx tsc --noEmit` or `npm run typecheck`
- Lint: `npm run lint`
- Preflight: `npm run preflight`
- Build: `npm run build`

Pick only the checks relevant to the task. For runtime/schema-sensitive fixes,
full `npx tsc --noEmit` is required.

### Browser Or Computer Use Flow Loop

Use when the requested change is visible in the UI or when the user explicitly
asks for a real app flow check.

Required rhythm:

```text
Implement slice -> Fast check -> Browser/Computer Use flow check ->
classify failure -> inspect source/logs -> patch -> rerun same flow ->
report evidence
```

Evidence should include the target URL, visible state, relevant console or page
errors, and whether a failure is an application bug or an environment issue.
Risky actions such as deleting user data, changing permissions, creating API
keys, triggering payments, or submitting external forms require confirmation.

Detailed reusable QA checklists belong under `docs/qa/`.

### Provider Docs Gate

Use before any provider, model, generation API, payload, response normalization,
webhook, pricing, or credit-cost change.

The loop exits only when official or primary-source documentation has been
checked and conflicts with local docs or code have been surfaced. If the
external documentation cannot confirm the planned behavior, stop and ask the
user.

### Diff Hygiene Loop

Use before reporting a meaningful code change as complete.

Review the current diff for:

- out-of-scope edits
- duplicated helpers or architecture drift
- `any` or unsafe casts
- direct component fetches
- route handlers that absorbed service logic
- missing i18n keys for user-facing text
- weakened tests
- skipped validation
- documentation drift

Fix only real issues in the changed slice.

## Stop Conditions

Stop the loop and report instead of continuing when:

- the loop reaches its maximum iteration count
- the same blocker repeats without new evidence
- the task needs product/API/security/storage/database confirmation
- required secrets, accounts, permissions, or third-party services are missing
- official documentation conflicts with current code in a behavior-changing way
- validation cannot be run in the current environment
- continuing would require broad refactors outside the task packet

## Documentation Taxonomy

Use current documentation locations:

- durable engineering workflow: `docs/engineering/`
- browser, manual, and regression QA: `docs/qa/`
- UI design and responsive rules: `docs/design/`
- active task packets and execution plans: `docs/plans/`
- reusable task packet template: `docs/engineering/task-packet-template.md`

Historical paths such as `docs/guides/**`, `docs/ai/**`,
`docs/reference/**`, and `docs/progress/**` are not default reading paths.
If old content is encountered, treat it as historical unless `docs/status.md`
or the active task packet explicitly says otherwise.
