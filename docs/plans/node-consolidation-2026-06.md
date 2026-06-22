# 画布节点收敛 + 加节点菜单重设计任务包（2026-06-21）

> 来源：LibTV / Krea / Updream 画布竞品实测后的收敛决策。竞品调研见对话记录；
> 节点设计实测结论（LibTV = React Flow + 单进单出 + 统一 350² 方卡 + 标题外移 +
> 节点级空态引导 + 导演台启动器节点）已并入下文。

## 0. 已确认决策（owner 拍板）

1. **端口给一套低饱和语义色**（不学 LibTV 的 hover 才显，常驻可见但克制）。
2. **节点收敛**：可添加节点从 **9 → 5**，按「模态」拆，不按「角色」拆。
   - 路径：**先做第 1 步打底 → 目标态是第 2 步**。
3. **节点级空态引导**：合并后的「图片 / 视频」节点用空态按钮承担 role / 上传选择。
4. **导演台（3D 摆位启动器节点）放最后做**，本任务包不含。
5. 加节点菜单（`CanvasAddMenu`）随收敛一起重设计，它只是节点集的「出口」。

## 1. 现状真相（ground truth，已读码核对）

可添加节点 **9 个**（`composer`/`agent` 已退役、不在菜单，仅为旧档迁移保留类型）：

| 节点 type         | 模态  | services 是否区分 | ScriptDoc 投影是否用           | 诊断                                    |
| ----------------- | ----- | ----------------- | ------------------------------ | --------------------------------------- |
| `shotText`        | text  | —                 | ✅                             | 保留 → 文本                             |
| `characterImage`  | image | ❌                | ✅（含 voice 输入 + 音色绑定） | 真有独立行为，合并后映射 role=character |
| `backgroundImage` | image | ❌                | ❌（手动孤儿）                 | 合并 → role=background                  |
| `frameImage`      | image | ❌                | ❌（手动孤儿）                 | 与 shot 重复                            |
| `shot`            | image | ❌                | ❌（手动孤儿）                 | 与 frameImage 重复                      |
| `voice`           | audio | —                 | ✅（对白）                     | 保留 → 音色                             |
| `seedance`        | video | —                 | ✅（聚合器）                   | 保留 → 视频                             |
| `videoReference`  | video | —                 | ❌                             | 只上传不生成 → 折进视频节点上传态       |
| `videoMerge`      | video | —                 | ❌                             | 保留 → 视频合成                         |

**三个过度拆分的硬证据：**

- 4 个图片节点在 `src/services/**` 零命中（生成逻辑同一套，差异只在 fields / 投影 / 聚合）。
- `shot` 与 `frameImage` 字段几乎相同（camera/composition/prompt，只差 action / frameIntent）。
- `backgroundImage`/`frameImage`/`shot` 不在 `projectScriptDocToGraph`（投影只造 characterImage + shotText + seedance + 对白 voice），是自动主线之外的手动孤儿。

**关键文件：**

- `src/constants/node-types.ts` — `NODE_TYPE_IDS` / `NODE_TYPES` / `NODE_*_NODE_TYPES` / `NODE_WORKFLOW_FIELDS_BY_NODE_TYPE` / `NODE_MEDIA_KIND_BY_NODE_TYPE`
- `src/lib/node-connection-rules.ts` — `NODE_CONNECTION_RULES` / `canConnectNodeTypes`（单输入口，(source→target) 级校验）
- `src/lib/node-workflow-script-doc.ts` — `projectScriptDocToGraph`（用 characterImage/shotText/seedance）
- `src/lib/node-workflow-migrate-planner.ts` — **退役迁移范本**，step 2 的图片迁移照抄这个模式
- `src/components/business/node/CanvasAddMenu.tsx` — `CANVAS_ADD_MENU_ITEMS` + 分类（all/elements/generation/orchestration）
- `src/components/business/node/StudioNodeWorkbench.tsx` — nodeTypes 注册表（含 composer/agent 行）
- `src/components/business/node/nodes/*.tsx` — 各类型节点组件
- `src/hooks/node/use-node-workflow.ts` — `addNode`（含 composer/agent 分支）
- `src/constants/node-tokens.ts` — `NODE_ACCENTS`（`dot` 输出实心 / `dotRing` 输入描边），已预埋 `text/image/video/audio` 模态 token
- `src/messages/{en,ja,zh}.json` — `nodeTypes` / `addMenuHelpers`（含 composer/agent 残留键，需清）

## 2. 目标态（第 2 步终点）

可添加节点 **5 个**，按模态：

| 目标节点     | 由谁合并                                             | role / 模式                                | 端口语义                                      |
| ------------ | ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| **文本**     | shotText                                             | —                                          | 输出=文本色                                   |
| **图片**     | shot + characterImage + backgroundImage + frameImage | `data.role`: character / background / shot | role=character 时开 voice 输入口；输出=图片色 |
| **音色**     | voice                                                | —                                          | 输出=音频色                                   |
| **视频**     | seedance + videoReference                            | 模式：生成 / 上传参考                      | 输入=吃上游引用；输出=视频色                  |
| **视频合成** | videoMerge                                           | —                                          | 输入=吃视频；输出=视频色                      |

`role` 字段驱动：默认 prompt 字段、ScriptDoc 投影目标、seedance 聚合绑定语义（character→角色参考+音色 / background→场景参考 / shot→关键帧）。

## 3. 第 1 步：低风险打底（无架构改动，菜单 9→7）

目标：删死代码 + 合并真重复 + 折叠上传节点。**不引入 role 字段、不动投影/聚合签名。**

- [ ] **彻底删 `composer` / `agent`**（迁移完成的前提下）：
  - 从 `NODE_TYPE_IDS` / `NODE_TYPES` / `NODE_TOKEN_TYPES` 移除；删 `ComposerNode.tsx` / `AgentNode.tsx`；
    `StudioNodeWorkbench` nodeTypes 注册表去行；`use-node-workflow.ts` addNode 分支去除；
    `NodeCardControls.tsx` / `StudioNodeAssistantDock.tsx` 的 agent/composer 分支清理。
  - 清 `messages/{en,ja,zh}.json` 的 `nodeTypes.composer/agent` + `addMenuHelpers.composer/agent`。
  - ⚠ `node-workflow-migrate-planner.ts` 保留到确认线上无旧档残留后再删（先确认存量）。
- [ ] **合并 `frameImage` → `shot`**：保留 `shot`，把 frameIntent 并入 shot 字段集；
      `CanvasAddMenu` 去 frameImage 项；连接规则里 seedance 的 frameImage 引用并到 shot。
- [ ] **折叠 `videoReference` → 视频节点上传态**：seedance 节点空态加「⬆ 上传参考 / ▶ 生成」两入口；
      `videoReference` 暂留类型但从菜单移除（step 2 再清类型），或直接改 seedance 支持上传源。
- [ ] **修菜单分类自洽**：把 `shot` 归到与其它图片生成一致的组；`参考视频` 不再属「生成」。

第 1 步后菜单 = 镜头文本 / 角色图 / 背景图 / 镜头图 / 音色 / 视频生成 / 视频合并（7 项）。

## 4. 第 2 步：目标态（image+role 重构，菜单 7→5）

- [ ] **新增统一 `image` 节点类型**，带 `data.role`（character/background/shot）。
  - `NODE_WORKFLOW_FIELDS_BY_NODE_TYPE` 改为按 role 取字段；
  - `NODE_MEDIA_KIND_BY_NODE_TYPE` 给 image=image。
- [ ] **条件化输入口**：`image` 节点仅 `role=character` 渲染 voice 输入 handle（现 characterImage 规则）。
- [ ] **连接规则改 switch-on-role**：`node-connection-rules.ts` 与 seedance 聚合的 harvest 从「按 node type」改「按 data.role」。
- [ ] **ScriptDoc 投影改写**：`projectScriptDocToGraph` 造 `image{role:character}` 取代 characterImage。
- [ ] **存量迁移**：照 `node-workflow-migrate-planner.ts` 写 `migrate-image-roles`，把旧 characterImage/backgroundImage/frameImage/shot → image{role}。
- [ ] **菜单收为 5 项**：移除分类 tab（5 项不需要 全部/元素/生成/编排），改扁平列表。
- [ ] **节点级空态引导**（LibTV 模式）：`image` 空态 = 「👤生成角色 / 🏞生成背景 / 🎬生成镜头 / ⬆上传」；`video` 空态 = 「▶生成 / ⬆上传参考」。选完即定型 role/模式。

## 5. 端口低饱和语义色（贯穿，落 `node-tokens.ts`）

- [ ] 在 `NODE_ACCENTS` 给 `text/image/video/audio` 四模态一套**低饱和** `dot`/`dotRing` token（非霓虹，沿用现有「fill-5 极淡」基调，参考 §2.3 注释）。
- [ ] 端口色 = **流动的数据模态**（图/视频/音频/文本），不是节点 role；常驻可见。
- [ ] 连线颜色随源端口模态色（低饱和），保持画布整体克制。

## 6. 验证清单（每步收尾跑）

- [ ] `npm run lint && npm run build` 绿。
- [ ] `npx vitest run`（全量，覆盖跨文件漂移：删 node 波及 `use-node-workflow` / 投影 / 聚合 / route 测试）。
- [ ] i18n 三语同步（`i18n-check`）。
- [ ] 旧存档迁移：造一个含旧节点的 project state，过迁移后投影/连接/生成不丢。
- [ ] 视觉回归 `npx playwright test e2e/visual.spec.ts`；菜单/节点卡有意改动则 `--update-snapshots` 并点名快照。
- [ ] 端口色：用 `toHaveCSS` 断言四模态端口的具体色值（呼应 Hard Rule 5 无 arbitrary values）。

## 7. 变更安全

- `node-types.ts` 属 HIGH-risk（构件被广引）；先 `grep -r` 各 `NODE_TYPE_IDS.*` 引用面，被引 >5 处只做向后兼容改动。
- services 层不分支这些图片类型（已核对），主要影响面在 constants / types / lib / hooks / components / i18n。
- 迁移先行：没有迁移就删类型 = 旧档炸。先迁移、再删类型。

## 8. Backlog（本任务包外，已记不展开）

- 标题外移（卡内 header → 卡外浮标，释放卡面给媒体）。
- 生成成本 / credit 在节点上预估（Krea 模式）。
- ScriptDoc→autospawn 投影前「计划预览 + 改模型 + 确认才跑」（Krea Node Agent 模式）。
- 上下文 dock 浮卡外（LibTV 模式，待卡片重做时评估）。
- 统一节点尺寸（350² 方卡，优先级低）。
- **导演台 = 启动器节点（3D 摆位摄影，一致性强解法）—— 最后做。**
