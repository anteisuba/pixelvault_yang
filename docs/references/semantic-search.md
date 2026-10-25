# 语义检索（按意思搜）

owner 2026-10-25 定：三项都做——按意思搜（标签 / LoRA / 自己的图、提示词、角色）→ 相似画风 → 角色长期记忆。
本页记现行做法；进度看施工单 `p-semantic-search`。

## 组成

| 层       | 在哪                                                     | 说明                                                                  |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| 转向量   | Cloudflare Workers AI `@cf/qwen/qwen3-embedding-0.6b`    | 中日英同一空间；$0.0118 / 百万 token，无冷启动                        |
| 存 / 查  | Cloudflare Vectorize `antei-semantic`（512 维 · cosine） | 元数据索引 `kind`（string）、`category`（number）                     |
| Worker   | `workers/semantic-index`                                 | `/upsert` `/delete` `/query`，Bearer `INDEX_TOKEN`                    |
| 应用接头 | `src/services/semantic-search.service.ts`                | `SEMANTIC_INDEX_URL` / `SEMANTIC_INDEX_TOKEN`；查失败回空，写失败抛错 |
| 常量     | `src/constants/semantic-search.ts`                       | kind、公共区名、分数下限                                              |

- **namespace 分归属**：公共库（Danbooru 标签、Civitai LoRA）在 `public`；以后每个用户自己的东西各一区，互相查不到。
  向量 id = SHA-256(namespace + kind + key)：id 在整个库里唯一、不分 namespace。
- **kind 分来源**：现有 `danbooru-tag`。新来源加一个 kind，不另建库。
- **不对称**：存按「文档」算，查按「查询」算（Worker 里分好了）。
- **多类别逐类查**：带 `categories` 时每个类别单独 `$eq` 查一次再按分数合并，⛔ 用 `$in`：线上实测
  「水彩画风」筛 `$in [1, 5]` 时 watercolor\_(medium)（0.61）整个漏掉，回来的是 0.46 的画师名。
- **分数下限 0.55**：对上的 0.6–0.73，乱打的字最高 0.52（`SEMANTIC_SEARCH.MIN_SCORE`）。
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
  与意思（`findTagsByMeaning`），**字面在前、意思接后、重复去掉**，界面不变。向量由
  `scripts/index-danbooru-tag-meanings.ts` 从 `DanbooruTagName` 整表算出；重新导入中日文名后再跑一次。

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
