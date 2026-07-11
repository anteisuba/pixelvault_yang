# LoRA 公开库 · 搜索与图片引用 Bug 审计（2026-07-11）

> 顶层调查产出，交 Sonnet 执行。范围：`/studio/lora` 公开库（`section=community`）
> 的搜索链路与 civitai 图片引用。已在本次会话修掉的两项（封面代理、视频封面跳过）
> 见文末「已完成」，勿重做。

调查方法：直接打本机 API（`/api/lora-assets/civitai`，无 auth）+ 打 civitai
`search-new.civitai.com/multi-search` 与 `/api/v1/model-versions`，逐条实测，非推测。

---

## Issue A — 搜索出来的 LoRA 点「去生成」配方图永远空【图片引用 · 高信心】

**现象**：搜索命中的 LoRA（如 Phrolova）挂到脊柱条后，生成页「推荐」tab 恒显
「这个 LoRA 还没有可用的来源图配方」。浏览（无搜索词）命中的同一类 LoRA 却有配方。

**根因**：meilisearch 搜索路径构造的 `CivitaiLoraLibraryItem` 里
`fileHashAutoV3 = null`（`hitToLibraryItem` 里写死 null，注释称 hits 没有
files[].hashes）。而配方 hook `useCivitaiMinedPrompts` 的门是
`if (!fileHashAutoV3 || !modelId) → idle`，直接不发请求。API/service 也硬要 hash：

- `use-civitai-mined-prompts.ts` guard 卡 `!fileHashAutoV3`
- `api-client/lora-assets.ts` `mineCivitaiLoraPromptsAPI` 必传 `fileHash`
- `app/api/lora-assets/civitai/mined-prompts/route.ts` Zod `fileHash: z.string().min(8)` 必填
- `civitai-lora.service.ts` `mineCivitaiUserPrompts` 入参 `fileHashAutoV3: string`，
  且 `const targetHash = fileHashAutoV3.toLowerCase()`（null 会抛）

**关键事实**：service 内的 `fetchModelVersionSourceRecipes(modelId, modelVersionId,
targetHashLower: string | null)` **签名本就接受 null**，hash 只用于给配方标注「是否
用了本 LoRA」，**不是出配方的必要条件**。而搜索命中的 item **带 `modelVersionId`**
（实测 Phrolova versionId=2050454）。所以只要放开 hash 硬依赖，配方就能出。

**修复（端到端把 fileHash 变可选，改按 modelVersionId 判定）**：

1. `use-civitai-mined-prompts.ts`：门改成 `if (!modelId || !modelVersionId) → idle`
   （不再要求 hash）；cacheKey 里 hash 段允许空串。
2. `api-client/lora-assets.ts`：`mineCivitaiLoraPromptsAPI` 的 `fileHash` 改可选，
   为空时不 set 该 query 参数。
3. `mined-prompts/route.ts`：Zod `fileHash` 改 `.optional()`；`modelVersionId` 建议
   改必填（无 version 时确实没法定位配方）。
4. `civitai-lora.service.ts`：`MineCivitaiUserPromptsInput.fileHashAutoV3` 改 `string
| null | undefined`；`targetHash = fileHashAutoV3?.toLowerCase() ?? null`；确认
   `/images` 兜底分支里 `resolveRecipeLoraSignals` 收到 null 不炸。
5. 测试：service 层加「无 hash 也能从 model-version images 出配方」用例；hook 层加
   「hash 缺省不 idle、按 versionId 触发」用例。

**验证**：`curl 'http://localhost:3000/api/lora-assets/civitai/mined-prompts?modelId=1494914&modelVersionId=2050454'`
（不带 fileHash）应回 `recipes.length > 0`。

---

## Issue B — NSFW 档搜索每页只出几张 / safe 档没真过滤【搜索 · 高信心】

**现象**：`nsfwOnly` 档搜索每页稀稀拉拉只几张；`safe` 档里内容 NSFW 的 LoRA 仍作为
卡片出现（只是封面被挡成占位）。

**根因**：`buildCivitaiSearchFilters` 只下推 `type = LoRA` + baseModel，**完全没带
nsfw 条件**。meilisearch 照常返回混合的一页 12 条，再由 `filterSearchHitsByNsfw`
**抓完 post-filter**：

- `nsfwOnly` 只留 `hit.nsfw===true` → 实测 12 条剩 6 条（每页被打稀，`total` 仍报
  未过滤的 489，分页 UI 误导）
- `safe` 只删「名字含 NSFW 关键词」的 → 内容 NSFW 但名字正常的 LoRA 照进列表

**已实测约束（Sonnet 直接用，别再试错踩限流）**：

- meilisearch `models_v9` 的 **`nsfw`（bool）不可 filter**。可 filter 的属性：
  `availability, canGenerate, category.name, checkpointType, fileFormats, hashes, id,
minor, nsfwLevel, poi, status, tags.name, type, user.id, user.username,
version.baseModel, versions.baseModel, versions.hashes, versions.id`。
- `nsfwLevel` **可 filter，但它是数组**（一个模型带多张图的 level 集合，如
  `[1,4]`、`[4,8,16,32]`）。meilisearch 数组 filter 是「任一元素满足即命中」，所以
  `nsfwLevel > 1` 会把 `[1,4]` 也算进来 → 不能干净地表达「safe=全部 SFW」。

**修复方向（Sonnet 定实现 + 实测收敛，二选一或组合）**：

- 方案 1（首选，改 source filter）：把 nsfw 下推进 meilisearch，页面在 source 就满。
  - `nsfwOnly`：`filter += "nsfwLevel > 1"`（命中含 NSFW 图的模型，足够贴近「仅 NSFW」）。
  - `safe`：`type=LoRA` 已经够（civitai 的 models_v9 是否已只含 SFW？实测：不带 filter
    的 12 条里 nsfwTrue=6，说明**没有**只含 SFW，safe 需要额外条件）。数组语义下没有
    干净的「全 SFW」谓词——退一步用 `minor = true`? 不对。**需 Sonnet 实测**
    `NOT nsfwLevel > N` / `nsfwLevel = 1` 的实际命中，选一个「尽量只留 SFW」的近似，
    并保留现有 `filterSearchHitsByNsfw` 的名字关键词兜底。
  - REST 浏览路径（`fetchCivitaiLoraPage` 用 `nsfw` query 参数）语义要与搜索对齐，
    避免两条路径 NSFW 行为不一致。
- 方案 2（兜底，保留 post-filter 但修页稀）：over-fetch（一次抓 `limit = pageSize * k`）
  再 post-filter 到 `pageSize`，用统一 cursor 记录 meilisearch offset，保证每页填满。
  代价是多抓，但对齐 source-filter 不可行时的稳妥退路。

**验证**：`nsfwOnly` 搜索页应稳定接近 12 条且全是 NSFW；`safe` 搜索列表里不应出现
明显 NSFW 的卡（封面 + 名字）。

---

## Issue C — 搜索翻页偶发「三四页内容一样」【搜索 · 中高信心】

**现象**：用户截图 page 3 与 page 4 显示同一批 12 条（且 total 在 477/489 间跳）。

**根因（非稳态，触发条件明确）**：稳态下 API 层分页**正确**——实测本机 API
page 1/2/3/4 返回完全不同的 id（Newest 递减、`fellBack:None`），客户端稳态复现也是
每页不同（overlap 0/12）。但用户会话里 civitai 对本机/服务器 IP **间歇 503**
（我在其 network 里直接看到过 `/api/lora-assets/civitai` 503）。`listCivitaiLoras`
在 meilisearch 失败时**静默回落 REST**（`listCivitaiLorasViaRest`，打
`sortFellBackToRelevance: true`）。两条后端**分页范式不同**：

- meilisearch 路径 = **offset 分页**（`offset = (page-1)*pageSize`，client 靠 page 号）
- REST 搜索回落 = **cursor scan 分页**（`cursorByPageRef` 那套）

`use-civitai-lora-library.ts` 的 `nextPage` 用 `canUseOffsetPagination =
debouncedSearch && !sortFellBackToRelevance` 在两种模式间切。**当某页走 meilisearch、
下一页 503 回落 REST（或反之），`sortFellBackToRelevance` 中途翻转，page 号与 cursor
map 不再自洽 → 重复/错位页。**

**修复方向（Sonnet 定实现）**：让「后端切换」不破坏分页契约，任一即可：

- 首选：**一次搜索会话内锁定后端**——首页决定走 meilisearch 还是 REST，后续页不再
  中途换（后端挂了就整体报错/重试，而不是偷偷换范式）。
- 或：回落 REST 时把 `sortFellBackToRelevance` 翻转**当作一次硬重置**（清 cursor map +
  回 page 1），别在旧 page 号上继续。
- 或：让 REST 搜索回落也走 offset 语义（若 REST 带 query 支持 page），page 号统一。
- 附带缓解触发源：civitai 对服务器 IP 的限流是 503 的根，`fetchCivitaiPayload` 的退避
  已有，但可评估给 meilisearch 失败加一次更长退避重试再回落，减少中途换后端的概率。

**验证**：人为让 meilisearch 间歇失败（或连续快翻页触发 503），翻页不应出现重复页；
`sortFellBackToRelevance` 翻转时 UI 行为可预期（要么整体降级、要么回第 1 页）。

---

## 非代码项 — Anima 底模显示「即将」不是 bug

`anima-runner` / 各 runner 底模的 `available = runnerAvailable(...)` →
`getModelById().available`，由 `FEATURE_FLAGS.comfyRunner =
process.env.NEXT_PUBLIC_FF_COMFY_RUNNER === 'true'` 门控。**flag 未开 → available=false
→ UI 显示「即将」**。这是 comfy-runner 收尾的部署开关（见
`docs/plans/comfy-runner-HANDOFF-2026-07.md`：剩 Vercel 配 RUNPOD_KEY + 翻
`NEXT_PUBLIC_FF_COMFY_RUNNER` + push），**不需要 Sonnet 改代码**，翻 flag 即好。
（hosted `anima-hosted` 恒「即将」是有意的——hosted 端点死链 + license 不许托管。）

---

## 本次会话已完成（勿重做）

- **封面并发直连 civitai 被限流 → 全黑**：渲染层 `proxyCivitaiImageUrl`（env 门控
  `NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE`）+ `LoraCoverTile` onError 兜底 + Cloudflare
  Worker `workers/civitai-image-proxy`（已部署 img.anteisuba.com）。commit `2f99de2d`
  / `c8794d09`。**生产仍需 Vercel 配该 env + 重部署**。
- **视频封面 `<img>` 渲染不了**：service 选图跳过 `type=video`。commit `dc541eef`。

## 通用要求

- 改前 `grep` 受影响面；`civitai-lora.service.ts` 是重要服务，只做向后兼容改动。
- 收尾全量 `npx tsc --noEmit` + `npx vitest run` 双绿（各 ~4–5min，后台跑捕获 exit code）。
- 三语 i18n 若动文案三个 json 同步。
- 别提交，实现 + 测试完回报给顶层，owner 点头再提交。
