# LoRA 域 UI/功能评审 + wireframes 增量提案

日期：2026-07-02（v1.3 @ 2026-07-04：D7 手感批 + D8 布局 B/暗房细则 + D9 搜索排序 B11 + P1-10/P1-11 + 多挂载配方规则，全部拍板收口）
状态：**可执行。** 本文是后续代码修改的唯一依据——每个批次含文件锚点、i18n key、验收标准。落地时逐批走 CLAUDE.md 的 UI 确认阶梯。

## 范围与方法

- 实跑 `http://localhost:3000/zh/studio/lora` 三模块（生成 / 库·公开 / 库·我的·收藏+自训 / 训练），未登录 + 登录（Clerk dev 账号）各一遍。截图 + DOM 检查（计算样式、img naturalSize、i18n key、源码锚点交叉验证）。
- 对照基线：[`docs/design/pages/lora-domain-wireframes.md`](../pages/lora-domain-wireframes.md)（§2–§7）与 [`2026-06-11-ui-audit-pass1-code.md`](2026-06-11-ui-audit-pass1-code.md)。
- 关键定性（owner 确认 + `src/proxy.ts` 证实）：**生产环境未登录只能访问公开路由**（`/`、画廊、登录/注册、创作者主页——`proxy.ts:20-37`），`/studio/lora` 整页被 `auth.protect()` 拦截；dev 的 `isDev` 旁路（`proxy.ts:39,60,78`）是本地开发便利，属有意为之。因此首遍看到的「未登录裸错误」全部是 **dev-only 现象，不排修复批次**（见附录 A）。

### 已拍板决策（2026-07-02，owner）

| #   | 决策                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 库抽屉/我的卡片主 CTA 统一为「**去生成**」语言，废弃 prompt-tag/Studio 旧文案                                                                                                                                                                |
| D2  | 库筛选状态走 **URL 方案 A**（family/搜索/排序全部入 query，可分享深链）                                                                                                                                                                      |
| D3  | 库控件行增加 **NSFW 开关**（默认安全档）                                                                                                                                                                                                     |
| D4  | 模块 tab bar **收拢为紧凑居中 pill**（采纳本文建议，与 wireframes 稿面一致；理由：三个 flex-1 全宽大按钮视觉重量等同主 CTA，压过内容区，且与公开/我的子 tab 的紧凑 segmented 同屏并存造成双标）                                              |
| D5  | 受限态主按钮（「在 Civitai 生成」vs 原稿「禁用去生成」）**后续再改，本轮不动**——代码与 wireframes §7 均维持现状                                                                                                                              |
| D6  | 生成页增加**参考图（img2img）**：FLUX 底模先行（fal 端点已核实），Illustrious 底模待 Replicate schema 核验后跟进；UI 借鉴 Studio 参考图 chip。规格见「三、」                                                                                 |
| D7  | **手感批（2026-07-04 拍板，经交互样机确认）**：① 生成页比例控件 ② LoRA scale 滑块 popover ③ 结果历史 filmstrip ④ 来源图点击填配方 ⑤ 抽屉「带词去生成」⑥ 训练「0/50」去红色 ⑦ section 切换 crossfade。①–⑤ 入 B10 新批次，⑥ 并入 B6，⑦ 并入 B7 |
| D8  | 生成页**布局 B**（象牙纸全宽底档）+ 暗房工作台形态细则七条 + 左栏弹性规则（见 §2 delta）                                                                                                                                                     |
| D9  | **搜索+排序是刚需**（2026-07-04）：P1-11 不走「按相关性」降级，搜索路径改 civitai meilisearch `multi-search` 端点实现真排序（字段已实测生效），立 **B11** 正式批次；REST 路径降为兜底态                                                      |

### 未覆盖（后续验证）

1. 移动端视口（库抽屉 Vaul Drawer 分支、训练 MobileTrainingSheet 实机行为）。
2. 实际出图链路（避免消耗 credits，本次只验证到挂载态；自训 FLUX LoRA 挂载 → 底模自动收敛 `FLUX.1-dev · 快` 已实测正常）。
3. 视觉回归基线未跑（审查性质）。

---

## 一、问题清单（按严重度）

### P0 — 功能坏 / 信任受损

#### P0-1 训练完成「去使用」是死链：跳进已不消费 LoRA 的 Image Studio

- **现象**（登录态实测）：训练完成横幅「LoRA 训练完成——『aimiss』训练完成，**去图像工具**激活它就能开始生成」，主按钮「去使用」。
- **根因**：`CompletionCelebration.tsx:50-55` push 到 `/studio/image?style=<code>`，注释假设 LoraStackProvider 会解析 `?style=`——但 provider 已随域拆分迁到 LoRA 子树（`src/app/[locale]/(main)/studio/lora/layout.tsx:23`；`studio/layout.tsx:8` 注释明确「LoraStackProvider used to live here too, but LoRA generation now owns」）。结果：跳到图像工作台，`?style=` 无人解析，训练成果不会被激活，用户面对一个与 LoRA 无关的页面。
- **修复**：
  1. `CompletionCelebration.tsx` handleUse 改 push `${ROUTES.STUDIO_LORA}?section=generate&style=<code>`（LoRA 域 layout 挂着 LoraStackProvider，`?style=` 解析基建直接复用；route/param 常量用 `LORA_WORKBENCH_SEARCH_PARAM`/`LORA_WORKBENCH_SECTIONS.GENERATE`，别硬编码字符串）。
  2. i18n：`LoraTraining.completionBody`（zh.json:4419「去图像工具激活它就能开始生成」→「去生成里激活它就能开始出图」），en/ja 同步。
- **验收**：训练完成横幅点「去使用」→ 落在 `?section=generate`，脊柱条显示该 LoRA chip + 底模自动收敛（自训 FLUX → `FLUX.1-dev · 快`，已验证此挂载路径本身正常）。

#### P0-2 授权徽标整体缺失（数据已有，UI 没渲染）

- **现象**：详情抽屉从头到尾没有可商用/个人使用/需署名任何授权信息。wireframes §4/§7 把授权徽标当核心元素（配色克制原则里唯一允许的语义色就是给它们的）。
- **锚点**：`civitai-lora.service.ts:869` 已抓 `allowCommercialUse`/`allowDerivatives` 进 `CivitaiLoraLibraryItem`（`types/index.ts:3574`）；`LoraWorkbench.tsx` 的 `CivitaiLoraInspector` 不消费这两个字段。
- **修复**：抽屉标题/作者行下方渲染授权徽标行，样式按 §7 组件板（绿=可商用 / 黄=个人使用 / 灰描边=需署名）；映射规则：`allowCommercialUse` 数组含 `Image`/`Rent`/`Sell` 任一 → 可商用绿，否则个人使用黄；`allowNoCredit === false` → 追加需署名灰。颜色用 oklch token 不抄 hex。
- **验收**：任一公开库抽屉可见至少一枚授权徽标；Network 里该 item 的 `allowCommercialUse` 数组与徽标一致。

#### P0-3 库网格封面系统性模糊（96px 缩略图渲染在 ~200px 卡上）

- **现象**：公开库卡片普遍发糊。DOM 证实：`img` naturalWidth=96，渲染 166×221 CSS px（retina 需 ~400 物理 px）。对照：**我的页卡片用 width=640 清晰正常**（登录态实测），只有公开库网格错用了 96。
- **锚点**：`LoraWorkbench.tsx:2234`（`item.thumbImageUrl ?? item.coverImageUrl`）；`civitai-lora.service.ts:759`（`CIVITAI_THUMB_WIDTH = 96`，注释写明是给「列表 row 40×40 缩略」的——网格卡重做后没跟着改）。
- **修复**：`civitai-lora.service.ts` 新增 `CIVITAI_CARD_WIDTH = 450`，library item 增加 `cardImageUrl`（或直接让网格卡消费现成的 `coverImageUrl` 640——二选一，**推荐加 450 档**：640 是抽屉大图档，网格 30 张同屏时省一半流量）；`LoraWorkbench.tsx:2234` 改用新档。96 档保留给挂载栈 chip/facepile。
- **验收**：网格卡 img currentSrc 含 `width=450`（或 640），肉眼无糊；`civitai-lora.service.test.ts` 补 transform 断言。

#### P0-4 CTA 心智分裂：全线残留 prompt-tag / Studio 旧文案【D1 已拍板：统一「去生成」】

行为都对（挂载 + 跳 LoRA 生成台），坏的只是文案。一次改齐，全在 messages 三语（zh 行号为准，en/ja 同 key）：

| Key                                           | 现值（zh）                                                            | 改为                                                       | 出现位置                                 |
| --------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| `communityUseInStudio`（zh.json:1371）        | 添加 LoRA 标签                                                        | 去生成                                                     | 库抽屉主 CTA                             |
| `addedToStack`（zh.json:1385）                | 已将 {name} 添加为 LoRA 标签，正在打开 Studio                         | 已挂载 {name}，正在打开生成                                | 挂载 toast                               |
| `use`（zh.json:1383）                         | 用于 prompt                                                           | 去生成                                                     | 我的页卡片主按钮（收藏+自训两 tab 均用） |
| `myLorasSubtitle`（zh.json:1309）             | 自训和收藏的 LoRA 都在这里。添加到 prompt tags 后即可在 Studio 使用。 | 自训和收藏的 LoRA 都在这里。挑一个去生成，或去训练做新的。 | 我的页副标题                             |
| `LoraTraining.completionBody`（zh.json:4419） | （见 P0-1）                                                           | （见 P0-1）                                                | 训练完成横幅                             |

- **验收**：`grep -rn "prompt tags\|LoRA 标签\|图像工具" src/messages/` 在 LoRA 域 namespace 下零命中（其他域的 prompt-tag 功能不在本轮范围）；三语 `i18n-check` 通过。

### P1 — 体验缺口

#### P1-1 封面加载无骨架，切筛选/翻页时整屏黑卡数秒

- **现象**：网格先渲染成一片裸 `bg-muted` 黑卡（Civitai CDN 慢时持续数秒），唯一反馈是搜索框里的小 spinner；抽屉大封面同样空白灰框数秒。两遍实测（含登录态）均复现——图片最终都能到，缺的只是过渡态。
- **修复**：
  1. 卡片图片 blur-up：96 档先行（正好复用 thumb transform）+ 450 档替换，或统一 shimmer 骨架（复用现有 skeleton 原语）。
  2. 筛选/翻页触发的刷新用骨架卡替换旧内容——wireframes §8 已有「模块切换 crossfade 200ms + 骨架卡」规范，同一规范扩展到网格内刷新。
  3. 抽屉大封面加骨架占位。
- **验收**：Network 节流 Slow 4G 下切家族筛选，网格无纯黑帧；`prefers-reduced-motion` 降级仍有静态占位。

#### P1-2 训练页 API key gate 违反 Hard Rule 8 + 文案自相矛盾

- **现象**（未配 key 时）：「开始训练」整体置灰，琥珀警告写「**在侧边栏**添加 Replicate API Key」——而表单里就有「Replicate 点击配置 / fal.ai 点击配置」按钮。对照样板：生成页脊柱条的「需要 API key」琥珀 chip 点击直接弹 QuickSetupDialog（实测正常）。
- **修复**：训练表单对齐生成页——缺 key 时「开始训练」保持可点，点击弹 QuickSetupDialog（`studio-shared/setup/QuickSetupDialog.tsx`）；警告条文案删「侧边栏」指向，改「未配置 Replicate API Key——点击上方 Replicate 配置，或直接点开始训练」。表单校验类置灰（图片 0 张、名称空）不受本条约束，属正常 disabled。
- **验收**：清掉本地 key 后点「开始训练」→ QuickSetupDialog 弹出；配好 key 后警告条消失。

#### P1-3 训练历史空态文案指错方向

- 「还没有训练任务。**在右侧**开始第一个。」——历史卡自己在右栏，表单在左（两栏收拢 commit dc0a9d21 后没跟上）。
- **修复**：`LoraTraining.historyEmpty`（zh.json:4357）改「还没有训练任务。填好左侧表单开始第一个。」en/ja 同步。

#### P1-4 触发词「推断」出垃圾值

- **现象**：Detail Tweaker LoRA 触发词推断为「细节调整LoRA」（标题括号里的中文），带「推断」徽标复制进 prompt 是纯噪音。
- **锚点**：`civitai-lora.service.ts:817` `extractCivitaiTrigger` 的 modelName 兜底分支。
- **修复**：modelName 兜底加过滤——主体非 ASCII、来自括号内容、或与家族/类型词重合 → 判「无触发词」；抽屉显示「无需触发词」而非硬造值（风格/细节类 LoRA 本就常无触发词，如实展示更可信）。`lora-trigger-extract` 测试补这三类用例。
- **验收**：Detail Tweaker 类模型抽屉显示「无需触发词」；带真实 trainedWords 的模型不回归。

#### P1-5 库筛选状态入 URL【D2 已拍板：方案 A 全量深链】

- **现象**：`section` 在 URL 但家族/搜索/排序不在。副作用一串：手动 `?family=Illustrious` → chip 显示「全部」+ 空结果 +「推荐」排序 select 渲染空白（脱节态）；库→生成→库往返家族筛选静默重置。
- **规格**（方案 A）：
  - Query 参数：`family`（`CivitaiLoraBaseModel` 值）、`q`（搜索词）、`sort`（`CivitaiLoraSort` 值）、`nsfw`（见 P1-6）。翻页游标**不**入 URL（cursor 不可分享，重进从第 1 页开始）。
  - 单一事实源：URL query（经 Zod safeParse 白名单校验）→ hook 状态派生；未知/非法值静默按默认处理，**不得**透传给 civitai API（消灭脱节态）。
  - chips/搜索/排序变更用 `router.replace`（不产生历史条目），section 切换维持现有 `router.push`。
  - 常量放 `src/constants/`（现有 `LORA_WORKBENCH_SEARCH_PARAM` 旁边）。
- **验收**：粘贴 `?section=library&family=Illustrious&q=detail&sort=Newest` 直达即筛即现，chip 高亮与结果一致；非法 `family=xxx` 等价于全部；库→生成→库返回后筛选保留（URL 还在）。

#### P1-6 NSFW 分级开关【D3 已拍板：加开关，默认安全】

- **现象**：wireframes §4 控件行规定「分级默认安全」但控件没做；默认视图出现 NSFW 命名模型（"…Hent…"，封面被 nsfwLevel 过滤成占位）。
- **规格**：
  - 控件行末尾加分级 toggle chip，按 §4 高保真稿现成样式（shield icon +「安全」）；点击切换 安全 ↔ NSFW，NSFW 态给琥珀描边示警（唯一允许的警示用色场景）。
  - 状态入 URL `nsfw=1`（随 P1-5 方案 A 一起做）。
  - 安全档：请求层 nsfw=false（civitai browsing level），且**名称含 NSFW 词（Hentai/NSFW/R18 等词表进 `src/constants/`）的模型一并前端过滤**——封面已被 nsfwLevel 挡掉只剩占位卡，留着没有信息量。NSFW 档放开两者。
  - 与 [[project-lora-nsfw-tag-library]]（NSFW 一级分类、只过滤违法）方向一致：开关是浏览过滤，不是内容删除。
- **验收**：默认安全档下网格无 NSFW 命名模型、无纯占位封面卡；开 NSFW 后出现且可开抽屉；URL 带 `nsfw=1` 直达生效。

#### P1-7 生成页与 wireframes §2 的差距（分期已标注，见二、§2 delta）

实测现状 vs §2 规格：

| §2 规格                                              | 现状                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| 配方源图 3 列网格                                    | 来源图横向 strip（64px 缩略）；无配方时空态文案「切到自己搭配补词」（好，保留） |
| 还原模式 chips（忠实还原/半身/全身）+ 精修模式 chips | 只有 ivory 纸左下一个「忠实还原」chip                                           |
| SCALE 滑块 + 固定 seed                               | 无滑块无 seed；×1.0 只是 LoRA chip 内文本                                       |
| 出图 = 全宽反相 pill                                 | ivory 纸右下小按钮                                                              |
| 左右 5fr/7fr 双栏均衡                                | 左栏下半大量留白                                                                |

- **处置**（2026-07-04 更新）：SCALE 已由 D7② 的 chip popover 覆盖（入 B10）；来源图 → 配方入口由 D7④ 覆盖（入 B10）；出图反相 CTA 与双栏均衡由 D8 布局 B 覆盖（入 B10）。剩余 v2 项：seed 控件（链路已通只缺 UI）、还原/精修模式 chips（依赖 recipe 引擎）、源图 3 列网格——见二、§2 delta 的分期块。

#### P1-8 魔导书（§3）是最小子集（分期已标注，见二、§3 delta）

- 现状：搜索 + 7 功能分类 chip + 双列词条列表。缺：danbooru 五类色点、热度、标签缩略图、智能词条、已选托盘（权重/负向/质量组）、NSFW 锁分类。与 NSFW 标签库任务包合流推进，不进本轮批次。

#### P1-9 触达区普遍低于 44px

- 家族筛选 chip 实测高 ~22px（`text-2xs` + `py-0.5`），收藏心 32×32；本次评审第一次物理点击 Illustrious chip 就没点中。对应 Pass1 审查 C6。
- **修复**：chip 视觉尺寸不变、扩 hit area（伪元素 `-inset-y-2` 模式）；触屏断点下心按钮升 44。验收：`toHaveCSS`/bounding box 断言 ≥44 触达高度（触屏断点）。

#### P1-10 生成页比例控件缺失（2026-07-04 复核发现，D7①）

- **现象**：`aspectRatio` 是 `useState<AspectRatio>('1:1')`（`LoraWorkbench.tsx:467`），只有 URL 回放 `?aspectRatio=`（`:484-500`，合法值白名单 `REPLAY_ASPECT_RATIOS:300`）和 recipe plan（`:511`）能改它——**页面上没有任何控件**，用户被锁死 1:1，而 LoRA 出图主流比例是 3:4 立绘。链路本身已通（`handleGenerate:554` 一直在传）。
- **修复**：ivory 提示词纸工具行（忠实还原 chip 右侧）加比例 chip，点开 popover 五值（1:1 / 3:4 / 4:3 / 16:9 / 9:16，即 `AspectRatio` 现有值域）。默认值保持 1:1 不动（避免扰动回放/快照兼容）。纯前端，零后端改动。
- **验收**：选 9:16 后出图请求 body 的 `aspectRatio=9:16`（Network 确认）；URL 回放 `?aspectRatio=3:4` 进来时 chip 显示 3:4（双向一致）。

#### P1-11 库搜索态排序失效（2026-07-04 owner 报告，根因在 Civitai 上游）

- **现象**：搜索「鸣潮」后切换 推荐/最多下载/最新，结果顺序纹丝不动。
- **根因（已实证 + 官方佐证，不是我们的 bug）**：我们的链路无误——hook 正确重置 cursor/page 并传 `sort`（`use-civitai-lora-library.ts:243-251`），service 两条路径都把 `sort` 挂上游（`civitai-lora.service.ts:1149`、`:1251`）。但 **Civitai `/api/v1/models` 带 `query` 时忽略 `sort`**：
  1. curl 对照实验（2026-07-04）：三种 sort 对 `query=鸣潮` 返回逐条相同（顺序 2681→2462→2725，连降序都不是，为相关性序）；无 `query` 时 sort 正常（Most Downloaded 65 万降序 vs Newest 全新低下载）。
  2. 官方文档（developer.civitai.com/site/reference/models）：`query` = "Full-text search (Meilisearch). Requires cursor-based pagination."——搜索走 meilisearch 相关性，从未承诺 sort 生效。
  3. 官方 issue **civitai/civitai#1848**（2025-09-16 开、至今无官方回应）：同一现象（sort 不全局生效、limit 被忽略、空页带 nextCursor——最后一条与本项目 commit ed950024 修过的分页 bug 同源）。
     「之前能排序」的记忆大概率来自**无搜索词的浏览态**（一直正常），或来自 civitai.com 网页版（网页搜索走自家 meilisearch 端点、支持真排序，与 REST API 行为不同——正是 #1848 的对比点）。
- **修复（已拍板 D9「搜索+排序是刚需」→ 正式批次 B11）**：搜索路径改走 civitai 自家
  meilisearch 端点 `search-new.civitai.com/multi-search`（civitai 网页版即此方案）。
  **排序字段 2026-07-04 已实测全部生效**：`metrics.downloadCount:desc`（5380→5133→4160
  严格降序，且包含 REST 路径缺失的全局热门）、`createdAt:desc`（全为新发布）、不传 sort
  = 相关性（与 REST 搜索结果逐条一致，证明 REST 内部就是这条相关性序）。规格见 B11。
  **不做客户端页内重排**（每页仅 10 条，重排单页伪造全局顺序，比不排更误导）。
- **兜底态（B11 内置）**：multi-search 失败（公钥轮换/端点变更）时回落现有 REST 路径，
  此时排序控件显示静态「按相关性」提示——原 v1 降级方案降为兜底态而非主态。
- **验收**：见 B11 行。

### P2 — 打磨项

#### P2-1 外源琥珀徽标：裸调色板 + 对比度不足 + 视觉噪音

- `bg-amber-500/80 text-white`（`LoraWorkbench.tsx:2266-2273`）违反 no-magic-values；白字对比 ~2:1 不达 AA；公开库首页几乎满屏琥珀，警示语义稀释。
- **修复**：外源与可生成统一 `bg-black/55` 黑纱底 + 家族名，外源仅多一枚外链 icon（已有）；受限完整说明留在抽屉（现状已有琥珀说明条）。

#### P2-2 toast 杂项 + 收藏冷启动窗口期 401

- 挂载 toast 停留 >30s 不消失；统一 duration（4s 级）。
- **登录态也能踩到裸「Unauthorized」**（2026-07-03 实测）：页面刚 hydrate 完立刻点收藏心 → 401 裸英文 toast；数秒后再点 → `POST /api/lora-assets/favorite` 200 正常（红心 + 「已加入收藏——可以在我的 → 收藏找到」好文案）。根因是 Clerk token 就绪前的请求窗口期。**修复**：favorite 调用的 401 错误映射成 i18n 文案「登录状态尚未就绪，请重试」（或静默重试一次）；无论何种来源的 401 都不得裸吐英文。取消收藏 `DELETE /api/lora-assets/favorite?assetId=` 正常。

#### P2-3 我的页卡片与公开库卡片是两套组件

- 我的页卡片（名称+作者/触发词+来源/主按钮+私有锁，类型徽标右上）与公开库卡片（封面优先+黑纱家族徽标左上+心）视觉语言不一致；wireframes §5 预期我的复用库卡片基底 + 主体角标 + 主按钮。
- **修复**（低优先）：统一卡片基底：封面优先、类型徽标统一左上黑纱、主按钮「去生成」（随 P0-4 文案批先改字）、来源降为 hover/菜单项。涉及 `LoraAssetCard.tsx` 与 `CivitaiLoraCard`（LoraWorkbench.tsx:2223）收敛，改动大，单独出批。

#### P2-4 模块 tab bar 收拢【D4 已拍板：紧凑居中 pill】

- 现状三个 `flex-1` 全宽大块 → 改为 wireframes 各稿面统一画法：紧凑居中 segmented pill（参考 §7 组件板「模块 TAB」规格：inline-flex、gap 2px、`#1b1b1d` 槽底、激活项 `rgba(255,255,255,0.10)` 底 + inset hairline——实现换真 token）。左右两翼暂不加「LORA · 暗房」字标/头像（app shell 已有侧栏与账号入口，稿面那两样是独立布局假设，不照搬）。
- **验收**：三 tab 总宽收到内容自适应居中；视觉回归基线更新点名此项。

#### P2-5 库网格默认自动选中第一张（ring-primary）但不指向任何状态

- 首屏第一卡永远带 `ring-2 ring-primary`（`LoraWorkbench.tsx:2240-2243`）而抽屉未开、生成台未挂载。**修复**：选中 ring 仅在抽屉打开期间标记对应卡（`isSelected = inspectorOpen && item.id === selected.id`）。

#### P2-6 分页页大小与网格列数错配 + 空结果态无动作

- 每页 10 条 vs 2xl:6 列 → 永远残行。**修复**：pageSize 改 12（2/3/4/5/6 列的公倍数不存在，12 在 6/4/3/2 列下整行，5 列容忍）或直接 24。空结果态（有筛选时）补「清除筛选」按钮，动作=重置 family/q/nsfw 回默认（方案 A 下即清 URL query）。

#### P2-7 观察项：模块 tab 的事件绑定

- 未登录 + section=mine 时物理点击「训练」两次无响应（登录态同路径正常，dev-only 场景）；且模块 tab 对程序化 `element.click()` 无响应（疑监听 pointerdown）。不排修复，但 P2-4 重做 tab bar 时**顺带**：改用标准 click/Radix Tabs 语义，补 `getByRole('tab')` 键盘激活测试。

---

## 二、对 `lora-domain-wireframes.md` 的增量修改

> wireframes 保持「拍板方向」地位，补三样：分期标注、实测中吸收的更优现状、稿里没画过的状态。以下 delta 拍板即生效，可直接照抄进该文档。

### §0 设计语言速记 — 追加两条

```
- **徽标一律黑纱**：库卡片家族角标统一 bg-black/55 白字；外源与否用外链 icon 表达，
  不用大面积警示色（amber 满屏 = 语义稀释 + 对比度不达标）。
- **加载态必须有骨架**：网格/抽屉封面用 blur-up（96 档先行 → 450 档替换）或 shimmer；
  禁止裸 bg-muted 黑卡等图。
```

### §2 生成 — 加分期标注块（放「规格」行下）

```
**分期（2026-07-02 实测校准）**
- v1 已落：LoRA/底模脊柱条（×weight chip、家族收敛底模下拉、「需要 API key」→ QuickSetup）、
  **多 LoRA 混挂**（多 chip 并列、请求带全部 loras 各自 scale）、推荐/自己搭配切换、
  来源图 strip + **选中后的配方面板**（正/负 prompt、seed/steps/cfg、叠加 LoRA 警告与
  +挂载、使用原图 seed、一键同款）、ivory 提示词纸（触发词预填）、忠实还原 chip、出图、
  未选 LoRA 空态（前门引导去库）。自训 FLUX LoRA 挂载 → 底模自动收敛 FLUX.1-dev·快，已验证。
- v1.5 已拍板（D6 + D7，2026-07-04）：
  · 参考图 img2img——ivory 纸工具行「参考图」chip（上传/素材库/强度滑块），能力位驱动
    （FLUX 先行，Illustrious 待 schema 核验，runner 到位后全家族）。规格见评审文 §3。
  · 比例 chip——ivory 纸工具行，popover 五值，默认 1:1 不动（评审文 P1-10）。
  · scale 滑块 popover——脊柱条 LoRA chip 的「×1.0」点击展开滑块（capability loraScale
    0.1–2.0 步长 0.05），实时写回挂载栈 entry.scale 并更新 chip 文本。
  · 结果历史 filmstrip——主图下方会话级缩略条（每张带 s×.×× · seed 角标），点击切主图；
    会话内存保存、上限 12 张 FIFO，刷新清空可接受。
  · 来源图配方面板（2026-07-04 三稿修正，作废二稿网格方案）——**配方面板是现状已有
    功能**（首轮审查漏测：选中来源图后渲染完整配方——正/负 prompt、seed/steps/cfg/尺寸、
    「该图叠加 N 个其他 LoRA」警告与「+挂载」、未应用参数提示、使用原图 seed、一键同款）。
    D7④ 的「点击填配方」即已有「一键同款」，不新建交互。左栏空档的真正根因 = 未选中
    来源图时面板整个缺席 → 修正：进入推荐 tab **默认选中第一张来源图**；配方加载中渲染
    骨架占位而非空白。strip 维持横滚不改网格。
  · 多 LoRA 混挂为现状已支持（脊柱条多 chip 并列，请求带全部 loras 各自 scale；上限
    fal maxLoras=5 / Replicate delta-lock=2）——D7② 的 scale popover 须**按 chip 独立**
    （每个挂载各调各的），脊柱条建议加「2/5」余量小字。
  · 多挂载配方规则（2026-07-04 补，owner 提出「来源图只显示一个/触发词不知怎么接两个」）：
    ① **来源图按挂载分组**——strip 上方加分组 chips（与脊柱条同名同序，如「丹瑾（6）｜
    今汐（4）」），切换即换来源图集与配方面板；仅挂一个时该行隐藏，单挂体验不变。
    ② **一键同款自动补齐触发词**——配方填入后自动 append 其他挂载 LoRA 缺失的触发词，
    面板提示行预告行为（「配方来自丹瑾 · 同款时自动补上 jinxi 触发词」），落地后 toast
    可撤销；不弹确认框。纸的初始预填 = 全部挂载触发词逗号连接。
    ③ **语义边界**：同款只承诺还原「单主体」；双角色同框需要构图词（2girls/side by side
    等），不在一键同款语义内——留给用户手补或后续助手/魔导书，实现与文案都不得过度承诺。
  · 布局已拍板（2026-07-04，D8）：**B = 象牙纸全宽底档**（对齐 Studio 底部 dock 心智，
    出图固定右下，结构性解决左右栏高差；纸全宽为触发词 chips 行与长配方词留横向空间）。
    **形态细则（frontend-design 定稿「暗房工作台」）**：
    ① 去盒化——脊柱条/配方区/结果区不再套圆角面板，分区用水平发丝线（白 8%）+ 留白
    节奏（组内 8–10px / 区间 16–24px）；配方为直接排版文字（12.5px·行高 1.7），
    结果图裸浮暗面无底板。
    ② 控件形制二分——胶囊仅用于**可移除对象**（LoRA 挂载、触发词，带 ×）；视图切换
    一律下划线文字 tab（模块 tab、推荐/自己搭配、来源图分组）。纸上工具行的小 chips
    （忠实还原/比例/参考图）属纸面形制，不受此条约束。
    ③ 全页唯一反相 CTA = 纸上「出图」墨块；一键同款降为象牙描边 ghost；「+挂载」为
    下划线文字链。
    ④ 挂载余量用五圆点 ●●○○○（实心=已挂）替代文字计数，带 aria-label。
    ⑤ 纸全出血贴底（左右下三边顶容器边缘，仅顶部与暗区相接）；纸上文字全用墨色系
    （正文 #26241d 级、辅助 #8d8879 级），禁止灰字上纸。
    ⑥ seed/steps/cfg 参数串单独用 mono（仅此一行，功能性对齐）；琥珀仅用于警示文字行，
    不做底色块。
    ⑦ 左栏弹性规则（2026-07-04 补，owner 问「空出来的区域是做什么的」）——左栏高度由
    右栏 3:4 底片决定，剩余空间三条规则消化：a) **动作行锚底**：「使用原图 seed ·
    一键同款」flex 锚到左栏底部（上加发丝线），弹性余量被吸收在配方元信息与动作行
    之间，一键同款恒居出图正上方形成「配方→同款→出图」垂直漏斗；b) **「+N」原位展开**：
    来源图点开后从单行原位长成多行网格占用该空间（带「收起」），不弹浮层；c) 两者未占满
    时剩余即暗房呼吸，**禁止填装饰**。配方块须补回现状已有的「未应用：sampler/clipSkip」
    提示行（首轮稿漏画）。
  注：生成请求已随出图传 seed（LoraWorkbench handleGenerate），v2 ① 的 seed 只是补
  UI 控件，不动链路。
- v2 待做（按优先级）：① 固定 seed 控件（scale 已由 v1.5 popover 覆盖；配方面板的
  「使用原图 seed」已是现状，v2 只补自由 seed 输入）
  ② 还原模式 chips（忠实还原/半身/全身）+ 精修模式 chips（依赖 recipe 引擎）
  ③ 配方源图 3 列网格（维持 v2：现阶段横滚 strip + 配方面板已够用）
  ④ ~~出图反相 pill~~（已由 D8 布局 B 覆盖：底档右下墨块，随 B10 落）
  ⑤ 触发词 chips 化——纸上触发词从裸文本抽成独立 chips 行（挂载即现、卸载即删、
  一键同款只替换正文不碰触发词行）；触发词是「挂载的属性」不是「用户写的词」，
  chips 化是结构性解法；实现复用 prompt-tag 引擎的 selections 机制（已有 80%，别重造）。
- ~~v2 前的过渡：左栏 strip 下补「试用提示词」卡~~（作废：配方面板本就承载试用词，
  B10 的「默认选中第一张」+ D7⑤「带词去生成」已覆盖该诉求）。
```

### §3 魔导书 — 加分期标注

```
**分期**：当前实现为最小子集（搜索 + 7 功能分类 + 双列词条）。色点/热度/缩略图/
智能词条/已选托盘/NSFW 锁与 danbooru 词库 import 合并为独立任务推进，
不在生成页修复批次内。
```

### §4 库 — 三处修订

1. **规格行**：「分级默认安全」→「分级开关（默认安全；开 NSFW 时 chip 琥珀描边示警；状态入 URL `nsfw=1`；安全档同时按名称词表过滤 NSFW 命名模型）」。
2. **徽标规范**：追加「外源模型同样黑纱，仅多一枚外链 icon；禁止实底警示色角标」。
3. **抽屉动作区（v1.1 修订）**：

```
- 可生成家族：主=「去生成」反相 pill，次=收藏 ghost，末=「打开来源」文字链。
- 受限家族：维持现状「在 Civitai 生成」为主按钮（D5：与原稿"禁用去生成+ghost Civitai"的
  取舍后续再议，本轮两边都不动）+ 琥珀说明条。
- 授权徽标行：标题/作者下方必渲染（可商用绿 / 个人使用黄 / 需署名灰描边），
  数据已在 CivitaiLoraLibraryItem（allowCommercialUse / allowDerivatives / allowNoCredit）。
- 触发词：推断兜底被过滤时显示「无需触发词」，不硬造值。
- 试用提示词区（D7⑤）：「复制」旁增主动作「带词去生成」——挂载该 LoRA + 该词段填入
  提示词纸 + 跳 ?section=generate（复用 handleUse 挂载路径与 ?prompt= 回放注入基建）。
- 筛选/排序/分级/搜索全部入 URL query（family / q / sort / nsfw），未知值按默认处理
  不透传 API；翻页游标不入 URL。
```

### §5 我的 — 两处修订

```
1. 卡片统一：我的卡片复用库卡片基底（封面优先 + 类型徽标左上黑纱），主按钮「去生成」；
   「来源」降为 hover/溢出菜单；自训卡保留「私有」锁标。收藏/自训子 tab + 计数徽标
   为已落现状（符合稿面），保留。
2. 副标题文案：废弃「添加到 prompt tags 后即可在 Studio 使用」，改「挑一个去生成，
   或去训练做新的」。
```

### §6 训练 — 三处修订

```
1. API key gate：与生成页对齐——「开始训练」不因缺 key 置灰，点击弹 QuickSetupDialog
   （Hard Rule 8）；警告条不得指向「侧边栏」。表单校验类置灰（图片不足/名称空）不受此限。
2. 右栏 = 预设 + 训练历史（现状，保留；比原稿多预设入口）；原稿「预计消耗 ~120 credits」
   仍缺——补进提交按钮上方，估算来自训练服务。历史空态文案方向改「左侧」。
   训练图片计数「0/50 张」常态用 muted 色（D7⑥）——空态是中性状态；仅当图片数 >0 且
   <5（不满足下限）时才转警示红。
3. 完成横幅（原稿没画）：吸收现状（绿色系庆祝卡 + 触发词展示 + 去使用/训练新的），
   但「去使用」必须落 LoRA 生成台（?section=generate&style=<code>），文案「去生成里激活」。
```

### §8 动效规范 — 追加

```
- 网格加载/筛选切换：骨架卡替换旧内容（同模块切换规范）；封面 blur-up 两档 transform（96 → 450）。
- 详情抽屉封面：骨架占位，禁止空白灰框。
- toast 统一 duration 4s。
- section 切换（D7⑦）：原稿早有的「壳不动 body crossfade 200ms + 骨架卡」现状未实现、
  目前是硬切——落地挂 B7 形态批；`--ease-standard`，`prefers-reduced-motion` 降级为直切。
```

### 新增「§9 全域状态规范（2026-07-02）」

```
| 状态 | 规范 |
| --- | --- |
| 加载 | 骨架/blur-up，禁止裸 bg-muted |
| 空结果（有筛选） | 文案 + 「清除筛选」动作（重置 URL query） |
| 空结果（无筛选） | 引导文案（去公开库 / 训练第一个） |
| 错误（网络/5xx） | 错误条 + 重试（重试只给真的可重试错误） |
| toast | 统一 4s duration，全部走 i18n messages |
| 未登录 | 生产由 proxy.ts auth.protect() 整页拦截，域内无需未登录 UI；
  若未来库公开化需回到本表补设计 |
```

---

## 三、新功能：生成页参考图（img2img）接入规格【D6】

### 3.1 可行性结论（2026-07-02 调查）

管线自上而下逐层核对过，**除两处显式开关外全部现成**：

| 层                | 现状                                                                                                                                                                                                        | 结论                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 请求 schema       | unified generate 的 image 请求已有 `referenceImages: z.array(z.string()).optional()`（`types/index.ts`，多处含 `:320`）；`advancedParams.referenceStrength` 已存在                                          | 不动                                                    |
| fal adapter       | img2img 通路现成（`image_url` + `strength = 1 - referenceStrength` 反转，`fal.adapter.ts:660-674`）；但 `fal-ai/flux-lora` 被列入 `TEXT_TO_IMAGE_ONLY_MODELS`（`fal.adapter.ts:640-647`）——该端点确实纯 t2i | 带 ref 时**切端点**到 `fal-ai/flux-lora/image-to-image` |
| fal 端点          | `fal-ai/flux-lora/image-to-image` 已核官方文档：`image_url`(必填) + `strength`(0.01–1，默认 0.85) + `loras` 数组 + steps/cfg/seed，与现有 body 构造完全兼容                                                 | **FLUX 可做，无未知量**                                 |
| Replicate adapter | 任何 ref 都会自动带 `input.image` + `input.strength`（`replicate.adapter.ts:477-485`），LoRA 走 `delta-lock-sdxl` schema 的 `loras` JSON                                                                    | 接线已在，但见下行                                      |
| Replicate 端点    | `delta-lock/noobai-xl` 是否接受 `image`/`strength` **未核验**（模型页 JS 渲染、公开 API 401，需带 key 查 schema）                                                                                           | **实施期第一步核验**，见 3.4                            |
| 能力层            | `MODEL_CAPABILITY_OVERRIDES` 把 `FLUX_LORA` 和 `ILLUSTRIOUS_XL` 都标 `maxReferenceImages: 0`（`provider-capabilities.ts:205-207,220-222`）——这是 UI 不出参考图控件的直接原因                                | FLUX 翻 0→1；Illustrious 核验后再翻                     |

与主线的关系：参考图 = [[project-lora-recipe-first]]「还原（来源图一键同款）」主线的底层通路（一键同款 ≈ 自动把来源图填进参考图 + 配方词）。本规格按能力契约设计、不绑 provider，未来 runner 底模（comfy img2img）直接复用同一 UI 与字段。

### 3.2 UI 规格（借鉴 Studio，不搬 Studio context）

Studio 的 `ReferenceImageChip`（`studio/ReferenceImageChip.tsx`）绑死 `useStudioForm`/`useStudioData`，**不直接复用**；复用它底下的通用件：

| 复用件                                                                | 用途                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `useImageUpload`（`hooks/use-image-upload.ts`，独立 hook）            | 本地文件压缩→R2 上传、`referenceImages`/`referenceEntries`、`setMaxImages` 上限、超限/不支持条目的 `disabledReason` |
| `ImageSourcePicker`                                                   | popover 内容：上传（primary）+ 从素材库选（secondary）+ 粘贴提示                                                    |
| `ImageAttachmentPreviewStrip`                                         | 已选缩略图条 + 删除                                                                                                 |
| `AssetSelectorDialog`                                                 | 全屏素材库选择（`mediaType="image"`，选 `GenerationRecord` 后 `addFromUrl`）                                        |
| `StudioToolSurface` 系原语（`studio-shared/primitives/tool-surface`） | chip 触发器 + popover 外壳（确认无 Studio context 依赖后用；有则退回普通 Popover）                                  |

**放置与形态**：ivory 提示词纸底部工具行，「忠实还原」chip 右侧加「参考图」chip（ImageIcon + 文字 + 数量徽标，激活态同 Studio `studioChipActiveClass` 语义、换 LoRA 域 token）。点击开 popover：上传 / 从素材库选 / 预览条 / **参考强度滑块**（`getCapabilityConfig(adapter, modelId).referenceStrength` 的 min/max/default，FAL 为 0.01–0.99 默认 0.7；语义「越高越像参考图」，adapter 负责反转成 denoise）。popover 开合用组件局部 state（LoRA 域没有 Studio panels reducer，不引入）。

**能力门控**（数据驱动，不写死模型名）：

- `getMaxReferenceImages(adapterType, providerModelId) > 0` 时 chip 才渲染。底模切换到不支持的条目时 chip 隐藏，但**已传条目不丢**——`useImageUpload.setMaxImages(0)` 会把条目标 `disabledReason`，切回支持的底模自动恢复（Studio 同款行为，`referenceEntries` vs 生效 `referenceImages` 的既有分离）。
- 挂参考图状态下若生效数为 0（全部被禁用），chip 徽标给 warning 提示「参考图对当前底模不可用」（沿用 `ImageChip.disabledUnsupported` 的文案模式，LoRA 域自己的 i18n key）。

**手机端**：popover 换底部 sheet（域内已有 Vaul 先例），素材库选择直接复用 `AssetSelectorDialog` 全屏。

### 3.3 数据流与后端改动

```
参考图 chip → useImageUpload（R2 URL）
  → handleGenerate（LoraWorkbench.tsx:530-559）在 image 请求上补两个字段：
      referenceImages: imageUpload.referenceImages   （非空时）
      advancedParams.referenceStrength: <滑块值>      （有 ref 时）
  → unified generate（schema 已支持，零改动）
  → adapter 层：
      FAL：generateImage 里 modelId=FLUX_LORA 且带 ref 时，externalModelId 换
          'fal-ai/flux-lora/image-to-image'（常量放 fal.adapter 内与 TEXT_TO_IMAGE_ONLY
          名单同一处，写明"端点对：t2i 与 i2i 变体"）；loras/strength/steps/seed 传参不变
      Replicate：现有 input.image + strength 通路不动（3.4 核验通过后才放开能力位）
  → 能力层：MODEL_CAPABILITY_OVERRIDES
      FLUX_LORA:      maxReferenceImages 0 → 1（referenceImageMode 走 FAL 默认 'img2img'）
      ILLUSTRIOUS_XL: 核验通过 → 1；不通过 → 保持 0（UI 自动不出 chip，无需前端分支）
```

积分：与该底模现行 cost 相同（fal i2i 与 t2i 同价按 megapixel 计），不新增计费维度。

### 3.4 实施期核验步骤（B9 第一步，先核验后写码）

1. `curl -s -H "Authorization: Bearer $REPLICATE_API_TOKEN" https://api.replicate.com/v1/models/delta-lock/noobai-xl | jq '.latest_version.openapi_schema.components.schemas.Input.properties | keys'`——确认有无 `image` / `strength`（或 `denoising_strength` 等变体名；变体名则 Replicate adapter 的 `input.strength` 键名要跟着适配）。
2. 有 → ILLUSTRIOUS_XL 能力位放开，dev 实测一张 img2img（挂 LoRA + 参考图，strength 0.7）确认出图受参考图约束。
3. 无 → ILLUSTRIOUS_XL 保持 0，本条记入 wireframes §2 的 runner 待办（WAI-Illustrious runner 落地时 comfy 原生 img2img 一并放开）。
4. FLUX 侧无需核验（文档已核），直接实测一张。

### 3.5 验收

- FLUX 底模 + 参考图 + 自训 LoRA：出图明显受参考图构图约束；Network 里请求打到 `fal-ai/flux-lora/image-to-image` 且 body 含 `image_url`、`strength`、`loras`。
- 不带参考图时仍打原 `fal-ai/flux-lora`（t2i 路径零回归）。
- 底模切到 `maxReferenceImages=0` 的条目：chip 消失、已传条目保留且标禁用、切回恢复。
- `provider-capabilities` 与 fal adapter 各补单测：能力位翻转、端点切换、strength 反转边界。

---

## 四、落地批次（决策已入，按此执行）

| 批次                             | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 关键文件                                                                                                                                   | 验收                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1 文案批**                    | P0-4 全部 key（含 P0-1 的 completionBody）+ P1-3 historyEmpty + P2-2 toast duration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/messages/{zh,en,ja}.json`、toast 调用点                                                                                               | i18n-check 绿；LoRA 域 namespace 无 prompt-tag/Studio/图像工具残留                                                                                                                                                                                                                                                            |
| **B2 完成横幅路由**              | P0-1 handleUse 改 LoRA 生成台深链                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `CompletionCelebration.tsx:50-55`、routes 常量                                                                                             | 点去使用落 ?section=generate 且 LoRA 已挂载                                                                                                                                                                                                                                                                                   |
| **B3 封面质量批**                | P0-3 CARD_WIDTH 450 + P1-1 骨架/blur-up + P2-5 选中 ring 收敛                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `civitai-lora.service.ts`、`LoraWorkbench.tsx:2234,2240`、skeleton 原语                                                                    | 节流下无纯黑帧；currentSrc 含 width=450                                                                                                                                                                                                                                                                                       |
| **B4 URL 深链批**                | P1-5 方案 A + P1-6 NSFW 开关 + P2-6 pageSize/清除筛选（`sort` 始终入 URL——B11 落地后搜索态排序真实生效）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 库 hooks（`use-civitai-lora-library`）、constants、控件行                                                                                  | 深链直达即筛即现；非法参数按默认；默认档无 NSFW 命名卡                                                                                                                                                                                                                                                                        |
| **B5 合规批**                    | P0-2 授权徽标 + P1-4 触发词过滤                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `CivitaiLoraInspector`（LoraWorkbench.tsx）、`civitai-lora.service.ts:817` + trigger 测试                                                  | 抽屉必有授权徽标；垃圾推断显示「无需触发词」                                                                                                                                                                                                                                                                                  |
| **B6 训练批**                    | P1-2 QuickSetup 对齐 + credits 预估 + 警告文案 + D7⑥「0/50」计数去红（仅 0<n<5 才红）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 训练表单组件（`studio/lora/training/`）、QuickSetupDialog                                                                                  | 缺 key 点开始训练弹 QuickSetup；空态计数 muted 色断言                                                                                                                                                                                                                                                                         |
| **B7 形态批**                    | P2-4 tab bar 紧凑 pill（顺带 P2-7 事件/a11y）+ P2-1 徽标统一 + P1-9 触达区 + D7⑦ section 切换 crossfade 200ms + 骨架                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | tab bar、`LoraWorkbench.tsx:2266-2273`、chips、section 容器                                                                                | 视觉基线更新点名；`getByRole('tab')` 键盘测试；44px 断言；reduced-motion 降级                                                                                                                                                                                                                                                 |
| **B8 卡片统一批**                | P2-3 我的/公开库卡片基底收敛                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `LoraAssetCard.tsx`、`CivitaiLoraCard`                                                                                                     | 两页卡片同基底；视觉基线更新                                                                                                                                                                                                                                                                                                  |
| **B9 参考图批（D6）**            | §3 全部：核验 noobai schema → 能力位翻转 → fal 端点切换 → 参考图 chip + 强度滑块                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `provider-capabilities.ts:205,220`、`fal.adapter.ts:640`、`LoraWorkbench.tsx:530-559`、复用件见 §3.2                                       | §3.5 全项；先核验后写码                                                                                                                                                                                                                                                                                                       |
| **B10 生成页手感批（D7①–⑤）**    | P1-10 比例 chip · scale 滑块 popover（**按 chip 独立**写回对应 entry.scale，多挂载各调各的；脊柱条加 2/maxLoras 余量小字）· 结果历史 filmstrip（会话级 ≤12 张 FIFO，seed/scale 角标）· 推荐 tab 默认选中第一张来源图（消灭左栏空态；配方面板沿用现状，加载中骨架占位）· **多挂载配方分组**（strip 上方分组 chips 切换来源图集；单挂时隐藏）· **一键同款补齐触发词**（append 其他挂载缺失触发词 + 面板预告行 + toast 撤销；纸初始预填=全部挂载触发词）· 抽屉「带词去生成」· 布局 B + 暗房工作台形态细则七条 + 左栏弹性规则（D8 已拍板，见 §2 delta）随批落地                                                                                                                                                                                                                                                                                                                                              | `LoraWorkbench.tsx`（脊柱条/ivory 纸/结果区/配方面板/抽屉动作区，比例锚点 `:467,554`，scale 锚点 `:533-535`）、`use-active-lora-stack`     | 比例：请求带所选值且与 URL 回放双向一致；scale：双挂载分别拖 1.0/0.8 → 请求 `loras[0].scale=1.0, loras[1].scale=0.8`；filmstrip：连出 3 张可切换比对；默认选中：进推荐 tab 即见第一张配方面板；分组：双挂载可见两组 chips 且切换换图集；同款：双挂载点一键同款后纸上两个触发词都在；带词去生成：落生成页词已在纸、LoRA 已挂载 |
| **B11 搜索排序批（D9 / P1-11）** | `listCivitaiLoras` 搜索路径（有 `query` 时）改走 multi-search：复用现有请求骨架（`civitai-lora.service.ts:37-42` 常量与公钥、`:565-596` POST+Bearer 范式、`buildCivitaiSearchFilters` 家族过滤），query 对象加 `sort` 映射——推荐→不传（相关性）/ 最多下载→`["metrics.downloadCount:desc"]` / 最新→`["createdAt:desc"]`（三者 2026-07-04 实测生效）。分页用 meili limit/offset（搜索态 hook 的 cursor map 改存 offset）。**最大工作量点**：meili hit 与 REST item 形状不同（`metrics` vs `stats`、versions 精简、可能缺完整 files/downloadUrl）——需 hit→`CivitaiLoraLibraryItem` 映射层，缺 downloadUrl 时按 versionId 走既有二段解析（`resolveFirstExactCivitaiVersionCandidate` 基建 `:633`）。**兜底**：multi-search 失败回落现 REST 搜索路径 + 排序控件显示「按相关性」。风险自认：非正式 API、browser key 可能轮换（withRetry 已包、logger label 监控）。无 query 的浏览态不动（REST sort 一直正常） | `civitai-lora.service.ts`（搜索路径 `:1119-1152` 替换）、`use-civitai-lora-library`（搜索态分页）、service 测试补 sort 传参与 hit 映射用例 | 搜「鸣潮」切最多下载 → 首屏严格降序（含 REST 缺失的全局热门，如 5380/5133 档）；切最新 → 全为新发布；切推荐 → 相关性序；模拟 multi-search 5xx → 回落 REST 且控件显示「按相关性」；浏览态排序零回归                                                                                                                            |
| 独立任务                         | P1-7 生成页 v2（seed 控件最先，scale 已被 B10 覆盖）、P1-8 魔导书×NSFW 词库                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                          | 各自任务包                                                                                                                                                                                                                                                                                                                    |

依赖：B1/B2 无依赖可先行；B4 内部 P1-6 依赖 P1-5 的 query 基建；B7 的 P2-7 依赖 tab bar 重做；B10 纯前端无后端依赖、子项彼此独立可拆着做（建议顺序：比例 → scale popover → filmstrip → 默认选中+配方分组 → 同款补触发词 → 带词去生成 → 布局 B 收尾）；B11 为 service 层独立批、与 B4 可并行（B4 先落也不冲突：浏览态 sort 一直生效，搜索态排序在 B11 落地前维持相关性）。每批完成走：lint+build → `e2e/visual.spec.ts`（基线更新点名）→ 涉及 token/触达区的 `toHaveCSS`/`getByRole` 断言 → 交互实跑。

### 候选建议（未拍板，不排批，留档防丢）

2026-07-04 评审讨论中提出、owner 尚未表态的增强项：库控件行 1280px+ 收单行；分页改「加载更多」哨兵滚动（与深链方案 A 不冲突，交互模式需拍板）；自训 LoRA 完成后用首张出图自动回填封面；训练触发词从模型名 slug 自动预填；出图落素材后结果区给「已入素材库」反馈链接。

## 附录 A — dev-only 现象记录（不排批次）

以下仅本地 `NODE_ENV=development` 可见（`proxy.ts:39,60,78` isDev 旁路，owner 确认为本地便利有意保留）；生产未登录访问 `/studio/lora` 会被 `auth.protect()` 重定向登录页，均不可达：

1. 库·我的未登录显示「加载失败 / Unauthorized + 重试」。
2. 未登录点收藏心弹英文裸 toast「Unauthorized」。
3. 未登录 + section=mine 时模块 tab 点击无响应（登录态正常；机制疑点已并入 P2-7）。

若未来把公开库开放给未登录用户（产品决策），需先补 §9 状态表的未登录行设计再动路由。

## 附录 B — 复现/验证速查

- P0-1：训练完成横幅点「去使用」→ 现状落 `/studio/image?style=…` 且无 LoRA 挂载（LoraStackProvider 只在 `studio/lora/layout.tsx:23` 挂载）。
- P0-3：公开库任意卡 DevTools 查 img currentSrc 含 `width=96`、naturalWidth=96 而渲染宽 >160；对照我的页卡片是 `width=640`。
- P1-5：直访 `/zh/studio/lora?section=library&family=Illustrious` → chip 显示全部 + 空结果 + 排序 select 空白。
- P0-2：Network 面板 civitai 列表响应每项含 `allowCommercialUse` 数组，UI 无对应渲染。
- 自训挂载正常（对照组）：我的·自训点主按钮 → `?section=generate`，脊柱条「aimiss ×1.0」+ 底模「FLUX.1-dev · 快」。
- 收藏链路正常（对照组，登录态 2026-07-03）：点心 → `POST /api/lora-assets/favorite` 200 → 红心 + 好 toast；再点 → `DELETE ?assetId=` 取消。仅 hydrate 完成前的首次点击有 401 窗口（见 P2-2）。
