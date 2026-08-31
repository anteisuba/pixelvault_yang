# `web_search_import` 搜索源比价（2026-08-30）

> ## ✅ owner 已拍（2026-08-30 深夜，原话）
>
> 「我感觉主要是给个预览的功能，用户确定了再落R2.」
> → **一律预览优先**：搜索只出预览候选进对话；**用户点选确认才转存 R2**（比推荐的
> 三层更简，等于把「用户挑中才转存」推广到全部来源——正好与导演内核 §3.1 既有实现同构，
> 且 user-directed storage 让 DMCA 姿态更稳）。首片后端=**Serper `/images`**（key 已配、
> 最便宜、唯一给保留权、缩略图不过期）；版权干净源（Wikimedia Commons / Met，见附录）
> 零 key 可后续追加为第二路召回。转存时写来源快照（复用 `Generation.snapshot Json?`
> 零迁移）+ 强制 `isPublic=false`。
>
> ## 附录 · 补充扫描回执（2026-08-30 晚，另一路后台调研）
>
> - **Flickr ❌ ToS 出局**：API ToS 明文禁「Cache or store any Flickr user photos
>   other than for reasonable periods」+ 商用 key 需人工审批——语料最好的一家死在合同上。
> - **Wikimedia Commons ⭐ 最佳零 key 干净源**：`haslicense:unrestricted` 3,747 万张
>   PD/CC0 位图（150 抽样零漏），一次请求带直链+完整机读许可（含 AttributionRequired）；
>   ⚠ 2026 新限流（无 UA 10/min，合规 UA 200/min，串行），无 NSFW 过滤需自己分类。
> - **Met ⭐ 工程最干净**：零 key、80 rps、`primaryImage` 非空即 CC0 的失效安全闸，
>   ~40.6 万 CC0 艺术图；⚠ 别用 `hasImages=true`（过度收缩 50,032→692）。
> - **Rijksmuseum 死了**（旧 API 410，新 API 无自由文本搜索）；**NASA 无逐张权利字段**
>   （ESA CC-BY 混在里面分不开）；**Smithsonian 520 万 CC0 里 68% 是标本扫描**；
>   **AIC 图床对本机 403（Cloudflare），生产出口需复验**；**Tavily/Exa 不是授权图源**
>   （页面刮图无许可数据）。

> 工作台助手操作员 P3「联网搜图入库」的搜索源选型报告。全部结论 2026-08-30 当日查证，
> 带 🔬 的是本机实测数字。出处清单在文末。**拍板前不接任何 key。**

## 〇、三条改变前提的现状

1. **Bing Search API 全家 2025-08-11 已退役**（继任 Grounding with Bing 不返回结构化图片 URL）→ 出局。
2. **Google Custom Search JSON API 不再接受新客户**（存量客户 2027-01-01 前迁移）→ 新接入不可能，出局。
3. **Brave 2026-02 砍掉免费档**，全档绑卡 $5/1k，且 ToS 禁止存储/缓存搜索结果 → 不能做默认档。

结论：**通用图搜已无官方一手 API**，只剩 SERP 代理（Serper / SearchAPI / SerpApi）。

## 一、版权干净源（可直接落 R2）

|               | 配额/价                   | 直链                       | ToS 能否下载再托管                                   | license 字段                           | 门槛        |
| ------------- | ------------------------- | -------------------------- | ---------------------------------------------------- | -------------------------------------- | ----------- |
| **Openverse** | 全免费，注册后 10,000/day | ✅ 🔬20/20 裸 GET 通       | ✅ 逐张 CC 许可；聚合器免责，署名义务是硬的          | ⭐ 最全（license/attribution/creator） | 零 key 可用 |
| **Pexels**    | 免费 20,000/月            | ✅ `src.original`          | ✅ ToS 明文授予 download/copy/modify 商用权          | ❌（统一 Pexels License）              | 即时发 key  |
| **Pixabay**   | 免费 100/min              | ✅（原图需申 full access） | ⭐ **明文要求你下载到自己服务器**（禁止永久热链）    | ❌（统一许可）                         | 即时发 key  |
| **Unsplash**  | 5,000/hr 需审核           | ⛔                         | ⛔ **ToS 强制 hotlink**，与落 R2 逐字冲突 → **出局** | —                                      | —           |

🔬 关键实测差异：**Openverse 有 1024px 天花板**（20/20 无一张 ≥2000px，Flickr `_b` 上限，改后缀升不上去）；**Pexels 20/20 全部 ≥2000px**（最高 6000）。

## 二、通用图搜（SERP 代理）

|                       | 价                     | 直链                               | ToS 存储条款                                               | 备注                                                      |
| --------------------- | ---------------------- | ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| **Serper** ⭐项目已接 | 免费 2,500 次；$1/1k   | ✅ 原图 + gstatic 缩略图**不过期** | ⭐ 唯一给保留权：_"for as long as your use case requires"_ | `SERPER_API_KEY` 已在 `.env.local`，`/images` 同 key 同域 |
| SearchAPI.io          | 免费 100；$4/1k        | ✅（Bing 路真 URL 埋在 `riu=`）    | 无明文限制，但保障条款点名排除 storage                     | 次选（若要第二路召回）                                    |
| SerpApi               | 免费 250/月；$15–25/1k | ✅ 但**缩略图 31 天过期**          | 沉默；legal shield 明文不保版权使用                        | 不推荐：贵 15–25×+缩略图会 404                            |

🔬 通用网图直链可下载率：厂商自选样本 7 条里 2 条 403，且是 **Cloudflare JS challenge**（补 Referer 无效）——实际库更差。

## 三、法务风险结构

- **版权干净源 = 授权方直接给书面许可**（Pexels/Pixabay 是授予条款；Openverse 是聚合器免责+逐张 license，可 `license_type=commercial,modification` 过滤掉 NC/ND，🔬 实测只返 by/by-sa/cc0）。**署名义务是硬的**：落库不存作者/许可信息即违约。
- **通用网图 = 没有任何人给过许可**。三家 SERP 代理都把第三方内容责任明文推回给使用方；SerpApi 的 legal shield 保的是**他们抓取**的合法性，不保**我们托管**的合法性。
- **DMCA 512(c) 安全港对「AI 助手自动挑图落库」是灰区**（判例区分自动化功能与 manual selection）；若走通用档落库需 designated agent 注册（$6）+ 删除流程 + 重复侵权人政策，且建议过一次外部法律意见。⚠ 本段是风险结构不是法律意见。
- **owner 既有拍板（导演内核边界 7）**：外部资源许可=策略 C 自用优先（记录来源/作者/许可/抓取时间，明确禁止仍阻断）→ Unsplash（强制 hotlink）与 Brave（禁存储）按「明确禁止」阻断。

## 四、推荐方案：三层结构（沿用项目既有模式，非新发明）

⭐ 项目里已存在同构先例：导演内核 §3.1「图片证据只存 URL+缩略快照；**用户挑中要用的才转存 R2**，转存时落策略 C 来源快照」，`danbooru.connector.ts` 已实现。

| 层                 | 源                                                                                                   | 行为                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 默认档（直接落库） | Pexels 主（分辨率）+ Pixabay 补（明文要求下载）+ Openverse 广度（9.15 亿张 52 源，唯一机读 license） | 助手可直接 `uploadFromHttpToR2`                        |
| 通用档（只预览）   | Serper `/images`（已接的 key、最便宜 $1/1k、唯一给保留权、缩略图不过期）                             | 只返 URL 进对话；**用户点选才转存**，写 sourceSnapshot |
| 硬闸               | —                                                                                                    | 通用档导入的图强制 `isPublic=false`，不进公开画廊      |

**落地必补项**（全有现成模板）：Generation 加图片版 sourceSnapshot（照 `LoraSourceSnapshotSchema` 先例）· `EvidenceImageItem` 补 license/author/pageUrl（否则署名义务无处存）· `GenerationSourceSurface` 加导入值 · `uploadFromHttpToR2` 的 UA 必须带联系方式（🔬 wikimedia 空 UA 403、带域名+邮箱 200）· DMCA agent 注册。管线其余（SSRF 守卫/流式转存/MIME 检测/预览资产）已齐。

**拍板后第一步**：用已配的 `SERPER_API_KEY` 实调一次 `/images`（成本 1/2500 免费 credit），验字段与真实可下载率。

## 五、出处（全部 2026-08-30 查证）

Bing 退役: learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement · Google CSE 关新客: developers.google.com/custom-search/v1/overview · Brave ToS/定价: api-dashboard.search.brave.com/documentation/resources/terms-of-service, brave.com/search/api · Serper ToS/价: serper.dev/terms, serper.dev · SearchAPI: searchapi.io/pricing, /legal/terms · SerpApi: serpapi.com/pricing, /legal, /us-legal-shield, /search-archive-api · Openverse: docs.openverse.org/terms_of_service.html, github.com/WordPress/openverse · Unsplash: help.unsplash.com/en/articles/2511245, unsplash.com/api-terms · Pexels: pexels.com/terms-of-service, /api/documentation · Pixabay: pixabay.com/api/docs, /service/terms · DMCA: copyright.gov/dmca-directory/faq.html · Wikimedia robot policy: wikitech.wikimedia.org/wiki/Robot_policy

**未完成**：补充源扫描（Flickr 直连能否破 1024px 天花板 · Tavily/Exa）后台未回，回来后追加；Openverse 已含 flickr/wikimedia/europeana/smithsonian/met/nasa 六家，补充增量预计有限。
