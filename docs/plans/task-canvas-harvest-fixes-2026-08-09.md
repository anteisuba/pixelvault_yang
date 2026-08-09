# Task Packet: 画布收割链两条已证实缺陷 + 两条候选缺陷复现

> ✅ **本包已交付完毕（2026-08-09）。A / B / C / D 四条全部落地** —— C、D 超出本包原定的
> 「只复现不修」，复现结论成立后当轮修掉了。**逐条结论与修法在上游账本
> [`canvas-fable-followups-2026-08-09.md`](canvas-fable-followups-2026-08-09.md) §1 §2 §4，
> 那份是活账本，以它为准。**
>
> 两处与本包原文不一致，按新的来：
>
> - **B-3（删 `frameImage` 族本体）owner 拍板不做** —— 它会抽掉 B-1 刚修好的那段代码的
>   全部活输入，且存量节点归一没有无损答案（followups §2 顶部）。
> - **A 的「另一半提示」不需要新做** —— `ReferenceTokenChip` 的 `voiceNotReadyHint` 早就
>   挂着，上游判「静默」是静态调查没看到这个机制。**没新增 dropped 理由、没新增 i18n 键。**
>
> ── 以下为原始任务书，留档备查 ──────────────────────────────────────
>
> 交接自 Fable 设计档（2026-08-09）。上游账本：[`canvas-fable-followups-2026-08-09.md`](canvas-fable-followups-2026-08-09.md)。
> ⚠ **A、B 两条已用探针实跑证实**（证据见下），不是推断。C、D 两条**仍是候选，先复现再判**。

## Goal

- **A**：系统 TTS 音色接进视频生成时，音频能真的发出去；发不出去时**大声说出来**，不静默。
- **B**：两个未分类的关键帧节点，发给模型的图例不再**双双自称「首帧」**。
- **C / D**：两条候选缺陷各补一条**复现用单测**，把「是不是真的」变成确定性结论（本包只要求复现，**不要求修**）。

## Non-goals

- ⛔ **不要动**「图片生成读上游文本」——现行行为是有意设计的（`src/lib/node-workflow-prompt.ts:56-64` 注释写明），它是本轮设计的**新能力**，要随设计落地做，现在改会造出「能力已通但没有入口」的中间态。
- ⛔ 不做任何 UI 改版（腰带/槽架/模式切换器等全部属于设计侧未落地的方案）。
- ⛔ 不动连线合法性矩阵（`node-connection-rules.ts` 恒 true 是 owner 2026-07-28 拍板）。
- ⛔ C / D 只复现不修（修法要等复现结论）。

## Task Scene / Type

- debugging + QA（service/lib 层为主，零 UI 改版）

## Read First

- `AGENTS.md` · `CLAUDE.md` · `docs/README.md` · `docs/status.md`
- 本包上游：`docs/plans/canvas-fable-followups-2026-08-09.md`（§1 §2 §4 的证据框与夹具）
- `docs/references/pages/canvas-node-detail.md` §15（音色缺陷的原始记录）

## Source of Truth

| 关注点                  | 文件                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 音频收割                | `src/lib/node-workflow-graph.ts` — `readVoiceUrl`（约 :1050-1064）· `harvestUpstreamAudioBindings`（约 :1100）                                                                                            |
| 音色写入点              | `src/components/business/node/node-detail/VoiceDetailBody.tsx`（约 :170-180 选音色、:339 取样本）· `CanvasImageSelectionToolbar.tsx`（约 :1079-1089）                                                     |
| 字段定义                | `src/types/node-workflow.ts:220`（`voiceSampleUrl`）                                                                                                                                                      |
| 不发送提示              | `src/lib/node-video-send-preview.ts`（`dropped` 的收集口径，约 :216-238）                                                                                                                                 |
| 关键帧图例              | `src/lib/node-workflow-graph.ts` — `resolveKeyframeLegendCategory`（约 :727-737）· `harvestUpstreamVideoImageReferences`（约 :764-800）· `orderKeyframes`（约 :183-195）· `isKeyframeNode`（约 :111-133） |
| 图例分类常量            | `src/constants/node-studio.ts` — `NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY`（约 :665-671）· `NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS`（约 :427-428）                                                 |
| 待审队列 / approve（C） | `src/lib/node-review-queue.ts`（约 :46-54）· `CanvasImageSelectionToolbar.tsx`（约 :798）· `node-workflow-graph.ts` `getNodeMediaUrl`（约 :268-275）                                                      |
| 提案卡（D）             | `src/components/business/node/CanvasOpProposalCard.tsx`（约 :234 `canToggle`、:308 回执条件）· `StudioNodeAssistantDock.tsx`（约 :386-423 自动落 effect）                                                 |

⚠ **行号取自 HEAD `c6365637` 前后，并行会话可能已漂移。按符号名 grep，别照行号跳。**

## Allowed File Scope

- `src/lib/node-workflow-graph.ts`（A、B）
- `src/lib/node-video-send-preview.ts`（A 的提示那一半）
- `src/constants/node-studio.ts`（B，仅在需要新增分类常量时）
- 上述文件对应的 `*.test.ts`
- `src/components/business/node/CanvasOpProposalCard.test.tsx`（D 的复现测试）
- 新增测试文件（C 的复现测试，放同族目录）
- `src/messages/{en,ja,zh}.json`（**仅当 A 需要新增「音色发不出去」提示文案时**，三语必须同步、逐键对比）

## Forbidden File Scope

- `src/lib/node-workflow-prompt.ts` 与图片生成收割链（见 Non-goals 第一条）
- 任何 UI 结构改版（`composer/**`、`nodes/**` 的布局与形态）
- `prisma/**` · `src/app/api/**` · Clerk · credit
- `src/lib/node-connection-rules.ts`

---

## A · 系统 TTS 音色送不出声 ✅ 已证实

**证据（探针实跑，2026-08-09）**

```
系统音色（voiceId + voiceName + voiceSampleUrl，无 voiceReferenceAudioUrl）
  → harvestUpstreamAudioBindings(...) = []
对照组（带 voiceReferenceAudioUrl）
  → [{url:"…/real.mp3", nodeId:"v2"}]
```

**服务端补捞已排除**：`generate-video.service.ts` 只透传 `input.audioUrls`（约 :119、:290-292）；`voiceId` 在服务端只出现在 `cards/voice-card.service.ts`（卡片 CRUD），不在生成链路上。

**两件事都要做，缺一仍是静默失败：**

1. **接上 URL**：`readVoiceUrl` 的取值链加入 `voiceSampleUrl`。
   ⚠ **优先级要想清楚再定**：`audioClip.url` / `voiceReferenceAudioUrl` 是用户自己的音频，`voiceSampleUrl` 是系统音色的**样本**。若认为样本不该等同于配音素材，**正确解法可能不是接上它，而是让 UI 不再把这种节点判成 ready** —— 两条路选哪条请在动手前说明理由。
   ⚠ **陷阱**：`node-workflow-graph.test.ts`（约 :2052-2065）有一条 `skips voice nodes with no recorded audio URL` **把当前错误行为钉成了期望值**。它会红 —— 那是要一起改的，不是你改错了。
2. **补上提示**：这类音色在**候选阶段就没生成 binding**，因此不进 `dropped`（那里只收「超上限」与「审核未过」）。修完要让「有音色节点但发不出音频」这件事在发送预览里**可见**，否则用户仍然只是"没声音"。

**验收**

- 探针夹具（见上游文档 §5）跑出非空 binding，或（若选第二条路）该 voice 节点不再被判 ready。
- 发送预览里能看到这类节点的处置（发送 or 不会发送 + 原因）。
- 那条钉错的测试已改写为断言新行为，且**注释说明它原本锁的是缺陷**。

## B · 关键帧图例说谎 ✅ 已证实

**证据（探针实跑）**

| 夹具                                           | 今天的产出                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| 两个菜单建的关键帧（**都无** `imageCategory`） | `{name:"首帧1",category:"首帧"}` · **`{name:"首帧2",category:"首帧"}`** |
| 显式 frameStart / frameEnd                     | `首帧1/首帧` · `尾帧2/尾帧` ✅                                          |
| 混合（一个无分类 + 一个 frameEnd）             | `首帧1/首帧` · `尾帧2/尾帧` ✅ 恰好落对                                 |

⇒ **只有「两个都没标」才说谎**，但那正是**默认路径**（菜单建的关键帧不带 `imageCategory`，且**无媒体时没有任何 UI 能标**）。
⇒ 严重性：`name` 与 `category` **两处都说首帧**，模型分不出首尾。

**两种修法，请择一并说明理由：**

|                       | 做法                                                                                          | 代价                              |
| --------------------- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| **①止血（推荐先做）** | 无分类时**不再自称「首帧」** —— 按序位给中性文案（如「关键帧1/关键帧2」），或第二张起明确标尾 | 改动小、只碰 fallback；但双轨仍在 |
| **②连根拔**           | 随设计侧「关键帧菜单项退役、首尾语义只活在具名槽」一起清双轨                                  | 改动大、要等设计落地              |

**验收**

- 两个无分类关键帧的图例，第二条**不得再自称「首帧」**。
- 三组夹具（无分类 / 有分类 / 混合）各一条测试，锁住行为。
- ⚠ 改文案时**从常量取，别写字面量** —— `node-workflow-graph.test.ts` 曾因写死「关键帧首」字面量而在改名时红过（见 commit `159f0518` 说明）。

## C · 候选：referenceAsset 条目的 approve 可能操作错对象

**推断链**（未复现）：待审队列的 URL 集合**包含** `referenceAssets[].url`（`node-review-queue.ts` 约 :46-54）；approve 按钮取 URL 用 `getNodeMediaUrl`，只返回 `imageUrl ?? mediaUrl`（约 :268-275）。

**本包只要求**：补一条测试，构造「待审项的 URL 是某条 referenceAsset 而非主媒体」，断言 approve 写回到哪个对象上。

- **若写对了** → 这条不成立，在上游文档划掉。
- **若写错了** → 记录结论，修法另开（不在本包）。

不受影响的：助手 `generate` 主路径（写的就是 `mediaUrl`）。

## D · 候选：`autoAppliedCount === 0` 的不一致态

**推断链**（未复现）：`CanvasOpProposalCard.tsx` 约 :308 要求 `> 0` 才显回执，而约 :234 的 `canToggle` 只要求 `=== undefined` → 等于 0 时可能出现「**有应用按钮，但条目不可勾选**」。

**现有测试没覆盖**：`CanvasOpProposalCard.test.tsx` 约 :117 用 `autoAppliedCount: 0` 测的是**纯 `set_review_state` 批**（此时 `structuralOps` 为空，按钮本就不渲染）。

**本包只要求**：补一条「**结构 op 存在 + `autoAppliedCount: 0`**」的渲染测试，断言按钮与勾选状态是否自洽。

**顺带记录（不要求本包做）**：自动落那道闸的执行端 `StudioNodeAssistantDock.tsx`（约 :386-423）**零单测覆盖**。

## Assumptions / Open Questions

- ✅ 已确认：服务端不从 `voiceId` 补捞音频。
- ✅ 已确认：图例说谎只在「两个都没标分类」时发生。
- ❓ **A 的优先级选择**：`voiceSampleUrl` 该被当作可发送的配音素材，还是该让节点不判 ready？**动手前请给结论与理由。**
- ❓ **B 的修法**：①止血 还是 ②连根拔？**建议 ①**（②依赖尚未落地的设计）。
- ❓ A 若需新增提示文案，i18n 键名请先提出来再写。

## Acceptance Criteria

1. A：系统音色节点接进视频后，音频要么真的发出去，要么在发送预览里**明确显示不会发送 + 原因**；不再静默。
2. A：那条钉错的回归测试已改写并加注释说明它原本锁的是缺陷。
3. B：两个无分类关键帧的图例第二条不再自称「首帧」；三组夹具各有测试。
4. C：有一条测试给出 approve 对象的确定性结论（对或错都算完成）。
5. D：有一条「结构 op + applied=0」的渲染测试给出确定性结论。
6. 全量 tsc 0 error · eslint 0 error · 全量 vitest 绿。

## Validation / Evidence

```bash
npx vitest run src/lib/node-workflow-graph.test.ts src/lib/node-video-send-preview.test.ts
```

```bash
npx tsc --noEmit
```

- ⚠ **闸门三样都要跑**：全量 tsc + 全量 vitest **+ eslint** —— 前两样全绿仍可能被 pre-commit 的 eslint 拦（react-hooks 那两条前两样都不查）。
- ⚠ **dev server 是 owner 开的（3000），不要 kill、不要并行 build。**
- A 建议附一次真机取证：绑系统音色 → 打开「查看发送内容」→ 截图。

## Documentation Sync

- `docs/plans/canvas-fable-followups-2026-08-09.md` —— 把 §1 §2 标为已修（附 commit），C/D 按复现结论改判。
- `docs/references/pages/canvas-node-detail.md` §15 第 5 条 —— 音色缺陷修完后更新该条。
- ⛔ 不要改 `canvas-fable-report-2026-08-09.md` / `canvas-fable-brief-2026-08-09.md`（那是设计档账本，归设计会话）。

## Last Verified

- 2026-08-09 · Fable 设计档。A、B 经临时探针实跑证实（探针跑完已删，夹具存在上游文档 §5）；C、D 为静态推断未复现。行号可能漂移，按符号名 grep。
