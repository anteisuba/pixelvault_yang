# Spec 2 — Studio Shared 层正式化（首批 16 文件）

**日期**：2026-05-28
**前置**：[Spec 1 架构契约](./2026-05-28-architecture-contract-design.md) 必须先完成或并行进行
**目标**：把"被 2+ 模块用、不属于任何单一工具"的扁平 studio 组件，从 `src/components/business/studio/*.tsx` 影子层正式提到 L1.5 `studio-shared/`；同时清理死代码并扩展 ESLint 边界规则到 L1.5。
**主线**：降低后续新功能成本 —— 后续每个 Studio 工具改动都受益（Spec 1 roadmap 中收益最大的一条）。

---

## 1. 背景

[Spec 1](./2026-05-28-architecture-contract-design.md) 定义了 5 层架构，其中 L1.5 "Studio Shared" 层概念上承认了"跨工具共享 UI"的存在，但本身没有物理实体 —— 44 个 SHARED 文件还混在 `src/components/business/studio/` 顶层（共 82 个 `.tsx`）。

通过 cross-module dependency 审计（详见附录 A 完整 82 文件表），确认：

- **44 个 SHARED 文件**（54%）—— 被 2+ 模块用，是 L1.5 候选
- **32 个 SINGLE-OWNER 文件**（39%）—— 应归属到具体模块（推迟到各模块 spec）
- **2 个 DEAD 文件** —— 无任何引用，可直接删除
- **4 个 SHARED "巨型" 文件**（>500 LOC）—— `StudioPromptArea` 1,371 / `StudioLoraChip` 889 / `GenerationPreview` 667 / `StudioDockPanelArea` 571 —— 因体积过大、内部职责需要先拆分，**推迟到 Spec 6**（先拆再决定归属）

本 Spec 处理"高频共享 + 没有内部耦合复杂度"的 **16 个文件首批迁移** + 删 2 个死文件 + 扩展 ESLint 规则。剩余 SHARED 文件（约 28 个）归 Spec 6 处理。

---

## 2. 现状快照（82 文件分类）

按"本 Spec 是否处理"二分（详细分类见附录 A 引用的审计报告）：

| 类别                                                                                          | 数量   | 本 Spec 处理                   |
| --------------------------------------------------------------------------------------------- | ------ | ------------------------------ |
| SHARED 安全件（搬 L1.5）                                                                      | 16     | ✅                             |
| DEAD（删除）                                                                                  | 2      | ✅                             |
| SHARED — 4 巨型（PromptArea 1371 / LoraChip 889 / GenerationPreview 667 / DockPanelArea 571） | 4      | ❌ 推迟到 Spec 6（先拆再归位） |
| SHARED — 其他需复核件                                                                         | ~24    | ❌ 推迟到 Spec 6               |
| SINGLE-OWNER（应归各 L2 模块的扁平件）                                                        | ~36    | ❌ 推迟到各模块 spec           |
| **合计**                                                                                      | **82** | **18 件本 Spec 处理（22%）**   |

> 数字说明：本 Spec 不依赖 SHARED 与 SINGLE-OWNER 的精确切分（推迟件由后续 spec 各自复核）。本 Spec 只需要确认 16 个搬迁件和 2 个删除件是**正确分类**的，详见 §6 清单和附录 A 审计依据。

---

## 3. L1.5 边界规则

### 3.1 进入 L1.5 的判定

文件**必须同时满足**所有条件才能进入 L1.5 `studio-shared/`：

1. **被 2+ 不同模块用** —— 通过 grep 实证，不靠"看起来通用"
2. **不含特定工具业务逻辑** —— 例：QuickSetupDialog 处理"缺 API key 时引导配置"，是所有 Studio 工具共用的 setup gate；它不知道当前是 Image / Video / Audio
3. **不依赖任何 L2 工具模块** —— L1.5 只能依赖 L1 / L0
4. **没有"它该归哪个工具"的明显答案** —— 如果可以明确归属 Audio，那就放 Audio 不放 L1.5

### 3.2 反例（不进 L1.5）

- 一个组件只在 Image 和 Audio 用，但内部分支 `if (modeIsImage)` —— 这是耦合假象，应该拆 2 个组件分别归 Image / Audio
- 一个 hook 名字带 "image"（如 `useImageModelOptions`）但被 Video 也调 —— **不要**搬到 L1.5。应分析：是 Video 在错误地复用 image hook，还是 hook 名字误导？让它各自存在 + 共用 `src/lib/model-options.ts` 中的纯函数
- 4 个巨型 monolith（PromptArea 等）—— 看着"shared"，但内部混了 image-specific 和 video-specific 逻辑，搬到 L1.5 等于把 monolith 合法化，**推迟到 Spec 6 先拆再归位**

### 3.3 决策树

加一个新组件时：

```
1. 我在写一个 UI 组件，是给 Studio 用的吗？
   ├─ 否 → 它属于 L1 内容域 / L3 Node / 其他模块，不在 L1.5 视野
   └─ 是 → 问 Q2

2. 写完之后预期被几个 Studio 工具用？
   ├─ 1 个 → L2 该工具的 components/business/studio/<tool>/
   ├─ 2+ 个 但有"主用户" → 放主用户的 L2，导出供他人使用
   └─ 2+ 个 且对称使用 → 问 Q3

3. 它含有任何工具特定的业务逻辑吗？
   ├─ 是 → 拆 2 个组件
   └─ 否 → L1.5 studio-shared/
```

---

## 4. 物理布局

### 4.1 目标目录

```
src/components/business/studio-shared/
├── chrome/                    # 工作台外壳
│   ├── StudioResizableLayout.tsx
│   ├── StudioCanvas.tsx
│   ├── StudioBottomDock.tsx
│   ├── StudioCommandPalette.tsx
│   ├── StudioErrorBoundary.tsx
│   ├── StudioLightbox.tsx
│   └── ActiveLoraBar.tsx
├── setup/                     # API key / model 配置 gate
│   ├── QuickSetupDialog.tsx
│   ├── StudioApiRoutesSection.tsx
│   └── StudioFaceConsentModal.tsx
├── workflow/                  # 工作流选择器
│   ├── StudioWorkflowGroupTabs.tsx
│   ├── StudioWorkflowPicker.tsx
│   ├── StudioWorkflowSummary.tsx
│   ├── StudioModeSelector.tsx
│   └── StudioGenerateBar.tsx
├── primitives/                # 跨工具复用的小原子
│   ├── tool-surface.tsx
│   └── (后续 Spec 6 补 ReferenceImageChip、StudioAspectRatioPopover 等)
├── index.ts                   # public API
└── README.md                  # 描述 L1.5 边界规则（指向本 spec）
```

### 4.2 命名

保持 PascalCase 文件名不变（只移动位置），唯一例外 `tool-surface.tsx` 保留小写（约定俗成的 utility 命名）。

### 4.3 Public API

```ts
// src/components/business/studio-shared/index.ts
// chrome
export { StudioResizableLayout } from './chrome/StudioResizableLayout'
export { StudioCanvas } from './chrome/StudioCanvas'
// ... 其他

// setup
export { QuickSetupDialog } from './setup/QuickSetupDialog'
// ... 其他

// 等价 export 列表对照原扁平文件，零增减
```

跨模块 import 必须经过 `'@/components/business/studio-shared'`，不允许深 import 到 `studio-shared/chrome/...`。

---

## 5. ESLint 规则扩展

在 Spec 1 已有的 boundary 规则配置基础上，**追加** L1.5 层：

```js
// eslint.config.mjs（增量）
{
  files: ['src/components/business/studio-shared/**/*'],
  rules: {
    'boundaries/element-types': ['error', {
      // L1.5 不能依赖 L2 / L3
      disallow: [
        { from: 'studio-shared', target: 'tool' },          // L2 工具
        { from: 'studio-shared', target: 'orchestrator' },  // L3 Node
      ],
    }],
  },
}
```

**作用范围**：本 Spec 同步开启 L1.5 范围内的 boundary `error`；其他模块（L2 工具内部）仍保持 ignorePatterns，等各自 spec 启用。

**预期违规**：0 条（迁移完后所有 import 经过 public API）。

---

## 6. Pilot 迁移 — 三个动作

### 6.1 动作 1：删除 2 个死文件

```
src/components/business/studio/StudioPronunciationEditor.tsx  → 删除（140 行）
src/components/business/studio/StudioReverseButton.tsx        → 删除（88 行）
```

**校验**：

```bash
# 确认无 import
grep -rn "StudioPronunciationEditor\|StudioReverseButton" src/
# 应输出空（或只在 git history 里）
```

如果 grep 有结果，**停下来** —— 重新分类（可能被审计漏掉）。

### 6.2 动作 2：迁移 16 个 SHARED 文件到 L1.5

完整文件清单：

| 原路径                                        | 新路径                                                        | LOC | 子目录     |
| --------------------------------------------- | ------------------------------------------------------------- | --- | ---------- |
| `business/studio/QuickSetupDialog.tsx`        | `business/studio-shared/setup/QuickSetupDialog.tsx`           | 347 | setup      |
| `business/studio/StudioApiRoutesSection.tsx`  | `business/studio-shared/setup/StudioApiRoutesSection.tsx`     | 30  | setup      |
| `business/studio/StudioFaceConsentModal.tsx`  | `business/studio-shared/setup/StudioFaceConsentModal.tsx`     | 49  | setup      |
| `business/studio/StudioResizableLayout.tsx`   | `business/studio-shared/chrome/StudioResizableLayout.tsx`     | 44  | chrome     |
| `business/studio/StudioCanvas.tsx`            | `business/studio-shared/chrome/StudioCanvas.tsx`              | 322 | chrome     |
| `business/studio/StudioBottomDock.tsx`        | `business/studio-shared/chrome/StudioBottomDock.tsx`          | 81  | chrome     |
| `business/studio/StudioCommandPalette.tsx`    | `business/studio-shared/chrome/StudioCommandPalette.tsx`      | 239 | chrome     |
| `business/studio/StudioErrorBoundary.tsx`     | `business/studio-shared/chrome/StudioErrorBoundary.tsx`       | 88  | chrome     |
| `business/studio/StudioLightbox.tsx`          | `business/studio-shared/chrome/StudioLightbox.tsx`            | 72  | chrome     |
| `business/studio/ActiveLoraBar.tsx`           | `business/studio-shared/chrome/ActiveLoraBar.tsx`             | 212 | chrome     |
| `business/studio/StudioWorkflowGroupTabs.tsx` | `business/studio-shared/workflow/StudioWorkflowGroupTabs.tsx` | 138 | workflow   |
| `business/studio/StudioWorkflowPicker.tsx`    | `business/studio-shared/workflow/StudioWorkflowPicker.tsx`    | 79  | workflow   |
| `business/studio/StudioWorkflowSummary.tsx`   | `business/studio-shared/workflow/StudioWorkflowSummary.tsx`   | 44  | workflow   |
| `business/studio/StudioModeSelector.tsx`      | `business/studio-shared/workflow/StudioModeSelector.tsx`      | 89  | workflow   |
| `business/studio/StudioGenerateBar.tsx`       | `business/studio-shared/workflow/StudioGenerateBar.tsx`       | 46  | workflow   |
| `business/studio/tool-surface.tsx`            | `business/studio-shared/primitives/tool-surface.tsx`          | 69  | primitives |

**共**：16 文件，总 1,949 LOC。

**Import 更新**：每个被搬文件的所有调用方 import 路径需更新。预计 100-150 处。建议用 codemod 批量处理：

```bash
# 示例 — 用 jscodeshift 批量改 import
npx jscodeshift -t scripts/migrate-studio-shared.ts \
  --extensions=ts,tsx \
  --parser=tsx \
  src/
```

codemod 脚本本身在本 spec 实施时编写（不在本 spec 范围内详写），逻辑就是 path rewrite + 不动语义。

### 6.3 动作 3：新建 public API + ESLint 配置

新建文件：

- `src/components/business/studio-shared/index.ts` —— public API，列出 16 个 export
- `src/components/business/studio-shared/README.md` —— 描述 L1.5 边界（指向本 spec）
- `eslint.config.mjs` 增加 L1.5 boundaries block（§5）

每个动作独立 commit。

---

## 7. 行为保留契约

与 Spec 1 §8.2 一致：**零运行时变更**。允许：文件位置 + import 路径 + index.ts re-export + ESLint 配置。禁止：函数签名 / 副作用 / 渲染输出 / URL / schema / i18n key 改动。

### 7.1 三个易踩坑细节（必须显式检查）

**陷阱 1：'use client' 指令保留**

被搬的 16 个文件全是客户端组件，顶部都有 `'use client'`。**移动文件时必须保留**。否则 Next.js 会把它们当 server component，破坏 hooks 使用。

```bash
# 迁移前后对比
for f in QuickSetupDialog StudioCanvas StudioCommandPalette ...; do
  head -1 src/components/business/studio-shared/**/${f}.tsx
done
# 期望每行都是 "'use client'"
```

**陷阱 2：循环依赖**

`studio-shared/index.ts` 集中 re-export 16 个组件，可能与某些被它们引用的 hooks / contexts 形成循环。

```bash
npx madge --circular --extensions ts,tsx src/components/business/studio-shared/
```

应输出空。

**陷阱 3：`index.ts` re-export 完整性**

每个搬入文件原本的 named export 必须 100% 在 index.ts 出现。漏一个，调用方报错。

```bash
# 自动核对原文件 export 与 index.ts 是否对齐
for f in QuickSetupDialog StudioCanvas ... ; do
  echo "=== ${f} ==="
  git show HEAD~1:src/components/business/studio/${f}.tsx | grep -E "^export"
  grep -E "from.*${f}" src/components/business/studio-shared/index.ts
done
```

### 7.2 每个动作的验证流程

每个 commit 前必须全部通过：

```bash
npm run lint                            # 含新增 L1.5 boundaries 规则
npx tsc --noEmit                        # 类型完整性
npm run build                           # Next.js 构建（含 server/client 边界检查）
npx vitest run                          # 单元测试
npx madge --circular --extensions ts,tsx src/components/business/studio-shared/
npx playwright test e2e/mobile.spec.ts --project=mobile

# 手工烟雾测试 — 触达 16 个组件的核心路径：
# - 打开 /studio/image / /studio/video / /studio/audio → ResizableLayout / Canvas / BottomDock 正常
# - Cmd+K 打开 CommandPalette → 列表正常
# - 缺 API key 时触发 QuickSetupDialog → 显示 + 配置流程正常
# - Studio 顶部 workflow group tabs / picker / summary → 选择 + 切换正常
# - GenerateBar 按钮 → 触发生成
# - 点开图像放大 → Lightbox 正常
# - ActiveLoraBar 显示 + 移除 LoRA 正常
# - StudioFaceConsentModal 触发（如有面部相关功能）正常
# - StudioErrorBoundary 触发（人为抛错验证）正常
```

任一项失败 → 回滚 → 修干净再 commit。

---

## 8. 不在本 Spec 范围内

明确**不做**的事：

- ❌ 搬 4 个巨型 SHARED 文件（PromptArea / LoraChip / GenerationPreview / DockPanelArea） → Spec 6
- ❌ 搬剩余 24 个 SHARED 文件（ReferenceImageChip、StudioAspectRatioPopover、StudioCardsButton 等） → Spec 6
- ❌ 5 个被埋的 module-owned 文件归位（StudioInpaintEditor → Edit, VoiceSelector → Node 等） → 各自的模块 spec
- ❌ 32 个 SINGLE-OWNER 文件归位 → 各自的模块 spec
- ❌ 拆 StudioPromptArea / StudioLoraChip / DockPanelArea 的内部结构 → Spec 6
- ❌ `use-image-model-options` 拆分 —— 经分析无需拆，generic 部分已在 `src/lib/model-options.ts`
- ❌ 修复 long-video 恢复、execution-callback 事务 → Spec 8
- ❌ 任何 URL / API / schema / 用户行为变化

---

## 9. 成功标准

本 Spec 落地后应能成立：

1. `src/components/business/studio-shared/` 目录存在，包含 16 个文件分布在 4 个子目录（chrome / setup / workflow / primitives）
2. `src/components/business/studio/` 顶层 `.tsx` 文件从 82 降到 64（82 − 16 搬走 − 2 删除）
3. ESLint 在 L1.5 范围内 `error` 级别违规数 = 0
4. **用户可见行为零变化** —— 通过 §7.2 手工烟雾测试逐项验证
5. 跨模块 import L1.5 组件时均走 `@/components/business/studio-shared` public API（没有深 import 到子目录）
6. `npx madge --circular` 输出为空
7. 所有原有 `'use client'` 指令保留
8. `StudioPronunciationEditor` / `StudioReverseButton` 在代码库中完全消失（含 git diff 验证）

---

## 10. 风险与缓解

| 风险                                                       | 缓解                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 16 文件 import 改动 100-150 处，手改易漏                   | codemod（jscodeshift / ts-morph）批量改；TypeScript 编译兜底（漏改即编译失败）    |
| `'use client'` 指令丢失 → server component 错误            | §7.1 陷阱 1：迁移后 grep 验证                                                     |
| 误把"看起来 shared 实际只有 1 个真实消费者"的文件搬进 L1.5 | 审计已用 grep 实证，附录 A 留备查；如发现误判，回滚单文件                         |
| 4 个巨型还在 flat 层，L1.5 看起来"不完整"                  | 本 spec 明确：完整性在 Spec 6 后达成，本 spec 是首批批量。L1.5 README 写明状态    |
| 24 个其他 SHARED 文件留在 flat，开发者困惑"哪些算 L1.5"    | README 列出"已搬"与"待 Spec 6 搬"两份名单；ESLint 当前不强制其他文件走 public API |
| codemod 误改字符串里的路径（如 i18n key、文档）            | codemod 限定 import 语句 AST，不动字符串字面量                                    |

---

## 11. 完成后样子（直观）

```
src/components/business/
├── studio/                    # 还有 64 个 .tsx（待 Spec 6 / 各模块 spec 处理）
│   ├── edit/                  # Edit 模块（原状）
│   ├── lora/                  # LoRA 模块（原状）
│   ├── node/                  # Node 模块（原状）
│   ├── StudioPromptArea.tsx   # 4 巨型还在这里
│   ├── StudioLoraChip.tsx
│   ├── GenerationPreview.tsx
│   ├── StudioDockPanelArea.tsx
│   ├── ... (其他 24 个未搬 SHARED + 32 个 single-owner)
│   └── index.ts               # 兼容老 import（暂保留）
└── studio-shared/             # ✨ 本 spec 新建
    ├── chrome/
    ├── setup/
    ├── workflow/
    ├── primitives/
    ├── index.ts
    └── README.md
```

---

## 附录 A：完整 82 文件审计表（数据基础）

详见 `2026-05-28-architecture-contract-design.md` 附录 A 的影子层清单 + 本 spec 调查输出。本 Spec 中实际搬移的 16 文件为该清单的子集，按"高频共享 + 体量适中 + 无内部耦合复杂度"筛选。

完整审计列表（按本 spec §2 分类计数共 82 件）作为决策依据保存在 git history 内（commit message 引用本 spec）。

## 附录 B：本 Spec 涉及文件变更概览

- **删除**：2 文件（约 228 LOC）
- **移动**：16 文件（约 1,949 LOC）
- **新建**：3 文件（`studio-shared/index.ts`、`studio-shared/README.md`、ESLint config 增量）
- **修改 import**：预计 100-150 处调用方
- **不动**：所有运行时逻辑、API URL、组件 props、用户行为
