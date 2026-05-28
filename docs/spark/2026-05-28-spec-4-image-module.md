# Spec 4 — Image 模块目录化

**日期**：2026-05-28
**前置**：[Spec 1](./2026-05-28-architecture-contract-design.md) 已落地；[Spec 2](./2026-05-28-spec-2-studio-shared-layer.md) 已落地（L1.5 边界已立）
**目标**：把 Image (L2 Tool) 模块的 services / hooks / Image-owned 扁平组件物理目录化；建 public API；启用 Image 模块 ESLint 边界。
**模式**：套用 Spec 3 Cards 模块的目录化套路（services/image/、hooks/image/、components/business/image/）。

---

## 1. 范围概览

| 类别                               | 数量        | 处理                                        |
| ---------------------------------- | ----------- | ------------------------------------------- |
| Image-only services                | 7 + 6 tests | ✅ 搬 `src/services/image/`                 |
| `image-transform/` 子目录          | 2 files     | ✅ 搬 `src/services/image/image-transform/` |
| Image-only hooks                   | 3 + 1 test  | ✅ 搬 `src/hooks/image/`                    |
| Image-owned flat studio components | 6 + 3 tests | ✅ 搬 `src/components/business/image/`      |
| Cross-cutting "image-named" hooks  | 2           | ⏳ 留在 `hooks/` flat（推迟 Spec 6）        |
| Image-owned constants              | 0           | —                                           |

**合计搬迁**：~30 文件 + 4 个 index.ts + ESLint 增量。

---

## 2. 跨切共享 hook 的明确判断

下列 hook **名字带 "image" 但本质跨多模块共享**，本 Spec 不搬，留待 Spec 6 与 L1.5 第二批一起处理：

- **`use-image-model-options`**（8 consumers）—— 全部在 Studio Shared / L1.5 候选层（StudioCanvas、StudioCommandPalette、StudioDockPanelArea、StudioPromptArea、StudioLoraChip 等）。搬进 `hooks/image/` 会造成 L1.5 → L2 反向依赖。
- **`use-image-upload`**（6 cross-module consumers）—— Cards、Arena、Studio contexts、generation-form、reference-image-section 都在用。是"上传参考图"的通用能力，conceptually L1.5 或 L0。

Spec 6 拆 4 巨型 + 24 SHARED 时一起重新归位。

---

## 3. 文件清单

### 3.1 Services（7 + 6 tests）→ `src/services/image/`

```
generate-image.service.ts (+ test)
image-3d-prep.service.ts (+ test)
image-analysis.service.ts (+ test)
image-decompose.service.ts
image-edit.service.ts (+ test)
image-preview-derivative.service.ts (+ test)
image-transform.service.ts (+ test)
```

### 3.2 image-transform/ 子目录 → `src/services/image/image-transform/`

```
handle-pose-transform.ts
handle-style-transform.ts
```

### 3.3 Hooks（3 + 1 test）→ `src/hooks/image/`

```
use-image-transform.ts
use-inpaint.ts (+ test)
use-reverse-image.ts
```

### 3.4 Components（6 + 3 tests）→ `src/components/business/image/`

```
CompareGrid.tsx
StudioGenerationErrorDialog.tsx (+ test)
StudioImageAdvancedParams.tsx
StudioKeepChangePanel.tsx (+ test)
StudioResultFeedback.tsx (+ test)
VariantGrid.tsx
```

---

## 4. ESLint Image (L2) 边界

新增第 5 个 boundary block：

```js
const IMAGE_FORBIDDEN_PATTERNS = [
  {
    group: [
      '@/components/business/studio/node/**', // L3 Node
    ],
    message: 'L2 Image must not import from L3 orchestrator (Node).',
  },
  {
    group: ['@/app/**'],
    message:
      'L2 Image must not import from app routes — services/hooks are pure logic.',
  },
]
```

**不限制 L2 sibling**（Video / Audio / 3D / Edit / LoRA），因为它们仍在 flat 层、无法精确路径定位，会产生误报。等 Spec 7 各 L2 模块目录化后统一加 sibling rule。

**预期违规**：0（基于审计：Image services 仅有 1 个跨层 import 是 `generate-image → @/services/prompts/recipe`，L2 → L1 合法）。

---

## 5. 行为保留契约

与 Spec 1/2/3 一致：**零运行时变更**。允许：文件位置 + import 路径 + index.ts re-export + ESLint 配置。无重命名（与 Spec 3 不同，本 Spec 不动文件名）。

### 三个易踩坑

1. **`'server-only'` 保留** — 7 Image services 顶部都有
2. **循环依赖** — `image-3d-prep` 被 3D 调（`generate-3d.service`），需保持 public API 暴露；3D 仍在 flat，import 路径会变 `from '@/services/image-3d-prep.service'` → `from '@/services/image/image-3d-prep.service'`
3. **`index.ts` 完整性** — `export *` 兜底，但要列出所有 7 services + 3 hooks + 6 components 的对应文件

---

## 6. 验证

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run --reporter=dot
npx madge --circular --extensions ts,tsx src/services/image src/hooks/image src/components/business/image
```

**手工烟雾**：

- `/studio/image` 生成图片
- `/studio/edit` 各子页面（inpaint, outpaint, extract-element, etc.）
- `/studio/3d` 生成（消费 image-3d-prep）
- Studio TransformPanel（use-image-transform）
- ReverseEngineerPanel（use-reverse-image）
- 图片增强 / Inpaint（use-inpaint）
- 图片分析 / 装饰 / 预览生成（image-analysis, image-decompose, image-preview-derivative）

---

## 7. 不在本 Spec 范围

- ❌ `use-image-model-options` / `use-image-upload` 跨切 hook 归位 → Spec 6
- ❌ ImageCard / ImageDetailModal / ImageSourcePicker / MediaCardTile / image-card/ 子目录 → Gallery / Image-display spec
- ❌ StudioInputImage / StudioInpaintEditor / StudioOutpaintEditor（Edit/L1.5 重排）→ Edit 模块 spec / Spec 6
- ❌ 拆 `generate-image.service.ts`（如果大）→ 内部拆分单独 spec
- ❌ L2 sibling 互斥（Image vs Video/Audio）→ Spec 7 各 L2 模块目录化后一起加

---

## 8. 文件变更概览

- **移动**：~30 文件
- **重命名**：0
- **新建**：4 个 index.ts + ESLint 增量 1 个 block
- **修改 import**：预计 80-120 处
- **不动**：所有 API URL、schema、组件渲染、用户行为
