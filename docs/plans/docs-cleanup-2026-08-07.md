# E · 文档清理 —— 执行记录（2026-08-07）

> **状态：✅ 已执行。** owner 已就四条边界拍板（见 §9），本文上半部分是执行前的清单与判定，下面是**实际做了什么**。
> ✅ **已合入 main：`c2729530`**（291 files / +744 / −23916）。

## ⓪ 实际结果

| 动作              | 数                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 删除文件          | **182**（md **73** · svg/png **104** · html/js **5**）                                                                              |
| ├ `docs/archive/` | 整目录 **107 个文件**（md 28 + 图 79）                                                                                              |
| ├ `docs/plans/`   | **39 份 md** + CD 交付目录的 13 个 html/截图/js                                                                                     |
| ├ ui-inspiration  | 整目录 **21 个文件**（md 4 + 图 17）                                                                                                |
| └ references 根   | `novelai-image-generation.md` · `seedance-25-capability.md`                                                                         |
| 修复源码注释      | **约 122 处**（含 19 处**在本轮之前就已经断了**的 `docs/spark/**` / `docs/product/roadmap.md` / `docs/reference/design-system.md`） |
| 修复文档内部指针  | **90+ 处**                                                                                                                          |
| 新增              | `docs/references/loading.md`（三份任务包合一）                                                                                      |
| 闸门              | 全量 `tsc` **exit 0 零输出** · 全量 vitest **466 files / 4196 tests 全绿，exit 0**（`LoraWorkbench` 那条已知超时本轮也没复现）      |

**清理后剩下**：`docs/plans/` 42 份根 md + research 23 份（全留）· `references/` 13 根 + pages 17 + domains 6 · scenes 11 · templates 8 · checklists 4 · 根 6。

**删了什么**：批 1（8 份零引用）· 批 2（17 份 + CD 交付目录）· 批 3（12 份，三份高密度保留）· `docs/archive/` 整目录 · `docs/references/ui-inspiration/` 整目录 · `references/novelai-image-generation.md` · `references/seedance-25-capability.md`。

**没删（我查不实的，一律留）**：`lora-generation-v6-…`（已核实交付，**已删**）以外的所有 🔶待定项 —— `canvas-session-handoff-2026-07-30/31` · `canvas-implementation-stages-2026-07-26` · `canvas-review-grid-2026-08-01`（要先和 07-31 那份合并）· `canvas-shot-frame-fold-2026-07`（`frameImage` 仍活着，10+ 文件在用）· `node-canvas-s5e-cardtypes-design`（画风/道具卡**没实现**，无 `styleCard` node type）· `node-consolidation-2026-06`（9→5 没做完，现仍 12 个 node type）。

**顺带做掉的 J3**：backlog 写「`globals.css:162` 一处」，实际 **7 处 + 3 处裸名**，详见 backlog §J3。

**⚠ 一处误伤已修**：批量降级引用时正则的 `(?:docs/)?` 可选组把 `docs/templates/task-packet.md` 里两处合法的 `` `docs/README.md` `` 也改了，已还原。

---

## 附：执行前的清单与判定（保留备查）

> **性质**：执行前写的清单与逐份判定，**保留备查**。真正做了什么见文首 §⓪。
> **owner 原话**：「文档这边主要是清理，**已经实现的可以直接删除**。只保留工作流，或者工作的规则。甚至工作流这边可能也有过时的地方，**需要你和我一一核对**。」
> **写作规矩**（交接文档 §四）：候选一律标候选，不写「可直接删 / 高置信」；每条附**怎么证伪**。下面每一个「已交付」都是**我的判断**，不是证据本身。

---

## 0 · 现状与本轮结论

| 项                  | 数                                                                          |
| ------------------- | --------------------------------------------------------------------------- |
| `docs/plans/*.md`   | **78**（+ research/ 23 + lora-b-cd-handoff/ 2 + r4a-workflows/ 1 = 104 份） |
| `docs/plans/` 非 md | 112 张实拍 PNG · 12 份 HTML 原型 · 4 份 workflow JSON · 1 SVG               |
| `docs/references/`  | 14 + pages 17 + domains 6 + ui-inspiration 4 = **41**                       |
| `docs/scenes/`      | 11 · `docs/templates/` 8 · `docs/checklists/` 4 · `docs/archive/` 28        |
| 根目录              | README · WORKFLOW · PLAYBOOK · brand-dna · forbidden · status = 6           |

**⛔ 最重要的一条发现：`docs/plans/` 的文档不是孤立的，它们被 `src/` 的代码注释引用了 88 处。**

删一份被代码引用的 plans 文档 = 制造一条悬空注释。**这件事已经发生过一次**：上一轮把 `lora-recipe-workflow.md`、`lora-domain-split-2026-06.md` 移进 `archive/` 时没改注释，现在 `src/constants/lora.ts:64`、`src/types/index.ts:4047`、`src/services/civitai-lora.service.ts`（2 处）、`src/app/[locale]/(main)/studio/layout.tsx:9` 等 **7 处源码注释指向不存在的文件**。

→ 所以下面的删除清单按**连带成本**分三批，不按主题分。

---

## 1 · 判定口径与证据来源

| 判定       | 含义                                        | 我用的证据                                                        |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------- |
| **删候选** | 内容已进代码 + 已沉淀进长期文档，或方向作废 | 文档自述 ✅ / `references/pages/*` 的切片表 / 代码实读            |
| **留**     | 工作流、规则、活的契约、在飞任务包          | 被 `WORKFLOW/scenes/references/CLAUDE.md` 引用，或 owner 明确在用 |
| **待定**   | 我查不实，或需要 owner 拍板                 | 写明我查到哪一步、卡在哪                                          |

**方法论注记（这轮踩到并修正的）**：第一遍统计引用时我 grep 的是 `plans/xxx.md` 这种**带前缀**的写法，漏掉了正文里裸写 `` `canvas-skin-spec-2026-07-26.md` `` 的引用 —— `canvas-skin-spec` 的引用数因此从 12 变成 **38**。这是交接文档 §一.5「过滤条件本身制造盲区」的同一个病，改用裸文件名重算后才对。**owner 如要复核任何一行的引用数，请用裸文件名 grep，别加 `plans/` 前缀。**

---

## 2 · 批 1 · 零连带（全仓零引用，删了不会断任何链接）

> 复核命令：`grep -rn "<文件名>" src docs workers e2e scripts --include='*.ts' --include='*.tsx' --include='*.css' --include='*.md'` → 应只命中它自己。

| #   | 文件                                               | 判定             | 依据                                                                                                     | 怎么证伪（1 分钟内）                                                                              |
| --- | -------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `node-canvas-s1-tokens.md`                         | 已交付           | `references/pages/node-canvas.md:213`「S1 ✅ 2026-07-10」+ §2.2 已回写定值                               | 打开 node-canvas.md §9 切片表，看 S1 行是不是 ✅                                                  |
| 2   | `node-canvas-s2-papercard.md`                      | 已交付           | 同上 `:214`「S2 ✅」+ §2.3 回写 5 支 on-paper 定值                                                       | 同上                                                                                              |
| 3   | `node-canvas-s3-stamps.md`                         | 已交付           | 同上 `:215`「S3 ✅」+ `:113`「8 态全表定稿，`NodeStatusBadge.tsx` 已按此实现」                           | 同上；或 grep `NodeStatusBadge` 看章视觉在不在                                                    |
| 4   | `canvas-design-session-handoff-2026-07-26.md`      | 一次性交接已过期 | 文档自述「给下一个设计会话读的」；那一轮设计会话 07-27 就结束了（`canvas-implementation-stages` 已接手） | 通读 68 行，看有没有**至今仍未执行**的结论                                                        |
| 5   | `lora-b-implementation-task-packet-2026-07.md`     | 已交付           | `src/app/lora.css` 存在且是冷瓷灰白；memory `project-lora-visual-redesign` 记 owner 选 B 装配台已落地    | 真机开 `/studio/lora`，看是不是三栏装配台 + 冷瓷浅色                                              |
| 6   | `homepage-media-production-2026-07-27.md`          | 已交付           | `public/homepage/` 已有 arena / imageEditing 等真实素材目录 + 文档自述「已完成母素材」                   | 真机开首页，看还有没有重复占位图                                                                  |
| 7   | `canvas-request-mapping-2026-07.md`                | 一次性对账已过期 | 07-16 的「owner 诉求 × 现有计划」映射表；画布 07-26 已 fresh start，映射的三份计划全部换代               | 通读 69 行，看映射到的计划名今天还在不在                                                          |
| 8   | `lora-generation-v6-base-only-advanced-upscale.md` | **待定**         | 未验。纯底模生成 + 高级参数 + 4x-AnimeSharp 后处理，**我没实测这三样今天在不在**                         | 真机 `/studio/lora?section=generate`：不挂 LoRA 能不能出图、有没有 seed/steps/CFG、有没有放大开关 |

⚠ **第 8 条我故意没给判定** —— 它是唯一一份零引用但我查不实的。别因为它在「零连带」这批就一起删。

---

## 3 · 批 2 · 只需改文档引用（不碰 `src/`）

| #   | 文件                                                     | 判定             | 依据                                                                                                                                                | 连带要改                                | 怎么证伪                                            |
| --- | -------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| 9   | `canvas-image-card-design-2026-07-27.md`                 | 已沉淀           | **文档自己写的**：「✅ 本轮已收口 / **施工基准已迁至 `references/pages/canvas-image-card.md`** / 本文只留设计推理与被否掉的选项」                   | `pages/canvas-image-card.md:3`          | 读那份 pages 文档，看施工基准是否完整               |
| 10  | `node-canvas-s4-chrome.md`                               | 已交付           | `pages/node-canvas.md:216`「S4 ✅」+ `:90/:92/:129` 三处回写实现值                                                                                  | `node-canvas.md:216` 的「任务包 …」括号 | 看 §9 S4 行                                         |
| 11  | `node-canvas-s5a-castdock.md`                            | 已交付           | 同上 `:217`「S5a ✅」                                                                                                                               | `node-canvas.md:217`                    | 同上                                                |
| 12  | `node-canvas-s5b-ingest.md`                              | 已交付（B0+B1）  | 同上 `:218`「S5b B0+B1 ✅」；B2 在 `:222` S5f-B 里补完                                                                                              | `node-canvas.md:218`                    | 同上                                                |
| 13  | `node-canvas-s5c-dossier.md`                             | 已交付           | 同上 `:219`「S5c ✅」+ §9a/§9c 偏差回写                                                                                                             | `node-canvas.md:219`                    | 同上                                                |
| 14  | `node-canvas-s5d-model-align.md`                         | 已交付           | 同上 `:220`「S5d ✅ 2026-07-11」六条对齐 + §6.0 回写                                                                                                | `node-canvas.md:220`                    | 同上                                                |
| 15  | `node-canvas-s5f-gestures.md`                            | 已交付           | 同上 `:221/:222`「S5f-A ✅ / S5f-B ✅」                                                                                                             | `node-canvas.md:221-222`                | 同上                                                |
| 16  | `canvas-cd-driving-protocol-2026-07-25.md`               | 方向已停用       | `canvas-implementation-stages-2026-07-26.md` 开头：owner 2026-07-26 拍板「**停止 Claude Design 迭代**」                                             | 9 处 plans 内引用                       | 看 stages 那份的状态行                              |
| 17  | `canvas-cd-round2-prompt-2026-07-26.md`                  | 一次性粘贴稿     | 同上；它是喂给 CD 的第二轮 prompt，CD 已停                                                                                                          | 2 处 plans 内引用                       | 同上                                                |
| 18  | `canvas-redesign-cd-brief-2026-07-25.md`                 | 一次性 CD 简报   | 同上                                                                                                                                                | 10 处 plans 内引用                      | 同上                                                |
| 19  | `lora-generate-claude-design-brief-2026-07.md`           | **方向已被推翻** | `lora-b-assembly-console-…-2026-07.md` 开头明写：「⚠ 旧线作废：`lora-generate-claude-design-brief-2026-07.md`「中性深炭」**为被推翻的现状证据**」   | 3 处 plans 内引用                       | 真机看 LoRA 是深炭还是冷瓷灰白（memory 记的是冷瓷） |
| 20  | `lora-b-assembly-console-claude-design-brief-2026-07.md` | 已交付           | 同 #5，B 装配台已落地                                                                                                                               | 1 处                                    | 真机 `/studio/lora`                                 |
| 21  | `canvas-detail-panel-redesign-brief-2026-08-03.md`       | 已被下游取代     | 它是「阶段 0–1 交接书」，下游 `canvas-detail-panel-structure-ledger-2026-08-03.md`（阶段 3，590 行）已含结论并被 `pages/canvas-node-detail.md` 引用 | 2 处                                    | 对比两份，看交接书有没有账本没有的东西              |
| 22  | `canvas-node-detail-redesign-2026-07.md`                 | 已被取代         | `status.md:17`「方向 E 只保留为历史基线」；现行结构在 `pages/canvas-node-detail.md`                                                                 | 3 处                                    | 读 status.md 那一行                                 |
| 23  | `canvas-redesign-current-state-2026-07-25.md`            | 现状快照已过期   | 它记的是 07-25 的画布现状；此后 fresh start + 令牌反转 + 详情面板重做，`canvas-ui-inventory-2026-08-01.md` 是新快照                                 | 6 处                                    | 对比两份的组件数与皮肤描述                          |
| 24  | `canvas-node-interaction-map-2026-07.md`                 | 逐条确认已完成   | 文档形态是「owner 逐条 ✅/✍️/❓」的确认表，确认结果已进 `canvas-relationship-v3` 与 `node-canvas.md` §6.0                                           | 2 处                                    | 看文中还有没有空着的「owner 答」                    |
| 25  | `comfy-runner-deployment-research-2026-07.md`            | 调研已被落地取代 | 自述「调研完成，待 owner 拍板路线」；路线已定并部署（v1 端点 `01g8rrmixe4hah` 见 HANDOFF），v2/v3/v4 都已上线                                       | 1 处 + archive 2 处                     | 看 HANDOFF §2 有没有已部署的端点号                  |
| 26  | `canvas-session-handoff-2026-07-30.md`                   | **待定**         | `status.md:67` 仍在引用它（「稳定方向与未决问题见…」）→ 里面可能还有活的未决项                                                                      | `status.md:67`                          | 读它的「未决」段，逐条对今天的代码                  |
| 27  | `canvas-session-handoff-2026-07-31.md`                   | **待定**         | 同类交接文档，包 3/4/4.5 已交付（memory `project-canvas-handoff-2026-07-31`），但「三教训」段是方法论                                               | 1 处                                    | 同上                                                |

---

## 4 · 批 3 · 要动 `src/` 注释（88 处，先定策略再动手）

这些文档**已交付**，但源码注释把它们当依据引用了。删之前必须先回答一个问题：**注释里那句依据搬去哪。**

| 文件                                             | src 引用数 | 主要落点                                                                                | 我的建议                                        |
| ------------------------------------------------ | ---------: | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `lora-search-image-audit-2026-07.md`             |     **18** | `civitai-lora.service.ts`(6) · `types/index.ts` · `use-civitai-lora-library.ts` 等      | **不删** —— 引用密度太高，改为沉淀进 references |
| `comfy-runner-HANDOFF-2026-07.md`                |     **14** | `constants/config.ts` · `feature-flags.ts` · `providers.ts` · `lora.ts` 等              | **不删**（memory 也写「动 runner 前读全文」）   |
| `lora-assistant-nl2tag-2026-07.md`               |     **13** | `prompt-assistant.service.ts` · `prompt-tag-normalize.ts` · 4 个组件                    | **不删**，同上                                  |
| `canvas-assistant-anthropic-route-2026-07-26.md` |          6 | `llm-capability.ts` · `providers.ts` · 2 个测试                                         | 删 + 注释改指 `references/providers.md`         |
| `comfy-runner-v2-runtime-lora.md`                |          5 | `submit-image.service.ts` · `civitai-lora-to-r2.service.ts` · `types/index.ts`          | 删 + 注释改指 HANDOFF                           |
| `comfy-runner-v3-checkpoint-ondemand.md`         |          5 | `prepare-runner-checkpoint.service.ts` · `runner-checkpoint-fidelity.ts`                | 删 + 注释改指 HANDOFF                           |
| `node-video-reference-seedance-design.md`        |          5 | `node-video-prompt-translation.ts`(3) · `use-video-composer.ts`                         | 删 + 注释改指 `pages/canvas-video-card.md`      |
| `loading-language-2026-07.md`                    |          5 | `spinner.tsx` · `generation-progress.ts` · `StudioGeneratingProgress.tsx` · 2 CSS       | 三份合一（见 #下方）                            |
| `assistant-ux-batch-2026-07.md`                  |          5 | `StudioAssistantDock.tsx`(2) · `StudioEnhanceButton.tsx` · `ImagePickerPopoverBody.tsx` | 删 + 注释改指 `pages/assistant-shell.md`        |
| `node-video-v1-token-translation.md`             |          3 | `node-video-prompt-translation.ts` · `node-studio.ts`                                   | 删（与上面 seedance-design 合并）               |
| `node-video-v2v3-master-panel.md`                |          2 | `node-workflow-graph.ts` · `types/node-workflow.ts`                                     | 同上                                            |
| `canvas-node-token-inversion-2026-07-27.md`      |          2 | `canvas.css:12` · `canvas.css:3439`                                                     | 删 + 注释改指 `canvas-skin-spec`                |
| `spinner-unify-2026-07.md`                       |          1 | `spinner.tsx:13`                                                                        | 三份合一                                        |
| `generating-progress-2026-07.md`                 |          1 | `generation-progress.ts:6`                                                              | 三份合一                                        |
| `comfy-runner-v4-anima-dit.md`                   |          1 | `runner-checkpoint-fidelity.ts` 一线                                                    | 删 + 注释改指 HANDOFF                           |
| `canvas-implementation-stages-2026-07-26.md`     |          1 | `canvas.css:487`                                                                        | **待定**（分段计划是否跑完我没核实）            |
| `canvas-review-grid-2026-08-01.md`               |          1 | 见 §6.2 —— 两份同题文档要先合并                                                         | 先合并再说                                      |

**「三份合一」指**：`spinner-unify` + `generating-progress` + `loading-language` 是同一件事的工程/算法/视觉三份，全部已交付（`src/components/ui/spinner.tsx` 存在、`constants/generation-progress.ts` 存在）。建议合成一份 `references/` 里的加载态契约，7 处注释统一改指它。

---

## 5 · 留（工作流 / 规则 / 活契约 / 在飞）

### 5.1 根目录 6 份 + scenes 11 + checklists 4 + templates 8 —— 全留

这是 owner 说的「工作流 / 工作规则」本体。**但第 ③ 步要和 owner 一一核对过时处**，我查出的疑点见 §6。

### 5.2 `docs/references/` 41 份 —— 建议全留（**需 owner 确认，见 §7 问题 1**）

它们是设计治理流程的落点（`scenes/ui-page.md` 的硬门：「写 `references/pages/<页>.md` → 才改代码」）。按字面「已实现的直接删」它们全该删，但删掉等于拆掉治理流程的落点。

### 5.3 `docs/plans/` 里必须留的

| 文件                                                 | 为什么                                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas-skin-spec-2026-07-26.md`                     | **全仓引用最多的 plans 文档（38 处，含 `canvas.css` 6 处）**。它是画布数值的唯一来源 —— 建议**升格进 `references/`**，它不该住在「完成即删」的目录里 |
| `canvas-master-2026-07-26.md`                        | 画布入口文档（memory 明写「入口 = 它」）                                                                                                             |
| `canvas-ui-inventory-2026-08-01.md`                  | 活的修缮工作面（59 编号 + 91 实拍图，批 1 待审）                                                                                                     |
| `canvas-detail-panel-structure-ledger-2026-08-03.md` | 七槽契约，`pages/canvas-node-detail.md` 引用                                                                                                         |
| `canvas-pipeline-gap-2026-07-31.md`                  | 取代了 assistant-pipeline §0 的现状依据；plans 内被引 19 次                                                                                          |
| `canvas-relationship-v3-2026-07.md`                  | 边语义仍被 `node-edge-tier.ts` / `node-video-merge-compose.ts` 引用 + live 8 处                                                                      |
| `research-landing-plan-2026-07-30.md`                | `status.md` 的主链索引                                                                                                                               |
| `audio-domain-design-2026-07.md`                     | 音频域基准，`WORKFLOW.md:57` 引用                                                                                                                    |
| `comfy-runner-HANDOFF-2026-07.md`                    | `WORKFLOW.md:58` + `backend.md:57` + `providers.md:15` + 14 处代码                                                                                   |
| `lora-ui-refactor-claude-handoff-2026-07.md`         | LoRA 实现契约，3 份 pages 文档引用                                                                                                                   |
| `lora-visual-redesign-2026-07.md`                    | LoRA 视觉逐项确认记录，`scenes/ui-page.md:89` 引用                                                                                                   |
| `homepage-motion-design-2026-07-27.md`               | G 条的基准（§9）                                                                                                                                     |
| `design-token-minimal-unification-2026-07.md`        | token 治理基准                                                                                                                                       |
| `canvas-baseline.md`                                 | `WORKFLOW.md:55` + `frontend.md:92` + `studio.md:8` 引用 —— **但它是 2026-06-15 的草案，见 §6.1**                                                    |
| `unified-ai-assistant-2026-08.md`                    | 08-06 在飞                                                                                                                                           |
| week 三件套 + `libtv-canvas-ui-teardown`             | 本周在飞                                                                                                                                             |

---

## 6 · 顺带查出的问题（不在 E 的原始范围，但都是「文档骗人」）

### 6.1 ⚠ `docs/design/` 整个目录不存在，却被 **7 处源码注释**引用

backlog §J3 写的是「`globals.css:162` 一处」——**实际是 7 处**：

| 位置                                                                   | 引用的小节              | 建议改指                                             |
| ---------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------- |
| `src/app/globals.css:162`                                              | §动效 canon             | `src/constants/motion.ts`                            |
| `src/constants/motion.ts:2`                                            | §动效 canon             | 自指改成「与 `globals.css` 同步」                    |
| `src/hooks/use-mobile.ts:5`                                            | C4 决议                 | `docs/references/frontend.md:55`（同一条 1024 决议） |
| `src/components/ui/responsive-dialog.tsx:33`                           | 移动端一等公民          | `docs/references/frontend.md:97`                     |
| `src/components/ui/responsive-popover.tsx:22`                          | §Studio 工具栏规则      | `docs/references/frontend.md` §覆层行为矩阵          |
| `src/components/business/studio-shared/primitives/tool-surface.tsx:96` | §Studio 工具栏规则      | 同上                                                 |
| `src/components/business/AssetSelectorDialog.tsx:54`                   | + §system/components.md | 同上                                                 |

内容仍在 `docs/archive/design/direction.md`（120 行，动效 canon / 移动端一等公民 / C4 都在）。但 `docs/README.md` 写着「archive 不进默认阅读路径」，所以**建议改指现行落点而不是指向 archive**。

### 6.2 ⚠ 包 6「审阅网格」有**两份同题账本**，且日期命名与新旧相反

| 文件                               | 行数 | 最后提交   | 内容                                                      |
| ---------------------------------- | ---: | ---------- | --------------------------------------------------------- |
| `canvas-review-grid-2026-07-31.md` |  133 | 2026-08-05 | Q1–Q6 + 阶段 5 三方向 + **✅ 选向 B（owner 2026-08-01）** |
| `canvas-review-grid-2026-08-01.md` |  416 | 2026-08-02 | 阶段 0–4 + ①–⑥，其中 ①②⑥ 仍「🔶 待 owner 确认」           |

**名字叫 07-31 的那份反而更新**，且它说方向已选，另一份说还在待确认。两份都没写「我取代谁」。→ 建议合并成一份，但**哪些结论算数需要 owner 拍**。

### 6.3 ~~`docs/reference/`（单数）与 `docs/references/`（复数）并存~~ ✅ 已合并（owner 2026-08-08 定「可以进」）

`docs/reference/api/model-doc-monitor.snapshot.json` → `docs/references/api/`，`package.json` 两行脚本路径同步改，单数目录已删。快照仍可被 `JSON.parse` 读出（顶层 `generatedAt` / `sourceFile` / `models` / `pages` / `apis`），CI 的 `model-doc-monitor.yml:35` 走的是 `npm run models:check-docs`，不另带路径。

### 6.4 ~~`docs/` 根目录 39 张图~~ ✅ 已修（owner 2026-08-08 定「图片那边修复」）

⚠ **先更正我自己**：本文原先写「39 张图一张都没进 git」——**错的**。那次 `git ls-files docs/` 是在 shell 已经 `cd docs` 之后跑的，路径变成 `docs/docs/` 所以零命中。**39 张一直都在 git 里。**（本轮第五次栽在同一类事上：命令的隐含前提没核。）

**真正的问题是语法不是文件**：`references/project-map.md` 用 `![[…]]` 内嵌了 36 张 —— 那是 Obsidian 专有的 wiki-embed，**GitHub 和任何标准 markdown 渲染器都不认**。图在仓库里躺着，但除了 owner 的 Obsidian 谁都看不见。

**修法**：36 张按所属小节重命名（`homepage-01..09` · `canvas-01..11` · `lora-01..13` · `voice-01..03`）`git mv` 进 `docs/references/assets/project-map/`；`![[…]]` 全改标准相对路径 `![](assets/project-map/x.png)`（Obsidian 与 GitHub 都认）。36 处链接逐条校验可解析。另删 3 张任何文档都没引用的（`Pasted image 20260724142153/142556/142604.png`）。

**顺带立规矩**：`docs/README.md` 文档原则新增第 6 条——图放引用方旁边的 `assets/<文档名>/`、用标准 markdown、禁用 `![[…]]`。`project-map.md` 抬头也写了一句，免得下次粘贴又散到根目录。

### 6.5 其它悬空引用

- `docs/references/pages/homepage.md` ← `homepage-motion-design-2026-07-27.md` 引用（实际文件叫 `home.md`）
- `docs/engineering/agent-loops.md` ← `templates/task-packet.md` 引用（目录不存在）
- `docs/domains/gallery.md` ← `references/domains/gallery.md` 自引旧路径
- `plans/comfy-runner-recipe-clone.md` / `plans/comfy-runner-runpod-deploy-2026-07.md` ← `comfy-runner-HANDOFF-2026-07.md` 引用（前者已在 archive，后者全仓不存在）
- 7 处指向 archive 的 src 注释（`lora-recipe-workflow.md` 3 处 · `lora-domain-split-2026-06.md` 4 处）

---

## 7 · 需要 owner 拍板的三个边界

1. **`docs/references/` 41 份要不要动？** 它们记录的都是「已实现」的页面契约。我的建议是**留**（它们是设计治理流程的落点），但这条与「已实现的直接删」字面冲突，需要 owner 划线。
2. **`docs/plans/research/` 23 份调研要不要留？** 既不是工作流也不是规则，但 `research-landing-plan` 说主链 7/10 已交付、还有 3 包没做，删了会丢掉未落地那部分的依据。
3. **`docs/archive/` 28 份 + 34 张 SVG 要不要一起删？** owner 说的是「删，不是归档」——那既有的 archive/ 目录本身是不是也该清掉？

---

## 8 · 第 ③ 步（工作流一一核对）

**我已经改掉的（都是可验证的事实性错误，不需要拍板）**：

| 文件                            | 改了什么                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `docs/README.md` 结构块         | `archive/` 那一行删掉（目录已不存在）；plans/ 那行改成「**完成即删**」并指向本文            |
| `docs/README.md` 文档原则 3     | 「完成即删、归档或沉淀」→「**完成即删，不归档**；删前必须 grep 全仓含 `src/` 注释改掉引用」 |
| `docs/README.md` UI 文档段      | 删掉「`archive/` 和 `ui-inspiration/` 只作证据」那句，改成两目录已删、证据从 git 历史取     |
| `docs/status.md` 最后更新       | 2026-08-05 → 2026-08-07                                                                     |
| `docs/status.md` Current Focus  | 顶部补「本周十条」进度（H/C4/J4/K/L/M/E 已完成、五条未开工）—— 此前一个字都没写             |
| `docs/status.md` 未提交改动那条 | 「本地另有未提交改动（MiniMax adapter…）」**已不成立**（`git status` 里没有），就地标作废   |
| `docs/WORKFLOW.md` 路由矩阵     | Comfy runner 行去掉已删的 `deployment-research`；UI 治理那句的 `direction.md` 标注已删      |
| `docs/references/README.md`     | 删 seedance / ui-inspiration 两行，补 `loading.md` 一行，「历史证据」段改写                 |
| `docs/templates/task-packet.md` | 删掉指向不存在的 `docs/engineering/agent-loops.md` 那条                                     |
| `docs/brand-dna.md` §历史方向   | 4 条 archive 链接删掉，改成「原始证据已删，从 git 历史取」                                  |

**仍需 owner 过目、我没动的三条**：

1. **`CLAUDE.md` 的 Skill Routing 表** —— 2026-07-26 核过一次（当时删掉 7 个空指针）。本轮**没有复核**，不知道现在还有没有指向未安装 skill 的行。要核的话我可以逐个对 `.claude/skills/`。
2. ~~包 6 两份同题账本~~ → ✅ **owner 2026-08-08 定「一起废弃」**，两份都已删除。唯一保留的审阅视图文档 = `references/pages/canvas-review-view.md`，已在文首写明两份过程账本为何被废（同题、互相矛盾、都没写谁取代谁）。
3. ~~`docs/reference/` 单复数并存~~ → ✅ 已合并，见 §6.3。

## 9 · owner 2026-08-07 的四条拍板

| #   | 问题                     | 拍板                                                | 影响                                                     |
| --- | ------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| 1   | `docs/references/` 41 份 | **留 pages(17) + domains(6)，其余 18 份进删除评估** | 见 §10                                                   |
| 2   | `docs/plans/research/`   | **整个 research/ 全留**（23 份）                    | §7 问题 2 结案，不再评估                                 |
| 3   | `docs/archive/`          | **一起删**（28 md + 34 SVG + 1 PNG）                | 连带 18 处文档指针 + 7 处 src 注释 + 若干 memory，见 §11 |
| 4   | 批 3 策略                | **删高密度三份以外的 14 份，注释改指 references**   | ⚠ 与拍板 1 冲突，见下                                    |

### ⚠ 拍板 1 与拍板 4 冲突

批 3 的注释改指目标里，`references/frontend.md` 与 `references/providers.md` 正好落在拍板 1 的「其余 18 份」里。同理 §6.1 的 J3 修复（7 处悬空注释）也要指向 `frontend.md`。
**这两份如果删，批 3 和 J3 就没有落点。** 需要在 §10 结论上再确认一次。

---

## 10 · `docs/references/` 那 18 份的逐份判定

> 引用数说明：`README.md` / `cicd.md` 这类短名或常见名的 grep 会被子串和同名文件污染，下表只在名字够独特时给数。

### 10.1 我判定为「工作规则」的 7 份 —— 建议留

| 文件             | 为什么它是规则不是记录                                                                | CLAUDE.md 直接指向 |
| ---------------- | ------------------------------------------------------------------------------------- | :----------------: |
| `providers.md`   | 「**慢改原则**：endpoint / model id / payload / 鉴权 / 轮询任何一项要改先核官方文档」 |         ✅         |
| `backend.md`     | 分层契约（谁能碰什么）+ resilience 工具清单                                           |         ✅         |
| `testing.md`     | 测试命令与闸门表                                                                      |         ✅         |
| `cicd.md`        | gh CLI + Vercel MCP 操作手册（按现状写，owner 2026-07-10 拍板不引入新 CI）            |         ✅         |
| `frontend.md`    | 共享组件行为契约 + 覆层行为矩阵 + 断点 1024（**J3 与批 3 的改指目标**）               |         —          |
| `database.md`    | 「只有 services 层能碰 Prisma」+ 迁移纪律                                             |         —          |
| `interaction.md` | 全局交互与动效脊柱，自标「**现行规则（2026-07-30）**」                                |         —          |

→ 这 7 份删掉的话，`CLAUDE.md` 会有 4 条指针立刻断掉，`scenes/` 的路由矩阵也会指空。

### 10.2 我判定为「已实现的记录 / 一次性调研」的 5 份 —— 删候选

| 文件                           | 判定                 | 依据                                                                                        | 怎么证伪                              |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `novelai-image-generation.md`  | 一次性外部调研       | **全仓 0 引用**。结论「NovelAI 闭源侧不吃用户 LoRA」已进 memory                             | grep 文件名，应只命中自己             |
| `seedance-25-capability.md`    | 能力事实已被目录接管 | 全仓 2 处引用；它自己写「接入通道状态是 `model-catalog.md` 的地盘」                         | 看 `model-catalog.md` §⑥§⑨ 有没有覆盖 |
| `project-map.md`               | **待定**             | owner 亲手画的项目逻辑图（memory：「owner 先写我补充」）。**这是 owner 的东西，我不该判它** | —                                     |
| `model-pricing.md`             | **待定**             | 用途写着「日后放上 homepage 的备料」→ 未来还要用；且当前有未提交改动（只是表格对齐）        | 看 homepage 备料这条还算不算数        |
| `README.md`（references 索引） | 跟随                 | 它是 references/ 的导航；留几份就改成几份                                                   | —                                     |

⚠ `model-pricing.md` 与 `model-catalog.md` 都被 `src/constants/` 引用（`enum.ts:44` · `video.ts:289,328` · `models.ts:134` · `providers.ts:20`），删了同样要改注释。

### 10.3 `model-catalog.md` —— 建议留

CLAUDE.md 与 memory 都写着「每月初审」，它是**活的流程产物**，不是已实现记录。

### 10.4 `ui-inspiration/` 4 份 —— 建议随 archive 一起删

`docs/README.md:27` 把它和 archive 归成同一类：「`archive/` 和 `references/ui-inspiration/` 只作**证据**，不得成为新页面的造型规范」。既然 archive 要删，同性质的证据目录一起删口径才一致。
⚠ 唯一犹豫：`haivis-canvas-2026-07.md` 自标「**owner 已确认的画布对标输入**」，且被引 75 处（多在 plans 内）。

### 10.5 `domains/assets.md`（拍板 1 说 domains 留）

登记一个事实：它是 6 份 domains 里**唯一全仓 0 引用**的。留可以，但它自己第 3 行指向的 `archive/reviews/2026-07-05-assets-optimization-directions.md` 会随 archive 一起消失。

---

## 11 · 删 `docs/archive/` 的连带清单（25 处指针）

**必须在删之前改掉，否则又制造一批悬空引用（这正是上一轮归档时犯的错）。**

### 11.1 活文档里指向 archive 的 18 处

| 位置                                                | 指向                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `docs/brand-dna.md:129-132`                         | direction / worknotes / font-handwriting / governance-reset |
| `docs/references/product.md:54`                     | `archive/product/mainline.md`（product.md 自称沉淀自它）    |
| `docs/references/domains/studio.md:25-27`           | studio-empty-state / assistant-dock / direction             |
| `docs/references/domains/assets.md:3,28`            | assets-optimization-directions                              |
| `docs/references/project-map.md:80`                 | 2026-07-02-lora-domain-ui-review                            |
| `docs/references/pages/lora-workbench.md:395`       | 同上                                                        |
| `docs/references/ui-inspiration/haivis-landing:219` | design-direction-worknotes                                  |
| `docs/plans/canvas-baseline.md:6,13,14,187,241,266` | direction / execution-roadmap / canvas-drafts               |
| `docs/plans/lora-visual-redesign-2026-07.md:71,161` | lora-generate-bench-redesign                                |
| `docs/plans/lora-ui-refactor-claude-handoff:44,45`  | lora-generate-bench-redesign / claude-draft                 |
| `docs/plans/lora-recipe-runner-v5.md:25`            | 2026-07-02-lora-domain-ui-review                            |
| `docs/plans/canvas-relationship-v3-2026-07.md:175`  | 2026-07-04-node-video-detail-v4                             |

### 11.2 src 注释里指向已归档 plans 的 7 处（**现在就已经是断的**）

`src/constants/lora.ts:64` · `src/types/index.ts:4047` · `src/services/civitai-lora.service.ts:313,2506` → `lora-recipe-workflow.md`
`src/app/[locale]/(main)/studio/layout.tsx:9` · `src/components/business/StudioToolbar.tsx:26` · `src/constants/lora-base-models.ts:7` · `src/hooks/use-active-lora-stack.tsx:134` → `lora-domain-split-2026-06.md`

### 11.3 memory 指针

`~/.claude/.../memory/` 里至少 10 条 memory 指向 archive 的文件（`2026-07-04-node-video-detail-v4` · `2026-07-02-lora-domain-ui-review` · `execution-roadmap-2026-06` · `lora-recipe-workflow` · `font-handwriting-foundation-2026-07` · `2026-07-07-studio-assistant-dock-redesign` · `2026-07-05-video-shot-cast-redesign` · `studio-dock-redesign` · `audio-domain-direction-2026-07` · `model-slimdown-2026-06`）。删 archive 之后要同批更新 memory，否则下个会话按 memory 去读会扑空。

---

## 11.5 · ⚠ 两个仓库级问题（本轮顺手修了）

### `claude.md` 在 git 里是**小写**的

`git ls-tree HEAD` 的权威口径是 `claude.md`，工作区里是 `CLAUDE.md` —— Windows 大小写不敏感所以一直没暴露。**在大小写敏感的文件系统上（Linux CI、云端 Claude Code 会话、case-sensitive 卷）clone 出来就是 `claude.md`，而 Claude Code 找的是 `CLAUDE.md` —— 整份项目指令会静默加载不到。** 已 `git mv -f` 改回大写。

### `Usersn20.claudeplans/` 是误提交的垃圾路径

`Usersn20.claudeplans/vast-skipping-biscuit-agent-a2e6715b298910553.md`，内容只有一个 `test`。是 `C:\Users\n20\.claude\plans\…` 这条 Windows 路径被吃掉反斜杠后当成目录名提交的（来自 `5b263fa5`）。已删。

---

## 12 · 额外发现（不在 E 范围，登记）

1. **`.claude/worktrees/` 下有 5 个残留 worktree**（`bold-rubin-eda34a` / `festive-varahamihira-d39e9b` / `stoic-hofstadter-12c3e8` / `zealous-noyce-879b92` / `zen-franklin-9cd1ad`），每个都带一整份 docs 拷贝 —— 全仓 grep 的结果被它们放大了 5–6 倍。清理它们能让以后所有 grep 干净很多。
2. **`ds-bundle/guidelines/docs/brand-dna.md`** 是 `docs/brand-dna.md` 的另一份拷贝（design-sync 产物）。同一个事实两个家。
3. **仓库根还有一批可疑件**（`override.txt` · `output/` · `scratchpad/` · `requirements.compiled` · `.sentrux` · `.sfdx` · `TODOS.md`）—— 没查，不在 E 的范围内，登记备查。

---

## Last Verified

- 2026-08-07 · 方法：`git ls-files` 全量列举 + 裸文件名 grep 统计引用（`src` / `workers` / `e2e` / `scripts` / `docs` 全覆盖）+ 逐份读头 6 行状态 + 对 `references/pages/node-canvas.md` §9 切片表逐行核 S1–S5f + 实读 `src/constants/node-types.ts` 核 `frameImage` 是否退役（**没有退役**，10+ 文件仍在用 —— 所以 `canvas-shot-frame-fold-2026-07.md` 没进删除清单）。
- **未做**：真机验证。批 1 的 #5 #6、批 3 的多数「已交付」判定只有代码/文档证据，没有真机证据。
- ⚠ **本轮 grep 口径踩了三次同一个坑**（交接文档 §一.5「过滤条件制造盲区」）：①带 `plans/` 前缀漏掉裸文件名引用；②`{5,}` 长度下限漏掉 `cicd.md` / `home.md` 这类短名；③`-F` 子串匹配让 `canvas.md` 吃进 `node-canvas.md`。**复核任何一行引用数时请用路径限定的精确 grep。**

---

## 闸门记录（2026-08-07）

- 全量 `npx tsc --noEmit` → **exit 0，零输出**。
- 全量 `npx vitest run` → **466 files / 4196 tests passed，exit 0**。⚠ owner 的 dev server 当时在 3000 上跑着，按 [[project-known-vitest-failures-2026-07-31]] 本该出 `LoraWorkbench` 满负载假超时，**本轮没有复现**。
- **未跑**：production build（dev 在跑，按仓库规则不并行）· Playwright 视觉基线（本轮零 UI 改动，全部是注释与文档）。
- **已提交**：`c2729530`。pre-commit 钩子通过（prettier 顺带重排了 `loading.md` 的表格）。
- ⚠ **三个文件故意没并进这次提交**：`plans/runner-r4-krea2-multiref-2026-07.md` 与新增的 `plans/seedance-25-ga-integration-2026-08.md` 来自**并行会话**（2026-08 模型月审）；`references/model-pricing.md` 是本会话开始前就在工作区的表格对齐改动。
