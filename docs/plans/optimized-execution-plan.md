# 优化后执行计划

> **日期**: 2026-05-03
> **来源**: 基于 `tech-debt-and-creative-control-roadmap.md`（2026-04-25）重新排序
> **依据**: `current-status-audit.md`（2026-04-28）+ 代码验证

---

## 与原计划的差异

### 已完成项（从原计划中移除）

| 编号  | 任务                               | 完成证据                                          |
| ----- | ---------------------------------- | ------------------------------------------------- |
| A.1.1 | execution-callback finalize 原子化 | 审计确认已包 `db.$transaction`；service test 覆盖 |
| A.2.5 | Provider adapter 补测              | 审计确认 8 adapter 全覆盖                         |

### 已知问题验证结果（2026-05-03 代码验证）

| 问题                      | 原状态  | 验证结果                                                                                        | 处理               |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| Cmd/Ctrl+K 双重绑定       | ⚠️ 已知 | ❌ **不存在** — 仅 `StudioCommandPalette.tsx:46` 一处绑定                                       | 从已知问题中移除   |
| Workflow Shell Phase 6    | ⚠️ 待做 | ✅ **确实未完成** — Phase 6 明确 pending（i18n + 移动端 + override 语义）                       | 保留，归入 Tier 2  |
| requestCount/credits 漂移 | ⚠️ 已知 | ✅ **确实存在** — i18n 键 `creditCount`/`creditsLabel` vs 后端 `requestCount`，15 个文件受影响  | 保留，归入 Tier 4  |
| 240s maxDuration 不够     | ⚠️ 已知 | ⚠️ **部分存在** — Worker 路径已缓解 CINEMATIC_SHORT_VIDEO+FAL，非 Worker 视频路径仍受 240s 限制 | 降级为低优先级备注 |
| 内存限流器                | ⚠️ 已知 | ❌ **不存在** — 已实现 Upstash Redis 分布式限流 + 内存降级 (`src/lib/rate-limit.ts`)            | 从已知问题中移除   |

---

## Plan A — 技术债（重新排序后的执行序列）

### Tier 1 — 用户直接感知的可靠性（最先做）

> 目标：用户遇到的最痛问题。

**A.1.2 Free-tier 并发原子性**

- 位置：`src/services/usage.service.ts` L103-126
- 问题：`createApiUsageEntry` 非原子，并发请求可突破 free-tier 限制
- TDD 子计划：`backend/2026-04-25-plan-a-a1-runtime-stability.md`

**A.3.2 生成失败用户错误反馈**

- 问题：生成失败为 500 或静默失败，用户不知原因
- 目标：`StudioGenerationErrorDialog` — 重试 / 换模型 / 查看原因
- TDD 子计划：`backend/2026-04-26-plan-a-a3-error-loading-webhook.md`

**A.3.1 补齐 loading/error 文件**

- 缺失路由：`studio/`、`storyboard/`、`u/[username]/`、`arena/`（缺 loading）、`profile/`（缺 error）
- TDD 子计划：`backend/2026-04-26-plan-a-a3-error-loading-webhook.md`

### Tier 2 — 首次体验优化（紧接着做）

> 目标：新用户的第一分钟体验。

**A.4.2 Studio 默认样例 prompt**

- 首次访问预填 sample prompt（`localStorage` flag）
- 文案入三语 JSON

**A.4.1 首页 Hero 密度瘦身**

- 11+ 概念 → 一句话定位 + 一句副标
- 3 CTA → 主 CTA（开始创作）+ 次 CTA（浏览画廊）

**A.4.3 OnboardingTooltip 节奏校准**

- 与 A.4.2 联动："已帮你填好 sample prompt"

**W6-Phase6 Workflow Shell 移动端 + i18n 补全**

- Workflow 名称三语 JSON
- Mobile workflow picker 间距
- Shell 首屏空态
- 切换时 prompt/panel/preview 保留策略

### Tier 3 — 工程质量基建（可并行推进）

> 目标：测试覆盖率和代码质量。可由 codex 并行执行。

**A.2.1-A.2.4 Service 补测**（14 service 无测试）

- 高优先级：`user.service`、`generation.service`、`studio-generate.service`、`arena.service`
- 中优先级：Card 体系（character/background/style/recipe）、社群（follow/like/collection）
- 低优先级：`lora-training`、`civitai-token`、`video-pipeline`、`image-analysis`
- TDD 子计划：`backend/2026-04-25-plan-a-a2-test-coverage.md`

**A.2.6 Route 覆盖率 43% → ≥70%**

- 优先补：`webhooks/clerk`、`admin/*`、`lora-training`、`generate-long-video/{retry,cancel}`、`image/edit`、`voices/*`

**A.1.3 签名验证抽取**（降级为 P2）

- 纯重构，不影响用户体验
- 新建 `src/lib/signature-verifiers/internal-execution.ts`

### Tier 4 — 运维与扫尾（最后做）

> 目标：技术完整性。部分可推迟到 Phase E 之前。

**A.3.3 Clerk webhook 事件扩展**

- 加 `user.updated`、`user.deleted`

**A.3.4 credits/requestCount 术语统一**

- i18n 键名 `creditCount` → `requestCount`（15 个文件）
- 建议推迟到 Phase E（变现）启动前统一处理

**A.5.1 Clerk handshake 诊断**

- 需在生产环境复现，可能是配置问题

**A.5.2 部署后 smoke 自动化**

- `.github/workflows/` + `scripts/smoke.ts`

---

## Plan B — 创作控制能力（分阶段切割）

> 原 B.1 有 8 个子任务，拆为 3 个可独立交付的里程碑。
> 严格顺序：图片 → 视频 → 音频。

### B.1α — 数据层（纯后端，不碰 UI）

| 任务  | 内容                                                                                                                    | TDD 子计划                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| B.1.1 | `ImageIntent` + `ReferenceAsset` Zod schema + `intent-parser.service` + `model-router.service` + `/api/generation/plan` | `plan-b-b11-intent-layer.md`    |
| B.1.2 | `prompt-compiler.service` (per-model: tag/photo/anime/natural)                                                          | `plan-b-b12-prompt-compiler.md` |
| B.1.3 | `Generation.referenceImages` 扩展为 `ReferenceAsset[]` + 老数据兼容                                                     | 含在 B.1.1                      |

**验收**: 3 个 service 有测试，API 可用 curl 调通，不需要 UI。

### B.1β — 反馈层（接通 UI 可验证）

| 任务  | 内容                                                                            | TDD 子计划                           |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------ |
| B.1.4 | `generation-evaluator.service` (LLM vision 评分) + `Generation.evaluation` 新列 | `plan-b-b14-generation-evaluator.md` |
| B.1.5 | `StudioGenerationPlan` + `StudioResultFeedback` + `StudioKeepChangePanel`       | `plan-b-b15-studio-ui.md`            |

**验收**: 用户可看到生成计划预览，可给结果打反馈标签，可发起 Keep/Change 优化。

### B.1γ — 持久层（形成闭环）

| 任务  | 内容                                                   | TDD 子计划                         |
| ----- | ------------------------------------------------------ | ---------------------------------- |
| B.1.6 | `Recipe` 表 + CRUD + `/api/recipes` + Profile 配方 tab | `plan-b-b16-recipe-persistence.md` |
| B.1.7 | Arena `taskType` + per-task ELO + model-router 接入    | 待细化                             |
| B.1.8 | `UserCreativePreference` 表 + 偏好学习                 | 待细化                             |

**验收**: 用户可保存配方、从配方重新生成、Arena 反哺模型推荐。

### B.2 视频稳定生成（依赖 B.1 完成）

- B.2.1 分镜编排 + 关键帧 I2V + 失败重试
- B.2.2 Continuity Checklist 注入
- B.2.3 Scene 级 Keep/Change

### B.3 音频稳定生成（依赖 B.2 完成）

- B.3.1 VoiceCard 持久化
- B.3.2 字段化输入 + 反馈
- B.3.3 Recipe 统一抽象收口

---

## 仍存在的已知问题

1. ⚠️ Workflow Shell **Phase 6** 未完成（i18n + 移动端测试 + override 语义）→ 归入 Tier 2
2. ⚠️ `requestCount`/`credits` i18n 键名漂移（15 个文件）→ 归入 Tier 4
3. ⚠️ 非 Worker 视频路径受 240s `maxDuration` 限制（Worker 路径已缓解）→ Phase G 处理

## 已验证不存在的问题（从跟踪列表移除）

- ~~Cmd/Ctrl+K 双重绑定~~ — 仅 `StudioCommandPalette.tsx` 一处绑定，无冲突
- ~~内存限流器未升级~~ — 已实现 Upstash Redis 分布式限流（`src/lib/rate-limit.ts`）

---

## Roadmap 其余未完成阶段（参考）

| Phase      | 状态 | 核心未完成项                                                                      |
| ---------- | ---- | --------------------------------------------------------------------------------- |
| D 社区     | 95%  | publish-to-earn、社交发现                                                         |
| E 变现     | 0%   | Credits 购买/充值、平台托管模式                                                   |
| F 创作流   | ~40% | Storyboard 角色绑定、Inpainting/Outpainting、工作流存档、OAuth 供应商登录         |
| G 生产就绪 | 0%   | 备份自动化、PWA、团队工作区                                                       |
| W 工作台   | ~70% | 视频风格连续性(W3)、音频最终组装(W4)、Workflow Shell Phase 6(W6)、Worker 扩展(W7) |
