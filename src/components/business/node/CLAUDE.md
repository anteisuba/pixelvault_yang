# src/components/business/node/ — 节点画布（v4）

## Risk Level: HIGH（一张图上的所有写路径都收在这里，改错会静默丢用户的项目）

施工基准：`docs/references/pages/node-canvas-v2.md`。视觉走 `docs/references/ui-defaults.md` §3.1（节点卡圆角例外）+ §4.1（弹簧三档）。**动这一域之前先读那两份，别照现状扩。**

## 目录分层

| 目录            | 装什么                                                                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workbench-v4/` | 工作台外壳：`NodeWorkbenchV4`（唯一入口）· `CanvasV4`（ReactFlow 宿主）· `WorkbenchToolbarV4` · `WorkbenchDocksV4` · `WorkbenchDndV4` · `WorkbenchRosterDropV4` · `WorkbenchShortcutsV4`                                                                                                                                                      |
| `nodes/v4/`     | 四类节点卡与卡内件：`registry.tsx`（`NODE_V4_COMPONENTS`）· `TextNodeV4` / `ImageNodeV4` / `AudioNodeV4` / `VideoNodeV4` · `chrome/*` 共用件（`NodeCardShell` / `NodeToolbar` / `NodePromptBar` / `NodeFrame` / `QuickLook` / `VersionDots` / `NodePorts`）· `NodeV4ContextMenu` · `NodeV4Provider` + `NodeV4Context` + `NodeV4ActionsBridge` |
| `mobile/`       | 手机端镜头带视图（< 768，node-canvas-v2 §7.x）：`CanvasMobileRail`（唯一入口，桌面 ReactFlow 在这一档不挂载）· `MobileShotCard` · `MobileRefStrip` · `MobileNodeSheet` · `mobile-rail-model`。⛔ 不另设数据：四个列表是 `state.nodes` 的投影，改动全部走 op。                                                                                 |
| `shared/`       | 跨壳共享件：`NodeStatusBadge` · `NodeVideoSurface`                                                                                                                                                                                                                                                                                            |
| 根目录          | 画布外壳：`CanvasTopBar` / `CanvasBottomDock` / `CanvasMiniMap` / `CanvasLeftPanel` / `CanvasSurface` / `CanvasWorkspaceLayout` · `CastDock` / `CastCard` / `CanvasRosterRail` · `ScriptDocWorkspace` · `CanvasOpProposalCard` · `CanvasAddMenu` · `IngestDragLayerV4`                                                                        |

配套 hooks 在 `src/hooks/node/`，纯逻辑在 `src/lib/node-*`，词表在 `src/constants/node-*` 与 `canvas-add-catalog.ts`。

## 禁改（改前先读基准，改后 `rg` 核调用方）

1. **op 表是唯一的语义写入口**。所有改图语义的动作走 `applyNodeAssistantOpV4`——与助手同一张表、同一份 inverse、同一批 `changedNodeIds`。⛔ 组件里不直接 `connectIntoSlot` / `setSlotVersion`：那会让「用户点的」和「助手做的」变成两条会漂的路径。例外只有四类（拖动坐标 / 整理布局 / 媒体回填 / 运行态），它们不发 op 也不进撤销栈，理由写在 `use-node-graph-v4.ts` 头注。
2. **外壳组件的动作只从 `useNodeCanvasActions()` 取**（`NodeV4ActionsBridge`），⛔ 没有第二条写入路径。
3. **撤销栈只有一份**（图引擎持有、`NodeV4Provider` 消费）。助手的一轮 = 一个撤销条目。⛔ 不要在 Provider 或组件里再存一份。
4. **端口 / 容量 / 合法性查表，不现推**：`NODE_V4_PORTS`（`src/constants/node-slots.ts`）+ `canConnect`。`0..N` 的上限跟模型走，由调用方传 `capacity`。
5. **legacy 已删，勿复活**：v3 的 `StudioNodeWorkbench` / `NodeDetailPanel` / `node-detail` 族 / `use-node-workflow` / v3 投影，以及 S11 删掉的 `NodeV4Shell` / `NodeV4GenerateDesk` / `NodeV4SlotRail` / `NodeV4SlotCard` 全部删除，⛔ 不留垫片、不重建第二套详情面板——画中框（`chrome/NodeFrame`）就是详情。`LegacyMigratedNode` 只是存量项目里未迁移旧 type 的空壳，回填跑完即删。
6. **卡面不上 `backdrop-filter`**（画布上可能同时有上百张卡），vibrancy 只给浮层：工具条 / 右键菜单 / 媒体 transport / composer / 移动端浮动条。
7. **助手提案的自动落「恰好一次」记在消息级**（`autoAppliedRef` 按 `message.id`），⛔ 不记在按消息渲染的卡里——流式期间同一条消息会重渲多次。
8. **`generate` 是唯一扣 credit 的动作**，服务端只吐 op、执行在客户端。这道结构性钱闸不能动。
