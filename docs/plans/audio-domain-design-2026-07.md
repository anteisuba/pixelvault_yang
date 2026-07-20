# 音频域设计基准（2026-07-05）

> **本文是音频域的最新施工基准**，合并了方向调研与情绪控制专题（背景与来源见
> [`audio-domain-direction-2026-07.md`](audio-domain-direction-2026-07.md)）。
> 改音频相关的模型 / 服务 / UI 前先读本文。
> 视觉权力限定（2026-07-19）：本文保留音频业务、模型、数据和功能信息架构决策；下文基于旧双面模式的外观描述已经废止。未来 Audio 视觉需独立完成域定义、三个结构方向与关键切片确认，不能继承 Studio Image、Canvas 或旧暗面工作台皮肤。
>
> 图解：[`svg/audio-domain-blueprint.svg`](svg/audio-domain-blueprint.svg)（架构总览）、
> [`svg/audio-studio-ui-wireframe.svg`](svg/audio-studio-ui-wireframe.svg)（语音 kind UI 线框）、
> [`svg/audio-emotion-control-stack.svg`](svg/audio-emotion-control-stack.svg)（情绪控制栈）。

## 0. 拍板记录（owner，2026-07-05）

| #   | 决策       | 内容                                                                                                                               |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 范围       | 做：**语音生成（升级）、音色固定（音色资产）、音乐生成、音效/视频配音、播客、长音频**。不做（现在）：实时 voice agents、DAW 式编辑 |
| A2  | 建模       | `audioKind ∈ {speech, sfx, music}` 是 `ModelOption` **属性**，不拆新 mode / 路由 / outputType                                      |
| A3  | 情绪默认档 | **有情绪意图（文本含行内标记或选了基调）→ Creative；无情绪 → Natural**。v3 映射 stability 0.0/0.5，Fish 映射 temperature 高/中     |
| A4  | 供应商     | 音乐、音效直连 ElevenLabs（Music API / SFX V2），复用现有 adapter 家族；MiniMax / 开源（ACE-Step）留远期                           |

## 1. 模型矩阵

`AUDIO_MODEL_OPTIONS`（`src/constants/models/audio.ts`）按 `audioKind` 扩展；每个新模型走 add-model checklist（enum + config + i18n×3 + adapter + tests）。

| audioKind | 模型                             | 状态      | 接口                           | cost（拍板点） | 备注                                                         |
| --------- | -------------------------------- | --------- | ------------------------------ | -------------- | ------------------------------------------------------------ |
| speech    | FISH_AUDIO_S2_PRO                | 已有      | fish `/v1/tts`                 | 2              | 行内 `[tag]` 自由词表、temperature 已暴露                    |
| speech    | ELEVENLABS_V3                    | 已有→升级 | `/v1/text-to-speech/{voiceId}` | 5              | 打开 stability 三档（现硬编码 0.5/style 0，见 §2.1）         |
| sfx       | ELEVENLABS_SFX_V2                | **新增**  | `POST /v1/sound-generation`    | 建议 3/变体    | ≤30s、可 loop、一次多变体；同步返回                          |
| music     | ELEVENLABS_MUSIC                 | **新增**  | Music API（compose）           | 建议 15–20/曲  | 官方计价 ~$0.80/min → ≤60s 先行、credit 拉开；商用许可最干净 |
| —（P2）   | video-to-sound                   | 后置      | ElevenLabs video-to-sound      | —              | 依赖视频输入管线，定位"无声视频补救"，不做主路径             |
| —（远期） | MiniMax Music 2.5 / ACE-Step 1.5 | 远期      | 火山/fal / RUNNER              | —              | 第二供应商与开源插座                                         |

**adapter 落点**：全部进 `elevenlabs.adapter.ts` 家族（新增 `generateSoundEffect` / `generateMusic` 能力方法，注册进 `providers/registry.ts` 能力矩阵）；缺 key 走 `QuickSetupDialog`（Hard Rule 8），外部调用包 `withRetry()` + circuit breaker。

## 2. 语音功能设计

### 2.1 情绪控制四层栈（核心升级）

现状根因与机制 ground truth 见 direction 文档 §5。设计定案：

- **L1 表现力（响应度）**：统一三档旋钮「克制 / 自然 / 戏剧化」，用户不接触厂商参数。编译：v3 → stability 1.0 / 0.5 / 0.0；Fish → temperature 低 / 中 / 高。**默认档按 A3 自动**：检测到情绪意图 → 戏剧化（Creative），否则自然（Natural）；用户手动改档后以用户为准（会话内记忆）。
- **L2 行内情绪标记**：prompt 编辑器支持选区/光标插入 `[excited]` 类内联 token（可视化、可整体删除），交互复用 video cast 的 mention-input contentEditable 原子 token 方案。词表四类：情绪（excited/sad/angry/…）、语调（whispering/shouting/soft）、音效（laughing/sighing/gasping）、强调（emphasis）。编译：Fish 透传（自由词表，支持 `[slightly …]` 程度前缀）；v3 走白名单映射，未知词剔除并 surface；校验进 prompt-guard 家族。
- **全局基调 chips**（现有 6 枚保留）：语义收窄为"整段基调"，编译时**逐句句首**注入规范强词（词表替换：`whisper softly` → `[whispers]` 等），不再全文一枚。
- **L3 情绪导演**：一键"标注情绪"——台词交给文本模型（复用画布 assistant 路由），自动插行内 tag；`llm-output-validator` 校验**只加标记不改词**。播客对话稿生成时默认带情绪标注。
- **A/B 变体出纸**：同文本 1/2/4 变体并排试听（交互对齐图片 variant），情绪调参的感知基础。

### 2.2 播客 / 长音频（成品化管线）

- **剧本层**：复用两阶段剧本引擎的模式（大纲确认 → 对话稿确认，两道门），输出结构化对话稿：`{ speaker, text(含情绪标记), voiceCardId, 基调 }[]`。形态先做 双人对谈 + 单人朗读 两种。
- **合成层**：新编排 service（确定性代码，不是 LLM）：逐段 TTS（每段带 speaker 音色 + 情绪编译）→ 拼接 → 单条长音频落 R2 + 分段清单存 meta。轮询/失败恢复与 video 生成同构（分段粒度重试）。
- **长音频**：超 `TTS_MAX_TEXT_LENGTH`（5000）的纯朗读走同一分段管线（按章节切分），播客只是"多说话人版长音频"。
- **技术依赖（先验证）**：服务端音频拼接方案（ffmpeg 可用性 / 纯 MP3 帧级拼接）——Phase D 第一件事是本地 spike，不确定性要先暴露。

## 3. 语音库设计（音色固定）

音色卡是音频域唯一的声音资产模型，也是"音色固定"的载体——一次获得、处处引用（Studio 语音 / 播客 speaker / 画布角色）。

- **来源枚举扩展**：`market`（Fish 公开库，已有）/ `cloned`（VoiceTrainer，已有）/ **`designed`（新：文字描述造音色，产物直接落卡）** / 临时 reference（已有，不落卡）。
- **情绪范围元数据（新）**：卡上标注该音色能驾驭的情绪档（如 平直旁白 vs 全情绪域），来源：市场标签 / 克隆样本分析 / 用户手标。UI 上用于：选卡时提示 + 情绪 token 超出范围时 soft warning（不阻断）。
- **情绪参考 donor**：现有 ad-hoc 参考音频明确双用途——克隆音色 or 借情绪基调（Fish 参考音频自带情绪）。上传时二选一标注用途。
- **克隆引导**：VoiceTrainer 上传页加提示——含情绪起伏的样本决定克隆音色的情绪上限（L0 地基）。
- **试听规范**：每张卡用统一试听句生成 中性 + 激动 + 耳语 三段缓存试听，选卡即可预判情绪表现（分摊成本：懒生成 + 缓存）。

## 4. UI 功能需求（旧外观规则已退役）

本节只保留 audio kind、字段、状态和工作流等功能需求。segmented、chip、popover、卡片等形态是旧方案记录，不是未来视觉答案；进入视觉改版时以 `docs/brand-dna.md`、`docs/scenes/ui-page.md` 与新的 Audio 域/page 文档为准。

> ⚠ **kind 切换与音效参数的落地细则已被
> [`../design/reviews/2026-07-06-audio-kind-ui-redesign.md`](../design/reviews/2026-07-06-audio-kind-ui-redesign.md)
> 取代**（B3 首版全宽切换条被 owner 否决；新细则=切换器进工具栏行首紧凑 segmented、音效设置改锚定 popover）。

### 4.1 kind 切换（surface 不裂开）

`/studio/audio` 单路由内做二级 segmented「语音 / 音效 / 音乐」，位置在 dock 参数区顶（与 video workflow picker 同位）。切换只换 dock 面板与出纸形态，画布/历史/快捷键全共享。播客不是第四个 kind，是语音 kind 下的**工作流**（入口挂 StudioWorkflowPicker），因为它复用语音的全部资产与参数。

### 4.2 语音 kind（线框见 `svg/audio-studio-ui-wireframe.svg`）

1. **prompt 区 = 情绪 token 编辑器**：正文中内联 token pill（点 × 删除）；选中文本或置光标后点情绪 chip 即插入。
2. **基调行**：现有 6 chips 保留 + 右侧「表现力」三档 segmented（克制/自然/戏剧化，默认按 A3 自动，自动态显示为高亮建议档）。
3. **音色行**：音色卡 chip（点开语音库面板）；播客工作流下变为 speaker 列表（每行 音色卡 + 基调）。
4. **出纸**：A/B 变体 ×1/×2/×4；音频出纸卡带波形 + 分段情绪标记高亮（长音频显示章节条）。

### 4.3 音效 / 音乐 kind

- **音效**：prompt + 时长（≤30s）+ loop 开关 + 变体数（默认 4，SFX API 原生多变体）；出纸为网格试听卡（hover 即播）。
- **音乐**：prompt + 时长（≤60s 先行）+ 器乐/人声开关；credit 高 → 生成按钮上明示 cost；歌词编辑后置。
- 两者产物都是音频资产，可被画布 video 节点作为音轨引用（与旁白 voice→video 同构）。

### 4.4 语音库面板

现有 voiceSelector / voiceTrainer 面板整合为一个库 surface：来源 tab（市场 / 我的 / 设计新音色）、卡片带情绪范围标签 + 三段试听、入口不变（dock 面板体系）。

## 5. 落地路线

| Phase                  | 内容                                                                          | 依赖 / 验证                                                                            |
| ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **A 情绪见效**（最小） | v3 stability 三档 + A3 默认逻辑；基调词表换规范强词 + 逐句注入；表现力三档 UI | 同文本三件对听（无标记 vs [excited]@Creative vs Fish [sobbing][whispering]）应明显可辨 |
| **B audioKind + 音效** | `audioKind` 建模（Zod/常量/过滤）→ SFX adapter + 音效 kind UI + 网格出纸      | 建模先行；SFX 出 4 变体、loop 可用                                                     |
| **C 音乐**             | Music API adapter + 音乐 kind UI + credit 定价                                | ≤60s；cost 明示                                                                        |
| **D 行内 token + A/B** | mention-input 复用 + per-provider 编译 + 校验；变体出纸                       | 编译产物 tag 落点正确（DevTools 查请求体）                                             |
| **E 播客 / 长音频**    | 拼接 spike → 编排 service → 两道门 UI + speaker 列表                          | 先证明拼接；分段重试可用                                                               |
| **F 音色经营**         | designed 造音色 + 情绪范围元数据 + 三段试听 + 克隆引导 + L3 情绪导演          | 选卡可预判情绪表现                                                                     |

B/C 可并行于 D；A 独立最先。每个 Phase 完成走 UI 确认阶梯（lint/build → visual.spec → token/a11y 断言 → 交互实跑）并逐项报告。

## 6. 边界与义务

- UI-only 切片不动 `src/app/api/**`、`prisma/**`、`src/services/**`；涉及 service 的切片（B/C/E）按 UI on Claude / 逻辑可走 Codex 的分工拆两半。
- 常量全进 `src/constants/`（情绪词表、kind 枚举、时长上限、credit）；Zod schema 同步 `src/types/`；i18n 三语必须同步。
- 所有新外部调用：`withRetry()` + circuit breaker + logger；LLM 产物（情绪导演、对话稿）过 `llm-output-validator`。
- credit 定价（sfx 3/变体、music 15–20/曲）是**建议值，上线前 owner 复核**。
