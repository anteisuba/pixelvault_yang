# Task Packet: 视频引用 V-1 — 发送翻译层（@名字 → @ImageN 位置绑定修复）

> 上游设计：`docs/plans/node-video-reference-seedance-design.md`（§1 三层 token / §3 发送规则 / §5 改动面）。owner 拍板：主图 1 张 / token 用 @Image1 / V-1 修复先上。
> 分工：Fable 出包（2026-07-11），Sonnet 执行。**这是线上正确性 bug 修复**（当前 @名字 大概率 Seedance 不认，参考图身份绑定失效），最高优先。

## Goal

- 画布视频节点发给 Seedance 的 prompt 里，把 `@名字`（@弗洛洛/@长麻花馆…）**按其参考图在 image_urls 的位置翻译成 `@ImageN`**（+ 名字降为括号说明），让 Seedance 原生的位置引用机制生效。音频/视频已是正确的 @AudioN/@VideoN 位置写法，不动。

## 背景事实（已核验，勿再改）

- Seedance 2.0 reference-to-video **只认位置 token** `@Image1/@Image2`（对应 image_urls 顺序），**不认自定义名字**；角色靠文字说明。三方权威含 fal 官方页核验（2026-07-11）。
- 现状 bug：`StudioNodeWorkbench` 装配时 image_urls（`referenceImages`）按位置排、图例 `buildShotReferenceLegend` 也按位置标「图N=名字」，**但 prompt body 里是 `@名字`（MentionInput 序列化），Seedance 读不懂** → 身份绑定丢失。

## Source of Truth（已侦察，精确）

- 装配点：`src/components/business/node/StudioNodeWorkbench.tsx` ~L962–1010 —— `referenceImages`（image_urls，去重+cap `maxReferenceImages`）、`referenceByUrl: Map<url, {name, kind/category}>`、`buildShotReferenceLegend(referenceImages, referenceByUrl)`、`mergedPrompt`（含 @名字）。发送在 ~L687（`prompt: plan.finalPrompt`）/ L786（`referenceImages`）。
- @名字 tokenizer：`src/components/business/node/composer/MentionInput.tsx` L40–67（`segmentPromptTokens`——CJK 无词界，`@` 后贪婪匹配已知名，返回 `{type:'token',name}`）。**复用它做 body 替换**，别自造 regex。
- 图例：`src/lib/node-workflow-graph.ts` `buildShotReferenceLegend`（L302）—— 已按 referenceImages 顺序产「图N=名字（分类）」/「图N：kind「名字」」。
- 音视频正确先例：`src/services/prompts/seedance-prompt-plan.service.ts` L46/56（@Video{n}/@Audio{n} + 名字说明）。

## 改动清单（精确）

1. **建 名字→@ImageN 映射**（StudioNodeWorkbench 装配处，`referenceImages`+`referenceByUrl` 就绪后）：
   - 遍历 `referenceImages`（最终顺序），对每个 url 从 `referenceByUrl` 取 `name`，建 `Map<name, imageIndex>`（index 从 1）。同名多图取首个位置（一个身份一个绑定 token；主图概念在 V-2，V-1 先按现有 referenceImages 首次出现位置）。
2. **翻译 prompt body**：用 MentionInput 的 `segmentPromptTokens`（抽成可复用纯函数，若尚未导出则导出）把 `mergedPrompt` 切成 text/token 段；对 `token.name` 命中映射的，替换为 `@Image{index}`；**首次出现追加括号名字**「@Image1（弗洛洛）」，同名后续只 `@Image1`。命中不到映射的 @token（无对应参考图）→ 原样保留（不臆造）。
   - 产出 `seedancePrompt`（翻译后），发送用它替代 `mergedPrompt`（`prompt:` 处）。**创作层不变**：节点存的 prompt / MentionInput 显示仍是 @名字，只有发送出去的那份翻译。
3. **图例对齐**：`buildShotReferenceLegend` 产的图例改用 `@ImageN` 前缀与 body 一致（如「@Image1 = 弗洛洛（画风）」），或若 body 已内联括号名字则图例可精简/去除——二选一，报告说明选择。保持 body 与图例不矛盾。
4. **1 图/卡（默认，低风险）**：⚠ 本片**可选**——若「每卡只送首图」改动面可控则做（harvest 每卡取 1 图），否则**留 V-2**（主图 picker 一起做），V-1 只做翻译。**翻译是本片必做核心；1 图/卡 视改动面决定，报告说明。**
5. **只送已引用**：**不在本片**（couples 管理素材 UI = V-3，无 UI 会让「连了没发」困惑用户）。本片维持现状发送集合，只修 body token 绑定。设计稿 §7 已记此排序调整。

## Allowed File Scope

- `StudioNodeWorkbench.tsx`（装配处翻译）· `MentionInput.tsx`（抽 `segmentPromptTokens` 为可导出纯函数 + test）· `node-workflow-graph.ts buildShotReferenceLegend`（图例前缀）· 相关 `.test.ts`
- 新增纯函数可放 `lib/`（如 `translatePromptTokensToPositional`）+ 单测（类型不合/同名/未命中/多身份各一例）
- 设计稿 §5/§7 回写实现选择

## Forbidden File Scope

- 不动音频/视频 token（已对）· 不动 services/api/prisma 的发送契约（referenceImages 数组不变，只改 prompt 字符串）· 不做主图字段（V-2）· 不做「只送已引用」（V-3）· 不动 UI 面板
- ⚠ 不 kill 3000、不 build、Edit/Write only、不 commit、禁任意值

## Acceptance / Validation

- 发送给 Seedance 的 prompt：`@弗洛洛` → `@Image1（弗洛洛）`，位置对应 image_urls 里弗洛洛主图的 index；多身份各自 @ImageN；未命中 @token 原样留；音视频 @AudioN/@VideoN 不变。
- 创作层不变：节点存的 prompt / composer 显示仍 @名字。
- 纯函数单测覆盖：单身份/多身份/同名多图/未命中/无参考图。
- lint / 全量 tsc / 全量 vitest 绿。
- **实证（强烈建议）**：真机 A/B——同素材同 prompt，@弗洛洛（旧）vs @Image1（新）各出一条 Seedance 视频，比对参考图身份是否更准（少量生成额度，owner 或 dev 实例）。文档证据已够判 bug，A/B 是锦上添花的实证。

## Documentation Sync

- 设计稿 §5/§7 标 V-1 实现选择；status.md 与归档由 Fable 收尾。
