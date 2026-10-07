# MCP 参考 — 外部 Claude 剪片接入契约

> 状态：**施工基准**（进度表 37）。S2–S4 已上线（2026-09-28，令牌表迁移与 render worker 均已在生产）；令牌管理界面 2026-10-07 落在 `/settings/connections`（未推）；S5 的「快照加时间线 · 教 op」2026-10-07 施工完（未推），站内 `look_at` 与 S7 未开工。owner 2026-09-28 设计门 ①–③ 定案：「用 Claude 控制我的项目剪片，它需要什么功能就做什么」。外部 Claude 经 MCP 读写画布项目，站内助手用**同一套工具**。剪辑台界面的改版（第 ④ 步画板）另行出稿，本文只管工具、数据与同步。

## 1. 定位

- 一条线：读项目 → 看片段 → 改（时间线 / 提示词 / 打回）→ 出小样回看 → 导出落回画布。**花钱的生成永远是用户在浏览器里点**。
- 客户端：先 Claude Code（令牌），后 Claude.ai / 桌面聊天（OAuth 连接器）；两条认证落到同一个用户、同一套工具。
- 用户在浏览器里看着它剪：开着的画布与剪辑台跟着变，改到的地方闪一下，⌘Z 能撤掉 Claude 的一批改动。

## 2. 硬规则

1. **不花钱**。MCP 没有任何生成工具；写入工具的准入表就是站内 `canvas_apply` 那一份 `CANVAS_APPLY_OP_IDS`（从 v4 op 真值表现算：能撤销 ∧ 不是 `generate`），⛔ 不手抄第二份。要重拍某一镜 = 改好它的提示词 + 把当前版本标成「打回」（`set_prompt` + `set_review_state`），再告诉用户去点生成。
2. **一条执行路径**。服务端执行改动与图引擎是**同一个纯函数**：把 `use-node-graph-v4` 里 `dispatchBatch` 的纯计算部分（逐条执行 → 槽位规整 → `@图N` 跟随参考轨 → 再规整）抽进 `src/lib`，图引擎与 MCP 服务都调它。⛔ 不在服务端另写一份执行逻辑——那会让「Claude 改的」和「用户点的」变成两条会漂的路径（node 域禁改第 1 条）。
3. **版本号就是 `updatedAt`**。每次写入带上读到的版本，条件更新；对不上 = 冲突，原样报给 Claude 让它重读重做。⛔ 不在服务端自动重放：用户刚改过的提示词会被 Claude 的旧意图整段盖掉。
4. **只收 v4**。库里不是 v4 的项目直接拒绝，告诉 Claude「请用户在浏览器打开一次完成升级」——升级要先备份 v3，那是浏览器那一侧的事（`services/CLAUDE.md`）。
5. **媒体只认项目自己的**。看片段只收节点 id / 段 id / 渲染 job id，地址由服务端从当前版本取，且必须是本站 CDN 域；⛔ 不收外来 URL（SSRF），⛔ 不收上传。
6. **每次调用都验归属**：令牌 → 用户 → 项目属于这个用户且没删。
7. **免 Clerk 会话的路由必须进 `src/proxy.ts` 公开表，并被 proxy 测试覆盖**。`/api/mcp` 与 OAuth 元数据路由都是自己验身份的；漏进公开表的症状是 100% 被拦成 404 且不进日志（2026-09-28 渲染回调就是这么断的）。

## 3. 连接与授权

- 端点：`https://www.anteisuba.com/api/mcp`，Streamable HTTP，**无状态**（每个请求自带身份，⛔ 不维护会话）。MCP 规范 2026-07-28 起协议本身已无会话与握手，`mcp-handler` 2.x 对 2025 年的老客户端做无状态兼容。
- 库：`mcp-handler` 2.x + `@modelcontextprotocol/server` 2.x（v1 SDK 只剩安全维护）。2.x 不需要 Redis；认证用它的 `withMcpAuth`，校验函数返回的 `AuthInfo` 里带我们的 userId。

### 3.1 令牌（S2，给 Claude Code）

- 范围：**整个账号 · 不过期 · 可随时吊销**（owner 定）。每人最多 10 个有效令牌。
- 形状：固定前缀 + 32 字节随机；明文只在生成那一刻显示一次，库里只存 SHA-256 与末 4 位（高熵随机串不需要加盐）。按哈希查。
- 记 `lastUsedAt`，距上次写入超过 30 秒才更新，⛔ 不每次调用都写库。吊销立即生效。
- 管理在 `/settings/connections`（`settings.md` §7），接口：列出 / 生成 / 吊销三条，走 Clerk 会话。生成那一刻页面直接给出填好令牌的接入命令（`buildClaudeCodeMcpCommand`）。
- 接入就一条命令（scope 用 `user`，所有目录都能用）：

```bash
claude mcp add --transport http --scope user pixelvault https://www.anteisuba.com/api/mcp --header "Authorization: Bearer <令牌>"
```

- ⚠ Claude Code 配了 `Authorization` 头却被拒时**不会回退到 OAuth**，直接显示连不上——吊销后要重新贴。

### 3.2 OAuth（S7，给 Claude.ai / 桌面聊天）

- 授权服务器 = **Clerk 的 OAuth 应用**（Dashboard 打开，发布 CIMD 与 DCR 支持；DCR 在 MCP 规范里已标弃用，CIMD 优先，Claude 两种都支持）。同意页由 Clerk 出。
- 受保护资源元数据（RFC 9728）我们自己出：`resource` 必须与用户粘贴的地址**逐字相同**（含 `/api/mcp`），`authorization_servers` 只写 Clerk 的 issuer（Claude 只读第一项）。
- 未认证请求回 **401** 并带 `WWW-Authenticate: Bearer resource_metadata="…"`（Claude 不认 200 上的这个头）。
- 验令牌用 `@clerk/nextjs` 6.39 自带的 `auth({ acceptsToken: 'oauth_token' })`。⛔ 不引 `@clerk/mcp-tools`：它要求 `@clerk/nextjs` ^7.2.3 且还依赖 v1 SDK，为它升整站登录的大版本不值得。
- 受众：Clerk 这个实例只服务本站一个资源，它签出的访问令牌天然就是给本站的；将来若挂第二个资源服务器，受众校验要改成显式比对。
- 回调地址由 Clerk 按 CIMD / DCR 处理：托管端 `https://claude.ai/api/mcp/auth_callback`，Claude Code 是任意端口的 localhost / 127.0.0.1 回环。

## 4. 工具

一律只收 id、不收地址；时间单位一律**秒**；出错时返回一句能照着做的话（`isError`）。服务端附一段 instructions，只写原则：时间是秒、写入带版本、不能生成（重拍怎么标）、先看再剪、改完出小样回看。

| 工具            | 做什么                                                                                                                                                                                                                                                                        | 切片 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `list_projects` | 列画布项目：id · 名 · 最近改动 · 节点数 · 时间线段数与时长。按最近活跃，最多 50 个                                                                                                                                                                                            | S2   |
| `read_project`  | 一个项目：版本号 · 画布快照 · 时间线（见 4.1）。可带 `focusShot` 把焦点挪到别的镜                                                                                                                                                                                             | S2   |
| `look_at`       | 看画面：目标三选一（节点 / 时间线段 / 渲染 job）+ 最多 8 个时间点 → 每点一张 512 宽 JPEG 带时间标注。段的时间点用时间线秒，服务端换算成素材秒（裁剪与倍速都算进去）；渲染 job 用成片秒（S4）；图片卡直接给缩略                                                                | S2   |
| `apply_ops`     | 一批改动（`baseVersion` + ops）：op 形状与准入表同站内 `canvas_apply`，一批一个撤销条目。回：新版本 · 落了几条 · 跳过哪几条及原因 · 改到的节点与段                                                                                                                            | S3   |
| `render`        | 出片：`draft`（480p 小样，不落画布、不进素材库）或 `final`（同剪辑台导出：落回画布成视频卡连回各段）；范围 = 整条 / 区间（`fromSec`/`toSec`，时间线秒）/ 单段（`clipId`，折成那一段的区间）；`final` 可带清晰度与界面语言（卡上「来源」那行）。不扣积分，与剪辑台共用在飞上限 | S4   |
| `get_render`    | 查渲染（`projectId` + `jobId`）：状态 · 步骤 · 进度；完成后给地址、封面，以及落回画布的那张卡（按成片那一版的 generationId 在项目里找）                                                                                                                                       | S4   |

### 4.1 读到的形状

- **画布**：复用站内助手的分层快照 `buildCanvasOperatorSnapshot`（焦点镜与左右各一镜完整展开，其余每镜一行），⛔ 不另写一份给 MCP。准入：站内助手只许改展开的那几镜；MCP 是无状态的，记不住它看过什么，所以准入放宽到**整个项目的节点**——它想改哪镜，先把焦点挪过去读一次，这是 instructions 里的原则而不是服务端闸。
- **时间线**：每段 = 段 id · 轨 · 序号 · 来源节点（id + 名字）· 时间线起止秒 · 素材入出点 · 倍速 · 段尾转场 · 原声 · 增益 · 「上游已更新」；字幕段 = 内容 · 起止 · 位置 · 字号 · 颜色 · 淡入淡出；台词段与字幕段另给**挂在哪**（`attachedTo` = 主线段 id + 素材秒）与**断挂**（`cut`：那一帧被裁掉了，导出时不出声不出字）；另给总长、比例、清晰度。读之前先归位（`reflowAttachments`），起点与台面、成片同一刻。**同一个构建函数给站内快照用**（S5），⛔ 不写两份形状。
- 版本号：`read_project` 给出的 `version` 原样带回 `apply_ops`。
- **每张媒体卡当前那一版的地址**（`takes`）：`set_review_state` 要用它指明打回的是哪一版（防止把后来新出的一版一起打回），画布快照只说「有没有产出」，所以单独给。

### 4.2 看片段怎么截帧

- 用 **Cloudflare Media Transformations** 在 CDN 边缘截帧（`/cdn-cgi/media/mode=frame,time=…`，与视频封面同一套，`src/constants/media-transformations.ts`）。⛔ 不起渲染容器——③ 原定挪到 ffmpeg 容器，改用边缘截帧结果一样、少一套基础设施。
- 源限制：MP4 · 小于 100MB · 10 分钟内 · 源站支持 HEAD 与 range（R2 自定义域满足）。不满足的那一帧单独回失败原因，⛔ 不连累同批其它帧。
- 计费：一帧 = 一次转换，同一 (源, 参数) 每个自然月只计一次，每月免费 5000 次，之后 $0.50 / 千次。
- 服务端取回图片、转 base64 作为 image 内容返回。Claude Code 单次工具结果默认上限约 25k token，8 张 512 宽 JPEG 远在上限内。

## 5. 服务端怎么写

- 读：按归属取项目 → v4 解析 + 槽位规整（与浏览器载入同一条 `upgradeNodeWorkflowStateToV4` 的 v4 分支）。
- 写：同上取到 state → 抽出来的批量执行纯函数 → 条件更新（`updatedAt = baseVersion`）。执行上下文在服务端补齐：
  - 模型解析：**不给**。「型号 → 完整选择（渠道 / key）」要用户的 key 与渠道健康状态，那是浏览器里 `useWorkflowModelOptions` 的活；在服务端另拼一份就是第二份真相。执行器的规矩是不给就失败可见，`set_model` 因此回一句「请用户在浏览器里选」。⛔ 不让 Claude 编 adapter 或渠道。
  - 角色名单：不给 —— 浏览器那边今天也没给图引擎（正文里的 `@` 只认节点名），两边保持一致；画布接上角色名单时两边一起加。
  - 新节点 id：服务端铸。
- 「是不是 Claude 改的」**不另存一列**：令牌 2 分钟内用过 = Claude 在线，这期间别处来的改动就当作它的。代价是那段时间里同账号另一个标签页的改动也会被这么说（只影响回执措辞）；换来的是不改画布项目表 —— 本地 dev 连的就是生产库，加列就得先动生产库的结构。
- 限流：每用户每分钟 60 次调用（`src/lib/rate-limit.ts`），`look_at` 一次最多 8 帧，`apply_ops` 一批最多 50 条。
- 日志：⛔ 不记令牌明文；记 userId · 工具名 · 项目 id · 耗时 · 结果。

## 6. 浏览器实时跟随（S3）

- 新接口：取当前项目的 `{updatedAt, mcpActive}`，`mcpActive` = 这个用户任一令牌 2 分钟内用过。
- 轮询：只查**当前项目**、标签页可见、已水化、非只读、没有写入在路上。`mcpActive` 时每 2 秒，否则每 30 秒（顺带让同一账号的另一个标签页 / 设备的改动也跟得上）。标签页回到前台立即查一次。
- 版本**变新**了（⚠ 不是「不相等」：一次在本地保存之前出发、之后才回来的查询带回的是旧版号）：
  - **本地没有未存的改动** → 拉整份、换进来，**⛔ 不清撤销栈**：图引擎把这次替换记成一条快照档撤销（`kind: 'state'`，已有的形状），改到的卡闪一下（剪辑台里的段闪与回执见 `node-canvas-v2.md` §6「回执与段闪」，owner 2026-09-28 定稿）。
  - **本地有未存的改动** → 不抢，走现有流程：下一次自动保存会 409，提示「载入最新 / 另存为副本」。
- 两次轮询之间 Claude 连写几批，会并成一条撤销。撤销 = 本地回到拉取前，自动保存带着新版本号写回，Claude 下次读到的就是撤回后的。
- 剪辑台与画布同一条（时间线在 `state.edit` 里）；手机的只读剪辑台同样跟随。

## 7. 渲染（S4）

- 服务端用同一个纯函数 `toRenderPlan` 从 `state.edit` 算渲染计划，走现有 `render-video` 任务与在飞上限。
- **落回画布挪到服务端**：成片回调里按版本号条件写入「加一张视频卡 + 连回各段」，冲突就在最新 state 上重做（纯新增，不会盖掉用户的改动）；浏览器靠第 6 节跟上。剪辑台的导出按钮也走这条，浏览器里那条落卡删掉，⛔ 不留两条落卡路径。
- 小样：先按 720p 算计划、再整份缩到 480p（`toDraftRenderPlan`：短边 480、字幕同比缩，剪点与成片一致）；用单独的任务标记（模型 `ffmpeg-container:draft`），**不建 Generation、不进素材库**，文件放 `renders/drafts/<projectId>/<uuid>`，这条路径建任务时记进 `externalRequestId`、查状态时据此推出地址；R2 对这个前缀设 7 天生命周期。
- 落卡上下文（来源段、按界面语言拼好的「来源」）随派发交给 worker、由签名的结果回调原样带回 —— 任务表不加列。
- 渲染任务与生成任务同表：查状态 / 取消只认 `adapterType = render-video` 的那几条。

## 8. 站内助手（S5）

- 画布快照加上时间线（4.1 同一个构建函数）；画布提示词教会它剪辑 op 与「重拍怎么标」。
- `look_at` 作为只读工具进画布域：同一个 service。进钱闸白名单的判据：不建 generation · 不扣费 · 不写库（边缘截帧只读）。
- 改法与 MCP 一致：直接改、一批一个撤销、改到的闪一下。剪辑台原来那套「一句话排片」（虚线预排 + 提案卡 + `deliverTimelineProposal` 便条 + `timeline-plan.ts`）随剪辑台改版删除，底部排片栏改成站内助手的输入入口（`node-canvas-v2.md` §6 / §13.6）。

## 9. 切片与验收

| 片  | 内容                                                                                                                    | 验收                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2  | 令牌表 + 迁移 · 令牌接口 · `/api/mcp` 骨架与令牌认证 · proxy 公开 + 测试 · `list_projects` / `read_project` / `look_at` | 上线前：进程内跑真实 `mcp-handler` 的路由测试 + 预演脚本验迁移（本地 dev 连的就是生产库，令牌表上线前本地连不上）；上线后：Claude Code 连线上，读出一个项目的镜头与时间线，看到某一镜第 2 秒的画面 |
| S3  | 抽出批量执行纯函数（图引擎改调它）· `apply_ops` · 版本接口 · 浏览器跟随与撤销                                           | Claude 挪一段、改一句提示词、标一镜打回；开着的剪辑台 2 秒内跟上并闪，⌘Z 撤回后 Claude 重读得到撤回后的                                                                                            |
| S4  | `render` / `get_render` · 服务端落卡 · 小样前缀与生命周期                                                               | Claude 出小样、截剪点看；导出成片落回画布成一张卡并连回各段                                                                                                                                        |
| S5  | 站内助手：快照加时间线 · 教 op · `look_at`                                                                              | 站内助手一句话把几镜排成初剪，直接生效、可撤销                                                                                                                                                     |
| S7  | Clerk OAuth · 受保护资源元数据 · 401 指引                                                                               | Claude.ai 加自定义连接器 → Clerk 同意页 → 能读项目                                                                                                                                                 |

- S1（剪辑台地基：导出实跑 · 声音段起点 · 配乐真渐弱 · 预览出声与转场）与 S6（台面重排）归剪辑台本身，见 `node-canvas-v2.md` §6 与第 ④ 步画板。
- 只有一条迁移（S2 的令牌表，owner 已授权，随推 main 由生产构建执行）。⚠ 本地 dev 连的就是生产库，Prisma 默认会 SELECT 模型上的每一列 —— 客户端先认得一列、库里还没有，所有画布读写当场报错；这也是 S3 不加 `lastWriter` 列的原因之一。

## 10. 不做

- MCP 触发任何生成或花钱的动作。
- 上传媒体；建 / 删 / 改名项目这类项目管理。
- MCP 的 resources / prompts / sampling（只用 tools + instructions）；有状态会话。
- 让 Claude 自己多轮试剪或给成片打分——由用户判断（同 D12 助手的规矩）。

## Source of Truth

施工前都还不存在，落地后以这些为准：

- 路由：`src/app/api/mcp/route.ts` · 令牌接口 `src/app/api/mcp/tokens/**` · 版本接口 `src/app/api/node-workflow/projects/[id]/version/route.ts` · 元数据 `src/app/.well-known/oauth-protected-resource/**`（S7）
- 服务：`src/services/mcp/`（令牌 · 工具 · 截帧）
- 纯函数：批量执行（从 `src/hooks/node/use-node-graph-v4.ts` 抽出）· 时间线快照构建 · `src/lib/studio-operator-canvas-snapshot.ts`
- 常量：`src/constants/mcp.ts`（前缀 · 上限 · 轮询间隔）
- 数据：`prisma/schema.prisma` 的令牌表 `McpToken`
- 已有、复用：`CANVAS_APPLY_OP_IDS`（`src/types/assistant-operator.ts`）· `node-workflow.service.ts` 的版本号条件写 · `use-node-workflow-store.ts` 的保存与冲突 · `src/constants/media-transformations.ts` · `render-video.service.ts`

## Last Verified

2026-09-28（owner 设计门 ①–③ 当天）：

- MCP 规范最新 2026-07-28：去掉会话与 `initialize` 握手、DCR 弃用改推 CIMD（modelcontextprotocol.io/specification/2026-07-28/changelog）。
- npm：`mcp-handler` 2.2.0（peer `@modelcontextprotocol/server` ^2）· `@modelcontextprotocol/server` 2.1.0 · v1 `@modelcontextprotocol/sdk` 1.30.1 · `@clerk/mcp-tools` 0.6.0（peer `@clerk/nextjs` ^7.2.3）；本项目 `@clerk/nextjs` 6.39.3 已含 `acceptsToken: 'oauth_token'`。
- Claude 连接器认证（claude.com/docs/connectors/building/authentication）：OAuth 走 DCR 或 CIMD；固定请求头是 beta 且仅限部分组织；必须 401 + `resource_metadata`；`resource` 须与用户输入逐字一致；托管端回调 `https://claude.ai/api/mcp/auth_callback`。
- Claude Code（code.claude.com/docs/en/mcp）：`claude mcp add --transport http … --header`；图片内联；单次工具结果默认上限 25k token（`MAX_MCP_OUTPUT_TOKENS`）。
- Cloudflare Media Transformations（developers.cloudflare.com/stream/transform-videos/）：`mode=frame` · `time` 0–10m · 源 <100MB / ≤10 分钟 / MP4 · 每月免费 5000 次后 $0.50 / 千次。
