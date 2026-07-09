# 音频工作台 kind 切换 UI 重设计（2026-07-06）

> **触发**：owner 实测 B3 音效 UI 后判「设计的太不合理」。本文基于 claude-in-chrome
> 对 `localhost:3000/zh/studio/audio` 的实测截图重出施工图，**取代**
> [`audio-domain-design-2026-07.md`](../../plans/audio-domain-design-2026-07.md) §4.1/§4.3
> 中 kind 切换与音效参数的落地细则（该文档其余部分仍有效）。
>
> 线框：[`svg/audio-kind-toolbar-redesign.svg`](svg/audio-kind-toolbar-redesign.svg)。

## 1. 实测诊断（2026-07-06，chrome 实测）

先记录一个非设计问题：owner 截图里 i18n 键裸渲染（`StudioEmptyState.hint.audio_sfx` 等）
是**旧 dev server 未加载新 JSON**，重启后消失，不是代码 bug。

内容层修复（上一轮）已确认生效：音效空态文案/示例 chips、工具栏按 kind 分流（音效=助手+设置）、
占位符「描述你想要的音效…」、字数 meta 隐藏——实测全部正确。

**剩余的是布局/质感问题**：

| #   | 问题                                 | 实测表现                                                                                                                                                      |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **kind 切换条全宽、选中态半屏白块**  | 独立一行横跨整个 dock（~1370px），选中段是一整块白色平板。它是二级切换却拿到了页面上最重的视觉权重；形态像进度条/错位的 tab，与下方紧凑的 chip 工具栏完全失配 |
| P2  | **音效设置 = 全屏遮罩 modal**        | 3 个参数（时长/贴合度/循环）开一个居中 modal + 全屏遮罩，重于内容；首次点击还因动态 chunk 编译卡了渲染器                                                      |
| P3  | **「继续创作」音频块是紫色音符占位** | 空态的最近生成 tile 对音频显示 🎵 emoji 占位块，空洞且 slop；音效模式下还混着语音生成                                                                         |

## 2. 根因

kind 切换器被当成了「页面级 tab」来做（全宽、平分、块状选中），但它的真实语义是
**dock 内的二级配置切换**——切的只是模型族 + 参数面板 + 文案，画布/历史/快捷键全共享。
二级控件要用二级的视觉权重。参照系就在本项目里：视频模式的 workflow picker、图片模式的
aspect-ratio 都是**行内紧凑控件**，没有谁占一整行。

## 3. 设计定案

### D1 kind 切换器 → 工具栏行首紧凑 segmented

- **位置**：并入现有 chip 工具栏行，作为**第一个元素**（模型选择器左侧）。决策顺序自然成立：
  生成什么（语音/音效）→ 用什么模型 → 调什么参数。dock 少一行，回到与图片/视频模式相同的行数。
- **形态**：与 chip 同高（`h-9`）的 segmented pill，两段各自适应文字宽（`px-3`），整体 ~110px：
  - 容器：`rounded-lg border border-border/60`
  - 选中段：`bg-primary text-primary-foreground`（暗面反相语言，与出纸徽标一致）
  - 未选段：透明底 + `text-muted-foreground`，hover 提亮
- **行为不变**：切换时换模型选择、工具栏 chips、占位符、空态（已有逻辑全部保留）。
- **实现落点**：删除 `StudioBottomDock` 里独立行的 `<StudioAudioKindSwitcher/>` 挂载；
  组件改为紧凑形态后由 `StudioToolbarPanels` 音频分支在行首渲染（语音/音效两个分支都渲染它）。
- 音乐 kind 上线时自动变三段（组件已按 availableKinds 渲染，隐藏逻辑 <2 不显示保留）。

### D2 音效设置 modal → 锚定 popover

- 参照系：图片模式的 `StudioAspectRatioPopover`——本项目已有约定：**小参数集 = chip 锚定
  popover，大面板（视频参数、音色库）= dialog**。3 个参数属于前者。
- **形态**：Popover 锚定「设置」chip，`w-72`，内含 时长 ParamSlider（0.5–30s）、
  贴合度 ParamSlider（0–1）、无缝循环 Switch。开关状态即 chip 高亮。
- **实现落点**：`StudioSfxParams` 内容不变，外壳从 `StudioDockPanelArea` 的
  ResponsiveDialog 移到自包含 popover 组件（`StudioSfxParamsPopover`，模式抄
  StudioAspectRatioPopover）；`sfxParams` PanelName 与 dialog 注册一并移除。
- 移动端：Popover 在窄屏退化为 drawer 由 ResponsiveDialog 原语处理——若 popover 原语
  无响应式退化，保持 popover（3 个参数在手机上也放得下）。

### D3 空态「继续创作」音频 tile 去 emoji + 按 kind 过滤

- 🎵 emoji 占位 → `lucide` `AudioLines` 图标 + `bg-muted/20`（与整站图标语言一致，去 slop）。
- 音效模式下最近生成应只显示音效：sfx 生成的 `snapshot.audioKind='sfx'` 已落库（B2）；
  若 history 接口暴露 snapshot 则按其过滤，未暴露则**本期不过滤**（标 P2，不为过滤改 API）。
- 出纸目标形态（×N 变体网格、hover 试听、波形封面）维持设计基准 Phase D 不变，本文不覆盖。

### D4 保持不变的

- 空态三段式结构（方案 A）、教程入口、按 kind 分流的文案与示例——实测已正确。
- 工具栏 chip 语言（`h-9 rounded-lg` pill）——现状即目标。
- 设置面板内容（时长/贴合度/循环三项）——只换壳不换芯。

## 4. 切片与验证

| 切片 | 内容                                                                                                 | 验证                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| R1   | D1 切换器进工具栏（改 StudioAudioKindSwitcher 形态 + StudioToolbarPanels 行首挂载 + 删 dock 独立行） | chrome 实测：dock 行数与图片模式一致；切换器 ~110px 不抢权重；两 kind 均可切换 |
| R2   | D2 popover 化（新 StudioSfxParamsPopover + 删 dialog/PanelName）                                     | chrome 实测：点设置弹 popover 不遮全屏；参数改动进请求体                       |
| R3   | D3 tile 图标化（+过滤若数据可得）                                                                    | chrome 实测：空态 tile 无 emoji                                                |

每片完成跑 lint + tsc + 相关 vitest，最后 chrome 截图对比本文线框。

## 5. 拍板点（默认按推荐执行）

1. **D1 位置**：推荐工具栏行首。备选=保留独立行但收窄为内容宽度居左——若你觉得行首太挤。
2. **D2 popover**：推荐。备选=保持 modal 与视频参数一致——一致性论点成立但 3 参数确实太轻。
3. 变体数控件（×1/×2/×4）**不在本轮**——按设计基准归 Phase D（A/B 变体出纸）一起做。
