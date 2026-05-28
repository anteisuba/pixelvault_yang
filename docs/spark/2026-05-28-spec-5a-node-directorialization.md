# Spec 5a — Node 模块目录化 + 归位（不拆 hook）

**日期**：2026-05-28
**前置**：Spec 1-4 已落地
**目标**：Node (L3 Orchestrator) 模块物理目录化。原 roadmap 把"目录化"和"`use-node-workflow.ts` 1,695 行拆 3 段"合并到 Spec 5；本 Spec **只做目录化**，hook 拆分独立到 [Spec 5b](./2026-05-28-spec-5b-node-workflow-hook-split.md)（待写）以隔离风险。

---

## 1. 为什么拆 Spec 5

原 Spec 5 范围有两类操作风险等级完全不同：

| 操作                                        | 风险                                                                    | 适合的 spec      |
| ------------------------------------------- | ----------------------------------------------------------------------- | ---------------- |
| Node services / hooks / components 物理搬迁 | 低（套路化，零运行时变更，已在 Spec 3/4 重复验证）                      | **Spec 5a 本次** |
| `use-node-workflow.ts` 1,695 行拆 3 段      | 高（真实代码拆分，公共 API 必须保留，影响 `/studio/node` 全部生成流程） | **Spec 5b 独立** |

合并会让后者拖累前者的稳定性，且翻车时回滚边界不清。Spec 5a 完成后 Node 模块的物理形态就稳了；Spec 5b 在稳定基础上做内部重构。

---

## 2. 范围概览（仅 Spec 5a）

| 类别                                                                | 数量                            | 处理                                  |
| ------------------------------------------------------------------- | ------------------------------- | ------------------------------------- |
| Node services                                                       | 4 + 3 tests                     | ✅ 搬 `src/services/node/`            |
| Node hooks（不含 hook 拆分）                                        | 5 + 4 tests                     | ✅ 搬 `src/hooks/node/`               |
| Node UI 子目录（`studio/node/`）                                    | ~22 files + inspector/ + nodes/ | ✅ 搬 `src/components/business/node/` |
| 2 个 Node-owned flat 漏件（VoiceSelector / FishVoiceLibraryDialog） | 4 (2 + 2 tests)                 | ✅ 搬 `src/components/business/node/` |
| `use-node-workflow.ts` 拆分                                         | 1 大 hook                       | ⏳ Spec 5b                            |

**合计**：~45 文件搬迁 + 3 个 index.ts + ESLint 增量。

---

## 3. 文件清单

### 3.1 Services（4 + 3 tests）→ `src/services/node/`

```
node-workflow.service.ts
node-assistant.service.ts (+ test)
script-breakdown.service.ts (+ test)
story.service.ts (+ test)
```

注意：`node-planner-route.service` 已被 Spec 1 Action 1 下沉到 `src/services/kernel/`，不在 Node 模块。

### 3.2 Hooks（5 + 4 tests）→ `src/hooks/node/`

```
use-node-workflow.ts (+ test)           ← 1,695 LOC 整文件搬过去，不拆
use-node-media-generation.ts (+ test)
use-node-reference-upload.ts
use-node-selection.ts (+ test)
use-script-breakdown.ts (+ test)
```

### 3.3 Components → `src/components/business/node/`

整体搬迁 `src/components/business/studio/node/` 子目录（约 22 个文件 + inspector/ + nodes/ 子目录），然后再补 2 个 flat 漏件：

```
src/components/business/studio/node/                → src/components/business/node/
  ├── AssistantConversation.tsx
  ├── CanvasAddMenu.tsx
  ├── CanvasAssistantRouteSelector.tsx (+ test)
  ├── CanvasAssistantToggle.tsx
  ├── CanvasBottomDock.tsx
  ├── CanvasMiniMap.tsx
  ├── CanvasPlannerRouteSelector.tsx
  ├── CanvasTopBar.tsx
  ├── CharacterImageLoraControls.tsx
  ├── CharacterImageReferenceControls.tsx
  ├── NodeWorkflowActionsContext.tsx
  ├── StudioNodeAssistantDock.tsx
  ├── StudioNodeWorkbench.tsx
  ├── WorkflowModelPicker.tsx (+ test)
  ├── inspector/
  └── nodes/

src/components/business/studio/VoiceSelector.tsx (+ test)        → src/components/business/node/
src/components/business/studio/FishVoiceLibraryDialog.tsx (+ test) → src/components/business/node/
```

---

## 4. ESLint Node (L3) 边界

新增第 6 个 boundary block：

```js
const NODE_FORBIDDEN_PATTERNS = [
  {
    group: ['@/app/**'],
    message:
      'L3 Node must not import from app routes — components/hooks/services are pure logic.',
  },
]
```

**不限制 sibling**：Node 是 L3 orchestrator，按铁律可以调任何下层（L2 工具、L1.5 共享、L1 内容、L0 内核），没有 sibling 概念。
**不限制反向**：下层不知道 Node 存在；如果 Node 出现在下层 import 中，是下层模块的违规，由下层 ESLint 规则负责。

**预期违规**：0。

---

## 5. 行为保留契约

与 Spec 1-4 一致：**零运行时变更**。允许：文件位置 + import 路径 + index.ts re-export + ESLint 配置。**不动 hook 内部代码**（`use-node-workflow.ts` 1,695 行原样搬过去）。

### 三个易踩坑

1. **`'use client'` / `'server-only'` 保留** — Node services 都有 server-only，components/hooks 都有 use client
2. **循环依赖** — Node 调底下所有层，本身不可被反向调用；检查 madge 输出
3. **`index.ts` 完整性** — `export *` 兜底

---

## 6. 验证

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run --reporter=dot
npx madge --circular --extensions ts,tsx src/services/node src/hooks/node src/components/business/node
```

**手工烟雾**（Node 是核心未来产品，重点跑）：

- `/studio/node` 打开正常 → 看到画布 + 顶部栏 + 底部 dock + Assistant 面板
- **新建项目** — 项目下拉切换
- **添加节点** — Canvas + 菜单（CanvasAddMenu）能添加角色 / 背景 / 声音 / 镜头节点
- **角色节点** — CharacterImageLoraControls、CharacterImageReferenceControls 弹窗能用
- **声音节点** — VoiceSelector / FishVoiceLibraryDialog 能选声音
- **Assistant 写脚本** — StudioNodeAssistantDock，能跟 AI 对话生成 shot CRUD
- **运行整个 workflow** — spawnFullWorkflow 触发生成视频
- **节点选择 + 删除** — use-node-selection
- **参考视频上传** — use-node-reference-upload
- **script-breakdown** — Assistant 写完脚本后拆 shot
- **story 服务** — 项目持久化

---

## 7. 不在本 Spec 范围（推迟到 Spec 5b 及之后）

- ❌ `use-node-workflow.ts` 1,695 行拆 3 段 → **Spec 5b**
- ❌ Node 内部 services 拆分（如果有大文件）→ 单独 spec
- ❌ Assistant dock / Canvas 内部 UI 重构 → Node UX 改进 spec（用户原本想做的）

---

## 8. 文件变更概览

- **移动**：~45 文件
- **重命名**：0
- **新建**：3 个 index.ts + ESLint 增量 1 个 block
- **修改 import**：预计 100-150 处
- **不动**：所有 API URL、schema、组件渲染、hook 内部逻辑、用户行为
