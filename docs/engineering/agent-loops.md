# Agent Loops Workflow

Last updated: 2026-06-14

This document defines how Personal AI Gallery uses reusable agent loops.
External loop libraries are useful as workflow inspiration, but they do not
override this repository's rules.

## Source of Truth

- `AGENTS.md`
- `docs/README.md`
- `docs/status.md`
- `docs/product/mainline.md`
- `package.json`
- https://loops.elorm.xyz/
- https://loops.elorm.xyz/install
- https://loops.elorm.xyz/loops/spec-first-ship

## Last Verified

- Date: 2026-06-14
- Method: official loops website inspection, `AGENTS.md` inspection, and
  `package.json` script inspection

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
agent hook bundles. Personal AI Gallery uses those prompts only after adapting
them to this repository's task-packet workflow, validation commands, security
boundaries, and documentation taxonomy.

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
4. Inspect the code source of truth.
5. Verify official or primary-source documentation when the task touches
   provider/model/API/pricing/auth/storage/database/deployment/security behavior.
6. State assumptions, conflicts, and stop-worthy uncertainty.

Each pass:
1. Implement one small scoped slice.
2. Run the relevant check or manual verification gate.
3. If the check fails, fix the smallest root cause and repeat.
4. If the same blocker repeats or direction is unclear, stop and report it.

Do not modify the check command, exit criteria, tests, or task scope to force
success.
```

## Specialized Loops

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

Historical paths such as `docs/guides/**`, `docs/ai/**`,
`docs/reference/**`, and `docs/progress/**` are not default reading paths.
If old content is encountered, treat it as historical unless `docs/status.md`
or the active task packet explicitly says otherwise.
