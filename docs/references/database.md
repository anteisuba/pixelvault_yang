# Database 参考 — Prisma 域模型边界与迁移纪律（现状事实）

> 定位：数据库现状事实与操作纪律。栈 = Prisma 7 + PostgreSQL（Neon）。红线见 `forbidden.md` 数据库节；检查项见 `checklists/database.md`。

## 访问规则（谁能碰数据库）

- **只有 `src/services/` 层能碰 Prisma**；API route 禁止直接查询（backend.md 分层）。
- Client 从 `src/lib/db.ts` 取；查询作用域辅助在 `src/lib/db-scope.ts`。
- 生成的 client 在 `src/lib/generated/prisma/`——**永远不要手改**。
- ownership（userId 归属）与 credit 计算只在服务端。

## 域模型地图（30 模型 + 11 枚举，2026-07-10 对照 schema 清点，1046 行）

| 域          | 模型                                                                                                                               | 备注                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 身份        | `User`                                                                                                                             | `clerkId` 映射外部身份；JIT 建档走 `ensureUser`                     |
| 组织        | `Project`（`parentId` 层级）· `NodeWorkflowProject` · `Collection` / `CollectionItem`                                              | 普通 Project 与画布项目**分离**；Project 删除不删作品               |
| 生成核心    | **`Generation`**（全模态统一资产记录，schema 中最大模型）· `GenerationJob` · `ExecutionOutbox` · `ApiUsageLedger` · `FreeTierSlot` | 异步执行骨架；Comfy runner 复用；`GenerationSourceSurface` 记来源面 |
| BYOK        | `UserApiKey`                                                                                                                       | 加密存储 + masking；显式 keyId 不 fallback                          |
| 卡片        | `CharacterCard` · `GenerationCharacterCard`（join）· `BackgroundCard` · `StyleCard` · `CardRecipe` · `VoiceCard`                   | 可复用创作上下文层                                                  |
| 配方/提示词 | `Recipe`（`visibility=PUBLIC` 即共享库）· `InspirationPrompt` · `ExtractedElement` · `ImageAnalysis` · `UserCreativePreference`    |                                                                     |
| 社交        | `UserLike` · `UserFollow`                                                                                                          |                                                                     |
| 竞技场      | `ArenaMatch` · `ArenaEntry` · `ModelEloRating` · `ModelConfig`                                                                     |                                                                     |
| 视频        | `VideoPipeline` / `VideoPipelineClip` · `VideoScript` / `VideoScriptScene` · `Story` / `StoryPanel`                                | 三代视频系统并存（收敛中，见 archive 路线图）                       |
| LoRA        | `LoraAsset` · `LoraTrainingJob`                                                                                                    | Civitai 来源字段 2026-06-08 迁移加入                                |

枚举 11 个：OutputType · GenerationStatus · GenerationSourceSurface · GenerationJobStatus · ExecutionOutboxStatus · CharacterCardStatus · LoraTrainingStatus · VideoPipelineStatus · PipelineClipStatus · VideoScriptStatus · VideoScriptSceneStatus。

## 迁移纪律

1. **改完 `schema.prisma` 必须**：`npx prisma migrate dev --name <description>` → `npx prisma generate`（`prisma/CLAUDE.md` 就地规则）。
2. 迁移历史 40 个（最近 `20260627180000_add_generation_source_surface`）；迁移文件是事实源，**不许手改数据库结构**——2026-06 发生过迁移漂移，靠专项恢复（教训：漂移恢复成本远高于纪律成本；历史见 `git show cddc4384:docs/plans/migration-drift-recovery-2026-06.md`）。
3. WHERE / ORDER BY 用到的字段必须加 `@@index()`。
4. 用户生成内容字段（prompt / 错误信息）用 `@db.Text`。
5. 删除关系：ownership 关系 `onDelete: Cascade`；软引用 `onDelete: SetNull`——选哪个必须说得出理由（checklist P1）。
6. 存量数据迁移路径（默认值 / 回填 / 兼容读）在动 schema 前想清并写进报告（checklist P0）。

## 命名约定

Model = PascalCase（`UserApiKey`）· 字段 = camelCase（`createdAt`）· 枚举 = PascalCase + SCREAMING_SNAKE 值（`GenerationStatus.COMPLETED`）。

## 高风险提示

- `Generation` 与 `User` 是被 service 层引用最广的模型——改字段先 grep 影响面，>5 处只做向后兼容（加列可以，改列义/删列要过兼容期）。
- `Generation` 承载全模态（图/视频/音频/3D）+ 卡片/配方/runGroup 元数据，往里加字段前先确认不是该拆去 `GenerationJob` / 专属表的东西（长期建模优先）。
- 视频三套系统（Story / VideoPipeline / VideoScript 族）是收敛中的并存现状——新视频功能先看 `plans/` 在飞任务包再选挂靠点，别随手再开第四套。

## Source of Truth

- `prisma/schema.prisma`（1046 行）· `prisma/migrations/`（40 个）· `prisma/CLAUDE.md`
- `src/lib/db.ts` · `src/lib/db-scope.ts`
- 历史架构上下文：`git show cddc4384:docs/architecture/{overview,storage,credits}.md`

## Last Verified

- Date: 2026-07-10 · Method: schema 模型/枚举清点（grep `^model|^enum`）、迁移目录清点、prisma/CLAUDE.md 就地规则收录。字段级细节未逐一审计——动具体模型前直接读 schema 对应段。
