# HuggingFace LoRA 导入源 — 实现方案 (Design Spec)

**日期**：2026-05-29
**状态**：📝 待评审（spec only，未写代码）
**目标**：在现有 LoRA Workbench 的 Community 发现层里，**新增 HuggingFace 作为第二个外部 LoRA 导入源**，与 Civitai 并存，覆盖 Illustrious / SDXL 系（能在 `delta-lock/noobai-xl` 端点跑）的 LoRA。

---

## 1. 背景

调研结论（见会话记录）：按"公开 API + 第三方可 fetch 的直链 .safetensors + Illustrious/SDXL 覆盖 + 许可允许第三方推理"四条标尺，**除 Civitai 外只有 HuggingFace 可导入**。Tensor.Art（只给元数据）/ LiblibAI / SeaArt / Shakker（鉴权阻断直链、定位托管出图）全部不可行。

HF 与 Civitai **机制同构**，所以本方案 = 把 Civitai 子系统复制一份、换数据源 + 解决三处差异（item 形状、license 信号、base-model 过滤参数）。

---

## 2. 现状回顾：Civitai 导入怎么工作（HF 要镜像的模式）

| 层      | 文件                                                                                           | 职责                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 常量    | `src/constants/lora.ts`                                                                        | 区段 `MINE/TRAIN/COMMUNITY`、base-model chip 值、`CIVITAI_BASE_MODEL_FAMILY_MEMBERS`（chip→raw baseModel 映射）、`CIVITAI_BASE_MODEL_GENERATABILITY`                |
| Service | `src/services/civitai-lora.service.ts`                                                         | `listCivitaiLoras()` 查 Civitai 公开 API → Zod 校验 → `toLibraryItem()` 归一成 `CivitaiLoraLibraryItem`；family-bucket 过滤、分页游标、over-fetch 绕 coverage bug   |
| 类型    | `src/types/index.ts`                                                                           | `CivitaiLoraLibraryItem`（extends `LoraAssetRecord`，带 Civitai 专属字段：modelId/modelVersionId/allowCommercialUse/AutoV3 hash/mined prompt…）                     |
| Route   | `src/app/api/lora-assets/civitai/route.ts`                                                     | **GET、无 auth**（公开读代理）、Zod 校验 query、edge 缓存 `s-maxage=900`                                                                                            |
| Hook    | `src/hooks/use-civitai-lora-library.ts`                                                        | 客户端 state：section / baseModel / sort / search / 分页                                                                                                            |
| UI      | `src/components/business/studio/lora/LoraWorkbench.tsx`                                        | `handleUse()` (:765 附近)、`CivitaiLoraInspector` (:1235)、`CivitaiLoraRow` (:1397)；用 `isCivitaiBaseModelGeneratable()` 决定按钮是「使用」还是「在 Civitai 打开」 |
| 收藏    | `favoriteExternalLora()` (`lora-asset.service.ts:275`) + `FavoriteLoraRequestSchema` (`types`) | Community 直接「使用」= 内存激活；「收藏」= 落库成 `LoraAsset(source:'imported')`                                                                                   |

**关键复用点（HF 几乎白嫖）：**

- `FavoriteLoraRequestSchema.provider` 是自由字符串 → 存 `'huggingface'` **无需改 schema**。
- `favoriteExternalLora` 已 source-agnostic（吃 name/triggerWord/loraUrl/type/baseModelFamily/provider/cover）。
- 生成链路（active stack → `merge-stack-loras` → `advancedParams.loras` → noobai-xl adapter fetch URL）**完全复用**，public HF 直链免 token。

---

## 3. 核心设计决策

### 决策 1：library item 形状 —— 泛化 vs 套进 Civitai 形状 ⭐ 最关键

HF item 的元数据和 Civitai 不同：无 modelVersionId、license 是单个 tag 字符串（非 `allowCommercialUse[]`）、有 downloads 无 thumbsUp、无 AutoV3 hash / mined-prompt。

| 方案                 | 做法                                                                                                                                                                                                                                                                                                                                                                                                             | 评价                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A. 泛化（推荐）**  | 抽 `ExternalLoraLibraryItem` 基类型（共享：provider 判别式 + id/name/loraUrl/baseModelFamily/triggerWord/cover/preview/tags/popularity/license 信号）。`CivitaiLoraLibraryItem extends ExternalLoraLibraryItem` 保留 Civitai 专属字段；新增 `HuggingFaceLoraLibraryItem extends ExternalLoraLibraryItem`。UI row/inspector 改吃基类型，Civitai 专属能力（mined prompt/outfit）按 `provider==='civitai'` 条件渲染 | 正确抽象、可扩展第三源；改动中等：动 189-file 的 types hub（**只新增类型 + 让旧类型 extends，向后兼容**）+ UI props 放宽 |
| B. 套进 Civitai 形状 | HF service 产出 `CivitaiLoraLibraryItem` 形状，modelVersionId 填哨兵、allowCommercialUse 从 license 推、AutoV3=null                                                                                                                                                                                                                                                                                              | UI 零改但**抽象泄漏**（HF item 顶着 Civitai 字段名）、mined-prompt 等 Civitai-only 逻辑要到处加 guard，债留给未来        |

**推荐 A**：与项目"暴露冲突不折中、选一种干净模型"的纪律一致。types hub 改动是纯新增（旧类型 extends 新基类），符合"只加可选字段/向后兼容"红线。

### 决策 2：UI 放哪 —— Community 内加 source 子开关 ⭐

| 方案                                    | 做法                                                              | 评价                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **A. Community 内 source 切换（推荐）** | 保持 `MINE/TRAIN/COMMUNITY` 三段不变；COMMUNITY 内加一个 `Civitai | HuggingFace` 子 toggle。base-model chip / search / sort / 列表 UI 全复用，仅切换后端源 | 不增顶层 tab；"Community"语义本就涵盖外部源；改动最小 |
| B. 新增顶层 section                     | `MINE/TRAIN/CIVITAI/HUGGINGFACE`                                  | tab 变多、割裂；不推荐                                                                 |

**推荐 A**。新增 `communitySource` 客户端 state（默认 `civitai`，保持现状）。`use-civitai-lora-library` 泛化为 `use-community-lora-library`（带 source 参数）或并列一个 `use-huggingface-lora-library`。

### 决策 3：license 过滤策略

Civitai 用 `allowCommercialUse` 含 `'Rent'`。HF 无此字段，只有逐 repo 的 `license` tag。

- 建 `HF_COMMERCIAL_OK_LICENSES` allowlist（如 `apache-2.0` / `mit` / `cc-by-4.0` / `openrail`/`creativeml-openrail-m` 中允许商用的）+ 明确 denylist（`cc-by-nc-*` / 含 `nc` / `*-nd` 受限 / gated / 无 license tag = unknown）。
- 归一成 `ExternalLoraLibraryItem.commercialUse: 'allowed' | 'restricted' | 'unknown'`，Civitai 侧由 `allowCommercialUse` 含 'Rent' 推导，HF 侧由 license tag 推导 → **两源共用一个 license 闸门概念**。
- v1：UI 显示 license 徽章 + 默认**过滤掉非商用/unknown**（可加"显示全部"开关）。注意：Civitai 的 'Rent' 闸门目前是 TODO 未强制——本方案顺带把它统一落地。

### 决策 4：v1 只支持 public repo（不做 gated / HF token）

HF gated repo 下载要 `Authorization: Bearer` header，noobai-xl 的 `loras` 字段只认 `civitai_token`、不认 HF token → 第三方 fetch 不到。**v1 只导入 public repo**（占绝大多数 LoRA），彻底绕开 token 复杂度。gated + HF token 列为未来工作。

---

## 4. 端到端数据流（HF）

```
HF /api/models?filter=lora&search=…&other=base_model:adapter:<repo>&full=true
  → huggingface-lora.service.ts: listHuggingFaceLoras()
       Zod 校验 → 取 siblings 里的 .safetensors → 拼 resolve 直链
       → license tag → commercialUse → 过滤
       → toExternalLibraryItem() (provider:'huggingface')
  → GET /api/lora-assets/huggingface (public, edge-cached, 镜像 civitai route)
  → use-community-lora-library (source='huggingface')
  → LoraWorkbench Community（source=HF）渲染同一套 row/inspector
  → 「使用」push 进 active stack  /  「收藏」→ favoriteExternalLora(provider:'huggingface') 落库
  → 生成：用户选 Illustrious_XL → Replicate delta-lock/noobai-xl 服务端 fetch HF resolve 直链 → 出图
```

**直链格式**：`https://huggingface.co/{repo}/resolve/main/{file}.safetensors`（public 免 token）。

---

## 5. 需要新增 / 改动的文件

### 新增

| 文件                                           | 内容                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/services/huggingface-lora.service.ts`     | `listHuggingFaceLoras()` + HF model→item 归一 + license 解析（镜像 civitai service） |
| `src/app/api/lora-assets/huggingface/route.ts` | GET public 代理，镜像 civitai route（无 auth + edge cache）                          |
| `src/hooks/use-huggingface-lora-library.ts`    | 或把 civitai hook 泛化为 `use-community-lora-library`                                |
| `src/lib/hf-license.ts`                        | license tag → `commercialUse` 判定 + allowlist                                       |

### 改动

| 文件                           | 改动                                                                                                                               | 风险                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/types/index.ts`           | 抽 `ExternalLoraLibraryItem` 基类型；`CivitaiLoraLibraryItem` extends 它；加 `HuggingFaceLoraLibraryItem` + `commercialUse` 字段   | **高**（189-file hub）——纯新增 + extends，保持向后兼容 |
| `src/constants/lora.ts`        | 加 `COMMUNITY_SOURCES`(civitai/huggingface) + `HF_BASE_MODEL_FAMILY_MEMBERS`（chip→HF base_model adapter repo）+ license allowlist | 中（178-file）                                         |
| `src/constants/config.ts`      | 加 HF API endpoint 常量                                                                                                            | 低                                                     |
| `src/lib/api-client.ts`        | 加 `listHuggingFaceLorasAPI()` wrapper                                                                                             | 低                                                     |
| `LoraWorkbench.tsx`            | Community 内加 source toggle；row/inspector props 放宽到 `ExternalLoraLibraryItem`；Civitai-only 能力按 provider 条件渲染          | 中（1993 行大文件）                                    |
| `src/messages/{en,ja,zh}.json` | source toggle / license 徽章文案 ×3                                                                                                | 低                                                     |

---

## 6. HF base-model family 映射（草案，需实测校准）

chip → HF `base_model:adapter:<repo>` 过滤目标（与 `CIVITAI_BASE_MODEL_FAMILY_MEMBERS` 对齐 family 概念）：

| Chip        | HF base_model adapter repo（候选）                                                             |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Illustrious | `OnomaAIResearch/Illustrious-xl-early-release-v0` / `Laxhar/noobai-XL-1.0`（NoobAI 同 family） |
| SDXL 1.0    | `stabilityai/stable-diffusion-xl-base-1.0`                                                     |
| Flux.1 D    | `black-forest-labs/FLUX.1-dev`                                                                 |

> 实测确认过 `?other=base_model:adapter:Laxhar/noobai-XL-1.0` 返回结果。具体 repo 列表上线前用 HF API 逐个核。

---

## 7. ⚠️ 验证门（吸取 Anima 教训：先验证再上）

**写 UI 前**先做一次真实冒烟：取一个 **public HF Illustrious/NoobAI LoRA 的 resolve 直链**，塞进现有 Illustrious_XL（`delta-lock/noobai-xl`）生成路径，确认：

1. noobai-xl 的 `loras` 字段接受 HF resolve URL（非 Civitai 域）
2. 真的能 fetch + 加载 + 出图（LoRA 风格生效）

通过才继续。**不要重蹈 Anima 未验证就上的覆辙。**

---

## 8. 分步落地（一动作一 commit）

0. **冒烟**：HF 直链 × noobai-xl 验证（门）
1. 类型：抽 `ExternalLoraLibraryItem` + `commercialUse`（types + 让 Civitai item extends，跑全测试确认向后兼容）
2. 常量：`COMMUNITY_SOURCES` + `HF_BASE_MODEL_FAMILY_MEMBERS` + license allowlist + config endpoint
3. service + route + api-client wrapper + 单测（镜像 civitai 的测试）
4. hook（泛化或新建）
5. UI：Community source toggle + props 放宽 + 条件渲染 + i18n×3
6. license 闸门统一落地（Civitai 'Rent' + HF license 共用）
7. 端到端验证：lint + build + vitest + 手动跑 HF LoRA 出图

---

## 9. 明确不做（v1 范围外）

- ❌ gated HF repo + HF token（noobai-xl 不认 HF token）
- ❌ Civitai-only 的 prompt mining / outfit 抽取套到 HF
- ❌ HF 上的训练 / 上传
- ❌ 改 favorite 持久化 / 生成链路（都复用，零改）

---

## 10. 待拍板的开放问题

1. item 形状走 **A 泛化**（推荐）还是 B 套形状？
2. license 默认**过滤掉非商用/unknown**，还是默认全显示 + 仅徽章提示？
3. 顺带把 Civitai 的 `'Rent'` 闸门一起强制（决策 3），还是 HF 单独先做、Civitai 维持现状？
4. base-model 映射的 HF repo 清单，要不要先派调研把每个 family 的权威 adapter repo 核全？
