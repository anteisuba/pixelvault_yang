# 视频镜头 Cast 结构重设计（按制作角色，非模态）

> 对象：`/studio/node` 视频（Seedance）节点详情面板的「参考素材」区 + prompt 编辑器
> 取代：v4 文档 §7 的部门条分组方案（四摄制部门 → 三模态卡 → **本文档的五制作角色卡**，见 §1 决策链）
> 关联：[`2026-07-04-node-video-detail-v4.md`](2026-07-04-node-video-detail-v4.md)（§7a/§7b-A 已交付的槽位/token/autospawn 引擎全部复用，只换分组）
> 状态：**待 owner 确认后施工**

---

## 1. 决策链（怎么走到这里的）

| 轮              | 分组方案                                                                                          | 结论                                           |
| --------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| v4 §4 C2        | 四摄制部门（选角/置景/动作/配音）                                                                 | 已定稿但未落地部门卡                           |
| 2026-07-05 上午 | owner 改判**按模态三卡**（图片/语音/视频）                                                        | 已实现；随后发现把「角色=视觉+听觉身份」拆散了 |
| 2026-07-05 下午 | owner 再判：**音色应绑角色，作为一个整体**；旁白也绑音色；要求按"AI 视频制作到底需要什么"重新整理 | 本文档                                         |

**Owner 已拍板**（2026-07-05）：

1. 五卡结构方向对（覆盖面需压测，见 §4）
2. **一个角色一条音色**（1:1）
3. **@token 原子化**排进来（见 §6）
4. 运镜设计要详细方案（见 §5）

## 2. X 调研摘要（中日英，2026-07-05 用 opencli 实查）

- **角色一致性是 AI filmmaking 的基石**，且角色被理解为「脸+衣服+音色」的**数字孪生**（日文圈：LoRA/IP-Adapter/InstantID 锁脸 + ControlNet 锁构图 + 口型同步串成"身份管线"）。
- **制作是分镜驱动**：`剧本 → 分镜(四宫格/3×3) → 用角色参考卡替换分镜角色 → Seedance 生成 → 配音/旁白 → BGM → 字幕`（中文圈原话："用角色参考卡为原分景图替换角色"）。
- **运镜是独立关注点**："99% 的一致性工作流，镜头一动就崩"；前沿玩法是 **Blender previs / iPhone 3D 走位实录 → 参考视频迁移运镜**（"Same reference video, different worlds"）。
- **旁白是独立工序且要管音质**（Seedance 直出音混环境噪声；日文圈单列「ナレーション生成」步骤，配音色）。
- 工具栈共识：Seedance(视频) · gpt-image-2(角色/道具/场景) · ElevenLabs(音色) · ComfyUI(一致性) · 剪辑后期(BGM/字幕不进生成)。

## 3. Cast 五卡结构（本设计核心）

按**制作角色**（production role）分组，不按图片/语音/视频模态分。一个视频镜头消费：

| 卡                 | 内容                                          | 数据映射（现有）                                                                                                                      | 引用方式                                   |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **角色**（可多个） | 参考图(脸/衣服) + **音色**(1:1) + [LoRA 可选] | image node `role=character`；voice node **连进角色节点**（`voice→character` 主连法，`harvestUpstreamAudioBindings` 已支持带名带封面） | 提示词 `@角色名`（原子 token，§6）         |
| **场景**           | 背景/置景参考图                               | image node `role=background`                                                                                                          | `@场景名`                                  |
| **镜头**           | 镜头参考图 + **首帧/尾帧** + 运镜（§5）       | image node `role=shot`；**keyframe（`role=frame`）归入本卡**（payload 里 keyframe 本来就排最前）                                      | `@镜头名`；首尾帧不入 prompt（纯 payload） |
| **动作**           | 参考视频（动作+运镜双 donor）                 | videoReference / 上游生成视频（`video_urls`，随连线自动送）                                                                           | 不入 prompt（自动图例可提「视1」）         |
| **旁白**（可选）   | **音色** + 旁白文本                           | voice node **直连视频节点**（不经角色）= 旁白位                                                                                       | 文本走 prompt 台词区                       |

**语音的两个家，没有第三处**：

- `voice → character → video` = 这个角色的音色（身份的一面，显示在角色槽的音色徽标上）
- `voice → video` 直连 = 旁白音色（显示在旁白卡）
- 独立「语音」卡**取消**。

**角色槽 UI = 身份单元**：脸缩略图 + 右下角音色徽标（有音色=mic+封面，无音色=＋直接配）。hover 预览浮层同屏显示脸+音色。

## 4. 覆盖面压测（owner 问题 1）

| 场景                             | 用到的卡                                                   | 覆盖                                     |
| -------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| 对话戏（多角色+台词）            | 角色×N(脸+音色) + 场景 + 镜头                              | ✅                                       |
| 口播/数字人                      | 角色(脸+音色)，台词属于角色                                | ✅                                       |
| 产品广告（无人物）               | 场景 + 镜头 + 旁白(音色)                                   | ✅ 角色卡空着即可                        |
| MV/舞蹈（动作迁移）              | 角色 + 动作(参考视频)                                      | ✅                                       |
| 打斗/动作戏                      | 角色×2 + 动作 + 镜头(运镜)                                 | ✅                                       |
| 风景/氛围片                      | 场景 + 镜头 + 旁白                                         | ✅                                       |
| 首尾帧控制（HyperFrames 类玩法） | **镜头卡收首帧/尾帧**（本设计新归位）                      | ✅（原三模态方案的缺口）                 |
| 多镜头串联/转场                  | videoMerge 节点，**面板外**，不属单镜头 cast               | ✅（边界明确）                           |
| BGM/音乐                         | 后期/`生成音频`开关，**不进 cast**                         | ✅（边界明确）                           |
| 全局画风/风格参考                | 不进 cast（风格是全局属性非镜头素材）；现走提示词/画风系统 | ⚠ 留白，如需"风格参考图"再议是否入镜头卡 |

**Escape hatch**（防"覆盖不全"）：任何不合类的图连进来默认按 `role=shot` 进镜头卡 + 提示词直书——五卡是引导不是墙，不会有素材"进不来"。

## 5. 运镜设计（owner 问题 4）—— 三层递进

对应用户成熟度渐进披露，三层可叠加：

**L1 · 运镜语法 chips（词汇助手）**

- 来源：`cinematic-grammar.ts` 的 SHOT GRAMMAR 词汇表（**已有资产**，模型中立）。
- UI：提示词工具栏「运镜语法▾」（v4 §4 C6 原计划），三组 chips：**景别**（远/全/中/中近/特/大特）· **角度**（平视/低角/高角/荷兰角/过肩/POV/鸟瞰）· **运动**（推/拉/摇/移/跟/甩/升降/手持/环绕/希区柯克变焦）。
- 点击 = 往提示词光标处插入标准片场短语（纯文本，非 token）。快、零学习成本。

**L2 · 结构化 camera 字段（机器可靠）**

- 节点 data 已有 `camera`/`motion` 字段；✨增强（seedance-prompt-plan）已会产出 per-segment camera。
- UI：镜头卡展开态给 景别▾/角度▾/运动▾/速度▾ 四个可空下拉，编译进 finalPrompt 的 camera 段。
- **后置**：等镜头卡本体落地后作为"高级展开"增量。

**L3 · 参考视频迁移（实拍级，前沿主流）**

- 动作卡的参考视频**天然带运镜**（X 共识：Blender previs / 手机 3D 走位 → Seedance 迁移）。**已有能力**（video_urls 已通）。
- UI 增量：动作卡槽位 hover 提示"参考视频同时提供动作与运镜"；文档/空态教育这个玩法。

**v1 落地 = L1 + L3 说明**（都是已有资产的薄 UI）；L2 后置。

## 6. @token 原子化（owner 问题 3 + 截图反馈）

现状问题：@角色名 是纯文本 → 可被改成半截（`@dani`）、会堆叠（`@daniabeijing @daniabeijing …`）、无视觉区分。

**目标行为**（owner 原话）：高亮、不可更改、删除时整个删。

**方案：提示词编辑器从 textarea 升级为最小 mention-input（contentEditable）**

- token 渲染为原子胶囊 span（`contenteditable=false`，端口色 25% 底 + 名字），光标进不去；Backspace/Delete 整枚删除。
- **不引重库**（lexical/tiptap/slate 都过重）：自研最小 contentEditable，因为只需要「文本 + 原子 chip」一种节点，无富文本诉求。
- **IME 守卫**：沿用项目 `IMEAwareTextarea` 的组合事件惯例（中文输入是主场景，composition 期间不做 DOM 手术）。
- 序列化：DOM → 纯文本（token → `@名字`）喂生成；发送图例机制（§7.2 ⑦）不变。
- **漂移问题消失**：token 携带 nodeId、是活引用——节点改名 token 标签自动跟随，v4 §7.2 ⑥ 的"改名漂移检测+替换"整套机制在新编辑器下**不再需要**（删代码）。
- 风险点：全屏编辑 S5、undo 栈、粘贴纯文本清洗。逐项在实现时验。

## 7. 迁移与复用

- **作废**：三模态卡分组（DepartmentStrip 的 image/voice/video DEPARTMENTS 表）、独立语音卡、`@token` 漂移检测（随 §6 落地后删）。
- **复用不动**：`spawnReference` autospawn 引擎、ReferenceTokenChip 六态、图N/音N/视N payload 角标、× 删连线、`harvestUpstreamAudioBindings`（角色路由已支持）、cinematic-grammar、素材库选择器。
- **新连法约定**：语音默认连角色（角色槽的音色徽标 ＋ 直接 autospawn `voice→character` 边）；直连视频 = 旁白。

## 8. 落地切片（建议顺序）

| 片               | 内容                                                                                                                          | 依赖 / 状态                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| S1 五卡重组      | DEPARTMENTS 表改五制作角色；角色槽挂音色徽标（含 ＋配音 autospawn voice→character）；旁白卡（voice 直连）                     | ✅ 已交付并浏览器实证（keyframe→镜头卡延后） |
| S2 @token 原子化 | 最小 mention-input 替换 prompt textarea                                                                                       | ✅ 已交付并浏览器实证（**漂移未删**，见下）  |
| S3 运镜 L1       | 运镜语法▾ chips（cinematic-grammar 词表）                                                                                     | 无                                           |
| S4 运镜 L2       | 镜头卡结构化 camera 下拉                                                                                                      | S1                                           |
| 后续             | keyframe→镜头卡 · 超限⚠（先抽共享 payload 装配）· 拖拽排序（先定排序建模）· 上传/粘贴入口 · **@token nodeId 持久化→漂移消失** | 见 v4 §14.3                                  |

**S1/S2 交付实证**（2026-07-05，commit a97a85b3/d77abf44/f3efd761）：浏览器 DOM 查得五卡 `["角色","场景","镜头","动作","旁白"]`、角色槽 2 枚音色徽标（就绪）、prompt 内 7 枚 `@name` 原子胶囊（`contenteditable=false`）；tsc 全量 exit 0；定向单测全绿。**§6 的"漂移检测随之删"未执行**——token 在 data.prompt 仍是纯文本 `@name`（生成路径不变），改名后 `@name` 退化成纯文本、漂移提示仍有用；真正"nodeId 活引用/漂移消失"需改持久化格式（动生成路径），列入后续。~~keyframe→镜头卡本轮也延后~~（后续增量已交付：keyframe 作 projection-only token 进镜头卡，commit 222772b5；运镜 L1 chips 同日交付，commit 519ec1ef）。

## 9. v2 升级：富缩略图 token + 特写 + 自动编号（2026-07-05 晚，owner 拍板）

> 权威图：[`svg/cast-v2-rich-tokens.svg`](svg/cast-v2-rich-tokens.svg)。触发：owner 给出即梦 Seedance 2.0 引用式 prompt 截图（「剑修2 是男徒弟。特写 是男徒弟面部细节。…角色动作、音乐、视频运镜完全参考 视频1」），要求最终效果对标 + 补面部特写。X 调查确认「素材引用规范」是 Seedance 2.0 skill 生态核心。

**五卡骨架与发送机制（胶囊→@名字纯文本+自动图例）不变**，升级四点：

1. **富 token**：MentionInput 胶囊内嵌 16px 真实缩略图（圆=角色/方=图/▶=视频）+ 名字，端口色底。
2. **特写（closeup）**：角色的面部细节子参考——image node 新 role `closeup`，**连进角色节点**（与 voice→character 完全同 1 跳范式）；角色身份 = 脸+特写+音色；特写随角色进 image_urls（1 跳收割），`@特写N` 独立可插。
3. **自动编号**：未命名素材自动得槽位名（角色N/场景N/镜头N/视频N/特写N），即连即用，「需命名」拦截取消；用户改名优先。编号=payload 槽位序（已有真源）。
4. **视频可内联引用**：动作卡参考视频获得「视频N」，可插入组句（「运镜完全参考 视频1」）；keyframe 仍 projection-only。

**改名策略 = B 自动回写**（owner 拍板，取代 nodeId marker 方案 C）：节点改名 → 复用现有漂移检测把引用它的 prompt 内 `@旧名`→`@新名` **静默自动回写**，删漂移提示 UI（手动替换按钮/⚠虚线态）。生成路径零改动。

**切片**：V2-1 B 自动回写+删漂移 UI（低）→ V2-2 token 内嵌缩略图（低）→ V2-3 自动编号+视频/未命名可插（中）→ V2-4 特写 role=closeup+身份组 UI+1 跳收割（大：新 role 波及 role picker/收割/连线规则/图例）。

**V2-1 已交付**（2026-07-05 晚）：改名静默自动回写落地——VideoComposer 加 effect，检测到 `insertedReferenceNames[id]≠当前名` 且 prompt 含 `@旧名` 时自动 `@旧名→@新名` 回写并 re-anchor（self-terminating）；漂移 UI 整套删除（ReferenceTokenChip 的 driftFrom/onReplaceDrift/虚线态/⚠角标/替换按钮，DepartmentStrip 的 driftFor/onReplaceDrift 贯穿）。生成路径零改动。测试改为验证「无替换按钮 + prompt 自动回写」。i18n `driftHint/driftReplace` 键成孤儿（共享文件污染，未删，无害）。

**V2-2 已交付**（2026-07-05 晚）：token 内嵌 16px 缩略图落地——`MentionInput.buildChip` 从纯文本 span 升级为「缩略图 + 名字」结构：`buildThumb` 生成 `size-4` 缩略图（圆=character/voice、方=background/shot/video，对应 §9 A 权威图形语言），有图时塞 `<img>`（voice 走 `coverImage`、其余走 `mediaUrl`，与 `ReferenceTokenChip` 同源），无图时退化成端口色 70% 底纯色块；video 额外叠 ▶ SVG 角标区分动图。chip 外壳从 `rounded px-1` 换成 `rounded-full`（胶囊，对齐权威图），文字包进独立 `.mention-chip-label` span，`textContent` 契约（`@name`）不受影响——`serializeEditor` 零改动。`MentionToken` 新增可选 `thumbnailUrl` 字段；`VideoComposer.mentionTokens` 组装时补上该字段，同时把 `refToken.kind === 'keyframe'` 过滤进类型谓词——顺带修了一个**自 keyframe 提交（222772b5）起就潜伏的 tsc 类型错误**：`mentionTokens` 把 `ReferenceTokenKind`（含 `keyframe`）直接赋给 `MentionToken['kind']`（不含 `keyframe`），本次全量 tsc 首次抓到并顺手修复。测试新增 2 例（缩略图 img src 断言 + video ▶ 角标断言）。验证：定向 vitest 34 passed，全量 tsc exit 0（第一轮暴露上述潜伏错误，第二轮 0 错误干净收尾）。
