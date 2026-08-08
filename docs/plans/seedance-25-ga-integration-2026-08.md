# Seedance 2.5 GA 接入 — 任务包（2026-08-08 立）

> **这篇管什么**：Seedance 2.5 的**三站接入**——火山方舟（cn）· BytePlus ModelArk（国际）· fal。触点、阻塞项与证伪方法。
>
> ⚠ **范围在 2026-08-08 扩过一次**：原计划只接火山（把已预留的两条从 `available: false` 翻开）。当日查实 BytePlus 与 fal 双双已 GA，owner 拍板**三站一次做完**。§1.5 是三站对照，§3.9 / §3.10 是后两站的触点。
>
> **这篇不管什么**：通道比价与 fal/BytePlus 侧结论——在 `docs/references/model-catalog.md` §⑥ §⑨ §⑫ §⑬。
>
> ⚠ **原能力事实文档 `docs/references/seedance-25-capability.md` 已被删除**（`c2729530`，2026-08-07 文档清理，理由记作「能力事实已被目录接管」）。**但 `model-catalog.md` 实际只接管了计费与通道状态，没有接管参数表、冲突 A 与超长视频的建模缺口。** 本包已把接入需要的部分内联到 §3.3 与 §6，无需回去翻；如需全文：
>
> ```
> git show c2729530^:docs/references/seedance-25-capability.md
> ```
>
> **⚠ 本文出自规划会话，执行在别的会话。** 下面凡标「候选」的都是候选，不是定论；每条都附了怎么证伪。锚点写的是「从这里开始查」，不是「问题在这里」。

## 1. 为什么现在能做了

| 闸                      | 07-31 复核时                                                               | 2026-08-08 复核                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上游是否开放 API        | ❌ 官方文档写「在线体验与 API 调用即将上线」                               | ✅ **08-07 火山引擎正式上线 Seedance 2.5 API 服务**（多家媒体同日通稿）；文档站导航已出现「Doubao Seedance 2.5 教程／提示词指南」，与 2.0 系列并列                        |
| 是否有可调用的 model id | ❌ 模型列表页只有族 id                                                     | ✅ **`doubao-seedance-2-5-260628`**，官方文档实读，见 §2                                                                                                                  |
| execution worker 分支   | ❌ `model-catalog.md` §⑫ 记「VolcEngine 至今没有 worker 分支，是第二道闸」 | ✅ **该记录已过时** —— `b4ecf638`（2026-08-01）「火山 Seedance 迁进 worker」，`seedance-25-reservation.test.ts:88-101` 的断言当天从 `execution-not-migrated` 翻成 `ready` |

**所以 2.5 现在是纯增量、零阻塞**：同一个 adapter、同一个 request builder、同一个 Ark endpoint，只剩「换 id + 按代分叉上限」。不存在排在后面的第二次集成，也不再有待证实的前提——§2 的 model id 与 §3.2 / §3.3 的字段约束都已由官方文档实读钉死。

> 顺手要修的文档错：`model-catalog.md:293` 那句「即便火山开了 API，Seedance 2.5 仍跑不了 —— VolcEngine 至今没有 execution worker 分支」已被 `b4ecf638` 推翻，改的时候连 §⑫ 末尾的「复查节奏」一起更新。

## 1.5 三站对照（2026-08-08 实读，火山与 BytePlus 的文档同为 08-07 更新）

|            | 火山方舟 · cn                              | BytePlus ModelArk · 国际                                                                                                                                                                                        | fal                                                      |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Model ID   | `doubao-seedance-2-5-260628`               | **`dreamina-seedance-2-5-260628`**（⚠ 前缀 `dreamina-` 不是 `doubao-`）                                                                                                                                         | `bytedance/seedance-2.5/{text,image,reference}-to-video` |
| Base URL   | `https://ark.cn-beijing.volces.com/api/v3` | `https://ark.ap-southeast.bytepluses.com/api/v3`                                                                                                                                                                | fal 常规                                                 |
| 720p 成本  | ≈ $0.213/秒                                | ≈ **$0.231/秒**（按单价比推算，非官方每秒价）                                                                                                                                                                   | **$0.4730/秒** = BytePlus 的 **2.06 倍**                 |
| 480p 成本  | —                                          | —                                                                                                                                                                                                               | $0.2205/秒                                               |
| token 单价 | 70 元/M（无视频输入）· 42（含）            | $10.70/M（无视频输入）· $6.40（含）                                                                                                                                                                             | 不按 token 计                                            |
| 个人用户   | ✅                                         | ✅ **文档明确列个人档**：180 RPM / 并发 3（企业 600/10）                                                                                                                                                        | ⚠ 见下                                                   |
| 区域       | 北京                                       | **仅 `ap-southeast-1` 有视频模型**（控制台显示为 **Asia Pacific (Johor)**，马来西亚柔佛——⚠ 早前本文写「新加坡」是我按区域代号臆测的，已更正）；eu-west-1 只有 seed-2-0 与 seedream-5-0-lite，欧洲用户也走这个区 | —                                                        |
| 输出格式   | .mp4                                       | .mp4 **+ .mov**                                                                                                                                                                                                 | —                                                        |
| 上架时间   | 08-07                                      | 08-07                                                                                                                                                                                                           | 2026-07-20，`status: public`                             |

**站点分工**：海外用户走 BytePlus（比 fal 便宜一半且明确收个人用户），国内走火山，fal 作为第三通道。

⚠ **fal 的准入仍是未澄清项**：07-31 记的是「early-access 白名单 + terms 写死 B2B only（须校验终端用户为企业）」。08-08 复查：early-access 那半看来解除了（三条模型 `status: "public"`、`licenseType: "commercial"`，与已接的 2.0 字段值完全相同）；但模型页 `end_user_id` 参数的说明仍写着「**Required for B2B access.** Unique identifier for your end customer.」，而我**只读到这一行参数说明、没读到 terms 全文**，无法判断 B2B only 准入是解除了还是仍在。owner 08-08 拍板 fal 也接——**接之前请先把 fal 的 terms 读完**，见 §3.10。

## 2. model id 已证实（2026-08-08 官方文档实读，原阻塞解除）

**`doubao-seedance-2-5-260628`** —— 火山方舟官方文档「视频生成教程」的模型能力表与全部 curl/Python 示例一致使用该 id。

- **来源**：`https://docs.volcengine.com/docs/82379/2298881`（旧 URL `www.volcengine.com/docs/82379/1366799` 会 301 到这里），页脚「最近更新时间：**2026.08.07 13:46:03**」——正是上线当天的版本。
- ⚠ **该站是 SPA，`curl` / WebFetch 只抓得到侧边栏导航**。本次是用真浏览器（claude-in-chrome）读到的，下次复查同理。

官方模型能力表的完整 id 对照（**顺带发现代码里 2.0 的两个 id 与官方一致，无需改**）：

| 模型              | Model ID                          | 项目代码                 |
| ----------------- | --------------------------------- | ------------------------ |
| Seedance 2.5      | `doubao-seedance-2-5-260628`      | ⬜ 待填（现为占位族 id） |
| Seedance 2.0      | `doubao-seedance-2-0-260128`      | ✅ 一致                  |
| Seedance 2.0 fast | `doubao-seedance-2-0-fast-260128` | ✅ 一致                  |
| Seedance 2.0 mini | `doubao-seedance-2-0-mini-260615` | 未接（2.0 三项欠账之一） |
| Seedance 1.5 pro  | `doubao-seedance-1-5-pro-251215`  | 未接                     |

> 附带确认：控制台首页横幅写着「Doubao Seedance 2.5 全面开放」，与 08-07 的通稿一致。

## 3. 触点清单

> ✅ **火山站已落码（2026-08-08，本会话）**。owner 拍板「火山之前可以跑，直接更新 2.5」——火山线在生产已跑 2.0，2.5 同 adapter / 同 endpoint / 同 key，只换 model id，不再单独验证。**实际改动比本清单原本记的五处多两处**，两处都是漏网的同源错误拷贝：
>
> | #   | 文件                                               | 改了什么                                                                                                                                                                                   |
> | --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | 1   | `constants/models/video.ts`                        | `externalModelId` → `doubao-seedance-2-5-260628`（×2）· `available` → true（×2）· 注释重写                                                                                                 |
> | 2   | `constants/video-model-capabilities.ts`            | 新增 `SEEDANCE_25_DURATIONS` [4,30] · reference 变体 `audio.maxReferences` 3 → **10**                                                                                                      |
> | 3   | `constants/video-model-send-plan.ts`               | 新增 `SEEDANCE_25_IDS` + 两代 SLOTS 常量，slots 按代分叉；纠正那条「2.5 沿用 2.0 的 9/3/3」的错误注释                                                                                      |
> | 4   | `constants/models/seedance-25-reservation.test.ts` | 从「守预留状态」重写成「守 GA 契约」，新增 2.0 回归断言                                                                                                                                    |
> | 5   | `src/messages/{zh,en,ja}.json`                     | 三语 description 去掉「预留中——火山尚未开放 API」                                                                                                                                          |
> | 6 ⚠ | `constants/models.ts`                              | **`RESERVED_MODEL_IDS` 清空** —— 原清单漏了。那个不变量的规矩是「模型一上线就删掉那行」，不删则 available:true 与 reserved 并存                                                            |
> | 7 ⚠ | `constants/reference-image-capabilities.ts`        | **图片上限 `max` 9 → 30** —— 原清单漏了。这是「2.5 沿用 2.0 形状」那条错误注释的**第二份拷贝**，且是真会卡住用户的那份（它管上传数量，send-plan 管发送契约，只改一处会让 UI 与请求对不上） |
>
> 闸门：`src/constants/` 21 个测试文件 165 个测试 + volcengine adapter 测试全过；三语键数一致（5203）且 REMOVED=0。
>
> **仍未做**：§3.3b 的 `ratio` 仅 adaptive 限制（需要设计，见 Q 包）、纯音频参考的 `min: 0` / `requiresReferenceImage: false`（需要 UI 先支持不传图）、§3.1 的 credit 定价（按 §3.9.2 实测值重算，是产品决策）。

按依赖顺序。每条都写了「怎么验」，别只照抄。

### 3.1 模型条目（`src/constants/models/video.ts:290-325`）

- `externalModelId` → `doubao-seedance-2-5-260628`（两条都要改，reference 变体共用同一个 id，与 2.0 的做法一致）
- `available` → `true`
- `cost` 现在是 `8`（沿用 2.0）。**2.5 官方定价比 2.0 贵约 50%**（70 / 42 元每百万 token，对 2.0 的 46 / 28），credit 定价要不要跟着动是产品决策，不是照抄——**这条建议单独问 owner，别顺手改**。
  - 怎么验现价：`docs/references/model-pricing.md` 里 2.0 的 credit↔成本换算方式，套 2.5 的新单价重算一遍。

### 3.2 时长（`src/constants/video-model-capabilities.ts:157,162`）—— 官方口径已确认

现在的 `supportedDurations` 是从 2.0 抄的 `[4..15]`，代码注释自己标了 PLACEHOLDER。官方文档「视频时长」段原文：

> Seedance 2.0 系列: [4,15] 或设置为 -1
> **Seedance 2.5: [4,30] 或设置为 -1**
> -1 表示智能指定时长，由模型在有效范围内自主选择合适的视频长度

⚠ **还有一条例外，代码里目前没有对应概念**：

> Seedance 2.5 在**视频编辑场景**下，duration **仅支持 -1**（自动保持与输入视频基本一致的时长），不支持自行设置具体秒数。

我们当前没有「视频编辑」这个动作（`videoExtension` 只有 `KLING_V3_PRO`），所以这条**暂时不影响**——但等有人接 2.5 的编辑能力时会撞上，先记着。

### 3.3 多模态素材上限（`src/constants/video-model-send-plan.ts:77-88`）—— ✅ 冲突 A 已裁决

2.0 和 2.5 **现在共用同一个分支**（`SEEDANCE_REFERENCE_IDS` 一个 Set 走到底）。必须按代分叉，否则二选一地错：要么 2.5 被 2.0 的上限卡住，要么 2.0 被放宽到它接不住的数字。

**裁决结果：手册那一列是对的，代码注释那一列描述的其实是 2.0 的契约，被错误地套给了 2.5。** 依据是官方文档「使用限制」段与「模型能力」表（2026.08.07 更新）：

| 字段             | Seedance 2.5（官方原文）              | Seedance 2.0 系列（官方原文）    | 代码现状                                |
| ---------------- | ------------------------------------- | -------------------------------- | --------------------------------------- |
| 多模态参考图片数 | **1~30 张**                           | 1~9 张                           | 9（2.0 的值）                           |
| 参考视频         | 单个 [2,30]s，**最多 10 个**，总 ≤30s | 单个 [2,15]s，最多 3 个，总 ≤15s | 3（2.0 的值）                           |
| 参考音频         | 单个 [2,30]s，**最多 10 段**，总 ≤30s | 单个 [2,15]s，最多 3 段，总 ≤15s | 3（2.0 的值）                           |
| 音频能否独存     | **✓ 支持纯音频参考**                  | ✗ **需搭配图片/视频**            | `audioRequiresVisual: true`（2.0 的值） |

音频那行的判据是模型能力表「多模态参考 → 音频参考」行：Seedance 2.5 打 ✓，2.0 / fast / mini 三列都写「✗（需搭配图片/视频）」。**所以分叉后 2.5 的 `audioRequiresVisual` 应为 `false`，2.0 保持 `true`。**

30 + 10 + 10 = 50，与 08-07 官方通稿的「最高 50 个全模态素材参考」自洽。

首帧/首尾帧场景的图片数另有规定，不走多模态参考那套：图生视频-首帧 = 1 张，首尾帧 = 2 张（2.0/2.5 相同）。

**结论已按纪律回写**：本节 + `model-catalog.md` §⑬。原 `seedance-25-capability.md` §1.4 那条立案随文档删除，此处即其归宿。

**软提示数字（来自即梦手册，非官方 API 约束，本次未在方舟文档中找到对应项）**：主体音视频 1–5 个效果好、6–10 稳定性下降；主体图 1–8 好、9–12 下降；视频编辑输入 ≤20s 好。用途是 UI 软提示不是硬校验——超过软线**给提示不禁用**（对齐 Hard Rule 8）。⚠ 这批数字的来源已删且未被官方文档复核，**当参考不当依据**。

### 3.3b ratio 的新约束（代码里没有这个概念，⚠ 会 400）

官方原文：

> Seedance 2.5 在**视频编辑、视频延长、首帧/首尾帧生视频**任务下，`ratio` **仅支持 `adaptive`**（自动保持与输入视频一致的宽高比），不支持自行设置具体宽高比。

2.0 没有这条限制。**我们有首帧/首尾帧形态**（`referenceMode: 'text-or-first-frame'` + `FIRST_FRAME_SLOTS`），所以这条是真会撞上的：用户选了 2.5 + 首帧图，UI 若还允许选 16:9，请求就是 400。

怎么处理是设计问题不是照抄题——建议在 §3.1 落码时一并问 owner：是「选了首帧就把宽高比锁成自适应」还是「按 Hard Rule 8 的气质给提示不禁用」。⚠ 这条是本次新查到的，**不在任何既有设计文档里**。

⚠ **与画布首尾帧的联动**：owner 08-08 拍板补上首尾帧能力（画布至今只送一张，详见 [`canvas-video-domain-cleanup-2026-08-08.md`](canvas-video-domain-cleanup-2026-08-08.md) §1）。首尾帧一旦做出来，2.5 上就会同时撞上本条 `ratio` 限制——**两件事要一起设计，别分头做完再发现打架**。

旁证（不是判据，只是方向）：08-07 官方通稿说「最高 50 个全模态素材参考」，与手册的 30+10+10=50 吻合，与 9+3+3=15 不吻合。

### 3.4 tripwire 测试本身要改（`src/constants/models/seedance-25-reservation.test.ts`）

**这条最容易漏。** 该文件第 79-85 行把 2.0 的 slots 断言钉死了：

```
expect(reference.slots).toMatchObject({
  images: 9, videos: 3, audio: 3, total: 12, audioRequiresVisual: true,
})
```

改了 3.3 之后这条必挂。它是 tripwire 不是 feature spec —— GA 时该做的是**把它从「守住预留状态」改写成「守住 GA 后的契约」**，而不是删掉。第 30-45 行那条 available×placeholder 的互斥断言在换了真 id 之后会自然失效（`if` 分支进不去），考虑改成正向断言：id 必须匹配 `doubao-seedance-2-5-\d{6}` 且 available 为 true。

### 3.5 i18n（`src/messages/{en,ja,zh}.json`）

`models.ts:72-73` 的 i18n key 是 `seedance25Volcengine` / `seedance25ReferenceVolcengine`。

- 怎么验：三个 locale 文件里这两个 key 是否都已存在（预留时可能已加）。**⚠ 改 messages JSON 禁用正则批量替换**，跨 256KB 的 `.*?` 会静默删掉别处的键——逐键改，改完逐键对比。

### 3.6 首页品牌图（已就位，无需动）

`home-v3.ts:347-348` 已有 `seedance-2.5-volcengine` / `seedance-2.5-reference-volcengine` 的 bytedance 图标映射。

### 3.7 其余官方约束（本次实读顺带查到，代码里都没有）

按「是否会咬人」排序：

1. ⚠ **不接受含真人人脸的参考图/视频**。官方原文：「Seedance 2.5 和 Seedance 2.0 系列模型**不支持直接上传含有真人人脸的参考图/视频**」，平台另有「Doubao Seedance 便利创作含肖像视频」的方案。**这条对 2.0 也成立，也就是说是既存问题不是 2.5 引入的** —— 用户拿真人照片当参考图会失败，我们目前没有任何提示。值不值得单独立项请 owner 判断。
2. **不支持离线推理**（`service_tier: "flex"`，价格是在线的 50%）。2.5 与 2.0 系列都不支持，仅 1.5 pro / 1.0 系列支持。别照着省钱思路去接。
3. **不支持样片模式**（`draft: true`，低成本预览后再出正片）。仅 1.5 pro 支持。
4. **分辨率**：只有 480p / 720p，**无 1080p / 4K**（4K 仅 2.0 独有）。代码 `supportedResolutions: ['480p','720p']` ✅ 已正确，`seedance-25-reservation.test.ts` 那条断言可原样保留。
5. **像素尺寸与 2.0 不同**：2.5 的 480p 16:9 = `854×480`，2.0 是 `864×496`；9:16 同理（480×854 vs 496×864）。720p 两代一致。若有任何地方按 2.0 的尺寸做预设或裁剪计算，要按代分开。
6. **图片格式**：官方写「其中，Seedance 1.5 pro 和 Seedance 2.0 系列模型新增支持 heic 和 heif」—— **原文没有点名 2.5**。可能是文档遗漏也可能确实不支持，**未确定，别当依据**；要用 heic 先实测一次。
7. **新能力**（2.5 与 2.0 系列都有，我们都还没接）：编辑视频、延长视频、联网搜索工具、返回尾帧图。属于 2.0 三项欠账的邻域，不在本包范围。

### 3.9 BytePlus 国际站（新增，照 MiniMax 双站模式）

**必须新开 adapter type，不能复用 `VOLCENGINE` + 改 baseUrl** —— 因为 key 是按 adapter type 存的，而 BytePlus 与火山方舟是两套账号体系、key 不通用。这与 MiniMax 的情况一模一样，[providers.ts:129](../../src/constants/providers.ts) 那句注释「Two stations, two entries」就是为它写的。

照 `MINIMAX_CN` 抄一遍（每一处都要，漏一处就是半通）：

1. `AI_ADAPTER_TYPES` 加 `BYTEPLUS = 'byteplus'`
2. `AI_PROVIDER_ENDPOINTS` 加 base URL
3. `PROVIDER_CONFIG` 加条目（baseUrl 指向上一条）
4. key 前缀提示（`providers.ts:161` 那张表，火山是 `'ark-...'`，BytePlus 待确认）
5. provider 优先级表（`providers.ts:183` 那张）
6. 默认模型映射（`providers.ts:208` 那张）
7. **`lib/platform-keys.ts` 的 `getSystemApiKey` 加 case → `process.env.BYTEPLUS_API_KEY`** ⚠ 这处是 2026-08-08 补进清单的，原九条漏了它。该文件是**手写 switch 不是自动派生**，漏了它平台代付那条路直接拿不到 key。变量名规范见同文件既有条目（`<PROVIDER>_API_KEY`），且 MiniMax 双站的注释已经写明**两站必须各自独立变量、不能用一个变量加区域开关**（「the two MiniMax stations issue keys that are rejected by the other host」）——BytePlus 与火山是完全相同的情况
8. 模型条目 ×2（base + reference），`externalModelId: 'dreamina-seedance-2-5-260628'`
9. i18n ×3
10. worker 侧确认 `providerBaseUrl` 透传能吃到新 base URL；若 worker 要自己取平台 key，`resolve-key` 回调那条路也要认 BYTEPLUS

**好消息**：管道不用改。`providerConfig.baseUrl` → `providerBaseUrl` 已经一路穿到 worker（[workers/execution/src/index.ts:2241](../../workers/execution/src/index.ts) 是 `context.providerInput.providerBaseUrl ?? VOLCENGINE_DEFAULT_BASE_URL`）。

### 3.9.1 ✅ 真机探针结果（2026-08-08，owner 的 key，越界参数，未产生生成）

向 `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` 发 `{"model":"dreamina-seedance-2-5-260628", ..., "duration":999}`，得：

```
HTTP 404
{"error":{"code":"ModelNotOpen","message":"Your account ... has not activated the model
dreamina-seedance-2-5-260628. Please activate the model service in the Ark Console.",
"param":"","type":"Not Found"}}
```

**三条事实就此钉死**：

1. **model id 正确** —— 报的是 `ModelNotOpen` 不是 `ModelNotFound`，服务端认识这个 id。§2 那个「第三方来源候选」现在是 API 亲口确认。
2. **base URL 与路径形状正确** —— 请求路由到了正确的处理器（能解析 `model` 字段并给出模型级错误），`/api/v3/contents/generations/tasks` 与火山一致。「volcengine builder 能复用」从推断前进到**接口层已验证**（⚠ 仍未验证的是成功路径的响应体结构，要等模型激活后补一次真实请求）。
3. **错误结构同款** —— `{"error":{code,message,param,type}}` 是 OpenAI 风格，与火山方舟一致 → 现有错误分类器不需要为 BytePlus 单开分支。

**当前唯一阻塞：模型未激活。** 控制台激活时报 `No available resource packs. Please purchase a resource pack first.`（`RuleType: CheckPaymentMethod`）——这是计费前置检查，不是 key 或模型的问题。解法二选一：勾选控制台的 **Enable Free Credits Only Mode**（只用免费额度，无需付费方式），或购买资源包 / 绑定付款方式。

⚠ 激活时**不建议 Select all**（42 个模型全开）+ **Automatically activate new models**：后者会让 BytePlus 以后新上的模型自动激活，一旦绑了付费方式就是一个没人看着的成本面。只激活实际要用的（Dreamina-Seedance-2.5 / 2.0 系列 / Seedream）。

### 3.9.2 ✅ 成功路径已跑通（2026-08-08，真实生成，BytePlus 国际线）

**这一站的推断项已清零。** 请求 `480p / 16:9 / duration 4`，任务 `cgt-20260808075608-thsls`，`status: succeeded`，视频已下载验看。

创建任务只回 `{"id":"cgt-..."}`；查询任务的完整响应体：

```json
{
  "id": "cgt-...",
  "model": "dreamina-seedance-2-5-260628",
  "status": "succeeded",
  "content": {
    "video_url": "https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/..."
  },
  "usage": { "completion_tokens": 38830, "total_tokens": 38830 },
  "created_at": 1786146968,
  "updated_at": 1786147078,
  "seed": 88034,
  "resolution": "480p",
  "ratio": "16:9",
  "duration": 4,
  "framespersecond": 24,
  "service_tier": "default",
  "execution_expires_after": 172800,
  "generate_audio": true,
  "draft": false,
  "priority": 0,
  "output_format": "mp4"
}
```

**结论**：

1. **响应体与火山逐字段同构** —— `content.video_url` / `usage.total_tokens` / `status` / `seed` / `resolution` 全部对得上火山文档示例。**「现有 volcengine request builder 能直接复用」由此从推断变成已验证**（提交与轮询两条路径都跑过了）。
2. **`generate_audio` 默认 `true`** —— 请求里**没有**传这个字段，响应回 true。与我们 `videoDefaults.generateAudio: true` 一致，但要知道这是上游默认不是我们设的。
3. **`video_url` 是 TOS 预签名 URL**，参数含 `X-Tos-Expires=86400`（24h）与 `X-Tos-Max-Requests=100`，与官方「视频保存 24 小时、下载上限 100 次」一致 —— 落 R2 必须在这个窗口内完成。
4. **耗时 110 秒**（480p/4s）。我们 `timeoutMs: 300_000` 够用，但 720p/30s 的长档要重新量。

**成本实测（对 §3.1 的 credit 定价有直接价值）**：

| 项                                  | 实测值                |
| ----------------------------------- | --------------------- |
| 480p / 4s / 含音频                  | **38,830 tokens**     |
| 折合每秒                            | ≈ 9,708 tokens        |
| 牌价成本（$0.0107/K，无视频输入档） | ≈ **$0.42**           |
| 资源包扣减（×1.671875）             | ≈ 64,914 资源包 token |

⚠ 这推翻了本文早前按火山定价换算的「480p/5 秒约 $0.4」——实测 4 秒就到 $0.42，**5 秒约 $0.52**。credit 定价按实测走，别按换算走。

**账号护栏已配**（owner 08-08）：买了 Seedance 2.5 的 5M token 资源包（$32 / 90 天），模型用量上限设 **2,900,000 tokens**。核验：`2,900,000 ÷ 38,830 ≈ 74 次`480p/4s，而资源包够 `5,000,000 ÷ 64,914 ≈ 77 次` —— 上限会在资源包耗尽**之前**触发，不会漏出按量付费。⚠ 超限是**自动暂停服务**且**改一次要等 2 小时**。

### 3.10 fal（owner 08-08 拍板加入）

fal 侧三条已 GA：`bytedance/seedance-2.5/text-to-video` / `image-to-video` / `reference-to-video`（2026-07-20 上架，`status: public`）。

**⚠ 第一步不是写代码，是读 terms。** §1.5 说明了为什么：`end_user_id` 参数写着「Required for B2B access」，而 07-31 的记录是「terms 写死 B2B only，PixelVault 作为个人消费者产品不符合准入」。**如果 B2B only 仍然成立，接了也不能合规使用**，而且影响的不止 2.5 —— 我们已经在 fal 上接了四个 2.0 变体，条款若真变过，那批也要重新对照。读完把结论写回 `model-catalog.md` §⑥。

条款过关后照 2.0 的既有形状加条目：2.0 的 fal 条目是「base/fast × 普通/reference」四条，`image-to-video` 走 `i2vModelId` 而不是独立条目（见 [video.ts:25](../../src/constants/models/video.ts) 的 `i2vModelId`）。2.5 没有 fast 档，所以大概是 **2 条**（普通 + reference），各自挂 `i2vModelId` 指向 image-to-video。

**成本提示**：fal 720p $0.4730/秒 是 BytePlus 的 2.06 倍，与 §⑪ 记的「字节系 fal 加价 1.6~2.2×」吻合。credit 定价必须按站分开算，别让三站共用一个 `cost` 值。

### 3.11 ⚠ 待决：三站在 UI 上怎么区分，以及条目膨胀

现有命名模式（[messages/zh.json](../../src/messages/zh.json) 实读）：fal 版无后缀（`Seedance 2.0`），火山版带后缀（`Seedance 2.0（火山引擎）`）。三站就需要第三个后缀。

**条目数会到 14**：现有 2.0 八条（4 变体 × 2 通道）+ 2.5 六条（2 变体 × 3 通道）。用户在模型选择器里看到十几个名字里带「Seedance」的条目，且**没有任何信息告诉他海外该选 BytePlus、国内该选火山**。

这不是本包能顺手解决的设计问题，**建议单独跟 owner 过一次**。可选方向（未拍板，仅列出来）：按区域自动路由而非让用户选／把站点降级成同一模型下的「线路」属性／沿用现在的平铺但在名字里给地域暗示。相关先例是 runner 那次的「命名 A 锁」（主名 + 徽标）。

## 4. 开工前先跑一次 2.0

`b4ecf638` 把火山迁进 worker 是 08-01 的事，本会话只做了代码层核对（白名单 `generate-video.service.ts:61-67` 有 VOLCENGINE、`workers/execution/src/models/volcengine/video-request-builder.ts` 存在且被 `index.ts:39-40` import、tripwire 断言 `execution: 'ready'`），**没有实跑验证**。

开工第一步建议真机跑一次 Seedance 2.0（火山线，非 fal 线）出片确认链路活着。这比事后从 2.5 的失败里反推便宜得多。

## 5. 闸门

- 全量 tsc + 全量 vitest（`full-gate` skill 的跑法），commit 前一次、串行
- 真机验收：2.5 文生视频一条 + 2.5 参考图一条，各确认落库
- ⚠ `git commit` 后台跑（pre-commit >2 分钟），用 `git commit -F <文件>` 不用 `-m @'…'@`

## 6. 明确不做

- ~~**不接 fal 侧的 `bytedance/seedance-2.5/*`**~~ —— **这条已作废**（2026-08-08）。原因是 07-31 时 fal 挂 early-access 白名单 + B2B only 条款；08-08 复查 early-access 已解除（`status: public`），owner 拍板三站全接。B2B 那半仍未澄清，处置见 §3.10。
- **不做超长视频的分镜预算建模** —— 原 `seedance-25-capability.md` §2.1 立案的缺口（该文档已删，此处为内联副本，**否则这条会随文档一起消失**）：ScriptDoc 的 `targetDuration` 是一个自由文本提示（`"8s"` / `"12-15s"`，上限 40 字符），**既不参与校验，也不向下分配到每个 shot**。30s 以内不痛（模型自己分配），一旦走到官方宣传的超长档，24 个 shot 谁长谁短、总和对不对得上目标时长就没有任何一层负责。**这是建模缺口不是实现细节**，独立立项，不塞进本包。
- **不为 2.5 新开节点族** —— 原文档 §2 的结论：手册四种模式（全能参考／智能编辑／超长视频／首尾帧）里，两种是画布既有形态、一种是参数扩档、两种是作用于已有节点的动词，**一种都不需要新节点**。与「名词做节点、动词做动作」的既定建模同向。
- **不动 2.0 的 slots** —— 分叉的意思是 2.5 走自己的数字，2.0 保持原样。

## Last Verified

2026-08-08 · **model id、时长范围、多模态素材上限、ratio 约束、§3.7 全部七条**均为火山方舟官方文档 `docs.volcengine.com/docs/82379/2298881`（页脚更新时间 2026.08.07 13:46:03）真浏览器实读；控制台横幅「Doubao Seedance 2.5 全面开放」同步确认。worker 分支与 tripwire 断言为本地代码实读。

2026-08-08 · **三站扩容**：BytePlus 的 model id / 区域 / 限流 / 能力取自 `docs.byteplus.com/en/docs/ModelArk/1330310`（页脚更新 2026-08-07 17:36:57）真浏览器实读，定价取自同站 Pricing 页；fal 三条模型的存在与 `status: public` 取自公开索引 API `fal.ai/api/models?keywords=seedance`（18 条，07-31 时 15 条），每秒价取自 fal 模型页。

2026-08-08 · **BytePlus 真机探针**（§3.9.1）：model id / base URL / 路径形状 / 错误结构四项由一次越界请求实测确认，未产生生成。区域说明从「新加坡」更正为控制台实显的 Asia Pacific (Johor)。

2026-08-08 · **BytePlus 成功路径已跑通**（§3.9.2）：真实生成一条 480p/4s，响应体结构、token 消耗、耗时、`generate_audio` 默认值、`video_url` 有效期全部实测。**BytePlus 这一站零推断项。**

⚠ **仍未实测项**：① **火山与 fal 两站的成功路径没跑过**（BytePlus 已跑通，接口同构所以风险低，但不等于验过）；② **reference 变体**（多模态参考、30 图/10 视频/10 音频）三站都没实发过，§3.3 的上限只是文档口径；③ §3.3b 的 `ratio` 仅 `adaptive` 限制未实测触发；④ §3.7 第 6 条 heic/heif 对 2.5 是否成立，官方原文未点名；⑤ §3.3 末尾那批「软提示」数字来自已删的即梦手册，未被方舟文档复核；⑥ **fal 的 B2B only 准入是否解除——只读了参数说明没读 terms 全文**，见 §3.10。
