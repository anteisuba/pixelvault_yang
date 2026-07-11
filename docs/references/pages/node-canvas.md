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

### 6.0 业务模型 v3.1（2026-07-10 owner 逐节拍板，S5c 后修正 —— 本节优先级高于下文与实现现状冲突处）

**二元实体：图片 ≠ 卡片。**

- **图片（素材原子）**：一张图 + 名字 + 分类。创建 = **先上传/选图再命名归类**（废除「先选用途」的 role picker 空态）。分类**标记为主不设死**：预设清单尽量全（角色参考/面部特写/服装造型/姿势/背景场景/风格/构图/道具/关键帧首/关键帧尾，基于现有 REFERENCE_ROLES 扩充）+ **用户自定义**；分类的核心目的 = **让视频生成 API 理解素材用途**（注入 @token 图例语义，接现有 buildShotReferenceLegend 机制）。融合不受分类限制（谁都能吃，拖错离谱轻提示不阻断）。
- **卡片（收集器）**：一个身份/要素的整体档案（图集 + 声音/词条等参数），**空卡起步**（新建→设名→往里融合）；视频调用时**整体参照**——装配时展开为「图组 + @token 图例」注入 prompt（API 不吃卡片原生概念，吃展开形态，机制=cast v2 图例已上线）。UI 与图片明显区分。
  **类型清单（2026-07-10 追加拍板）**：预设四类 **角色卡 / 场景卡（原背景卡，收环境音）/ 画风卡（对齐全局 StyleCard）/ 道具卡** + **自定义卡**（自拟类型名）；与全局 /cards 分类学对齐。画风/道具/自定义为新类型，另片（S5e）落地。
  **音色与参考视频 = 素材不是卡片**（2026-07-10 owner 修正）：素材三同权（图片/音色/参考视频）都可自由挂画布、被卡或视频吃；**卡匣只放卡片**，素材不进卡匣（素材复用走画布散件 + 素材库/详情三来源）。

**生命周期**：没被吃的实体待在画布上；被吃瞬间消失进吃它者的肚子；**拆到零引用时回画布**（一卡多镜期间从任一肚子拆出，仍在其他肚子里就不回）。

**卡匣 = 复用注册表**：所有建过的卡永远有本体条目（含被吃的），标出演 N 镜；一卡多镜 = 从卡匣拖本体到新目标（建引用，本体不动）。**样式回横匣**：四分区一字排开、始终展开可见、溢出**左右滑动**、可折叠把手；浮层 tabs 废弃。

**手势总表**：图片→卡（融合入图集）· 图片→视频/镜头（关键帧/直接参考）· 卡→镜头图/视频（吞噬）· 音色→卡（听觉身份）/→视频（旁白）· 卡匣→画布目标（再喂一镜）· 成分栏×/档案拆出（拆引用，零引用回画布）· 图集拆出（图片回画布）。

**与 S5b/S5c 实现的差距（S5d 修正片清单）**：①卡匣浮层→横匣样式回滚 ②隐藏条件从「身份类型一律隐藏」改「**有下游引用才隐藏**」（渲染层一行条件，数据零改动）③图片节点 upload-first + 名字/分类（含自定义），分类进图例 ④卡片=收集器 UI（画布卡面档案化，与图片区分）⑤融合目标改画布上的卡 ⑥卡匣再喂手势。

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

> **形态 v2（2026-07-10 owner 反馈拍板，替代 S5a 首版常驻横匣）**：S5a 横匣在资源多时横向截断、与工具条双层叠占 ~200px。改为 **把手 + 浮层 tabs**：常态只有「▤ Cast · N」把手并入工具条同行（零占用）；展开为浮层——分区 tabs（带计数）+ 当前分区**网格换行**（永不横向截断）+ 新建位，点外收回，tab 记忆上次选择；**拖卡出浮层时浮层自动降透明让路，投放完成自动收回**。移动端 = 同浮层的抽屉形态（ResponsiveOverlay 原语）。

- 四分区：角色 / 背景 / 音色 / 参考视频。
- **卡片**：拍立得式 —— 照片窗（深窗）+ 名字（手写体）+ `@token` 章；静置随机微倾 ±2°，hover 归正。数据源 = CharacterCard / 背景卡 / VoiceCard（零新建模）。
- **本体—引用模型**：卡匣本体永远不动，被吃的是引用副本（一张卡可被多镜同吃）；卡上标「出演 N 镜」，点击高亮吃过它的节点（反向查询）。
- **食料入口**：新建/喂卡走三来源 —— 上传 dropzone / 素材库（AssetSelector 直开）/ AI 生成，全部复用既有组件（node-image-ui-unify Slice A 产物）。

### 6.3 吞噬手势（作用域 = 省略模式紧凑卡；详细模式 = 胃）

- **吃**：拖卡匣卡（或桌面小鱼卡）到目标卡热区 → 目标「张口」→ 松手入腹 → 片头条下**成分栏**新增 chip。**点选兜底**：选卡 → 可吃目标高亮 → 点目标落卡（触屏无拖拽依赖）。
- **胃**：⤢ 展开详情 = 成分清单（v4 参考素材五分区就是胃的 UI，已存在），每项可「取出」（反向动画飞回卡匣，绑定解除）。
- **咬不动**：超模型契约/类型不合 → 目标不张口、红描边 + 摇头 + 拖拽物软弹回 + 原因气泡（如「参考位已满 12/12」）。大声暴露，不静默丢；借此抽共享 payload 装配器（v4 遗留）。
- **连线退场**：渲染层不再画边（透视模式也不做）；**数据层边模型完整保留**（吞噬 = 建边 + 上游转隐藏渲染），收割/autospawn/存档引擎零改动，可随时回退连线渲染。
- **实现要点**：吞噬是**纯渲染层折叠** —— ReactFlow 节点 hidden + 成分栏渲染；助手 autospawn 的图 = 出生即吃好。拖拽用**自定义 pointer 拖拽**（portal 渲染拖拽副本），不用 HTML5 DnD —— 三拍动画的挤压拉伸与磁吸都要求对拖拽物的完全控制（浏览器 ghost 不可编程）。
- **增强三件套（2026-07-10 拍板进 S5b）**：①**磁吸** —— 拖拽时合法目标微亮，近距离最近目标张口加强 + 吸附指示，降瞄准成本；②**快投模式** —— 卡 hover 浮出投放钮（触屏长按）进入：合法目标全亮标序号、已含该卡目标标 ⊘、点一个投一个连续投、Esc/点空白退出（解决一卡多镜 + 触屏兜底）；③**张口预览** —— 张口时目标浮一行迷你清单「图集×N · 音色 · @名字（参考位 n/m）」，超限整行转红（契约校验前置；上限不可得则省略 n/m 不硬造）。backlog：反向投喂（成分栏＋就地速选）、批量投喂、把手计数跳字。

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

| 片                      | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 风险                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| S1 ✅ 2026-07-10        | Token 层：新增 §2.2 组 + §2.1 调值 + 生成键换石绿 + lipsync 降中性                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 低（全局色温可见变化，视觉基线全量更新并点名）                                |
| S2 ✅ 2026-07-10        | NodeShell 纸卡化：卡面/片头条/深窗/**成分栏**/拖拽微倾                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 中（核心组件，先 grep 引用面）                                                |
| S3 ✅ 2026-07-10        | 状态章系统（NodeStatusBadge → 章视觉）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 低                                                                            |
| S4 ✅ 2026-07-10        | Chrome：failed 真红收尾 + 顶栏片名条 / 工具条核查 / minimap 蓝图（剧本笺皮肤裁出挂账，见 `docs/plans/node-canvas-s4-chrome.md`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 中                                                                            |
| S5a ✅ 2026-07-10       | Cast 卡匣四分区（**镜像视图版**：身份节点暂留画布，卡匣为第二呈现；点卡聚焦+分区新建+可折叠。「迁入/退场+添加菜单收敛」移交 S5b，任务包 `node-canvas-s5a-castdock.md`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 中                                                                            |
| S5b B0+B1 ✅ 2026-07-10 | 卡匣形态 v2（把手+浮层 tabs）+ 吞噬核心（拖拽入腹三拍 + 咬不动 + 胃取出 + 身份节点/连线渲染退场 + 添加菜单收敛）。B2 增强三件套（磁吸/快投/张口预览）留二次会话，任务包 `node-canvas-s5b-ingest.md`                                                                                                                                                                                                                                                                                                                                                                                                                                          | 中高（新手势 + 契约校验可视化，触屏点选兜底必测）                             |
| S5c ✅ 2026-07-10       | 浮层修缮（列数自适应/裁切根因修复）+ 角色档案卡（紧凑卡徽章 + 档案面板：视觉/身份/听觉/出演四区）+ 散图一等公民 + 融合/拆出循环（含本地文件拖入），任务包 `node-canvas-s5c-dossier.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 中（散图↔卡匣是新方向手势，`referenceAssets`/`fusedIntoNodeId` 向后兼容增量） |
| S5d ✅ 2026-07-11       | 业务模型 v3.1 对齐修正六条（§6.0 清单：①横匣回滚 ②隐藏条件=有下游引用 ③upload-first+分类系统+分类进图例+frame 退役 ④收集器档案卡面 ⑤融合目标改画布 ⑥卡匣再喂）+ owner 追加拍板（卡匣只放收集器卡、音色/参考视频=素材回添加菜单）+ 两缺陷修复（融合三拍补齐/把手双锚点），任务包 `node-canvas-s5d-model-align.md`，偏差回写 §9c                                                                                                                                                                                                                                                                                                               | 中（渲染层隐藏条件翻转 + schema 兼容增量）                                    |
| S5f-A ✅ 2026-07-11     | 画布实体拖拽吞噬全覆盖（收集器卡/音色/参考视频/散图 → 合法目标；散图→镜头图按矩阵正确拒绝），任务包 `node-canvas-s5f-gestures.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 中（onNodeDragStop 扩面复用 evaluateCastIngest）                              |
| S5f-B ✅ 2026-07-11     | B1 磁吸 + B3 张口预览（卡匣卡路径，onBiteChange → 迷你清单「图集×N·音色·@名字·参考位 n/m」超限红）+ **B2 快投模式**（CastCard hover Send 钮/触屏长按 onLongPress → 进模式；合法目标 `.node-quick-throw-target` 绿框+序号角标、已含 `.node-quick-throw-included` ⊘暗；workbench onNodeClick=feed / onPaneClick+Esc=exit；quickThrowApiRef 桥接 provider↔workbench 事件）+ **B4 把手热区**（canvasNodeDragActive 信号 → CastDock 折叠态指针近把手 handleHotZonePx 自动展开、拖拽结束回折叠）。⚠ 张口预览的**画布节点拖拽路径**（handleNodeDrag）仍走引擎外，暂只覆盖卡匣卡路径。真机拖拽/长按需 owner 实测（合成事件过不了 setPointerCapture） | 中高（两套拖拽系统 + 跨 provider ref 桥接）                                   |
| S6                      | 空态插画 + 手写体点缀 + composer/agent 死类型清理                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 低                                                                            |

依赖：S5b 依赖 S5a 与 S2 的成分栏；其余可按序独立验收。连线渲染退场发生在 S5b（吞噬可用之前不拆现有连线，避免中间态无绑定手势）。

每片：`npm run lint && npm run build`（dev 跑着不并行 build）→ `e2e/visual.spec.ts`（基线按 OS 分套，有意改动 `--update-snapshots` 并点名）→ 交互态 claude-in-chrome 实跑 → `checklists/ui.md` 过 P0。

### 9a. S5b B0+B1 实现偏差回写（2026-07-10 执行会话）

- **B0 合并行**：选了任务包给的「较小实现」——把手与工具条不是同一个带分隔线的边框容器，而是各自独立的圆角药丸，共享 `StudioNodeWorkbench` 里同一个 `bottom-3` 定位包裹层（一次性算好 assistant-dock 让位 inset，两个药丸并排）。`CanvasBottomDock`/`CastDock` 各自不再自带 `absolute` 定位。
- **浮层原语**：用现成 `ResponsivePopover`（桌面 Popover / 移动 Drawer），不是文档字面提到的「ResponsiveOverlay」（代码里没有这个名字，实际家族是 `ResponsiveDialog`/`ResponsivePopover`）。附带效果：移动端断点变成 `useIsMobile()` 的 1024px（`lg:`），不是画布其余 chrome 用的 767px（`md:`）——两者接近，抽屉在平板宽度也会提前触发，判定为可接受的小偏移。
- **卡片网格**：`grid-template-columns: repeat(4, minmax(0,1fr))` 走内联 style（Hard Rule 5 禁 Tailwind 任意值，CSS 原生网格不受此限），非字面 `auto-fill`；40+ 卡表现为固定 4 列 + 纵向滚动（`flyoutMaxHeightPx`），不是横向 wrap，效果等价「永不横向截断」。
- **CastCard 点击语义改变**：S5a 的「点卡=focusNode 聚焦画布」在身份节点隐藏后失去意义（面板对一个不渲染的节点做 fitView 没有视觉结果），改为「点卡=直接打开该节点的⤢详情面板」（`setExpandedNodeId`）——胃/详情面板本来就是 character/background/voice/videoReference 四类的编辑入口，这样卡匣即是它们唯一可达的编辑口。
- **CastCard 新增删除（×）**：任务包未点名，但身份节点隐藏后画布上的 NodeToolbar 删除按钮同样不可达，不补一个入口会造成「新建了删不掉」的死角，判定为必要的同范围内追加（`deleteNode`，hover 露出，无二次确认，与 NodeShell 既有删除按钮同惯例）。
- **胃取出落点**：视频节点（`DepartmentStrip`）与镜头节点（`ShotInspector`）在 S2/cast-redesign 阶段已经有「×删边」，本片未改动；本片实际新增的取出点是 `NodeShell.Ingredients`（成分栏 chip ×，S2 只读→可解绑）与 `CharacterImageInspector` 的已绑定音色徽标（新增 × 解绑）。
- **参考位已满容量检查**：仅对「贡献 image_urls 的来源（角色/背景/legacy 类型/统一 image 节点）→ 视频或镜头目标 且目标已选模型」这一种组合计算 n/m（`getMaxReferenceImages`）；音色/参考视频来源没有已知上限，永不触发 capacityFull（诚实沉默，不硬造数字）；目标未选模型时同样跳过（上限不可得）。
- **镜头图卡/关键帧不受影响**：`isCastIdentityNode` 精确对应 §6.1 四类（角色/背景含 legacy、音色、参考视频），shotText 与 closeup 本片**未**纳入隐藏（§6.1 原文提过 shotText 隐藏的愿景，但 B1-6 的执行清单没有点名，保守不动，避免"误隐藏"扩大化）。
- **端口（Handle）不隐藏**：本片只退场"连线渲染"，NodeShell 的 Handle（含纸面端口色）维持现状——§3 组件改动面表格里"端口渲染退场"是更长期的终态描述，S5b 任务包的 B1 清单没有把它列进来。
- **工具条 剪刀/连线 两个工具模式**：连线不再渲染后这两个模式失去可交互对象（没有边可点/可剪），但本片未删除或改造它们（不在任务包改动清单内），属已知的功能性冗余，留给后续片处理。
- **验证中发现的预置问题（非本片引入）**：`VideoComposer`/`DepartmentStrip` 的「参考素材」面板对`鸣潮`测试项目里已连线的视频节点没有显示任何 token（`references.emptyDept` 一直命中），复核确认这在本片改动前就是如此（S5b 未触碰 `use-video-composer.ts`/`DepartmentStrip.tsx`/`node-workflow-graph.ts`），且不影响数据层——直接读 localStorage/服务端 payload 确认吞噬手势建的边完全正确、可持久化、跨刷新存活。已用 chrome 实测的合成 PointerEvent 序列绕过展示层验证了建边/拒绝两条路径，具体建边→edges 数组多一条、拒绝→原因气泡+红描边正确触发。这个展示面板的问题记为后续待查项，不在 S5b 范围内处理。
- **B2 增强三件套（磁吸/快投模式/张口预览）本次未实现**：任务包明确允许 B0+B1 全绿后中期交付、B2 留二次会话；鉴于 B0+B1 本身已是自定义指针拖拽引擎 + 三拍 WAAPI 动画 + 渲染折叠的完整战役，验证工作量也不小，按任务包指引在此打住。

### 9b. S5c 实现偏差回写（2026-07-10 执行会话）

- **浮层裁切根因（一.2）比任务包描述更具体**：DOM 实测（`getBoundingClientRect`/`getComputedStyle`）定位到真正原因——`CastCard` 曾用固定 `w-24`（96px），而 `CastDock` 网格按 `repeat(4, minmax(0,1fr))` 在 `w-96` 容器里算出的实际列宽只有 ~80.5px，卡比列宽，被 `overflow-y-auto` 连带强制的 `overflow-x-auto` 裁切（`scrollWidth 368 > clientWidth 348`）——不只是 padding 不够。修复把 `CastCard` 宽度改成 `w-full`（贴列宽，效仿"+新建"瓦片一直以来的做法），配合 `gap-2→gap-3`、容器 `p-3→p-4`+网格自身 `p-1.5`。
- **一.3「大片空黑」重新解读为「稀疏分区空白格」**：直接测量证明高度早已按内容自适应（`maxHeight` 只是上限，非强制），未发现真正的高度 bug；实测到的真实空黑是稀疏分区（如 2 张卡）在固定 4 列网格里空出的横向空格。修复：列数按 `Math.min(flyoutGridColumns, cards.length+1)` 收窄（封顶不变，40+ 卡仍是 4 列换行，"永不横向截断"承诺不变），配合 `w-fit min-w-80 max-w-96` popover 宽度——两者都是标准 Tailwind 刻度，非任意值。
- **紧凑卡徽章格式**：「📷N ♪N」按空格分隔渲染为「📷N ♪」（♪不带数字，因为 spec 原文本身说"♪=voice 边有无"是存在性不是计数）；两者独立按需显示，都为零则整行不渲染。card 高度 `h-32→h-36` 给新行让空间。
- **档案面板视觉身份区改成"跨 tab 常驻"**：`NodeMediaInspector` 原有的 `CharacterImageReferenceControls` 挂在 `showAiForm`（`editTarget==='ai'`）内，意味着默认停在"已有图片"结果视图时参考图集不可见——这与档案面板"身份区应始终可见"的定位冲突，因此 gallery 模式下把它提到 `showAiForm` 外层，非 gallery（shot/frame 既有调用方）行为完全不变。
- **听觉身份区"+绑定"复用 `VideoComposer`"＋配音"的确切模式**：不是 `VoiceSelector`（系统 TTS 音色目录，没有 `voiceReferenceAudioUrl`），而是 `spawnReference` + `AssetSelectorDialog(mediaType='audio')`——与既有"音色 = 已生成/已上传音频当 donor"架构完全对齐，`boundVoice` 检测逻辑（需要真实音频 URL）未改动。
- **身份词条区 visualSeed 只读展示**：全仓库检索未发现任何组件曾编辑过 `character.visualSeed`（只在 ScriptDoc/script-breakdown 引擎写入），判定这是助手管理的锁定字段，不额外造一个手改 UI；有值才显示，只读。
- **出演区聚焦复用既有 `focusNode`**：点击出演 chip 先 `setExpandedNodeId(null)` 关闭档案面板再 `focusNode`（与 S5b「面板对隐藏节点 fitView 无效」同一条理由——出演 chip 指向的是可见的镜头/视频节点，但先关面板再对焦更符合"聚焦=看得见"的直觉）。
- **融合手势（三.3）用原生 `onNodeDragStop`，不是第二套指针引擎**：任务包本身括注了"onNodeDragStop 包围盒命中检测"——散图节点是画布原生可拖节点（`nodesDraggable`），沿用 ReactFlow 自身拖拽生命周期做落点命中检测（`document.elementFromPoint` 找 `[data-cast-card-node-id]`），比照搬 S5b 的自定义指针/portal 幽灵引擎轻得多；三拍视觉复用同一套动效常量与关键帧（`playTargetGulpAnimation`/`playTargetRejectShakeAnimation` 从 `use-cast-ingest.ts` 抽出导出，两个手势方向共享同一份 keyframes，不是各写一份）。**取舍**：因此没有"把手作为热区自动展开浮层"（§6.3 提到的便利性）——融合前必须先手动展开卡匣到目标分区，任务包本身允许"按 一→二→三 顺序交付，上下文吃紧不压缩验证"，这里判定为把预算留给验证而非这颗糖。
- **散图咬不动=原地不动，不弹回**：与 Cast 卡匣→画布方向的吞噬（松手弹回原位）不同，画布→卡匣方向的"咬不动"就是"什么也没发生"——散图本来就是画布合法常驻件，不合法目标只需一条 toast 讲清楚，不需要把节点弹回任何地方（它已经在它该在的地方）。
- **拆出统一走 `extractReference(nodeId, referenceId)`**：`source:'canvas'` 分支原地 un-hide 原节点（`fusedIntoNodeId` 清空）；`upload`/`asset`/`paste` 分支在视口中心新建散图节点——两条路径共享同一个"从 referenceAssets 移除"前置，`createReferenceAsset`/`createReferenceId` 从 `CharacterImageReferenceControls.tsx` 导出复用，没有第二份构造逻辑。
- **closeup 合并仅做只读陈列，未纳入 §6.3 的隐藏折叠**：S5b 已明确保守决定"closeup 本片未纳入隐藏"，本片档案面板把 closeup 图并入视觉身份区网格（标"特写"来源）满足"陈列"要求，但没有跟进把 closeup 节点也折叠进 `isCastIdentityNode`——避免单独一片里扩大隐藏面导致回归风险评估变复杂，closeup 节点在画布上的可见性维持 S5b 现状不变。
- **背景档案「同构」核实为真**：`NodeMediaInspector` 的 `isImageNode` 门禁对 character/background 一视同仁（referenceAssets + LoRA + AI 生成三件套完全共享），因此背景档案顺带做了视觉身份区 + 出演区；听觉身份区（无环境音字段/节点类型）与 closeup 合并（closeup 只单向绑角色）两处不同构，未做，`BackgroundDetailBody` 注释已更新说明。

### 9c. S5d 实现偏差回写（2026-07-11 执行会话）

- **卡匣只放收集器卡（owner 会话中追加拍板，收窄 §6.2 四分区）**：横匣分区从四个（角色/背景/音色/参考视频）收窄为两个收集器分区（角色/场景），音色与参考视频按「素材」定性回 `CanvasAddMenu`（与图片（素材）同级）。`isCastIdentityNode` 仍匹配全部四类——「有下游引用才隐藏」的画布折叠规则对四类一致，只是音色/参考视频不再有 dock 卡面。`CAST_SECTIONS` 清单驱动渲染，未来新收集器类型（画风卡等）加一行即可。
- **空分区不占位 + ＋新建收敛为匣尾单入口**：零卡分区整段不渲染（无标签瓦片无占位）；每分区一个「＋」收敛为横匣尾部一个「＋新建」，点开二项类型选单（角色/场景）。选单必须用真 Popover（Radix portal）——手写 `absolute` 菜单被横匣自身 `overflow-hidden`/`overflow-x-auto` 裁切不可见（chrome DOM 实测：菜单存在且 rect 合法但永不上屏），owner 实测抓出。i18n `castDock.createAria.*` 与 `castDock.empty.*` 键随之删除（三语同步）。
- **隐藏条件（修正②）纯派生零字段**：「有下游引用才隐藏」= `workflow.edges` 一次遍历收集 source id 集合，`isCastIdentityNode(node) && set.has(node.id)` 才折叠 hidden——没有新增任何持久化字段，拆到零引用时集合自然少一个 id，下一帧渲染即回画布，无需显式 un-hide 逻辑。`fusedIntoNodeId`（referenceAssets 融合路径）保持 S5c 原样，与边引用是两条并行的隐藏依据。
- **role picker 全退役（修正③）**：`ImageRolePicker.tsx`（+测试）删除；`ImageNode` 空态分发改为 `ImageSourceStarter`（无 role 无媒体 → 三来源起步卡）/`LooseImageCard`（无 role 有媒体，S5c 原样）/`IdentityCollectorCard`（role=character/background，档案卡面）/`NodeMediaPreview`（shot/frame/closeup，原样）；`NodeDetailPanel` 的两步流（选用途→详情）删成单层，役出 `nodeDetail.backToRolePicker`、`imageRolePicker.*` i18n 键。「镜头图（生成）」从添加菜单直接 role-stamp（与 CastDock ＋新建同一模式），不再经过任何选择器。
- **分类系统落点**：`NODE_STUDIO_REFERENCE_ROLES` 5→11（enum 扩值，旧值原位保留）+ `custom` 配对 `customLabel`（asset 级）/`imageCategory`+`imageCategoryLabel`（散图节点级，融合时经 `createReferenceAsset` 的 `categorySeed` 参数带进卡片图集）。分类进图例走新纯函数 `buildReferenceAssetLegendEntries`（node-workflow-graph.ts）：节点自身 referenceAssets 的分类条目以「图N = 名字（分类）」格式并入 `buildShotReferenceLegend`，与上游角色/背景的「图N：角色「名字」」格式并存（URL 冲突时上游语义优先）；custom 无标签或无名字的条目诚实跳过不硬造。
- **frame 关键帧兼容迁移**：`isKeyframeNode` 在旧 `role==='frame'`/`frameImage` 分支原样保留之外，追加认 `imageCategory ∈ {frameStart, frameEnd}`——新关键帧是「分类为关键帧首/尾的散图」，收割顺序（关键帧先行）不变，旧存档不迁移不炸。添加菜单保留「镜头图（生成）」row（中鱼原样），frame role 不再有创建入口但 enum 保留。
- **融合三拍动画补齐（owner 实测缺陷①）**：S5c 的融合只有目标 gulp 没有吸入飞行，且没有 per-frame 张口。补 `onNodeDrag`（ReactFlow 原生 per-frame 回调）做拖拽中张口/清除（refs 不进 React state，避免每帧重渲染），共享合法性判定 `isLegalLooseImageFuseTarget`（张口承诺=落卡结果，一份判定两处用）；落卡成功时 `playCanvasFuseSwallowAnimation`（use-cast-ingest.ts 新导出）克隆被拖卡的 DOM 做一次性 body ghost，按 §8 同一份 `INGEST_MOTION` 挤压/弧线/终点缩放 keyframes 飞入目标中心，落定后才翻 `fusedIntoNodeId`（视觉消失与数据折叠同步）。`applyBiteHover`/`clearBiteHover`/`findNodeCardElement` 从引擎抽出导出，Cast 卡方向的原有代码路径改调同一份。
- **把手双锚点（owner 实测缺陷②）**：折叠把手贴工具条行高度（`collapsedBottomOffsetPx=12`，同 `bottom-3`），展开横匣浮在工具条上方（`barBottomOffsetPx=68`）+ minimap 水平避让（`minimapClearancePx` 沿用）——折叠态原先悬在画布半空盖住节点内容。
- **命中检测升级为 `elementsFromPoint` 栈式扫描**：修正⑤把融合目标从「浮层卡 DOM」扩到「画布上的卡节点」后，被拖节点自己的 wrapper 恰好也在指针下（ReactFlow 抬高拖拽节点 z-index），单点 `elementFromPoint` 会被它挡住——改全栈扫描并跳过被拖节点 id，dock 卡命中（`data-cast-card-node-id`）保留为后备路径（吃掉已隐藏卡仍可从卡匣操作）。
- **修正⑥（卡匣再喂）零代码改动**：S5b 的 `CastCard.beginDrag`（本体拖出建引用副本、本体不动）与 `performanceCountBySourceId`（出演 N 镜计数）在横匣形态下原样工作——本片只是把它们所在的容器从浮层搬回横匣，引擎未触碰。
- **图例实跑取证降级为测试级**：分类进图例的端到端取证需要真实生成一次镜头图（花钱+跑模型），以 `node-workflow-graph.test.ts` 新增用例（「图N = 名字（分类）」格式断言 + custom 标签 + 诚实跳过）+ 代码路径核对代替，报告点名。

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
