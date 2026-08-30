# 项目状态

最后更新：2026-08-30

唯一活跃进度文档。保持短，覆盖更新，不追加历史。

## ⚠ 待推：本地 main 领先 origin/main 18 笔

08-24 21:54 ~ 08-25 20:40 的提交**线上一笔都没有**。push `main` = 生产部署，先过
`docs/checklists/release.md` P0。⚠ 部署顺序有硬约束：`bf965440` 要求 **fork 镜像先上
RunPod、app 才能上线**；反了的话新字段无人认领而 `images` 又是空的，参考图静默消失、
img2img 悄悄退化成 txt2img——出图会「成功」但完全不像参考图。

- **部署链路**：Preview 不再跑 `migrate deploy`（`bb9e7bae`——buildCommand 改指
  `scripts/vercel-build.sh`，只有 `VERCEL_ENV=production` 才迁移；此前任何碰 `prisma/`
  的功能分支一 push 就已在合并前把 schema 改到生产库上）。迁移改走 Neon direct 端点
  （`533679e2`，新增 `DIRECT_URL`；运行时继续用 pooler，缺失即大声抛错、**刻意不回落**，
  否则静默退回 pooler 正好掩盖要修的问题）。三条 cron 上心跳（`d083ba0c` +
  `.github/workflows/cron-monitor.yml`）——Hobby 的 runtime log 只活 1 小时，实查生产
  过去 24h 三条 cron 一条痕迹都不剩。
  ⚠ 代价（有意接受）：Preview 从此跑在生产 schema 上，带新迁移的分支在 Preview 上相关
  代码路径会报错——这是期望行为，正解是给 Preview 配 Neon 分支库，独立一件事。
- **画布数据安全**：堵住「本地 state 覆盖服务端」整条链（`6388ca13`——只 PUT 本会话
  服务端确认过的项目 · 服务端拒收「非空 → 空」的覆盖 · localStorage 与云端两侧的静默
  失败都接上 logger + 一次性抑制的 toast）。燃料是 localStorage 配额静默截断：Chromium
  按 UTF-16 计费，约第 36 个中等项目就爆。另一半是「内容从未上过云」——新用户的首个
  项目现在真的会在服务端建行（`acc8a668`），此前整个首次会话只活在 localStorage。
  ⚠ 同族已知未处理：`deleteProject` 删掉最后一个项目时本地新建的默认项目，其 id 同样
  不在确认集合里。
- **死代码收敛**：src 侧死执行链整删（`4dbb2724`，46 文件 −7433 行；生产自 2026-06-03
  起全量走 execution worker，那份第二实现自那时起不可达，测试绿断言的是死的那份）；
  fal 的 3D inline 死路径随后补删（`8c7b7814`，当时留下的顾虑逐条复验后被证伪）。
  ⛔ 别再去 src 找 `generateImage` / 视频方法，只存在于 git 历史；防线在
  `src/test/worker-contracts/`。
- **i18n**：(main) 不再下发 5 个只在它之外用的命名空间（`48de10e1`，每次 (main) 页面
  加载省约 8.6% 的 RSC payload，`src/messages/*.json` 一个键没动，用 denylist 而非
  allowlist）。配套 AST 守卫断言每条路由 **client 可达**的命名空间都被下发（`7d22a799`，
  36 用例）——堵的正是「漏发一个 → 页面原样吐 message key，编译不报错、旧全量测试全过」
  这个盲区，关键设计是 RSC 边界建模。
- **模型**：接入 Wan 3.0（`08f27813`，fal 三端点；走 fal 而非百炼原生是因为原生这次没有
  价格优势，逐档价与「这是个案不是新默认」记进 `model-pricing.md`）。顺带把成本预览扩到
  视频档并修好「没有分辨率旋钮的模型价格会凭空消失」——24 个有价视频模型填了 14 个，
  其余官方只公布 720p 一档，留空显示「起」，⛔不按比例推。重建模型文档监控基线
  （`69d787ca`，真实 54 模型；旧基线是空数组 = 六周检测盲区，另加空基线守卫）。
- **worker / runner**：参考图改走 URL（`bf965440`）——修 execution worker 128MB OOM
  与 RunPod `/run` 的 10MiB 请求体拒收，并删掉那条把两种真实失败都判成「今日免费生成
  次数已用完」的兜底正则。`errorCode` 跨不过 Cloudflare Workflows 的 step 边界，改由
  step 返回值带出（`d1de9c4a`，`guardWorkflowStep`；⚠ 本地 wrangler dev 不复现，端到端
  会以错误的理由变绿，契约只能靠单元测试锁）。runner fork README 按 API 实读值重写
  （`75ce8fa8`，端点 / 卷 / 构建链路原本全是错的，照做会走进死路）。
- **助手 / LLM**：助手流换成 SSE 帧协议（`2321dbf5`）——`open` 帧把响应头 flush 与
  「模型开没开口」解耦，这条路由上的 504 在协议层关死（超时最多是一条截断的 200）；
  为「没有帧」而生的响应头塞载荷那 185 行连同三档降级阶梯整个删掉。前一笔补上 Grok /
  DeepSeek / Qwen 的 SSE、把三条助手路由 `maxDuration` 提到 300、并给所有 provider 的
  主请求加超时（`5c6c67f9`，根因是 08-23 接 Grok 时只写了缓冲补全那一半）。
- **文档**：清掉六处与 Engineering Principle 1 相反的「只做向后兼容」指令、adapter 名册
  对齐 `registry.ts`、修三处坏指针（`98969039`）；修一处被 prettier 转义坏的加粗
  （`41250dc4`，同样的伤在 `docs/plans/` 下还有五处未动）。

## 未决（等 owner 拍板）

- **`npm run preflight:migrations` 是断头路**：它要 `NEON_API_KEY` + `NEON_PROJECT_ID`，
  这两个变量 `.env.example` 与 `.env.local` 里**都没有**，脚本自 08-22 写就起从未在真实
  key 下跑通过。而 `bb9e7bae` 之后 Preview 也不再跑迁移——**「合并前验一次迁移」现在
  没有任何工具兜着**。三条路选一：配上这两个变量、给 Preview 配 Neon 分支库、或明确
  接受这个缺口。
- **Fish 音频免费档已接，待办改成「09-01 复核」**：`FISH_AUDIO_S2_PRO` 的执行 id 已从
  `s2.1-pro` 切到免费档 `s2.1-pro-free`（同一个模型、同样的语言覆盖，音色卡
  `reference_id` 与多说话人数组照常可用），单价 $0。代价是免费档无 SLA、无 TTFA / DPA
  保证，Fair Use 可限流，且官方声明请求**可能被用于改进模型**。
  所以待办不再是「接不接」，而是 **2026-09-01 去
  https://fish.audio/blog/s2-1-pro-free-api/ 确认有没有第三次延期**（免费期 08-31 到期，
  此前已延两次：07-24 → 整个 7 月 → 08-31）。到期不再延 = 这个 model string 失效，而它
  是目前**唯一 `available: true` 的语音模型**（`ELEVENLABS_V3` 已 `available: false`），
  失效即语音生成整条断掉。回退一行：`src/constants/models/audio.ts` 的
  `externalModelId` 改回 `'s2.1-pro'`（$15 / 百万 UTF-8 字节，BYOK 用户自付），并同步
  `audio.test.ts` / `models.test.ts` 两处 pin。

## Current Focus

- **C+F 素材页与选择器 UI 正在做 Codex / Claude 设计对比**：域要求与 shared/dedicated shell 边界已确认；右侧 Dock 是当前工作方向。Owner 2026-08-11 否决 V1 视觉，Codex 已重做“编辑型私人档案馆”V2（文件夹/详情两态），并准备独立的 [`Claude 设计简报`](plans/assets-claude-design-brief-2026-08-11.md)。完整账本见 [`docs/plans/assets-cf-design-2026-08-09.md`](plans/assets-cf-design-2026-08-09.md)；`src/**` 继续冻结，待 owner 对比后选向。
- **本周十条待办**（owner 2026-08-07 口述），索引 =
  [`docs/plans/week-2026-08-07-backlog.md`](plans/week-2026-08-07-backlog.md)，交接 = 同目录
  `week-backlog-session-handoff-2026-08-07.md`。
  已完成：**H** LoRA 挂载不设上限（`eb295d23` + `6c3add69`）· **C4** 上传图画质（`84487a71`）·
  **J4** 无依据常量普查（`f9522e44`）· **K** LoRA 库重构（`a77901db`）· **L** TTS 上限按 provider
  拆分（`1cf1fe2a`）· **M** 角色图 LoRA 加号闸退役（`dafa2898`）· **E** 文档清理 + **J3** 悬空引用（`c2729530`，
  见 `plans/docs-cleanup-2026-08-07.md`）。
  C+F 已进入设计治理；其余并行条目的实时状态以各自 active plan 与代码为准：A 助手分域回复 · B 画布助手→节点 · D 图像优化 ·
  G 首页 UI · I 侧边栏 UI（前置 = J1 补视觉基线）· J1/J2。
- **调研落地路线图主链 7 / 10 已交付**，入口 =
  [`docs/plans/research-landing-plan-2026-07-30.md`](plans/research-landing-plan-2026-07-30.md) §6。
  已完成：包 1 文档止血 · 包 2 现状实测校准 · 包 2.5 剧本长度悬崖 ·
  包 3 分镜静帧投影 · 包 4 审核态门禁 · 包 4.5 显示名收口 · 包 5 助手写画布。
- **下一个 = 包 6 审阅网格**，是主链上**第一个要过 `ui-page` 设计门**的包：
  域定义 → 三方向 → 关键切片（桌面 + 375）→ owner 逐项确认 → 写 page 文档 → 才实现。

## Completed / Stable Enough to Build On

### 素材库上传

- 2026-08-29 素材库上传入口已从图片扩到图片 + 视频（MP4 / MOV / WebM）。视频走浏览器直传 R2，
  单次 PUT 上限采用 R2 的 5 GiB 平台边界，预签名窗口 1 小时；完成接口只用 HEAD 核对真实大小并
  Range 读取前 4 KiB 验证容器签名，不把整段大视频下载进应用服务器内存。视频记录按 `VIDEO`
  归档，并把客户端截帧写入 thumbnail 字段。

### 模型目录

- fal 图生图路由（2026-08-30）：挂参考图时 `SEEDREAM_50_PRO` / `SEEDREAM_50_LITE` /
  `FLUX_2_PRO` / `FLUX_2_FLASH` 从 T2I 端点切到官方 `/edit`，发 `image_urls[]`
  （上限 10 / 10 / 8 / 4）。此前能力表写 `maxReferenceImages: 0`，工作台会 400
  「does not support reference images」。Recraft / Illustrious 在 fal 上没有对等
  edit 端点，仍是 0。火山/BytePlus Seedream 本来就能带参考图，未改。
- NovelAI 已捞回 Image（2026-08-24）：V4.5 Full/Curated + V5 Full/Curated 四档
  `available: true`、**只 BYOK**，worker 认 V5 id（`params_version: 4`，不发
  `skip_cfg_above_sigma`）。参考图可选、最多 1 张、按 img2img 发；不进 LoRA；助手 LLM
  路由不改（NovelAI 不是聊天模型）。V4/4.5 的多图 Director 在 worker 侧从未实现，
  能力已收 `max: 1`。

### 图片工作台结果区

- owner 2026-08-23 选定方向 A「对照台」打底，并采用方向 B 的顶部常驻参考轨与底部唯一动作栏。
  `CompareGrid` 现按模型分行、点击只聚焦、定最佳需显式提交；图上不再叠按钮或 Gallery 元信息。
  `StudioReferenceRail` 让参考图在生成前后都可切换 / 编辑 / 删除；编辑舞台高度与标注图框同步修正。
  施工契约见 [`docs/references/pages/studio-image-workbench.md`](references/pages/studio-image-workbench.md)。

### 画布管道（本轮主链产出）

- **「聊 → 大纲 → 镜头 → 投影 → 出图」整链真机走通**（包 2 实测，两轮复跑）。
  投影幂等成立；缺口清单 = [`canvas-pipeline-gap-2026-07-31.md`](plans/canvas-pipeline-gap-2026-07-31.md)，
  它**取代** `canvas-assistant-pipeline` §0 的 07-26 断层表。
- 剧本提示词改**按预算装配**，修掉 4000 字符静默悬崖（此前故事一丰富就全线 500）。
- 分镜静帧已能投影（`role=shot`）；`role=background` **有意砍出**——它会渲染成身份卡，
  而身份卡存废未定（G5）。
- **审核态门禁**：生成物默认待审，未过审不进 `image_urls`；过审可逆。
- 助手拿到的是**真实显示名**，不再是本地化类型标签。
- **助手能写画布**：建节点 / 连线 / 改名 / 标审核态 / 触发生成五种 op，
  全部经「提案 → 用户点 → 才发生」；助手**不得自批** `approved`。
- 2026-08-10 owner 真机反馈已收口：删除视频节点重复工具条及文本/图片状态脚；镜头文本改白色纸面；
  身份代表图按原图比例展示并恢复卡外名字；声音节点恢复卡外名字；MiniMap 可直接拖动画布；
  节点拖动不再叠两张图；模型选择行悬停不改变高度。Seedance 2.0 选择器现明确区分
  fal.ai、火山方舟（国内）与 BytePlus ModelArk（国际）三条独立通道；2026-08-11 Seedance 2.5
  也已补齐同样三渠道，并按官方 schema 分开 fal 与 Ark 的参考音频约束。桌面画布助手现可直接拖动
  标题栏空白区且保持原尺寸，按钮不会误触拖动；历史记录迁入左侧第三视图；Script 展开态由约 627px
  提升到约 811px（当前 1127px 视口），仍限制在画布工作区内；助手默认顶部改为 64px，画布外观入口固定在顶栏最右侧。
- 节点详情页 Round 2 A「媒体优先」已按确认契约实现并完成定向验证；后续真机反馈中的
  左栏圆角、参考视频比例、音色选择后试听与助手默认模型显示也已修复。详情双栏断点已从
  `1120px` 收窄到 `960px`，避免 1092px 画布误进上下布局。方向 E 只保留为历史基线。
  owner 的真机复核仍在继续。
- 图片族详情来源已收口：右栏只保留「参考图 + 添加参考图」，其浮层统一上传 / 素材库 / 粘贴；
  主图上传/素材库替换迁到左侧媒体上的「替换图片」，Studio 与未完成 LoRA 不再占用详情 UI。

### 早前已稳定

- 画布视频节点 = 纯视频卡 + 固定右侧紧凑编排器；仅显式扩大按钮进详情。
- 视频引用沿真实连线收割图/视频/声音；预览与提交共用 `buildVideoSendPreview`。
- `video-model-send-plan.ts` 按 Seedance / Kling / HappyHorse / Gemini 定义素材槽与能力。
- 旧 `fusedIntoNodeId` 隐藏通路已退役；旧项目走兼容迁移。
- 左侧 Cast 卡匣已降级为定位器（分组 / 搜索 / 定位 / 选中），不再编辑与新建。
- 首页模型卡使用官方品牌素材；LoRA 底模选择器接入同源素材。
- 本地化 Clerk 登录/注册 catch-all 路由已恢复。
- 本地 dev「跑不出生成」根因已解：`NEXT_PUBLIC_APP_URL` 的 `https://localhost`
  协议错配；已加派发前守卫，生产零行为变化。

## Design Status

- 2026-08-30 首页功能页 01 调整为图片优先：860px 工作台内输入列 315px、四宫格 500px，单图 245px；移动端补齐纵向回落，四宫格宽度 100%。未改变首页其他功能页、动效时钟或产品内页。
- 2026-08-05 LoRA 域已按 owner 真机反馈统一为系统白色浅色工作台；无 `section` 的
  `/studio/lora` 默认入口改为 Generate，Library / Mine / Train 显式深链保持不变。
- 2026-08-05 后续反馈已完成：首页图片案例改为“左侧文案内含交互 / 右侧纯图片”；视频生成、
  参考视频、视频合成共享白色浅色初始空态；添加菜单只保留一个直接创建的「收集」入口。
- Round 2 共同要求：主体媒体显著放大；镜头图/关键帧重做；删除独立「视频素材/文生模式/空闲」摘要条；
  视频模型复用通用两级选择器；管理素材不得覆盖提示词。
- 已选向：A「媒体优先」；详情展开层的信息 / DOM / 键盘顺序已确认改为
  **主体 → 编排 → 素材 → 关系/证据 → 动作**。
- 关键切片“视频详情 + 管理素材开/关”已完成三档验证；现行 `>960px` 保持“大媒体左 / 编辑右”，
  只有 `681–960px` 才切换为“媒体上方全宽 + 下方提示词 / 素材双列”。
- 宽屏编辑栏已确认固定为 `384px`；素材管理已确认在参考素材栏内原位切换，不遮挡提示词并保留焦点回返。
- 移动端已确认在 `≤680px` 进入“媒体 → 提示词/模型 → 参考素材”的完整单列，主动作粘附底部。
- 图片族主图与参考图保持不同数据语义，但来源入口不再重名堆叠；LoRA 存量字段未做破坏性迁移。
- **包 6 审阅网格的造型同样未确认**，必须走完设计门再实现。
- 稳定方向与未决问题见 `docs/plans/canvas-session-handoff-2026-07-30.md`；
  详情页当前结构见 `docs/references/pages/canvas-node-detail.md`，
  其状态已升级为「已实现、待 owner 真机复核」。

## Validation

- 2026-08-30 首页图片功能页：Chrome 1920×855 实测输入 315px / 结果 500px / 单格 245px，页面 `scrollWidth === innerWidth`；`HomeV4Fn.test.tsx` 40/40 通过，目标 ESLint 0 error，`npm run typecheck` 通过，`git diff --check` 无空白错误。owner 的 3000 dev 实例运行中，按规则未并行 build。
- 2026-08-29 素材库视频上传：定向 Vitest 7 files / 62 tests 通过（含 80 MB 完成校验与
  `bytes=0-4095` 范围读取断言）；本次改动文件 ESLint 0 error；`git diff --check` 无空白错误；
  Chrome 实查 `/zh/assets` 文件输入已声明 JPG / PNG / WebP / GIF / MP4 / MOV / WebM。
  全仓 TypeScript 被并行音频改动缺失的 `AUDIO_EMOTION` / `AudioEmotion` 导出阻断，非本链路错误；
  全量 Vitest 在工作区另两套既有 Vitest 进程并行占用资源时长时间无汇总，已停止本次重复运行；owner
  的 3000 dev 实例运行中，按规则未并行 build。

- **2026-08-25 待推的 18 笔，闸门逐笔记在各自提交消息里**：`2321dbf5` 全量 tsc 零错、
  受影响 18 文件 358 条 vitest 全绿；`5c6c67f9` / `bf965440` 同日全量 vitest
  **532 files / 5148 passed**（当时唯二失败来自同工作树在飞的 3D 改动，已随 `8c7b7814`
  落地）；`4dbb2724` worker 95/95 + 计划内文件三绿；`8c7b7814` 定向 33 绿 + worker 95 绿；
  `08f27813` 真机验过成本预览逐档价（Wan 5s/720p $0.50 → 30s/1080p $6.00 →
  30s/480p $1.50，Seedance 2.0 720p $1.52 / 1080p $3.41，Kling 无旋钮路径 $0.84）；
  `d083ba0c` 的心跳端点用 Vercel MCP 实查生产验证。
  ⚠ **本文件不预先声称全量闸门绿**：完整的一次（tsc + lint + vitest +
  Playwright mobile + production build）按 `docs/checklists/release.md` 在 push
  前跑，以那次结果为准；owner 的 3000 dev 实例跑着时不并行 build。
- 2026-08-23 图片工作台结果区：开发态 `/zh/dev/ui-states` + `scripts/ui-probe.js` 复测同一状态，
  交互遮挡 4→0、矩形相交 16→0、无切换控件计数 1→0，9:16 单格高度从 767px 降到 257px，
  2×2 结果首屏由 3/4 提升为 4/4；全量 TypeScript 通过，全量 ESLint 0 error（5 条既有 warning），
  全量 Vitest 537 files / 5196 tests 通过。未执行 production build：owner 的 3000 dev 实例正在运行。
  （文件数此后降到 532，是 `4dbb2724` 删掉死执行链连带删测试所致。）
- 2026-08-18 图层分解整条删除（owner：功能废弃）：`LayerDecomposePanel` / `use-layer-decompose` /
  `image-decompose.service` / `/api/image/decompose` 四个文件删除；画布 `decompose` 能力与工作区那整段
  （预览 / 全选 / 放置图层）删除，ready 能力 8 → 7；`'layers'` 交互、`'image-layers'` 输出、
  `'derive-layers'` 策略、`derivedBatchId`（全仓只写不读）一并清掉；三语各删 39 个叶子，**删完重新 parse
  比对前后叶子集合，新增 0 / 意外删除 0**（禁正则改 messages JSON）。跑的是 HF Space `xiuruisu/see-through`。
  TypeScript 0 错 · 全量 Vitest 485 files / 4409 tests 绿 · 目标 ESLint 0 warning。真机 `/zh/studio/image`
  确认「图像」弹层只剩 上传 / 最近素材 / 素材库。
- 2026-08-18 图片工作台重设计（D1 切片 0–3）：图片模态换横向外壳 `StudioWorkbenchLayout`（`lg:w-72`
  参数栏 + 结果区，断点 lg 与 `useIsMobile` 对齐），视频 / 音频维持 `StudioFlowLayout` 不动；
  `generateCompare(input, models, perModelCount)` 收敛成矩阵入口（模型集 × 张数），`VariantGrid` 退役、
  图墙统一到 `CompareGrid`；`BaseModelPickerPanel` 加 `layout="columns"` 三列居中 Dialog + 多选 + 品牌图，
  搜索框按 owner 删；规格三档合成 `StudioSpecPopover`；助手改右上角浮标 `StudioAssistantFab`。
  真机 1920 实测：浮标开 720px / 关 0px、参数栏坐标全程不动；生成按钮阻塞态文案 18.15:1（`color(srgb …)`
  分量是 0–1，按 0–255 读会算出 1.50 的假值）。TypeScript 0 错 · 全量 Vitest 绿 · 目标 ESLint 0 warning。
  ⛔ 切片 4（成本预览）已落地：图片档 `5f3a3c77`，视频档随 `08f27813` 扩齐；切片 5（平台出资降档）
  仍未做，卡 owner 一句话；编辑线 E0–E5 一条未开工。
- 2026-08-17 Studio Image 参数栏弹层回归：`ResponsivePopover` 在窄视口 + fine pointer 时保留锚定 Popover，
  touch-primary 紧凑态仍走 Drawer；`StudioPromptArea` 的 document pointer handler 不再抢先关闭当前
  `图像` / `规格` 触发器。定向 Vitest 3 files / 25 tests、全量 Vitest 485 files / 4409 tests、
  TypeScript、目标 ESLint 与 `git diff --check` 通过；现有 3000 页面实测两个入口均可“打开 → 再点同一按钮关闭”。
- **2026-08-11 及更早的逐条验证记录不再在本文件复述**（画布助手几何与交互 · Seedance 2.5 三渠道 ·
  身份卡空态回归 · 视频紧凑编排器缺 Key 路由 · 08-10 画布反馈 · 08-05 统一助手切片 / 模型选择器 /
  UI 收口 / 图片族来源 · 08-04 节点详情 Round 2 与画布反馈 · 包 5 真机验收）：全部已验完并进 main，
  真机数值见各自 `docs/references/pages/*.md` 与 git 历史。
  与发布相关的唯一一条留在这里：**移动端 Playwright 最近一次记录在案的结果是 2026-08-05 的
  单 worker 30/30**，此后未再跑。

## Next

1. **推这 18 笔**：过 `docs/checklists/release.md` P0；**fork 镜像先上 RunPod，app 再上线**。
2. **包 6 审阅网格**：按 `ui-page` 走设计门（域定义 → 三方向 → 关键切片 → owner 确认）。
3. 包 7 剧本节点**设计轮**（owner 已定：形态仍模糊，不是写契约）；其前置除包 6 外，
   还包括**卡片总线契约必须回来补**——否则剧本节点铺出的角色槽全要手填。
4. 链外登记 G1 参考图接不到素材库 / G3 政策归因 / G4 进度·取消·失败可见性 / G5 身份卡存废。
   G2 模型选择器已修（`df12cf19`）。
5. 可插包 I1 视频灰区 #2（很小，仍未做）· I2 LoRA 提示分层 · I3 壳级 A' 浅壳。
6. 本轮留下的两个同族收尾：`deleteProject` 删到最后一个项目时新建的本地 id 不在服务端确认集合里
   （`acc8a668` 登记）· `prompt/enhance` 与 `prompt/feedback` 仍是 `maxDuration = 30`，小于新的
   120s 缓冲超时，走 Grok 时超时永远轮不到触发（`5c6c67f9` 登记，要不要一起提由 owner 定）。

## Blocked

- **包 6 / 包 7 仍需要 owner 对关键切片逐项确认**；节点详情 Round 2 已实现，不再构成实现授权阻塞。
- **卡片总线契约** owner 已后置，但**包 7 之前必须回来补**（G5 身份卡存废与之同源）。
- OpenAI key 无效（GPT Image 2 报 401）；VolcEngine 未绑 key ——
  后者挡着 G3 的归因对照实验。
- 真实扣费 provider smoke 仍未执行（需要有效且经 owner 授权的 API key，会产生费用）。
  Wan 3.0 因此有三件事未定：位置引用是否必需、首尾帧是否真生效、30s 是否超过轮询上限
  （`maxAttempts × pollInterval = 600s`，全局常量未动）。
