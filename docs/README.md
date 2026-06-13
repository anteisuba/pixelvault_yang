# Personal AI Gallery 文档入口

这个目录是 Personal AI Gallery 的长期开发参考区。

文档的目标不是复刻所有代码细节。代码仍然是实现事实源。文档只记录在长期开发中容易丢失、但会影响后续判断的内容：产品边界、架构契约、执行规则、关键决策和验证路径。

## 文档原则

1. 当前实现以代码为准。
2. 长期文档只记录稳定契约，不记录临时进度。
3. 临时计划完成后必须删除、归档或沉淀。
4. 每篇长期文档都必须指向代码事实源。
5. 能更新现有文档时，不新建重复文档。
6. 过期进度报告不能留在默认阅读路径里。

## 文档生命周期

### 长期参考文档

长期参考文档描述会约束未来开发的规则。它们应该短、明确，并链接到对应代码。

适合长期保存的内容：

- 产品范围
- 架构边界
- 业务域契约
- Provider 接入契约
- UI、响应式和 i18n 规则
- 验证流程

### 临时计划文档

临时计划是当前或近期任务的执行包，不能变成永久记忆。

任务完成后，计划必须进入三种状态之一：

- 没有长期价值时删除
- 仍有历史价值时移入 `archive/`
- 改变了产品或架构时，沉淀到长期参考文档

### 归档文档

归档文档只保留历史背景，不参与默认开发阅读路径。

## 建议目录结构

```text
docs/
├── README.md
├── status.md
├── product/
├── architecture/
├── domains/
├── integrations/
├── engineering/
├── design/
├── qa/
├── decisions/
├── plans/
└── archive/
```

## 分类规则

### `status.md`

唯一的活跃进度文件。

它应该很短，并随着项目变化覆盖更新。不要在这里追加历史、完成记录或详细执行计划。

建议字段：

- Current focus
- Next
- Blocked
- Recently changed
- Needs doc sync

### `product/`

产品意图和用户可见范围。

用于记录：

- 产品边界
- 核心用户路径
- 功能定义
- 路线图级方向

不要在这里写实现细节。

### `architecture/`

系统级契约和边界。

用于记录：

- 应用架构
- 认证和权限边界
- 积分归属和扣减规则
- 生成链路
- 存储和持久化规则
- 数据库职责边界

这个分类下的每个文件都应该包含 `Source of Truth`，指向对应代码文件。

### `domains/`

业务域契约。

建议文件：

- `studio.md`
- `gallery.md`
- `profile.md`
- `arena.md`
- `storyboard.md`
- `credits.md`
- `api-keys.md`

每个文件应该回答：

- 这个业务域负责什么？
- 这个业务域不负责什么？
- 涉及哪些 routes、components、hooks、services 和 API routes？
- 开发时绝对不能破坏什么？

### `integrations/`

外部服务接入契约。

用于记录：

- AI providers
- Clerk
- Neon 和 Prisma
- Cloudflare R2
- Vercel
- Webhooks

这些文档应该关注接入边界、环境要求、失败形态和可信服务端行为。

### `engineering/`

开发流程和验证方式。

用于记录：

- 本地开发
- 验证命令
- 部署流程
- 调试流程
- Codex 和 Claude 协作规则

### `design/`

UI 系统和体验规则。

用于记录：

- 视觉系统
- 响应式规则
- 移动端 QA
- 可访问性要求
- i18n 规则

不要把一次性页面实现计划放进这里，除非它已经变成稳定设计契约。

### `qa/`

测试和验证参考。

用于记录：

- 手动 QA 脚本
- 浏览器主路径检查清单
- 回归检查清单
- 已知测试覆盖缺口

一次性测试报告完成后不应留在活跃 QA 路径里，除非它沉淀成可复用清单。

### `decisions/`

架构决策记录。

每个决策一个文件，格式保持短：

- Context
- Decision
- Consequences
- Source of Truth

### `plans/`

只放活跃任务包。

相关任务完成后，计划必须删除、归档或沉淀。这个目录不能再次变成主要知识库。

### `archive/`

不再参与活跃开发上下文的历史材料。

## 事实源模板

长期文档应该包含以下区块：

```md
## Source of Truth

- `src/...`
- `prisma/schema.prisma`

## Last Verified

- Date: YYYY-MM-DD
- Method: command, code inspection, or manual flow
```

如果文档最近没有验证过，Codex 必须先检查列出的源文件，再把该文档作为开发依据。

## 默认阅读路径

未来开发任务按这个顺序读取上下文：

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/status.md`，如果存在
4. `docs/product/mainline.md`
5. 相关的 `domains/*.md`
6. 相关的 `architecture/*.md`
7. 相关的 `integrations/*.md`
8. 相关代码事实源

如果文档和代码冲突，优先相信代码。只有当任务需要时，才同步更新文档。

## 标准执行工作流

所有有实际影响的开发、规划、调试、Provider/model/API、架构或 UI 任务，都必须按这个顺序推进：

1. 读相关文档。
2. 查代码事实源。
3. 任务涉及 provider、model、API、价格、SDK/平台行为、认证、存储、数据库、部署或安全时，查官方或一手资料。
4. 暴露不确定点、冲突和假设。
5. 方向不清晰或存在多个合理方向时，停止并等用户确认。
6. 非 trivial 实现前，写出或确认 task packet。
7. 实现一个小切片。
8. 跑相关验证。
9. 只更新必要文档。

简写：

`读文档 -> 查代码事实源 -> 必要时查官方资料 -> 暴露不确定点 -> 你确认方向 -> 写 task packet -> 实现小切片 -> 跑验证 -> 更新必要文档`

只有 trivial 修改可以跳过无关步骤。跳过时必须在最终报告里说明原因。

## AI 任务读取规则

AI 不应该每次读取整个 `docs/` 目录。默认只读取和任务有关的最小文档集合。

### 通用开发任务

必须读取：

- `AGENTS.md`
- `docs/README.md`
- `docs/status.md`，如果存在
- `docs/product/mainline.md`
- 当前任务对应的 `domains/*.md`，如果存在
- 当前任务对应的代码事实源

### 架构或跨模块任务

额外读取：

- 相关的 `architecture/*.md`
- 相关的 `decisions/*.md`
- 受影响业务域的 `domains/*.md`

### Provider、模型、API、积分或生成链路任务

额外读取：

- `docs/architecture/generation.md`，如果存在
- `docs/architecture/credits.md`，如果涉及积分
- `docs/integrations/providers.md`，如果存在
- 对应 provider 的 `docs/integrations/*.md`，如果存在
- `src/constants/models.ts`
- 相关 provider adapter、service、API route 和 schema

并且必须联网查官方最新资料。不能只凭已有记忆或旧文档修改 provider/API/model 相关代码。

### UI、响应式、i18n 任务

额外读取：

- 相关的 `design/*.md`
- 相关页面或业务域的 `domains/*.md`
- 对应 messages 文件
- 对应组件、hooks 和 route entry

## 不确定即停止规则

AI 不能猜产品方向、API 契约、provider 能力、模型参数、计费规则、权限边界或数据持久化策略。

如果出现以下情况，必须停止并向用户确认：

- 产品方向有多种合理选择，且文档没有明确答案
- API/provider 官方文档无法确认当前行为
- 模型名称、参数、能力、价格或返回结构不确定
- 代码和文档冲突，且会影响业务行为或数据安全
- 需要修改认证、积分、存储、数据库或外部 API 契约
- 实现需要引入新的长期架构规则

停止时应该说明：

- 已确认的事实
- 不确定点
- 可选方向
- 推荐方向和理由
- 需要用户确认的问题

## 联网核验规则

规划或修改以下内容前，必须联网查官方或一手资料：

- AI provider API
- 模型列表、模型能力、参数、限制和返回结构
- 价格、credit 映射或计费假设
- SDK、框架、平台、数据库、认证、存储和部署行为
- 安全、合规或权限相关行为

优先资料顺序：

1. 官方 API 文档
2. 官方 SDK 文档或 changelog
3. 官方模型页面、model card 或 endpoint schema
4. 官方公告、release notes 或 migration guide
5. 代码库当前实现

如果官方资料和当前代码冲突，AI 不能直接改代码来迎合猜测。必须先说明冲突并请求确认。

## 推荐写作顺序

新文档应该一篇一篇写。

建议顺序：

1. `docs/status.md`
2. `docs/architecture/overview.md`
3. `docs/architecture/generation.md`
4. `docs/architecture/credits.md`
5. `docs/domains/studio.md`
6. `docs/integrations/providers.md`
7. `docs/design/ui-system.md`
8. `docs/engineering/validation.md`

每写完一篇，都应该先对照当前代码审一遍，再继续写下一篇。
