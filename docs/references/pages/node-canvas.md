# 画布间施工图 — node-canvas.md「导演的制片桌」

> 状态：**概念稿 v1 已拍板（2026-07-10）**，本文件为工程化施工图，逐节核对后即可开工。
> 房间：画布 ★旗舰（`/studio/node`）· 颜料：石绿 `#3E8C6C`（S1 对比度微调定值，见 §2.2）· 隐喻：导演的制片桌。
> 本文件生效后，画布 UI 改动以本文件为准（brand-dna 过渡期规则：已改版页以房间施工图为准）；未迁移完成的组件仍守 `docs/plans/canvas-baseline.md`（v1 基准）。

## 0. 拍板记录（2026-07-10 概念稿会话）

| 分叉                         | 拍板                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 材质关系                     | **A · 深炭桌 + 纸质场记卡**（媒体裱深窗发色；只动卡片层材质，引擎全保留）                                                                                           |
| 石绿用量                     | **克制档**（五处工具痕迹，连线保持中性炭墨）                                                                                                                        |
| 纸质感实现                   | **结构表达**（色 + 装帧元素，不用位图纹理）                                                                                                                         |
| 手写批注字                   | **域内小范围试**（仅装饰性文字，不动全局字体栈）                                                                                                                    |
| 关联拍板                     | 画布交互第一增量 = Cast 卡组 dock（同日全项目审计，见 memory `project-canvas-cast-card-2026-07`）                                                                   |
| **吞噬交互**（同日追加拍板） | 绑定手势 = **吞噬**（大鱼吃小鱼），**连线彻底退场**（透视模式也不做）；作用域 = **省略模式（紧凑卡）**，详细模式（⤢ 展开）= 胃的清单编辑                            |
| 吞噬食物链                   | 镜头图卡**留作中鱼**（产静帧可先审再喂视频）；音色卡/参考视频卡**进卡匣分区**；closeup→角色卡特写槽、frame→视频卡关键帧槽、shotText→剧本笺直填；composer/agent 删除 |
| 吞噬动效                     | **游戏化档 + 幅度加强**（拉伸/压扁 ±8–10%、张口 1.08）；咬不动弹回**降弹性（更软）**                                                                                |

## 1. 设计基调

v1 诊断：全面去色后画布只剩中性灰面板 + 两个 Tailwind 默认色（emerald / red），材质单一 = 模板感。新风格**用材质对比替代色彩刺激**：纸卡 vs 炭桌，一支石绿。

房间语言四件套：**场记卡**（节点）· **吞噬**（绑定手势，取代连线）· **盖章**（状态）· **剧本笺**（助手）。

**吞噬 > 连线的语义依据**：Seedance reference-to-video 实际收到的是一个大 payload 打包全部参考（image_urls + 音频 + @token 图例），不是「节点间流动」——吞噬（成为成分）比连线（暗示流动）更诚实地表达装配。数据层同构：参考图 ⊂ 角色卡 ⊂ 镜头 payload，两跳收割（特写/音色随角色前进）引擎早已实现。

## 2. Token 层（strangler 迁移，不反转旧 token 语义）

⚠ 关键建模决定：`--node-panel` 系 v1 语义是「深面板浅字」，**不要直接把 panel 反转成纸色**（全部引用处前景色会错乱）。做法与 `node-danger` strangler 先例一致：新增「卡面材质」token 组，逐组件迁移，迁完删旧引用。

### 2.1 调值（chrome 层继续用深炭，只调色温）

| Token                                    | v1        | v2        | 用途                                                                                                        |
| ---------------------------------------- | --------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `--node-canvas`                          | `#0b0b0a` | `#14120f` | 桌面（暖炭），点阵网格同步转暖 `#403a2f`（S1 首落 `#26231e` 仅 1.19:1 不可见，owner 目验拍板加深至 ~1.6:1） |
| `--node-panel`                           | `#1a1a1a` | `#191612` | 深色 chrome：顶栏 / 工具条 / Cast 卡匣 / minimap 容器                                                       |
| `--node-panel-inner`                     | `#2a2a2a` | `#221f1b` | chrome 内层                                                                                                 |
| `--node-panel-soft`                      | `#202020` | `#1c1915` | chrome 软层                                                                                                 |
| `--node-foreground` / `muted` / `subtle` | 现值      | 保留      | chrome 上的文字（仍是深底浅字）                                                                             |

### 2.2 新增（纸卡材质组 + 颜料）

| 新 token                   | 值        | 用途                                                                                                                                                                    |
| -------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--node-card-paper`        | `#ebe5d8` | 场记卡卡面                                                                                                                                                              |
| `--node-card-paper-strong` | `#e0d8c8` | 片头条 / composer 挂载面                                                                                                                                                |
| `--node-card-paper-soft`   | `#f4efe4` | 卡内输入面 / 剧本笺气泡                                                                                                                                                 |
| `--node-card-ink`          | `#26231e` | 卡上炭字（标题）                                                                                                                                                        |
| `--node-card-ink-muted`    | `#5f594e` | 卡上次级字                                                                                                                                                              |
| `--node-card-ink-subtle`   | `#8a8070` | 卡上提示字 / 章描边基色                                                                                                                                                 |
| `--node-card-window`       | `#1b1917` | 深窗（媒体裱框，作品发色区）                                                                                                                                            |
| `--node-card-line`         | `#c9c0ab` | 卡上分隔线 / 占位词条线                                                                                                                                                 |
| `--node-paint`             | `#3E8C6C` | 石绿颜料（唯一高光）。S1 由 `#3D8A6B` 微调：原值上深字 4.49:1 / 浅字 3.68:1 均 <4.5，现值深字 `--node-canvas` 达 4.61:1（WCAG 确定性计算 2026-07-10，生成键文字取深字） |
| `--node-paint-fg`          | `#ebf3ee` | 石绿底上的文字                                                                                                                                                          |

### 2.3 替换与删除

- `--node-success #10b981`（Tailwind emerald）→ **删除**，生成键等全部改 `--node-paint`。D5 例外条款随之更新为「石绿生成键」。
- `--node-lipsync` 紫：**降中性**（v1 遗留待定项就此了结；lipsync 语义靠图标）。
- **端口类型色 5 支保留**，但需新增「纸面变体」：v1 极淡类型色按深底校准，挂在纸卡缘会看不清 —— 每支加 `-on-paper` 变体（同色相、加深饱和/明度到纸面 3:1 对比以上），Handle 组件按所在面取值。
  **S2 实测定值（2026-07-10，确定性 WCAG 脚本）**：5 支现值对 `--node-card-paper #ebe5d8` 均已 ≥3:1（同色相同饱和度未偏移，最小偏移量为 0，非"重新校准"）——`--node-port-character-on-paper #6f6a86`（4.10:1）/ `--node-port-background-on-paper #5f7a73`（3.70:1）/ `--node-port-voice-on-paper #856a72`（3.89:1）/ `--node-port-video-on-paper #647386`（3.86:1）/ `--node-port-image-on-paper #6f6a86`（4.10:1）。iconPlate 淡底另按 chrome 实跑数值校准由 /20 改 **/10**（非本节草拟的 /30——同色相淡底不透明度越高越拉近字色、对比越差，方向验证见 S2 报告，双向对深底 chrome 语境同样是净改善）。

## 3. 组件改动面（现状文件 → 目标形态）

| 组件               | 文件                                                        | 改动                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 节点壳             | `nodes/NodeShell.tsx`                                       | 卡面纸色、片头条（`paper-strong`）、圆角 6px、拖拽中微倾 1°（release 归位）                                                                                                         |
| 状态章             | `nodes/NodeStatusBadge.tsx`                                 | 视觉改「章」：描边矩形 + 微倾 2–3°，映射见 §4；组件可改名 `StampBadge`（保留旧导出别名）                                                                                            |
| 媒体区             | `nodes/NodeMediaPreview.tsx`                                | 深窗裱框（`card-window` + 内 `rounded-sm` 6px —— 原稿 4px 无对应刻度档，S2 拍板与卡同档，不为 2px 差新增 token），进度墨条石绿                                                      |
| 端口/成分栏        | NodeShell 内 Handle                                         | **端口渲染退场**（吞噬取代连线）；片头条下新增**成分栏**（吃进的引用 chip 行，溢出 +N）；Handle 数据层保留                                                                          |
| 连线               | `edges/`                                                    | **渲染退场**：不再画边；数据层边模型完整保留（§6.3），组件保留待回退用                                                                                                              |
| composer           | `composer/VideoComposer.tsx` 等                             | 面板挂 `paper-strong`；两级切换器结构不动；生成键 → `--node-paint`                                                                                                                  |
| 顶栏               | `CanvasTopBar.tsx`                                          | ✅ S4：项目名改「片名条」（`bg-node-card-paper`/`text-node-card-ink`）+ 添加节点纸色反相丸 + 导航徽标 icon 换 `text-node-paint`；下拉菜单/节点数 chip/右侧图标钮组/容器不动         |
| 助手 dock          | `StudioNodeAssistantDock.tsx` + `AssistantConversation.tsx` | 「剧本笺」皮肤：纸面、顶部签头、气泡 `paper-soft`；三态/ScriptDoc 工作区结构不动（**挂账，另立片，见 `docs/plans/node-canvas-s4-chrome.md`**）                                      |
| 工具条             | `CanvasBottomDock.tsx`                                      | ✅ S4 核查：grep 0 处 v1 残留色，激活态反相（`bg-node-foreground text-node-canvas`）已是现状，未改动                                                                                |
| minimap            | `CanvasMiniMap.tsx`                                         | ✅ S4：蓝图纸 `--node-blueprint-bg: #101820` + `--node-blueprint-line: #2e4a5e`（token 化落地，回写值与本行一致）；`nodeColor`=bg 令节点填充融进底色，只留 `nodeStrokeColor` 线框感 |
| 空态               | `NodeCanvasEmptyGuide.tsx`                                  | 制片桌摊开空场记卡 + 笔的石绿线稿插画；起手动作不变（A2 结构保留）                                                                                                                  |
| **新增** Cast 卡匣 | `CastDock.tsx` + `CastCard.tsx`（新）                       | 见 §6                                                                                                                                                                               |

## 4. 盖章状态系统

S3 执行回写（2026-07-10）：8 态全表定稿，`NodeStatusBadge.tsx` + `node-tokens.ts STATUS_COLORS` 已按此实现。

| 状态     | 章文 zh/en/ja             | 配色（变量类）                                         | 动效        | 继承原则                                |
| -------- | ------------------------- | ------------------------------------------------------ | ----------- | --------------------------------------- |
| idle     | 无章（组件 return null）  | —                                                      | —           | —                                       |
| queued   | 待拍 / Standby / 待機     | `border-current text-node-muted`                       | Loader spin | 中性                                    |
| ready    | 就绪 / Ready / 準備完了   | `border-current text-node-foreground`                  | 无          | 中性                                    |
| running  | 拍摄中 / Rolling / 撮影中 | `border-current text-node-paint`（石绿，§5 落点②）     | pulse 点    | 进行中靠动效                            |
| done     | 已收 / Wrapped / 収録済み | `border-current text-node-foreground`                  | 无          | 完成克制                                |
| failed   | NG / NG / NG              | `border-node-status-failed text-node-status-failed-fg` | 无          | 错误才红                                |
| stale    | 过期 / Stale / 期限切れ   | `border-current text-node-subtle`                      | 无          | 中性                                    |
| disabled | 停用 / Disabled / 無効    | `border-current text-node-subtle`                      | 无          | 中性                                    |
| 审阅循环 | 过 / 重拍                 | 章式按钮（approve = 盖「过」）                         | —           | Board/审阅期接入（未实现，S3 non-goal） |

章 = 结构表达：`rounded-none border 1px` 描边 + 同色文字 + 透明底 + `rotate(-2deg)`（Tailwind `-rotate-2` 标准档），无纹理无阴影。`text-node-*` 变量类靠 `.node-card-paper` 容器覆盖自动在纸卡/深 chrome 两种环境切换深浅，组件不写两套样式（S2 strangler 覆盖机制，已用 getComputedStyle 实测两种作用域下的实际渲染色核实）。

✅ **S3 已知发现 → S4 已修复（2026-07-10）**：真红迁移完成——`--node-status-failed` 从旧暗枣红 `#3a1e1e` 改为 `--node-danger` 的真红本体 `#e5484d`；`--node-status-failed-fg` 语义收窄为「红底上的前景」，值改 `#fadcdc`（深 chrome 语境，服务 `bg-node-status-failed/NN` 混合底文字）。`node-tokens.ts` failed 行同步改 `border-node-status-failed text-node-status-failed`（同色字，与其余 7 态语言一致，不再用 `-fg`）。因 `NodeShellRoot` 的 `.node-card-paper` 是无条件类（S2 起所有卡都是纸卡），root 真红对纸面文字对比度不够（vs `#ebe5d8` 仅 3.12:1），故在 `.node-card-paper` 作用域内追加纸面专用覆盖：`--node-status-failed: #a32d2d`、`--node-status-failed-fg: #1a1310`。`node-danger` strangler 别名连带收编：7 处引用改指 `node-status-failed`，`--node-danger` 定义 + `@theme` 映射删除。WCAG 确定性计算（S4 报告）：章描边/文字深 chrome 语境 vs `panel`(`#191612`) 4.61:1、纸面语境 vs `card-paper-strong`(`#e0d8c8`) 4.99:1；-fg 深 chrome 语境（删除按钮 hover / NodeMediaInspector banner）vs 红/40·50 混 panel 组合底 8.21:1 / 6.95:1；-fg 纸面语境（AgentNode / NodeMediaPreview banner）vs 红/50 混 card-paper 组合底 6.41:1，均 ≥4.5:1（文字）/ ≥3:1（边框）达标。

## 5. 石绿落点清单（克制档 · 封闭列表）

仅以下五处，增补须回本文件登记：①生成键 ②running 章 + 进度墨条 ③选中描边（节点/连线选中态）④空态插画线稿 ⑤画布导航徽标。
**禁区**：大面积石绿底、连线常驻石绿、一屏第二支颜料、档案化元素（词条/媒体内容）着色。

## 6. 吞噬交互 + Cast 卡匣（第一落地件，2026-07-10 吞噬拍板后 v2）

### 6.1 食物链（= 现有连线合法矩阵 `node-connection-rules.ts` 的 1:1 翻译，不发明新关系）

```text
L0 食料（不是节点）：本地上传 / 素材库 / Studio 作品 / AI 直生
L1 卡匣身份卡：角色卡（吃 参考图·特写·音色）· 背景卡（吃 场景图·氛围音）· 音色卡 · 参考视频卡
L2 镜头图卡（中鱼，留画布）：吃 角色卡/背景卡 → 产静帧（先审再喂）
L3 视频卡（大鱼）：吃 角色·背景·镜头图·关键帧·音色·参考视频·其他成片·镜头文本 → 产片段
L4 片盒 videoMerge（巨鱼）：吞成片，盒内保序胶片条可重排 → 长片
```

节点定性：`image` role=角色/背景 → 迁入卡匣；closeup → 角色卡特写槽；frame → 视频卡关键帧槽；shotText → 剧本笺直填（数据层节点转隐藏，autospawn 兼容）；voice / videoReference → 卡匣分区；composer / agent → 删除。**画布上只剩会生成的东西**（镜头图卡 / 视频卡 / 片盒）。

### 6.2 卡匣（鱼塘）

- **位置**：画布底部横匣（深炭 chrome），四分区：角色 / 背景 / 音色 / 参考视频；可折叠；移动端 = ResponsiveOverlay 抽屉。
- **卡片**：拍立得式 —— 照片窗（深窗）+ 名字（手写体）+ `@token` 章；静置随机微倾 ±2°，hover 归正。数据源 = CharacterCard / 背景卡 / VoiceCard（零新建模）。
- **本体—引用模型**：卡匣本体永远不动，被吃的是引用副本（一张卡可被多镜同吃）；卡上标「出演 N 镜」，点击高亮吃过它的节点（反向查询）。
- **食料入口**：新建/喂卡走三来源 —— 上传 dropzone / 素材库（AssetSelector 直开）/ AI 生成，全部复用既有组件（node-image-ui-unify Slice A 产物）。

### 6.3 吞噬手势（作用域 = 省略模式紧凑卡；详细模式 = 胃）

- **吃**：拖卡匣卡（或桌面小鱼卡）到目标卡热区 → 目标「张口」→ 松手入腹 → 片头条下**成分栏**新增 chip。**点选兜底**：选卡 → 可吃目标高亮 → 点目标落卡（触屏无拖拽依赖）。
- **胃**：⤢ 展开详情 = 成分清单（v4 参考素材五分区就是胃的 UI，已存在），每项可「取出」（反向动画飞回卡匣，绑定解除）。
- **咬不动**：超模型契约/类型不合 → 目标不张口、红描边 + 摇头 + 拖拽物软弹回 + 原因气泡（如「参考位已满 12/12」）。大声暴露，不静默丢；借此抽共享 payload 装配器（v4 遗留）。
- **连线退场**：渲染层不再画边（透视模式也不做）；**数据层边模型完整保留**（吞噬 = 建边 + 上游转隐藏渲染），收割/autospawn/存档引擎零改动，可随时回退连线渲染。
- **实现要点**：吞噬是**纯渲染层折叠** —— ReactFlow 节点 hidden + 成分栏渲染；助手 autospawn 的图 = 出生即吃好。

## 7. 手写批注字（域内小范围）

- 字体：LXGW 文楷（霞鹜文楷，OFL 开源，中日字形覆盖；拉丁字形随字体）。
- 仅装饰性文字：镜号（「镜头 S3」）、状态章文、Cast 卡名字。**正文/参数/prompt 一律不用**。
- 加载：`next/font` 按画布路由分包，不进全局字体栈（全局字体工程独立立项不受影响）。子集化仅装载所需字重。

## 8. 动效性格（手作动作，全部走现有 motion canon）

吞噬三拍（游戏化档 + 幅度加强，demo 已 owner 手感定稿 2026-07-10）：

| 拍       | 触发              | 规格（基准 1×，全部可乘速率）                                                                                                                                      |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 张口     | 拖拽物进热区      | 目标卡 scale **1.08** + 石绿描边（outline 2px offset 4px）+ 朝拖拽方向倾身 1.5°，180ms ease                                                                        |
| 吸入     | 松手              | 拖拽物沿上拱弧线（offset-path）620ms `cubic-bezier(0.45,0.05,0.6,1)` 加速入腹；飞行中 **scaleX 1.18 / scaleY 0.90**（±~9% 挤压拉伸），终点 scale 0.16 + rotate 12° |
| 消化落定 | 入腹完成          | 目标卡 gulp 480ms：scale(1.08,0.90)→(0.98,1.05)→1（overshoot）；成分 chip 340ms scale 0.3→**1.2**→1                                                                |
| 咬不动   | 契约超限/类型不合 | 飞至 ~58% 弹回原位 950ms，弹回曲线**降弹性**（软回弹，参考 `cubic-bezier(0.3,0.7,0.4,1.05)`）；目标红描边 + 摇头 ±4–5px ×2（330ms）+ 原因气泡                      |
| 吐出     | 从胃取出成分      | 吸入的反向：chip 放大回卡形，飞回卡匣本体位                                                                                                                        |
| 盖章     | 状态切换          | scale 1.15→1 + opacity，`--duration-base`                                                                                                                          |
| 面板形变 | dock/展开         | 沿用 `.node-canvas-panel-motion` + `data-resizing` 规则不变                                                                                                        |

红线：每个动画绑定真实状态变化（绑定成立/失败/解除），无纯装饰帧；不做嘴巴/咀嚼/粒子/光效。曲线若与 `motion.ts` 现有刻度冲突，**在 constants 新增具名曲线**（如 `--ease-ingest` / `--ease-soft-return`），不写 inline 魔法值。`prefers-reduced-motion` 全部降级淡入淡出（全局兜底已有）。交互 demo 存 2026-07-10 会话（可玩版含速率滑杆），实现按 demo keyframes 翻译。

## 9. 增量切片（交 Sonnet 执行顺序，一次一片全绿）

| 片               | 内容                                                                                                                             | 风险                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| S1 ✅ 2026-07-10 | Token 层：新增 §2.2 组 + §2.1 调值 + 生成键换石绿 + lipsync 降中性                                                               | 低（全局色温可见变化，视觉基线全量更新并点名）    |
| S2 ✅ 2026-07-10 | NodeShell 纸卡化：卡面/片头条/深窗/**成分栏**/拖拽微倾                                                                           | 中（核心组件，先 grep 引用面）                    |
| S3 ✅ 2026-07-10 | 状态章系统（NodeStatusBadge → 章视觉）                                                                                           | 低                                                |
| S4 ✅ 2026-07-10 | Chrome：failed 真红收尾 + 顶栏片名条 / 工具条核查 / minimap 蓝图（剧本笺皮肤裁出挂账，见 `docs/plans/node-canvas-s4-chrome.md`） | 中                                                |
| S5a              | Cast 卡匣四分区（新组件；角色/背景/音色/参考视频迁入，添加菜单收敛为 镜头图/视频/片盒）                                          | 中                                                |
| S5b              | 吞噬手势 + 三拍动画 + 咬不动 + 胃取出（连线渲染退场随此片）                                                                      | 中高（新手势 + 契约校验可视化，触屏点选兜底必测） |
| S6               | 空态插画 + 手写体点缀 + composer/agent 死类型清理                                                                                | 低                                                |

依赖：S5b 依赖 S5a 与 S2 的成分栏；其余可按序独立验收。连线渲染退场发生在 S5b（吞噬可用之前不拆现有连线，避免中间态无绑定手势）。

每片：`npm run lint && npm run build`（dev 跑着不并行 build）→ `e2e/visual.spec.ts`（基线按 OS 分套，有意改动 `--update-snapshots` 并点名）→ 交互态 claude-in-chrome 实跑 → `checklists/ui.md` 过 P0。

## 10. Do Not Break（继承声明）

- 交互 canon（D1–D5 修订版）：中键平移 / 参数在节点 / 右栏纯助手 / 两级切换器 /（原绿）生成键例外 → 改述为石绿；**D3 连线部分被吞噬拍板取代**（2026-07-10），合法性矩阵 `node-connection-rules.ts` 完整保留 = 吞噬合法性事实源。
- **数据层图模型不动**：节点+边+收割装配+autospawn+存档解析全保留；吞噬只是渲染折叠（隐藏节点+成分栏），必须可回退连线渲染。
- 状态原则：进行中靠动效、完成克制、错误才红。
- `node-*` token domain-scoped 于画布，不外泄通用页；暗面显式 `color-scheme: dark`（滚动条陷阱）。
- 卡宽 400 token 体系（`--width-node-card` 等）与 NODE_SIZING/SPACING 纪律。
- a11y：焦点环（石绿选中描边兼任需过对比度）/ 44px 触达 / 键盘可达 / 触屏软键盘策略。
- UI-only：不碰 `src/app/api/**` / `prisma/**` / `src/services/**` / Clerk / credit / ScriptDoc·autospawn 引擎。

## 11. Source of Truth

- 拍板：本文件 §0（2026-07-10 会话，概念稿三张图存会话记录）
- 现状代码：`src/app/globals.css`（`--node-*` L286+ / `@theme` L24+）· `src/constants/node-tokens.ts` · `src/components/business/node/**`
- v1 基准（未迁移组件仍守）：`docs/plans/canvas-baseline.md`
- 关联 memory：`project-canvas-cast-card-2026-07` · `project-canvas-ui-baseline`

## 12. Last Verified

- Date: 2026-07-10 · Method: owner 四分叉选择框拍板 + 概念稿三图核对 + token/组件现状代码实读（globals.css / node-tokens.ts / node 组件目录）。
- 同日吞噬 v2：现役节点全量盘点（node-types.ts / node-connection-rules.ts / CanvasAddMenu 实读）+ 食物链/卡匣分区/镜头图去留选择框拍板 + 可玩动效 demo 手感定稿（幅度加强、软弹回）。
