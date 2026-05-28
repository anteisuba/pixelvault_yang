# Spec 3 — Cards 模块目录化 + Recipe 三套同义词归位

**日期**：2026-05-28
**前置**：[Spec 1](./2026-05-28-architecture-contract-design.md) 已落地
**目标**：把 Cards 模块按 Spec 1 §6 命名约定物理目录化；同时纠正 Spec 1 §4.1 对 "recipe" 概念归属的错判（实际不是 Cards 拥有）；把 `recipe-compiler` 下沉 L0 Kernel；并扩展 ESLint 边界规则到 Cards 模块。

---

## 1. 背景与 Spec 1 修正

Spec 1 §4.1 把 `recipe`, `card-recipe`, `recipe-compiler` 三个 service 都列在 Cards 模块下，作为"recipe 概念混乱"的标志要 Spec 3 处理。Spec 3 实施前先做了一遍审计，**发现 Spec 1 的归属判断有错**：

| 文件                         | LOC | 实际语义                                                                                                                                                   | 实际归属                                                |
| ---------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `recipe.service.ts`          | 391 | 用户 prompt 模板的 CRUD —— 对应 `/prompts` 页面"我的模板" tab 后端，操作 Prisma `Recipe` model                                                             | **Prompts (L1)**                                        |
| `card-recipe.service.ts`     | 199 | 角色+背景+风格卡的组合配方 CRUD，操作 Prisma `CardRecipe` model                                                                                            | **Cards (L1)**                                          |
| `recipe-compiler.service.ts` | 603 | 把 Card IDs 编译成可执行 prompt（输入 `{characterCardId, backgroundCardId, styleCardId, freePrompt}`，输出 `compiledPrompt`）—— 是 prompt-engineering 能力 | **Kernel (L0)**（重命名为 `card-recipe-compiler` 消歧） |

**关键结论**：`recipe` 和 `card-recipe` 是**不同 Prisma model、不同业务概念**，不可合并。Spec 1 roadmap 写的"重命名 recipe.service → card-recipe.service（合并）"是错的，本 Spec 取消该动作，改为**正确分流**：`recipe` 归 Prompts、`card-recipe` 归 Cards、`recipe-compiler` 归 Kernel。

文件名一律保留（与 Prisma model 同名），仅**重命名一个**：`recipe-compiler.service` → `card-recipe-compiler.service`，明确它是"compile Card Recipe to prompt"。

---

## 2. 范围概览

| 类别                                                                               | 数量                           | 处理                         |
| ---------------------------------------------------------------------------------- | ------------------------------ | ---------------------------- |
| Recipe 三套归位（含一个重命名 + 下沉 L0）                                          | 3 services + 2 hooks + 4 tests | ✅                           |
| Cards 模块 services 目录化                                                         | 7 services + 7 tests           | ✅                           |
| Cards 模块 hooks 目录化                                                            | 8 hooks + 1 test               | ✅                           |
| Cards 模块 components 目录化                                                       | 11 components + 2 tests        | ✅                           |
| Cards 模块 constants 目录化                                                        | 3 files                        | ✅                           |
| ESLint Cards 边界规则                                                              | 1 新 block                     | ✅                           |
| ImageCard / MediaCardTile / image-card 子目录（**generation 显示，不属于 Cards**） | 留在原地                       | ⏳ Gallery / Image spec 处理 |

**合计**：~38 文件搬迁 + 1 重命名 + 100+ 处 import 改动。

---

## 3. 三个动作

### 3.1 动作 1：Recipe 三套归位

#### a. 移动 + 重命名

```
src/services/recipe.service.ts                  → src/services/prompts/recipe.service.ts
src/services/recipe.service.test.ts             → src/services/prompts/recipe.service.test.ts
src/hooks/use-recipes.ts                        → src/hooks/prompts/use-recipes.ts

src/services/recipe-compiler.service.ts         → src/services/kernel/card-recipe-compiler.service.ts (重命名)
src/services/recipe-compiler.service.test.ts    → src/services/kernel/card-recipe-compiler.service.test.ts
```

#### b. 验证 L0 下沉不产生反向依赖

`recipe-compiler.service` 当前 import：

- `@/lib/db`、`@/lib/logger`、`@/constants/card-types`、`@/constants/model-strengths`、`@/constants/providers` — 全部 L0 ✓
- `@/lib/llm-output-validator` — L0 ✓

无 L1+ 依赖。下沉 L0 安全。

#### c. 调用方导入路径更新

注意：移动后需要更新所有调用方的 import 路径。`recipe-compiler` 重命名也要更新所有 `compileRecipe` / `previewRecipe` / `extractBackgroundAttributes` / `extractStyleAttributes` 的导入路径。`vi.mock()` 路径也要同步更新。

### 3.2 动作 2：Cards 模块目录化

#### Services (7 files + 7 tests)

```
src/services/character-card.service.ts (+ test)   → src/services/cards/character-card.service.ts
src/services/character-card.mapper.ts             → src/services/cards/character-card.mapper.ts
src/services/character-refine.service.ts          → src/services/cards/character-refine.service.ts
src/services/character-scoring.service.ts         → src/services/cards/character-scoring.service.ts
src/services/background-card.service.ts (+ test)  → src/services/cards/background-card.service.ts
src/services/style-card.service.ts (+ test)       → src/services/cards/style-card.service.ts
src/services/voice-card.service.ts (+ test)       → src/services/cards/voice-card.service.ts
src/services/card-recipe.service.ts (+ test)      → src/services/cards/card-recipe.service.ts
```

#### Hooks (8 files + 1 test)

```
src/hooks/use-character-cards.ts                  → src/hooks/cards/use-character-cards.ts
src/hooks/use-background-cards.ts                 → src/hooks/cards/use-background-cards.ts
src/hooks/use-style-cards.ts                      → src/hooks/cards/use-style-cards.ts
src/hooks/use-voice-cards.ts                      → src/hooks/cards/use-voice-cards.ts
src/hooks/use-card-recipes.ts                     → src/hooks/cards/use-card-recipes.ts
src/hooks/use-character-card-gallery.ts           → src/hooks/cards/use-character-card-gallery.ts
src/hooks/use-card-manager.ts                     → src/hooks/cards/use-card-manager.ts
src/hooks/use-character-image-generation.ts (+test)→ src/hooks/cards/use-character-image-generation.ts
```

#### Components (11 files + 2 tests)

```
src/components/business/CardDropdown.tsx          → src/components/business/cards/CardDropdown.tsx
src/components/business/CardifyPreview.tsx (+test)→ src/components/business/cards/CardifyPreview.tsx
src/components/business/CardManagerToolbar.tsx    → src/components/business/cards/CardManagerToolbar.tsx
src/components/business/CardsPageContent.tsx     → src/components/business/cards/CardsPageContent.tsx
src/components/business/CharacterCardCreateForm.tsx → src/components/business/cards/CharacterCardCreateForm.tsx
src/components/business/CharacterCardGallery.tsx → src/components/business/cards/CharacterCardGallery.tsx
src/components/business/CharacterCardItem.tsx    → src/components/business/cards/CharacterCardItem.tsx
src/components/business/CharacterCardManager.tsx → src/components/business/cards/CharacterCardManager.tsx
src/components/business/CharacterCardTile.tsx (+test)→ src/components/business/cards/CharacterCardTile.tsx
src/components/business/SimpleCardManager.tsx    → src/components/business/cards/SimpleCardManager.tsx
src/components/business/StyleCardManager.tsx     → src/components/business/cards/StyleCardManager.tsx
```

**保留在原地**（不属于 Cards 模块，留给 Gallery / Image spec）：

- `ImageCard.tsx` (+ test) — 生成结果展示
- `MediaCardTile.tsx` (+ test) — 媒体卡片网格 tile
- `image-card/` 子目录（ImageCardActions, ImageCardMedia, ImageCardVisibility, UseLoraButton）— 生成结果操作

#### Constants (3 files)

```
src/constants/card-types.ts        → src/constants/cards/card-types.ts
src/constants/cardify.ts           → src/constants/cards/cardify.ts
src/constants/character-card.ts    → src/constants/cards/character-card.ts
```

#### 新建 public API

- `src/services/cards/index.ts` — `export *` 覆盖 7 services + mapper
- `src/hooks/cards/index.ts` — `export *` 覆盖 8 hooks
- `src/components/business/cards/index.ts` — `export *` 覆盖 11 components
- `src/constants/cards/index.ts` — `export *` 覆盖 3 constants

### 3.3 动作 3：扩展 ESLint Cards 边界

在 `eslint.config.mjs` 加第 4 个 boundary block：

```js
const CARDS_FORBIDDEN_SIBLINGS = [
  {
    group: [
      '@/services/gallery/**',
      '@/services/assets/**',
      '@/services/prompts/**',
      '@/hooks/gallery/**',
      '@/hooks/assets/**',
      '@/hooks/prompts/**',
      '@/components/business/gallery/**',
      '@/components/business/assets/**',
      '@/components/business/prompts/**',
    ],
    message: 'L1 Cards must not import from sibling L1 modules.',
  },
]
```

更新 KERNEL_FORBIDDEN_PATTERNS 已包含 `cards/**` —— 无需改动。
更新 PROMPTS_FORBIDDEN_SIBLINGS 已包含 `cards/**` —— 无需改动。

---

## 4. 行为保留契约

与 Spec 1/2 一致：**零运行时变更**。允许：文件位置 + import 路径 + index.ts re-export + ESLint 配置 + 一个 service 重命名（`recipe-compiler` → `card-recipe-compiler`）。

### 三个易踩坑细节

1. **`'server-only'` 保留** — 所有 Cards services 顶部都有，搬迁时必须保留
2. **循环依赖** — `recipe-compiler` 下沉到 L0 后绝不能反过来 import Cards services（已审计：当前只 import `lib/`、`constants/`、`llm-output-validator`，无 L1 依赖）
3. **`index.ts` re-export 完整性** — 用 `export *` 兜底

### 已知潜在风险

- `Cards/use-recipes` → `Prompts` 违规（Spec 1 ESLint 提到过）—— **本 spec 解决**：use-recipes 实际归 Prompts，迁移后调用方变成 `from '@/hooks/prompts'`，违规消除
- `cardify` 概念（"从图像生成 character card"）依赖 Image 相关 hooks —— 需要审计 cardify 内部依赖是否会触发 Cards → Image 违规

---

## 5. 验证（与 Spec 1/2 一致）

每个 commit 前必须全部通过：

```bash
npx tsc --noEmit
npm run lint                              # 含新增 Cards boundary 规则
npm run build
npx vitest run --reporter=dot
npx madge --circular --extensions ts,tsx src/services/cards src/services/kernel src/hooks/cards src/components/business/cards
```

手工烟雾：

- `/cards` 页面（CardsPageContent）— 列表正常加载
- 角色卡 CRUD（创建/编辑/删除）— CharacterCardCreateForm, CharacterCardManager
- 风格卡管理 — StyleCardManager
- 简单卡片管理（背景、声音）— SimpleCardManager
- Studio 内卡片选择器 — CardDropdown / SimpleCardSelectors
- Card Recipe 编译为 Prompt — `/api/card-recipes/[id]/compile`
- 角色细化 / 评分（character-refine / character-scoring）— 触发路径
- `/prompts` 页面"我的模板" tab — listRecipes（已迁入 Prompts）
- Studio 调用模板 — useRecipes hook

---

## 6. 不在本 Spec 范围

- ❌ ImageCard / MediaCardTile / image-card/ 重新归位 → Gallery / Image spec
- ❌ Cards 内部大文件拆分（如果有）—— 各模块拆分 spec
- ❌ 改 Prisma schema 或 Recipe / CardRecipe 表结构
- ❌ 改任何 API URL（/api/recipes、/api/card-recipes 保持）

---

## 7. 文件变更概览

- **移动**：~38 文件
- **重命名**：1 文件（recipe-compiler → card-recipe-compiler）
- **新建**：4 个 index.ts + ESLint 增量
- **修改 import**：预计 100-150 处
- **不动**：所有 API URL、schema、组件渲染、用户行为
