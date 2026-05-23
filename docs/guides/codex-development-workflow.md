# Codex 开发工作流

## 目的

把 Codex 在本仓库中的开发、计划、review、稳定性判断流程固定下来，减少每次新对话重新摸索导致的漂移和幻觉。

这份文档是长期规范，不是一次性任务说明。

---

## 核心原则

本项目采用“文档控上下文”的开发方式。

目标不是让每个新对话都重读整个仓库，而是让 Codex 先读稳定规则，再读接近当前代码的地图，再读本次任务切片。

默认顺序：

1. 法律层
2. 地图层
3. 切片层

---

## 上下文读取顺序

### 1. 法律层

必须先读：

- `AGENTS.md`
- `docs/guides/*.md`

这层定义项目的长期约束、线程职责、开发与 review 流程。

### 2. 地图层

对于当前代码状态，优先读这些文件：

- `docs/plans/ui/02-現狀映射.md`
- `docs/plans/feature/02-現狀映射.md`
- `docs/plans/qa/functional/02-現狀映射.md`
- `docs/plans/qa/ui/02-現狀映射.md`
- `docs/plans/roadmap/**`（仅当任务是未来规划、能力预研、路线制定时再读）
- `docs/progress/current-status-audit.md`
- `docs/guides/ai-context.md`

说明：

- `docs/plans/{ui,feature,qa/*}` 比大部分 `docs/plans/` 其他文件更接近当前代码，应优先于历史计划文档
- `docs/plans/roadmap/` 属于未来规划层，不应用来覆盖上面这些目录对当前代码的描述
- 若这些工作包映射文档与旧计划冲突，以更接近代码现状的映射文档为准

### 3. 切片层

只读与当前任务直接相关的内容：

- 相关 `docs/plans/...`
- 相关目录下的 `src/**/CLAUDE.md`
- 目标代码文件
- 目标测试文件

---

## 首次掌握项目 vs 后续新对话

### 首次掌握项目

第一次系统接手本项目时，应该做一次较完整的全局阅读：

1. `AGENTS.md`
2. `docs/guides/*`
3. `01/02/03/04` 的 README 与現狀映射
4. 核心高风险代码：
   - `src/types/index.ts`
   - `src/contexts/studio-context.tsx`
   - `src/hooks/use-unified-generate.ts`
   - `src/lib/api-route-factory.ts`
   - `src/constants/models.ts`

### 后续新对话

后续新 chat 不应默认重读整个仓库。

默认只读：

1. 法律层
2. 相关地图层条目
3. 本次任务切片

只有在下面情况才重新做大范围阅读：

- 用户明确要求全局复盘
- `01/02/03/04` 显著落后于代码
- 架构或产品边界发生重大变化
- 任务本身是跨域整合或全局重构

---

## Session Handoff 与重新进入

长线程不应只依赖聊天历史续命。任何可能跨 session、跨 compact、跨线程或跨天继续的任务，都必须留下一个短而可执行的 handoff。

### 什么时候必须写 handoff

以下情况必须在完成报告或暂停报告里写 handoff：

- 任务已经持续超过一个明确功能切片
- 本轮改动涉及 3 个以上文件或跨前后端
- 用户说“继续”“下次接着做”“先暂停”“换一个线程做”
- 发生 compact、明显上下文不足、用户中断或方向切换
- Codex 完成实现但还需要独立 review、浏览器 QA、部署或文档回流

### Handoff 模板

```md
## Session Handoff

- Goal:
- Current state:
- Files touched:
- Decisions made:
- Validation run:
- Validation not run:
- Known risks:
- Related plan status:
- Next exact step:
```

规则：

- `Current state` 写当前已经真实完成的状态，不写愿望。
- `Files touched` 只列关键文件或目录，不复制完整 diff。
- `Decisions made` 记录会影响后续实现的取舍。
- `Validation run` 必须写具体命令或浏览器证据。
- `Next exact step` 必须能直接变成下一条 Codex 指令。
- 如果没有相关计划，写 `Related plan status: No related plan exists`。

### 重新进入协议

从旧 session、compact summary、用户粘贴的 handoff 或“继续”重新进入时，先做这 5 步：

1. 读最近的 handoff 或用户给出的总结。
2. 运行 `git status --short`，确认工作树是否已经变化。
3. 只读取 handoff 里列出的关键文件和当前任务切片，不默认重读整个仓库。
4. 对比 handoff 和当前代码。如果不一致，先说明不一致点，再继续。
5. 重新给出本轮成功标准和下一步，不把旧计划当成仍然正确。

如果 handoff 缺失，Codex 必须先从当前代码和 git diff 重建最小上下文，不应根据模糊记忆继续写代码。

---

## 任务包制度

任何非微小任务，在进入实现或 review 前，都应先形成一个清晰的任务包。

任务包至少包含：

- `目标`
- `非目标`
- `必须先读的文档`
- `允许修改的文件范围`
- `验证命令`
- `完成定义`

推荐模板：

```md
## Task Packet

- Goal:
- Non-goals:
- Read first:
- Allowed file scope:
- Validation:
- Definition of done:
```

如果任务跨前后端，还要额外写明：

- `涉及层`
- `对应 01/02/03/04 的哪一条`

---

## 标准开发流程

### 1. 任务归类

先判断任务主要属于哪类：

- UI / 页面
- 功能 / 服务 / API
- 功能测试
- UI 测试
- 跨层任务

### 2. 读取地图

根据任务类型优先读取：

- UI 任务：`01-UI` + `04-UI測試`
- 功能任务：`02-功能` + `03-功能測試`
- 跨层任务：四者都读，但只聚焦相关条目

### 3. 代码切片阅读

读目标路由、组件、hook、service、测试和同目录 `CLAUDE.md`。

### 4. 制定或更新计划

较大的任务必须先有计划，再动手实现。

计划文档建议放在：

- `docs/plans/frontend/`
- `docs/plans/backend/`
- `docs/plans/product/`

计划必须包含可验证的完成条件。没有完成条件的长期任务，应先收敛成一个目标：

```md
Goal:
Verifier:
Stop condition:
Out of scope:
```

示例：

- `Goal`: LoRA stack 真正进入图像生成请求并落库到 generation metadata。
- `Verifier`: 相关 service test 通过，手动生成请求能看到 LoRA metadata。
- `Stop condition`: 测试通过并完成一次浏览器生成链路检查。
- `Out of scope`: 不在本任务内重设计 LoRA 库页面。

对于 UI、端到端流程、登录态流程、跨页面流程，Goal 必须把 Computer Use 或 Browser QA 写进 verifier，而不是只写“看起来正常”：

```md
Goal:
完成 <用户可见能力>，并让用户能在 <目标路由/设备> 完成主路径。
Verifier:

- Fast check: <typecheck/lint/test 命令>
- Flow check: 使用 Computer Use 按测试流程完成 <具体用户路径>
- Evidence: URL、关键可见文本、截图或 app state、控制台/页面错误、失败时的复测结果
  Stop condition:
  主路径通过；失败路径有明确错误态；没有新增 console/pageerror；相关测试通过。
  Out of scope:
  <本轮不处理的功能/UI/数据迁移>
```

### 5. 受控实现

实现时必须遵守：

- 不无关重构
- 不跨层漂移
- 不改变既有架构模式，除非计划明确说明
- 用户可见文案变更必须保持 i18n 可扩展
- 改动与任务包无关的区域，默认不碰

### 6. 作者自审

实现者先基于 diff 自审，不直接把“写完了”当成“没问题”。

自审顺序：

1. 架构边界
2. 类型与 schema
3. 安全与权限
4. i18n
5. 测试与验证
6. UI / 响应式 / 状态完整性

### 7. 独立 review

有意义的改动完成后，应由独立的 `探索` thread 做 review。

review 输入应包含：

- 任务包
- 相关计划
- 对应 `01/02/03/04` 条目
- 当前 diff

原则：

- 实现线程不把自己的判断当作最终 review
- `探索` 线程优先找风险、回归、边界和缺失测试

### 8. 验证

完成 review 后再执行验证，并明确记录：

- 跑了什么
- 没跑什么
- 为什么没跑

### 9. 文档回流

如果改动改变了地图、边界、计划或长期规则，必须回写：

- `01/02/03/04`
- `docs/plans/...`
- `docs/guides/...`
- `AGENTS.md`（若是长期规则）

---

## Steering 与 Queuing 纪律

用户在任务进行中追加信息时，先判断是 steering 还是 queuing。

### Steering

Steering 是改变当前正在做的事，例如：

- “别这样做，换成 B 方案”
- “这个 UI 方向不对”
- “先停一下，检查这个报错”

处理方式：

1. 停止继续扩大当前 diff。
2. 简短复述新方向和会废弃的旧假设。
3. 检查已经修改的文件是否仍然适用。
4. 只保留仍然服务新目标的改动。

### Queuing

Queuing 是把下一件事排到当前任务之后，例如：

- “做完后再 review”
- “下一步加 URL 分享”
- “完成后发一个路线图”

处理方式：

1. 不打断当前正在验证的任务。
2. 在 handoff 的 `Next exact step` 或完成报告里记录。
3. 如果 queued task 是新功能或跨层任务，必须生成新的任务包。

如果用户追加的内容同时改变当前目标和新增后续目标，优先按 steering 处理当前目标，再把剩余内容放入 queue。

---

## 计划格式

计划不追求长，追求稳定和可执行。

建议结构：

1. 背景
2. 目标
3. 非目标
4. 影响范围
5. 风险
6. 验证方式
7. 回流文档

对于本项目，计划还应明确：

- 对应的 `01/02/03/04` 条目
- 受影响的页面/能力域/测试域
- 是否涉及跨层改动

---

## Review 工作流

### 作者自审必须看

- 是否违反 `AGENTS.md` 的分层
- 是否把逻辑塞进 component / route
- 是否引入了第二种架构模式
- 是否漏了三语或 translation-ready 约束
- 是否动到高风险文件却没有补验证
- 是否影响 auth / ownership / credits / provider fallback

### 独立 review 必须优先找

- regression
- 边界条件
- 缺失测试
- 不一致的状态处理
- i18n 漏项
- 响应式和空态/错误态缺口

review 应优先引用：

- `docs/plans/qa/functional/02-現狀映射.md`
- `docs/plans/qa/ui/02-現狀映射.md`

把这些文档当成 checklist，而不是靠临场印象 review。

---

## 项目平稳性的判断标准

“项目运行平稳”不能只靠页面看起来能用。

至少从七个维度判断：

### 1. 类型与静态门禁

日常至少确认：

- `npx tsc --noEmit`
- `npm run lint`

### 2. 改动相关测试

本次改动必须至少跑相关测试：

- 相关 `vitest`
- 相关 route tests
- 相关 component tests

### 3. 合并前门禁

重要改动合并前应确认：

- `npx vitest run`
- `npm run build`

### 4. 目标化验证

每个任务包必须把验证分成三层：

- `Fast check`: 和本次改动直接相关的最小命令，例如单个 test file、`tsc --noEmit` 或局部 lint。
- `Flow check`: 能证明用户路径可用的浏览器或 API 链路。
- `Release check`: 合并前才需要跑的完整 lint / test / build。

不要用“跑了很多命令”代替验证目标。验证报告必须说明每条命令证明了什么。

### 5. Computer Use 测试流程

当任务涉及真实 UI 交互、Chrome 登录态、本机浏览器状态、文件选择器、拖拽、复制粘贴、滚动抽屉、响应式布局或第三方网页时，Flow check 应优先写成 Computer Use 测试流程。

任务包里的 Computer Use 测试必须包含：

```md
Computer Use Flow Check:
App/browser:
Start URL:
Locale:
Viewport/device:
Preconditions:
Test data:
Steps: 1. ... 2. ...
Expected:
Evidence to capture:
Do not do:
```

推荐默认流程：

1. 启动或复用本地 dev server，记录 URL 和端口。
2. 用 Computer Use 打开目标页面，确认当前 URL、页面标题、关键文本和登录状态。
3. 执行主路径：点击、输入、选择模型/素材、提交、等待结果、检查状态变化。
4. 执行至少一个失败/空态路径：缺 key、缺输入、无权限、加载失败或移动端滚动场景。
5. 捕获客观证据：截图/app state、关键 DOM 文本、console/pageerror、network/API 状态或服务器日志。
6. 如果失败，先分类：
   - app bug：代码逻辑、状态、样式、权限、API、schema、i18n 问题
   - environment：本地编译、网络、登录态、第三方服务、测试数据、浏览器扩展问题
7. 对 app bug 做最小修复，重新运行同一条 Computer Use 流程。
8. 最多循环到主路径通过；若被环境或权限卡住，停止并写 handoff，不假报通过。

Computer Use 安全边界：

- 默认只操作本地开发环境、测试账号和测试数据。
- 不在未确认时删除云端/本地数据、创建 API key、改账号权限、发帖、发邮件、上传敏感文件、提交支付或提交外部表单。
- 需要上传文件、传输敏感数据、修改第三方账号状态或触发外部副作用时，必须在动作发生前向用户确认。
- CAPTCHA、密码修改最终提交、绕过浏览器安全提示等动作不交给 Codex 自动完成。

开发 + 测试 + debug 的闭环应写成：

```md
Implement slice -> Fast check -> Computer Use Flow check -> classify failure -> inspect source/logs -> patch -> rerun same Flow check -> report evidence
```

完成报告必须写清：

- Computer Use 测了哪条路径
- 看到的通过证据是什么
- 失败过什么，如何修复或为什么归类为环境问题
- 哪些路径没有测，原因是什么

### 6. 产品烟雾链路

优先检查现有主干路径：

- landing
- studio auth / generate
- gallery
- mobile
- i18n

可直接参考现有 `e2e/*.spec.ts`。

### 7. 运行健康与文档健康

运行健康：

- `/api/health`
- `/api/health/providers`

文档健康：

- `01/02/03/04` 是否仍然反映当前代码
- 计划文档是否已失真
- 新的长期规则是否已回流到 `docs/guides/` 和 `AGENTS.md`

如果代码已经变化，但地图和规则没有更新，则项目不应被视为真正平稳。

---

## 自动化使用规则

自动化用于守住重复性检查，不用于绕过任务包直接改代码。

### 适合自动化的任务

- 每日检查 `docs/plans/**` 是否可能 stale
- 定期运行模型文档监控或 provider 可用性巡检
- 定期做本地/预览环境的轻量 smoke QA
- 长任务期间回到同一 thread 检查等待中的 review、CI、部署或外部反馈
- 每周汇总 session compact、中断、未验证任务和未回流计划

### 不适合自动化的任务

- 没有完成条件的开放式重构
- 自动修改 `src/**`、`prisma/**`、`scripts/**` 后直接宣称完成
- 需要用户产品判断的 UI 方向选择
- 需要真实密钥、支付、权限或 destructive 操作的流程

### 选择自动化类型

- 同一个长线程需要回来继续上下文时，用 thread heartbeat。
- 从工作区定时重新开始的检查，用 scheduled workspace automation。
- 低于一小时、依赖当前讨论上下文的跟进，优先用 heartbeat。

自动化 prompt 必须自包含，并明确输出格式：

```md
Task:
Scope:
Read first:
Allowed actions:
Validation:
Report format:
```

自动化发现问题时，应报告证据、影响和建议任务包；除非用户明确授权，不直接扩大实现范围。

---

## 线程使用建议

### `规范`

- 只沉淀长期规则
- 输出到 `docs/guides/`

### `探索`

- 负责理解、拆解、计划、独立 review
- 输出到 `docs/plans/`

### `前端`

- 执行 UI / i18n / 交互实现
- 必须基于计划实现

### `后端`

- 执行 service / API / auth / storage / database 实现
- 必须基于计划实现

### 跨层任务

- 只选一个执行线程
- 由计划明确写出跨层范围
- review 回到 `探索`

---

## 一句话纪律

先读法律层，再读地图层，再读切片层。

先计划，再实现。

实现不等于 review。

CI 绿不等于项目平稳。

代码改变后，地图和规则也要同步更新。
