Implement this feature: $ARGUMENTS

Use `docs/WORKFLOW.md` to pick the scene and verification. Build one end-to-end slice along the dependency order constants/types → services → hooks → components, touching only the layers this slice needs and reusing existing constants, types and services before adding new ones. Derive types from Zod schemas (no `any`). New user-visible strings go into all three of `src/messages/{en,ja,zh}.json`.

Verify per WORKFLOW's impact table (`npm run typecheck`, `npm run lint`, targeted `npm run test:run -- <path>`). Run `npm run build` only when no dev server is running on 3000.
