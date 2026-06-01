# Projects Domain

最后更新：2026-06-02

本文档记录 Projects 业务域的当前事实、已确认目标和未决边界。这里的 Projects 指普通 `Project` 归类/文件夹系统，不包括 `NodeWorkflowProject` 画布工作流项目。

## Current

### Role

当前普通 `Project` 是用户私有的作品组织容器。

Current implemented responsibilities include:

- create, list, rename, move, and soft-delete projects
- support parent/child project hierarchy through `parentId`
- attach generated works to a project through `Generation.projectId`
- filter user-owned generations by project or unassigned state
- show project/folder navigation in Assets
- move single or multiple assets between projects
- expose project selection in Studio so new generations can be created under the active project

当前代码没有公开项目页。

### Data Model

`Project` is the current database source of truth.

Current fields include:

- `id`
- `userId`
- `name`
- `description`
- `parentId`
- `isDeleted`
- `createdAt`
- `updatedAt`

Current relations include:

- `User.projects`
- `Generation.project`
- `CharacterCard.project`
- `BackgroundCard.project`
- `StyleCard.project`
- `CardRecipe.project`

Current indexes support:

- listing non-deleted projects by user
- listing non-deleted children by `parentId`

Current project limits:

- project name max length: 60
- description max length: 500
- max projects per user: 50
- project history page size: 20

### API Surface

Current project API routes:

- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/[id]`
- `DELETE /api/projects/[id]`
- `GET /api/projects/[id]/history`
- `PATCH /api/generations/[id]/project`

Related batch route:

- `POST /api/generations/batch` with `action = "project"`

Project CRUD routes use API route factories. Project history currently uses direct `auth()` and `NextResponse`.

### Service Layer

`src/services/project.service.ts` owns normal project CRUD and project history:

- `listProjects`
- `createProject`
- `updateProject`
- `deleteProject`
- `getProjectHistory`
- `assignGenerationToProject`

`createProject` and `updateProject` validate `parentId` ownership and prevent moving a folder into itself or its own child.

`deleteProject` soft-deletes the project in a transaction. It also:

- moves generations in that project back to `projectId = null`
- moves child projects back to root by setting their `parentId = null`

`getProjectHistory` returns generations for a project or the special unassigned bucket. The API route maps `/api/projects/unassigned/history` to `projectId = null`.

Related generation service behavior:

- `batchAssignProject` validates target project ownership and `isDeleted = false` before batch-moving generations.
- `getAssetSectionCounts` groups user generations by `projectId` for Assets sidebar counts.
- gallery/assets queries can filter by `projectId`, including the special `"none"` value for unassigned generations.

### Client Surface

Current project client code includes:

- `src/lib/api-client/projects.ts`
- `src/hooks/use-projects.ts`
- `src/components/business/ProjectCreateDialog.tsx`
- `src/components/business/ProjectChipFilter.tsx`
- `src/components/business/KreaAssetBrowser.tsx`
- `src/components/business/AssetDetailSheet.tsx`
- Studio prompt submission through `projects.activeProjectId`

`KreaAssetBrowser` currently presents projects as folders in Assets. It supports:

- all assets
- favorites
- published
- uploads
- unassigned
- project folders
- nested folder tree rendering
- folder create, rename, and delete
- batch move to a folder or unassigned

`AssetDetailSheet` supports moving a single generation to a project or unassigned.

### Visibility

Current `Project` has no `isPublic` field.

Project visibility is private by design in the current code:

- project APIs require authentication
- project list and history are scoped through the signed-in user
- project organization is mainly surfaced in Assets and Studio

Generation visibility is separate:

- `Generation.isPublic` decides whether a work can appear in public surfaces.
- `Project.projectId` only organizes a work for the owner.

Public Gallery may accept project-related filters in shared query code, but Project itself is not a public publishing surface.

### Node Workflow Separation

`NodeWorkflowProject` is a separate Prisma model.

It stores React Flow canvas state for Node Studio workflows and has its own API routes under:

- `/api/node-workflow/projects`
- `/api/node-workflow/projects/[id]`
- `/api/node-workflow/projects/[id]/activate`

`NodeWorkflowProject` belongs to the Node workflow domain, not the normal Projects domain.

## Target

### Role

Projects should be a private organization layer, similar to file management.

It owns:

- private project/folder names and descriptions
- project hierarchy
- project membership for generated works
- project membership for cards and recipes
- owner-only filtering, browsing, and moving between project folders
- unassigned state as the default no-project bucket

Projects does not own:

- generation execution
- model/provider routing
- media storage or R2 persistence
- public Gallery feed behavior
- public creator Profile pages
- public project pages
- social discovery
- Collection publishing
- Card character consistency logic
- Node workflow canvas state

Confirmed product direction:

```text
Projects are private file-management-style organization.
There will not be public project pages.
```

### Privacy Contract

Project membership must stay private.

Rules:

- A project is owned by one user.
- Project list, project history, hierarchy, and folder names are owner-only.
- Making a generation public must not make its project public.
- Moving a generation into a project must not affect `Generation.isPublic`.
- Deleting or hiding a project must not delete the generated work itself.
- Public Gallery, public Profile, and public generation detail pages must not depend on exposing project metadata.

If a future public grouping surface is needed, it should be modeled separately through Gallery/Profile/Collections or another explicitly public domain, not by making Projects public.

### Ownership And Permission Rules

Every write that touches `projectId` must verify server-side ownership.

Required checks before assigning a non-null `projectId`:

- the project exists
- the project belongs to the authenticated internal user
- the project is not soft-deleted
- the asset/card/recipe being moved belongs to the same user

Client-selected project IDs are only user intent. They must never be trusted as authorization.

### Deletion Policy

Project delete should remain a non-destructive organization operation.

Target behavior:

- soft-delete the project
- do not delete generated works
- move contained generations back to unassigned
- move child projects to root or require an explicit owner-confirmed policy
- keep storage, Generation records, cards, and recipes intact unless the user explicitly deletes those assets through their owning domain

### Domain Boundaries

Confirmed domain boundary:

- Projects: private organization, folder hierarchy, membership, owner filtering.
- Assets: main private asset browser and bulk management UI.
- Generation: generated work source of truth and `projectId` field.
- Storage: R2 and durable media persistence source of truth.
- Gallery: public feed and public generation details; not project management.
- Profile: public creator identity and public works presentation; not project folders.
- Collections: potential public or curated grouping surface; not the same as private Projects.
- Cards: character/background/style/recipe reusable creation assets; may be organized by Project but own their own creation semantics.
- Node workflow: advanced canvas workflow project state; separate from normal Project folders.

### Development Rules

- Do not add public project pages without explicit owner confirmation.
- Do not use project membership as a public visibility signal.
- Do not let deleting a project delete generated media or R2 objects.
- Do not move project hierarchy or membership logic into UI components.
- Do not write `projectId` from client input without server-side ownership validation.
- Do not merge `Project` and `NodeWorkflowProject` into one model just because both are called projects in UI.

## Unresolved

- `assignGenerationToProject` in `src/services/project.service.ts` currently updates `Generation.projectId` without explicitly validating that the target non-null project belongs to the user and is not deleted. This should be fixed or replaced by the safer `batchAssignProject` pattern before relying on that route as a permission boundary.
- `createGeneration` accepts `input.projectId` and writes it directly. Callers should be audited to confirm every media path validates project ownership before persistence.
- `getPublicGenerationPage` and shared gallery query code can filter by `projectId`, but public route behavior currently does not pass project filters during the initial server query. The final relationship between public Gallery filters and private Project IDs should be reviewed.
- Current project history route uses direct route handling instead of API route factory. Whether it should be migrated for consistency is unresolved.
- Project hierarchy UI exists in Assets, but full drag/drop hierarchy management is not documented as a target yet.
- Card services have `projectId` support, but the exact UX for organizing CharacterCard, BackgroundCard, StyleCard, and CardRecipe by project should be specified in `docs/domains/cards.md`.
- Whether deleting a parent project should always move child projects to root, or later offer "delete tree" / "move children" choices, needs confirmation before UI expansion.
- Project counts currently come from generation grouping; counts for cards or recipes are not part of the current Project summary.
- Browser QA for project create, rename, delete, hierarchy, single move, batch move, unassigned history, and Studio active project generation has not been run in this documentation pass.

## Source of Truth

- User-confirmed Projects direction in the 2026-06-02 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/storage.md`
- `docs/domains/studio.md`
- `docs/domains/gallery.md`
- `docs/domains/profile.md`
- `prisma/schema.prisma`
- `src/constants/config.ts`
- `src/types/index.ts`
- `src/services/project.service.ts`
- `src/services/generation.service.ts`
- `src/services/project.service.test.ts`
- `src/services/generation.service.test.ts`
- `src/lib/api-client/projects.ts`
- `src/lib/api-client/gallery.ts`
- `src/hooks/use-projects.ts`
- `src/components/business/ProjectCreateDialog.tsx`
- `src/components/business/ProjectChipFilter.tsx`
- `src/components/business/KreaAssetBrowser.tsx`
- `src/components/business/AssetDetailSheet.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/projects/[id]/history/route.ts`
- `src/app/api/generations/[id]/project/route.ts`
- `src/app/api/generations/batch/route.ts`
- `src/app/[locale]/(main)/assets/page.tsx`
- `src/app/[locale]/(main)/gallery/page.tsx`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

## Last Verified

- Date: 2026-06-02
- Method: owner direction confirmation plus schema/API route/service/hook/component/page/test inspection
- External docs: not required for Projects domain facts in this pass
- Runtime: not run
