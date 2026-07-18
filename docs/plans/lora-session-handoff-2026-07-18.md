# LoRA 域会话交接 — 2026-07-18

> 用途：本次会话（LoRA 库+生成页重设计执行 + 第二波 owner 反馈处理）的完整状态快照，供**新对话第一时间读取接续**。
> 阅读顺序：本文 → `docs/references/pages/lora-workbench.md`（施工基准 v1.1 + §12/§13）→ 三份第二波施工图（见 §3）。
> 角色分工：4.8 调查+架构 / Fable 设计 / Sonnet 执行；本会话 Fable 统管「设计→编排 Sonnet→汇总」。

---

## 0. 一句话现状

main 进度链：S1–S6（`b3e1452d`）→ 五件 fixes（`3dabd1fe`）→ **§12 控件压缩 + H1 样例参考（`0318fecf`）→ 空态闪烁修复 cherry-pick（`b39ee5d0`，Fable review 通过后合入）**。剩余主线：F1–F4 助手线（施工图已拍板）；runner r4 立项（Krea2+多参考+hires-fix+容量水位，实证清单 `docs/plans/runner-r4-krea2-multiref-2026-07.md`，P1–P6 实证先行）。runner 运维已收口（volume 46.7/80GB·旧端点退役·turbo 归位 unet/·注册表指新端点）。

---

## 1. 已提交进 main（完成）

| 项                        | commit                                            | 内容                                 |
| ------------------------- | ------------------------------------------------- | ------------------------------------ |
| S0 audit 3bug             | `0d261217`（2026-07-11）                          | 配方 fileHash / nsfw 下推 / 翻页锁定 |
| **S1–S6 库+生成页重设计** | **`b3e1452d`（2026-07-18，owner 点头单 commit）** | 见下                                 |

S1–S6 要点（施工基准 `docs/references/pages/lora-workbench.md` §10 各行已标完成）：

- **S1 统一外壳**：family slug 化 + `source/type/family/q/sort` 深链 + 两 tab（civitai/HF）控件行形制对齐 + HF 排序接入（**真参数 `trendingScore`**，`trending` 会 400）；`LoraWorkbench.tsx` 4268→~2800 行，库侧组件拆入 `src/components/business/studio/lora/library/`。
- **S2 内容类型**：7 类 chip（人物/服装/表情/姿势/风格/概念/场景）+ L1 tag/L2 关键词/L3 override 三重兜底合并检索 + 稀疏引导卡/空态。供给实测：「表情」L1<500 但 L2 健康 → **保留渲染**（推翻首发隐藏假设）。
- **S3 统一卡片+抽屉**：`LoraLibraryCard` / `LoraLibraryInspector`（双源同基底仅源角标异）；HF file select 迁抽屉、收藏语义统一；顺手修合并结果「最多下载」排序 bug。
- **S4 组合体验**：兼容淡绿点（`bg-emerald-500/70`）+ 不兼容琥珀点 + 非阻断警示行「切到建议底模」 + 底模 Select 云端/Runner 两层分组（Runner 内 SDXL/DiT 再分）+「常与它同挂」Top3。
- **S5 触发词 chips 化**：`TriggerChipRow`，正文不再 prefill，编译顺序 触发词→tray→正文；删旧 `lib/lora-prompt-triggers.ts`。
- **S6 inline 补全**：`PromptTagAutocomplete`（正/负双框，danbooru 引擎，写正文不进 tray，IME 不弹，热度点）。
- 附带收编：`ui/spinner.tsx` + `Common.loading`（被本线文件引用，随 commit 一并进）。

---

## 2. 第二波 owner 反馈（2026-07-18 五图）— 分诊

| 图          | 问题                                             | 归属     | 状态                                             |
| ----------- | ------------------------------------------------ | -------- | ------------------------------------------------ |
| 图一        | HF+Illustrious 家族筛选空                        | bug      | ✅ 修完验证绿（§4）                              |
| 图二        | Civitai 类型筛选不满12/下一页无效                | bug      | ✅ 修完验证绿（§4）                              |
| 图一/新     | HF 封面大面积落社交横幅（"明明有参照图"）        | bug→架构 | 🔄 渐进增强收尾中（§4）                          |
| 图五/新     | HF「风格」类型每页只出 3-4 张                    | bug      | 🔄 类型播种收尾中（§4）                          |
| 新/检索失败 | 库检索失败态是死胡同（无重试按钮）               | bug      | ✅ Civitai 侧补重试按钮（HF 侧本已有），并入本批 |
| 图三        | 控件区上下占用太多                               | 设计     | 📐 方案定稿 §12，待建                            |
| 图四+五     | 生成页加 LoRA 助手 / 自己搭配难用 / 自然语言→tag | 设计     | 📐 施工图拍板，待建（§3）                        |
| 图五        | 参考图只能挂一张                                 | 调研     | 📐 可行性成文，独立立项（§3）                    |
| 图四/五     | HF 库一张封面够、生成侧看全部图+提示词           | 设计     | 📐 §13 分层拍板，H1 待建                         |

---

## 3. 第二波设计（已拍板，待建）

### 3a. LoRA 助手 + 自然语言→tag — `docs/plans/lora-assistant-nl2tag-2026-07.md`（v1.1 已拍板）

- **核心发现**：kernel 已有 `mode:'lora'` 转换系统提示（`services/kernel/prompt-assistant.service.ts:78`），但停在 S5 前旧世界（还让触发词进正文）。
- **引擎 v2**：词库双向 grounding（入参预检索 `searchPromptTags` 喂候选 + 出参逐词规范化，未命中标「自由词」）+ 挂载上下文注入（触发词绝不输出、人物 LoRA 默认不写身份词防打架）+ 结构化输出 `{positive, negative, note}`。
- **宿主 = A 右侧 dock（owner 拍板，覆盖 Fable 原推荐的左列第三 tab）**：复用 `StudioAssistantDock`，LoRA 页默认激活 LoRA 人格；结果卡在对话流内渲染（chips 预览→填入/追加正文，不进 tray）。
- **自己搭配重构 P1–P5 全做**（owner 拍板）：分节+热度点+选中反馈+中文释义露出+极性 segmented。
- **切片**：F1 引擎 v2 → F2 dock 挂载+结果卡 → F3 落地联动（串行）；F4 自己搭配重构（独立可并行）；F5 建议挂载（v2，不做）。

### 3b. 控件区纵向压缩 — `lora-workbench.md` §12（已拍板）

导航两行合一（公开/我的 + Civitai/HF + 排序/NSFW 右置）+ 搜索独占 + 类型/底模成簇，264→178px（-33%）。改动面：`LoraWorkbench.tsx` / `LoraLibraryTabs.tsx` / `CivitaiLibraryPane.tsx` / `HuggingFaceLoraLibrary.tsx`。

### 3c. HF 样例参考分层 — `lora-workbench.md` §13（已拍板）

- 库侧：一张封面（README 首图优先，**渐进增强**见 §4/H0）。
- 生成侧（挂载后）：`getHuggingFaceRepoShowcase` → README 全部图横滚 + 提取提示词一键填入（**H1 待建**：prompts 启发式提取 + 「样例参考」条 UI）。

### 3d. 多参考图 — `docs/plans/lora-multi-reference-feasibility-2026-07.md`（调研结论）

可行走 Runner + ComfyUI IPAdapter（fork r4 加装 custom node + ~3.2GB 权重自播种 + Worker workflow 新分支 + ReferenceSlot 1→N）；Anima DiT 无生态首发排除；云端多图挂不了 LoRA 此路不通。**独立立项**（动 RunPod 基建），立项先做 §4 三项实证。

---

## 4. 在飞/未提交（工作区状态 — 新对话务必先 `git status` 核对）

**已修完并经权威核验绿（我独立跑：426 files / 3520 tests、tsc、lint 全 exit 0）：**

- **Bug 图一 · HF 家族播种**：`buildDiscoverySearchTerm` 用 `HUGGINGFACE_LORA_FAMILY_SEARCH_SEEDS`（家族→Hub search 种子；`sd15` 不带空格更准）把盲扫窗口对准供给。
- **Bug 图二 · Civitai 类型分页**：`offsetPaginationSupported` 显式字段（替代"有无搜索词"错误代理）+ 合并窗口正确分页（每页满 12、跨页不重不漏）。

**后台 subagent `a797b447ab1a02b66` 收尾中（两件，同 `huggingface-lora.service.ts` 串行）：**

- **H0 · HF 封面渐进增强**（owner 拍板方案 B）：根因=同步阻塞列表挖 README 致首屏 5–31s（单 README 仅 0.28s，死在批量尾延迟）。改法：列表秒回（封面到社交横幅兜底），客户端 `IntersectionObserver` 懒加载 `getHuggingFaceRepoShowcase().images[0]`，落空卡 骨架→(真图 or 横幅) 无跳变；新端点 `/api/lora-assets/huggingface/showcase`（images 可用、prompts 占位给 H1）。验收点：Anything2Real 卡出真 cosplay 图、纯工具 repo 落横幅、首屏秒回。
- **HF 类型播种**（图五）：`buildDiscoverySearchTerm` 漏了类型维（只播种家族）。追加 `HUGGINGFACE_LORA_CONTENT_TYPE_SEARCH_SEEDS`（已实测：character→character / clothing→outfit / pose→pose / **style→style**(单词比 art style 宽) / concept→concept / scene→background；expression 不播种靠本地兜底）。验收点：风格+全部底模满 12 张。

**检索失败态补重试按钮（owner 2026-07-18 拍板并入本批）**：

- 根因三层：① **dev server 编译 worker 池崩** = 最可能撞到的（`/api/health` 500→全 API 500→检索失败，`touch next.config.ts` 自愈，非产品代码）；② **真产品缺口**：`CivitaiLibraryPane` 错误态是死胡同（只有文字+图标、无重试），而 HF 侧（`HuggingFaceLoraLibrary:374`）本已有 refresh 按钮；③ 类型筛选 meilisearch 独占无 REST 回落（S2「失败大声暴露」取舍，放大可见性）。
- 修复：`CivitaiLibraryPane.tsx` 错误态照 HF 模式补 `Button`→`library.refresh()`（`t('refresh')` 三语现成，无新键）。仅此一处（HF 无需改）。

**✅ 全部验证绿（2026-07-18，Fable 接手核验，非 subagent）**：

- **vitest exit 0：431 files / 3550 tests**（含全部五件修复）。
- **tsc 判绿**：含前四件修复的完整树 tsc exit 0；补第五件（10 行 JSX 重试按钮，lint 0）后六轮 tsc **src/ 全程 0 错误**——非零退出全部来自 dev server 与 `.next/dev/types/routes.d.ts`（Next 生成文件）的写入竞态（见记忆 `reference-tsc-next-routes-race`：判绿标准=src 零错误；该文件不进 commit，生产构建全新生成）。
- claude-in-chrome 实测 HF 风格类型：**12/12 张全加载**（此前 3-4）= 类型播种生效；封面 = 10 仓内真图 + 1 README 图（cdn-uploads，渐进增强懒加载生效）+ 1 社交横幅（唯一兜底，正确）= 封面链生效。
- Civitai 类型分页：owner 截图第2页满 12 张确认。

**⚠ 工作区还混着并发 spinner/loading 线的在制品**（canvas/GenerationPreview/spinner 等无关文件）——提交时**按 LoRA 文件清单精确 staging**，`messages/*.json` 按 hunk 拆（LoRA 键 vs spinner 的 `Common.loading`/`StudioNode.*`）。上次单 commit 用 `git apply --cached` 过滤 hunk 的手法（见本会话）。

---

## 5. 提交计划（等 subagent 完 + 核验 + owner 点头）

**一个 fixes commit** 打包五件：① HF 家族播种 ② Civitai 类型分页 ③ HF 封面渐进增强(H0) ④ HF 类型播种 ⑤ Civitai 检索失败态补重试按钮。精确 staging LoRA 线文件（排除 spinner 线），`messages/*.json` 按 hunk 拆。**owner 未点头前不提交、不 push。**

涉及文件（LoRA 线，供 staging 参考；以 `git status` 实际为准）：`src/services/huggingface-lora.service.ts`(+test) · `src/services/civitai-lora.service.ts`(+test) · `src/constants/lora.ts`(+新 lora.test.ts) · `src/hooks/use-civitai-lora-library.ts`(+test) · `src/hooks/use-huggingface-showcase-cover.ts`(+test，新) · `src/app/api/lora-assets/huggingface/showcase/`(新端点+test) · `src/lib/api-client/lora-assets.ts`(+新 test) · `src/components/business/studio/lora/library/{CivitaiLibraryPane,HuggingFaceLoraLibrary,LoraLibraryCard}.tsx` · `src/types/index.ts`(offsetPaginationSupported + showcase schema) · `src/messages/{en,ja,zh}.json`（LoRA 键 hunk）· `docs/plans/lora-*`。

---

## 6. 待办 backlog（拍板后交 Sonnet；顺序建议）

1. **本批提交**（上面四件，owner 点头后）
2. **§12 控件压缩** + **H1 生成侧 showcase**（可同批）
3. **F1–F4 助手线**（F1 引擎→F2 dock→F3 联动串行，F4 面板并行）
4. **多参考图立项**（先做 3 实证：worker-comfyui 是否含 IPAdapter node / volume 余量 / 权重选型）
5. **task_a473c130**（已 spawn，未修）：库首次加载慢请求期间闪"没有找到匹配"空态——`use-civitai-lora-library.ts` 的 `isLoading = items.length===0 && isRevalidating` 时序缝，根因未挖到底。

---

## 7. 关键约定/纪律（新对话沿用）

- **dev server**：复用 localhost:3000（本会话起的干净实例），绝不另起第二实例（毁 .next）、绝不 taskkill；坏了（无关页面 500 + /api/health 正常=编译 worker 池崩）用 `touch next.config.ts` 自愈重启。preview\_\* 连不上 localhost，UI 实测用 claude-in-chrome。
- **验证闸门**（每片收尾，声称绿之前）：lint + 全量 tsc（后台跑显式捕获 exit code，~4min，禁超时跳过）+ 全量 vitest（`--maxWorkers=4`，~4.5min，禁只跑子集）+ claude-in-chrome 真机 + i18n-check 三语。
- **源码只用 Edit/Write 改**（PowerShell 默认编码毁 UTF-8 中文注释）。
- **Hard Rules**：no magic value（进 constants）/ no any（Zod+z.infer）/ no fetch in components（走 api-client）/ server-only / no Tailwind 任意值（进 @theme）。
- **守 v1 暗房工作台身份**：非房间改版，不引入紫矿釉料房；零新颜料，琥珀仅警示。
- **编排纪律**：多切片改同文件时**串行**（并行互踩同文件/同浏览器/全量测试）；subagent 报告只回本会话，跨会话靠文档交接不靠会话记忆。

---

## 8. 关键锚点速查

- 施工基准：`docs/references/pages/lora-workbench.md`（v1.1 + §11 拍板 + §12 压缩 + §13 showcase）
- 助手施工图：`docs/plans/lora-assistant-nl2tag-2026-07.md`（v1.1）
- 多参考调研：`docs/plans/lora-multi-reference-feasibility-2026-07.md`
- 上游简报：`docs/plans/lora-search-redesign-2026-07.md`
- HF service：`src/services/huggingface-lora.service.ts`（家族/类型播种 `buildDiscoverySearchTerm` ~:942 · 封面链 `resolveCoverImageUrl` ~:281 · README 纯函数 `extractReadmeImageUrls`/`fetchReadmeCoverImageUrl`）
- Civitai service：`src/services/civitai-lora.service.ts`（`listCivitaiLorasByContentType` 合并分页 + `offsetPaginationSupported`）
- 常量：`src/constants/lora.ts`（family/type slug · 种子表 · content types · 封面链常量）
- 生成页助手 kernel：`src/services/kernel/prompt-assistant.service.ts:78`（`mode:'lora'`）
- 记忆：`project-lora-search-redesign`（索引已指向本文）

---

## Last Verified

2026-07-18 · 两个 bug 权威全量核验绿（426/3520）；封面渐进增强+类型播种由 subagent `a797b447ab1a02b66` 收尾中（未验证，新对话须重核）。
