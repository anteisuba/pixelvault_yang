# 语义检索（按意思搜）

owner 2026-10-25 定：三项都做——按意思搜（标签 / LoRA / 自己的图、提示词、角色）→ 相似画风 → 角色长期记忆。
本页记现行做法；进度看施工单 `p-semantic-search`。

## 组成

| 层       | 在哪                                                     | 说明                                                                  |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| 转向量   | Cloudflare Workers AI `@cf/qwen/qwen3-embedding-0.6b`    | 中日英同一空间；$0.0118 / 百万 token，无冷启动                        |
| 存 / 查  | Cloudflare Vectorize `antei-semantic`（512 维 · cosine） | 元数据索引 `kind`（string）、`category`（number）                     |
| Worker   | `workers/semantic-index`                                 | `/upsert` `/delete` `/query`，Bearer `INDEX_TOKEN`                    |
| 内部调用 | 同一 Worker 的 `SemanticIndex` 入口（service binding）   | 别的 Worker 直接 RPC（`query` / `upsert` / `remove`），不经公网       |
| 应用接头 | `src/services/semantic-search.service.ts`                | `SEMANTIC_INDEX_URL` / `SEMANTIC_INDEX_TOKEN`；查失败回空，写失败抛错 |
| 常量     | `src/constants/semantic-search.ts`                       | kind、公共区名、分数下限                                              |

- **namespace 分归属**：公共库（Danbooru 标签、Civitai LoRA）在 `public`；以后每个用户自己的东西各一区，互相查不到。
  向量 id = SHA-256(namespace + kind + key)：id 在整个库里唯一、不分 namespace。
- **kind 分来源**：现有 `danbooru-tag`、`civitai-lora`。新来源加一个 kind，不另建库。
- **不对称**：存按「文档」算，查按「查询」算（Worker 里分好了）。
- **多类别逐类查**：带 `categories` 时每个类别单独 `$eq` 查一次再按分数合并，⛔ 用 `$in`：线上实测
  「水彩画风」筛 `$in [1, 5]` 时 watercolor\_(medium)（0.61）整个漏掉，回来的是 0.46 的画师名。
- **分数下限 0.55**：对上的 0.6–0.73，乱打的字最高 0.52（`SEMANTIC_SEARCH.MIN_SCORE`）。
- **查询句向量记在 isolate 里**（最多 500 句）：同一句话不再转向量。⛔ Cache API：workers.dev 与 RPC 里都不生效。
  `/query` 响应带 `Server-Timing: embed;dur=…, vector;dur=…`。
- **截维**：模型原生 1024 维，存前 512 维再归一化。换维度 = 新建一个库、全量重算。

## 选型与费用（2026-10-25）

细账 `/mnt/project-files/rag/cost-2026-10-25.md`。要点：

- 否掉 Modal 自托管（Qwen3-VL-Embedding-2B）：每次唤醒按秒付冷启动 + 空闲，约 $0.01 / 次，人多了线性涨，冷启动 10–20 秒。
- Vectorize 每月 ≈ (查询次数 + 存的条数) × 维度 × $0.01/百万 + 存的条数 × 维度 × $0.05/亿，减去 Workers 付费版自带额度。
  全量（标签 14.8 万 + LoRA 68 万 + 用户几千）512 维约 $4.2/月，在 Workers 付费版 $5 之外；人多几个几乎不变。

## 实测（2026-10-25，5000 个通用 / meta 标签 × 30 句中日英）

| 存的字          | 查询侧    | 1024 维 | 512 维    | 256 维 |
| --------------- | --------- | ------- | --------- | ------ |
| 名字 + 中文注释 | queries   | 30/30   | **30/30** | 29/30  |
| 只有名字        | queries   | 29/30   | 28/30     | 29/30  |
| 名字 + 中文注释 | documents | 27/30   | 28/30     | 27/30  |

（前 10 名里有要的标签算命中。）所以：标签存「英文名 / 中文名 / 日文名 — 中文注释」（`danbooru-tag-meaning.ts`），查按 queries，512 维。

## 接进来的地方

- **Danbooru 标签**（标签库查资料 + 助手查标签）：`danbooru.connector.ts` 的 `matchPage` 同时问字面（自家中日文名词库、Wiki 别名、英文模糊）
  与意思（`findTagsByMeaning`），**字面在前、意思接后、重复去掉**，界面不变。意思那边一开始就问、与字面几步同时跑；
  字面已排满时只再等 300 ms（同上的限时）。向量由
  `scripts/index-danbooru-tag-meanings.ts` 从 `DanbooruTagName` 整表算出；重新导入中日文名后再跑一次。
- **Civitai LoRA 大库**（LoRA 库搜索 + 助手查 LoRA，都走 civitai-index 的 `/search`）：`workers/civitai-index/src/meaning.ts`。
  - 存的字：「名字 / tags: 前 12 个 / triggers: 前 5 个 / base: 底模」，至多 600 字；key = model_id。
  - 什么时候算：每行记 `embedded_fp`（算时的 `light_fp`，迁移 0007）；每日同步完接着算「两者不等」的行（部分索引
    `lora_embed_pending`）。首灌或改了拼字口径后 `POST /embed` 单独开一轮（只算不同步）。算失败不算同步失败，明天接着算。
  - 怎么排（owner 2026-10-25 定）：**字面在前，意思接后**。有搜索词时与计数同时问意思前 50 条（≥ 0.5：线上实测真命中 0.53–0.71、乱码 ≤ 0.45），回 D1 过同样的
    底模 / 分级 / 内容类型筛选、去掉字面已命中的，接在字面结果末尾，总数 = 字面总数 + 这些。同一句话 10 分钟内不再问。
    语义那边出错只当没有。
  - **限时**（2026-10-26，owner 定先限时、「字面先出、意思随后补」留到 UI 统一）：实测转向量 0.5–4.5 秒、查向量库
    0.2–1.7 秒，忽快忽慢，字面搜索只要几十毫秒。这一页字面结果就排得满（且不是排到字面最后一条的那一页）时，意思那边只等
    300 ms，没回来就先出字面结果、总数先不算它们，后台照样算完记进缓存；字面不够一页时照等。
  - 首灌（2026-10-25）：`wrangler workflows trigger pixelvault-civitai-index-sync '{"embedOnly":true}'`，144 步 × 5000 行，每步约 1 分钟，共约 3 小时（瓶颈是模型调用，不是 D1）。
  - 向量库里上游已删的 LoRA 不专门删：回 D1 时对不上，自然不出现。
- **自己的图 / 提示词 / 角色 / LoRA**（第 3 块，2026-10-26）：⛔ 不给自己的东西另算向量，改成**先把搜索词翻成标签、再字面搜**。
  - 为什么：同日拿 400 张图实测，提示词多是一长串标签，整段算向量意思被冲淡：搜「下雨」13 张写了 rain 的一张没对上，
    乱打的字分数（0.24）与真词（0.23–0.47）分不开；切成 160 字小段也只好一点（乱码 0.31、真词 0.41–0.53）。
    而标签那份向量很准：下雨 → rain 0.67、猫耳 → cat_ears 0.72、白发 → white_hair 0.71、穿泳装 → swimsuit 0.68、雨の日 → rain 0.55。
  - 怎么翻：`search-expansion.service.ts` 的 `expandSearchQuery`——每个词（空格 / 逗号分开，最多 3 个）问中日文词库前 3 个 +
    按意思前 3 个（只要通用 / 作品 / 角色三类），换成空格写法（`cat_ears` → `cat ears`），去掉搜索词里已有的；同一句话 10 分钟内不再翻。
  - 怎么对：整词、不分大小写、空格下划线都算（`src/lib/search-words.ts`）：`rain` ⛔ 算进 `training`。
  - 接在哪（都是字面在前、翻译后对上的接后）：
    - 助手查库（`workspace.service.ts`）：图、角色、LoRA、提示词四类，字面不到 8 条才翻。图先按 ILIKE 粗筛 300 条 id 再整词筛。
    - 素材库搜索框（`generation.service.ts`，本人视角）：字面那几页翻完了，最后一页后面接上，同样的筛选与排序，最多 30 条，总数加上它们。
    - 角色库、提示词库、LoRA 库的「我的」：列表本来就整份在浏览器里，页面问 `GET /api/search/expand` 拿翻好的词（停打 300 ms 才问），
      在已载入的列表里再对一遍接在后面。角色对造型标签 / 外观 / 简介，提示词对名字 / 正文，LoRA 对名字 / 触发词。
  - 短板：说整体感觉的（「温柔的那个角色」）翻不出标签，留给第 5 块「角色记忆」。

## 运维

一次性建库（令牌要 Vectorize Edit）：

```sh
cd workers/semantic-index
npx wrangler vectorize create antei-semantic --dimensions=512 --metric=cosine
npx wrangler vectorize create-metadata-index antei-semantic --propertyName=kind --type=string
npx wrangler vectorize create-metadata-index antei-semantic --propertyName=category --type=number
npx wrangler secret put INDEX_TOKEN   # 与 Vercel 的 SEMANTIC_INDEX_TOKEN 同值
```

⚠ 元数据索引要在写入之前建：先写进去的向量不在索引里，按 kind / category 筛不到。
⚠ 两条 `create-metadata-index` 隔开跑、跑完用 `list-metadata-index` 确认两个都在：2026-10-25 连着发，
第二条显示「已排队」却没建上。

线上：Worker `https://pixelvault-semantic-index.xiuruisu.workers.dev`；Vercel 三个环境都配了
`SEMANTIC_INDEX_URL` / `SEMANTIC_INDEX_TOKEN`（2026-10-25）。
