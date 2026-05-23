# PixelVault Node Studio — 完整设计规格

## 目标

在 Figma 文件 `https://www.figma.com/design/5mKh7zmE1tcjLo9BvO30n9/node-design` 当前 page 里生成 Frame 03 到 Frame 11，与已存在的 Frame 02 (node-id 10:58) 风格一致。Frame 02 是基准参考，所有后续 frame 复用同样的 token / 组件 / 节点结构。

约束：

- 每个 frame 上下排列，间距 60px
- Frame 02 已存在，**不要重复创建**，从 Frame 03 开始
- 颜色、圆角、字号严格按下表 token，不要自由发挥
- 文案统一中文
- emoji 用 unicode 字符（🤖 / ⌗ / 💬 / ✨ / 👋 / ↑ / ▾），不要用 SVG icon
- 投影使用 Figma drop-shadow effect，参数：`color #000 50% / offset y 20 / radius 60 / spread 0`
- 字体 Inter (Regular / Medium / Semi Bold / Bold)

---

## Section A — 全局 Design Tokens

### A.1 颜色 token（严格用这些 hex，禁止用 oklch）

```css
:root {
  /* surfaces */
  --canvas-bg: #0b0b0a; /* 主画布底色 */
  --rail-bg: #030303; /* 左侧 nav rail 底色（比 canvas 还黑） */
  --panel: #181716; /* 浮动面板/节点卡 surface */
  --panel-inset: #1f1d1b; /* 节点内嵌容器（attach slot / composer 底色） */
  --chip: #22211f; /* chip / dock item / 二级按钮 */
  --chip-hover: #2d2b28; /* chip hover */
  --preview: #2d2b28; /* 节点内 preview area 底色（agent 中央灰色矩形） */

  /* borders */
  --hairline: rgba(244, 241, 234, 0.08); /* 卡片描边，几乎不可见的细线 */
  --hairline-2: rgba(244, 241, 234, 0.15); /* 略强描边（attach slot 虚线） */
  --hairline-3: rgba(244, 241, 234, 0.25); /* 连线、minimap viewport */

  /* text */
  --text-1: #f4f1ea; /* primary text */
  --text-2: #a6a098; /* secondary text */
  --text-3: #6f6a63; /* muted text / placeholder */
  --text-on-light: #0d0c0b; /* 用在白底主按钮上的文字 */

  /* accents */
  --amber: #f59e0b; /* 项目 icon、credit sparkle */
  --emerald: #22c55e; /* route 健康绿点、success status */
  --rose: #e11d48; /* error / failed */
  --slate: #94a3b8; /* draft / disabled status */
  --violet: #a78bfa; /* video accent */

  /* CTA */
  --cta-bg: #f4f1ea; /* 主按钮背景（白底） */
  --cta-bg-hover: #ffffff;
  --cta-text: #0d0c0b;

  /* shadow */
  --shadow-card: 0 20px 60px rgba(0, 0, 0, 0.5);
  --shadow-pop: 0 24px 80px rgba(0, 0, 0, 0.6);
}
```

### A.2 圆角

| Token            | 值    | 用途                                                         |
| ---------------- | ----- | ------------------------------------------------------------ |
| `--r-card`       | 22px  | 节点卡、顶栏药丸、Assistant dock、Bottom dock、Minimap panel |
| `--r-pill`       | 23px  | 顶栏 action group、credits pill、route pill                  |
| `--r-chip`       | 999px | 所有 chip（药丸）                                            |
| `--r-inner`      | 16px  | 节点内 preview area、attach slot、Assistant composer         |
| `--r-dock-item`  | 12px  | Bottom dock 9 个小方块按钮                                   |
| `--r-icon-plate` | 10px  | 顶栏项目 icon plate（34×34）                                 |
| `--r-port`       | 999px | React Flow handle 圆点                                       |

### A.3 字号 + 字重

所有文本默认字体 system stack：`ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif`。等宽用：`"SF Mono", monospace`。

| Size                                          | Use                                              |
| --------------------------------------------- | ------------------------------------------------ |
| 10px / 600 / uppercase / letter-spacing 0.1em | 顶栏 eyebrow、节点 type chip、status chip        |
| 11px / 500                                    | secondary label、minimap title、credit detail    |
| 12px / 600                                    | 按钮文字、route pill、dock chip                  |
| 12px / 400                                    | composer placeholder                             |
| 13px / 500                                    | sidebar 导航项、Assistant title                  |
| 14px / 600                                    | 卡片标题（项目名、节点标题、Assistant greeting） |
| 14px / 400                                    | greeting body、placeholder long text             |
| 15px / 700                                    | (no use)                                         |
| 16px / icon                                   | 大 emoji、sparkle、collapse icon                 |
| 28px / 700                                    | sidebar 品牌 "PixelVault"                        |
| 32px / regular                                | greeting wave emoji 👋                           |
| 34px / regular                                | agent empty state 🤖 emoji                       |

### A.4 间距

| Token       | 值   |
| ----------- | ---- |
| `--space-1` | 4px  |
| `--space-2` | 8px  |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |

### A.5 渐变（仅在 canvas 主背景）

```css
.canvas-bg {
  background:
    radial-gradient(
      ellipse 55% 50% at 85% -10%,
      rgba(245, 158, 11, 0.08),
      transparent 70%
    ),
    radial-gradient(
        circle at 1px 1px,
        rgba(244, 241, 234, 0.12) 1px,
        transparent 0
      )
      0 0 / 28px 28px,
    var(--canvas-bg);
}
```

（点阵 + 右上微弱琥珀光晕 + 黑底）

---

## Section B — Component Library（先在 mockup 顶部声明，所有 frame 复用）

### B.1 顶栏：项目药丸 `.project-pill`

- 容器：260×56，`--r-card`，bg `--panel`，border `--hairline`，padding 12 14
- 左侧：34×34 icon plate，`--r-icon-plate`，bg `--chip`，text `--amber` 14px bold 居中（单字母 "N"）
- 中间：纵向两行
  - row 1: 10px / 600 / uppercase / `--text-3` "节点工作流"
  - row 2: 14px / 600 / `--text-1` "未命名项目"（truncate）
- 右侧（hidden md-）：8px 细分隔线 + 11px / 500 / `--text-2` "2 个节点"

### B.2 顶栏：Top Action Group `.action-group`

- 容器：auto width × 46，`--r-pill`，bg `--panel`，border `--hairline`，padding 6
- 内含三个 button，gap 4：
  - **Primary "+ 添加节点"**：h 34，`--r-chip`，bg `--cta-bg`，text `--cta-text` 12px/600，padding 0 12，icon `+` 14px 在前
    - hover: bg `--cta-bg-hover`
  - **Ghost "整理画布"**：h 34，`--r-chip`，bg `--chip`，text `--text-2` 12px/600，padding 0 12，icon `⤧` 14px 在前
    - hover: bg `--chip-hover`，text `--text-1`
  - **Ghost "保存草稿"**：同上，icon `💾` 14px

### B.3 顶栏：Credits Pill `.credits-pill`

- 容器：82×46（auto 也可），`--r-pill`，bg `--panel`，border `--hairline`，padding 0 16，flex center
- 内：sparkle ✦ 14px `--amber` + "1.0K" 12px/600 tabular-nums `--text-2`

### B.4 顶栏：Route Pill `.route-pill`

- 容器：auto×46，`--r-pill`，bg `--panel`，border `--hairline`，padding 0 16
- 内：8×8 圆点 bg `--emerald` + "API 路由 · 13 个启用路由" 12px/600 `--text-1`

### B.5 Composer 节点 `.node-composer`

详细规格见 Section C "Component Anatomy"。

### B.6 Agent 节点 `.node-agent`

详细规格见 Section C。

### B.7 Placeholder 节点 `.node-placeholder`（5 种类型：image / video / audio / text / model）

详细规格见 Section C。

### B.8 Right Dock `.assistant-dock`

- 容器：absolute right 20 top 20 bottom 20，宽 336，`--r-card`，bg `--panel`，border `--hairline`，box-shadow `--shadow-card`
- 内部纵向 grid：header 60 / body 1fr / sub-links 50 / composer 110

### B.9 Bottom Dock `.bottom-dock`

- 容器：absolute bottom 20 left 50% translateX(-50%)，332×50，`--r-card`，bg `--panel`，border `--hairline`，box-shadow `--shadow-card`，padding 8，flex gap 4

### B.10 Minimap Panel `.minimap`

- 容器：absolute bottom 20 left 20，184×132，`--r-card`，bg `--panel`，border `--hairline`，box-shadow `--shadow-card`，padding 12
- title "小地图" 11px/600 `--text-2`
- map area 160×78，`--r-inner`，bg `--chip`
- viewport rect 78×36，border 1px solid `--hairline-3`，bg rgba(255,255,255,0.05)

### B.11 Sidebar `.sidebar`（左侧 226 宽 nav rail）

- 容器：absolute left 0 top 0 bottom 0，226 宽，bg `--rail-bg`，padding 14 12
- 内容上下：
  - top: 品牌 "PixelVault" 28px/700 `--text-1` + 折叠 icon
  - main nav（4 项）：画廊、提示词、素材、卡片管理（13px/500 `--text-1`，icon 18×18 左对齐）
  - section divider + label "工具" 11px/600/uppercase `--text-3`
  - tool nav（7 项）：图像、视频、音频、3D、编辑、LoRA、**节点编辑** (active)、竞技场
  - active item: bg `--chip`, `--r-dock-item`, padding 5 9
  - bottom-anchored:
    - credits card 206×54, `--r-card`, bg `--canvas-bg`, border `--hairline`：上行 "334" 13px/600，下行 "今日免费 / 20 / 20" 11px split
    - language switch 206×50, `--r-pill`, bg `--chip`，3 段 EN / JA / ZH（active 是圆形 38×38 bg `--text-1`，text `--text-on-light`）

---

## Section C — Component Anatomies（独立 frame，每个组件画 3 倍大示意图 + 标注线）

每个 anatomy frame 1440×900，放在主 frame 之间。标注用细线 + 11px/500 `--text-2` 文字。

### C.1 Composer 节点 Anatomy

**尺寸**：560×180，`--r-card`，bg `--panel`，border `--hairline`，box-shadow `--shadow-card`

**布局**（坐标相对节点左上角）：

- **Attach slot** `top:12 left:12 size:48×48`，`--r-inner`，bg `--panel-inset`，border 1px dashed `--hairline-2`
  - 中心 □ icon 16×16 `--text-3`
  - hover：border `--hairline-3`，icon `--text-2`
  - 状态：empty (默认) / filled (显示缩略图)
- **Expand button** `top:14 right:14 size:18×18`，`⤢` 16px `--text-2`
  - hover：bg rgba(255,255,255,0.05)，`--text-1`
- **Textarea** `top:12 left:72 right:60 height:96`，无 border/bg，placeholder 14px/400/`--text-3`，行高 22px
  - placeholder 文案："输入你的创意或请求，可添加上游连线以引入参考素材"
  - focus 时也无 ring（节点本身的 selected ring 替代）
- **Chip bar** `bottom:12 left:12 gap:8`：
  - Chip "⌗ Agent 模式 ▾"：h 28，`--r-chip`，bg `--chip`，border `--hairline`，padding 0 10，11px/600 `--text-2`，icon 12 + label + ChevronDown 12
  - Chip "💬 询问 ▾"：同上结构
  - Chip "✨ 技能库"：同上但无 ChevronDown
- **Send button** `bottom:18 right:12 size:36×36`，`--r-chip`（即 999px），bg `--cta-bg`，text `--cta-text`
  - 内部 ↑ 16px bold
  - disabled (prompt empty 或 isLoading 或 没连下游 agent)：bg rgba(244,241,234,0.2)，text rgba(13,12,11,0.6)
  - hover (enabled)：bg `--cta-bg-hover`
  - loading：换成 spinner ⟳

**Handle (port)**：

- Left: target handle，y 中心，10×10 圆，border `--hairline-3`，bg `--chip`
- Right: source handle，同上
- hover：border rgba(255,255,255,0.6)

**Selected ring**：节点 selected 时 border 改为 1.5px rgba(255,255,255,0.4) + ring 2px rgba(255,255,255,0.1)

### C.2 Agent 节点 Anatomy

**尺寸**：360×240，`--r-card`，bg `--panel`，border `--hairline`

**布局**：

- **Inner card** `inset:9`：340×222，`--r-inner`，bg `--preview`，border `--hairline`
  - **Type chip** `top:8 left:8`：74×24，`--r-chip`，bg `--chip`，border `--hairline`，padding 0 8，10px/600 `--text-2`，icon "🤖" + " Agent"
  - **Open editor button** `top:8 right:8 size:28×28`（仅在 has breakdown 时显示），`--r-dock-item`，`--text-2`，icon ⤢ 14px
    - 默认 opacity 0，节点 group-hover 时 opacity 100
- **Body**（在 inner card 中央）：根据状态切换
  - State A — empty：
    - 中央 🤖 emoji 34px
    - 标题 "等待 Composer 输入" 12px/600 `--text-1`
    - 描述 "把 Composer 节点连接到这里，发送后会在这显示 Agent 拆解的剧本结构。" 11px/400/`--text-2`，max-w 260，center
  - State B — loading：
    - 中央 spinner ⟳ 24px `--amber`
    - 标题 "Agent 拆解中…" 12px/600 `--text-2`
  - State C — done (with breakdown)：
    - logline 12px/400/`--text-1`（line-clamp 2）
    - 5 个 counter 卡片：grid 5 cols gap 6，每个 h 36，`--r-dock-item`，bg `--panel`，border rgba(255,255,255,0.06)
      - icon 12 居中 `--text-3`，下方数字 11px/600 tabular-nums `--text-1`
      - 5 类：Users 角色 / MapPin 场景 / Activity 行为 / Clapperboard 段落 / Film 镜头
    - 底部分隔线 1px `--hairline` + footer：
      - 左：planner label "Gemini 3 Pro" 10px/500 `--text-1` + planner model id 10px mono `--text-2`
      - 右：copy risk badge 10px `--r-chip` bg `--chip` border `--hairline-2` `--text-2`
  - State D — failed：
    - 中央 ⚠ 24px `--rose`
    - 标题 "Agent 失败" 12px/600 `--rose`
    - 描述 错误简述 11px `--text-2`
    - 按钮 "重试" h 28 `--r-chip` bg `--chip` text `--text-1`

**Handle**：左侧 input port，右侧无 output（Agent 是末端）

### C.3 Placeholder Node Anatomy（image / video / audio / text / model）

**尺寸**：360×240，与 Agent 同结构

**Type chip 文案 + icon**：

- image: "□ 图片" `--emerald`
- video: "▱ 视频" `--violet`
- audio: "♪ 音频" `--amber`
- text: "T 文本" `--slate`
- model: "🎛 模型" `--text-2`（如有需要）

**Body**：根据状态

- empty：中央大图标 28px accent color，下方 12px/500 `--text-2` "等待生成"
- loading：spinner + progress bar 4px
- done：实际产物 thumbnail（图片占满 inner area + 1px hairline frame）
- error：⚠ + 错误文字

---

## Section D — Frame 列表（mockup HTML 里上下排列）

每个 frame 1440×900（mobile 390×844），padding 0，border 1px solid #2d2b28，`--r-card`，box-shadow `--shadow-pop`，上下间距 60px。Artboard 上方 `<h2>` 标题 + 简短描述。

### Frame 02 — Empty Canvas（已在 Figma 10:58 落地，参考用）

简要重复结构（mockup 内仍要画出来作为对比基准）：

- Sidebar (left 0)
- Top bar: project pill + action group + credits + route（top 20，gap 12）
- Center area: Composer (220, 400) + Agent (320, 110) + edge composer→agent
- Right Assistant Dock (right 20, full height)
- Bottom Dock (bottom 20, centered)
- Minimap (bottom 20 left 5+offset)

### Frame 03 — Generated Workflow（剧本拆解完成后）

复用 Frame 02 的 sidebar / topbar / dock，画布上多放节点：

**节点位置 + 类型**：

- Composer (60, 580) — 已有内容 prompt："三个角色在废弃车站发现会预言未来的旧相机"
- Agent (380, 320) — state **done with breakdown**：
  - logline: "三个朋友在废弃车站偶遇老式相机，相机的快门声响起后立刻浮现各自最深的秘密。"
  - counters: 3 / 4 / 7 / 8 / 12（角色/场景/行为/段落/镜头）
  - planner: "Gemini 3 Pro"
  - copy risk: "原创"
- Image 节点 "角色 1" (780, 220) — state done with thumbnail（占位用渐变 emerald → dark）
- Image 节点 "角色 2" (780, 480) — state done
- Video 节点 "镜头 1 - 开场推镜" (1080, 220) — state done with frame thumbnail
- Video 节点 "镜头 2 - 特写" (1080, 480) — state running with progress bar
- Audio 节点 "旁白" (1080, 720) — state empty

**Edges**（用 SVG path 或 1.5px stroke `--hairline-3` 曲线 + animated dash）：

- composer → agent
- agent → image-1
- agent → image-2
- image-1 → video-1
- image-2 → video-2
- agent → audio

**已选中节点**：Agent 节点 selected，显示 selected ring + 右侧 Assistant dock 变成 **Inspector mode**（见 Frame 04 状态 B）

**变化的顶栏**：

- 项目药丸右侧"2 个节点" → "7 个节点"
- 多一个"工作流"按钮（在 action group 里）：bg `--chip` text `--text-2` 12px "导出工作流"

### Frame 04 — Assistant Dock 三个状态

一个 1440×900 frame，画 3 个 dock 并排展示。每个 dock 336×860。

#### 状态 A — Empty Greeting（默认）

- Header (h 60)：
  - left 12: ✺ logo 14px + "updream" 13px/700 `--text-1`
  - left 110: chip "+ 新建对话" 92×34 `--r-chip` bg `--chip` border `--hairline` 12px/600 `--text-2`
  - left 208: chip "AI 助手 ▾" 92×34 同上
  - right 12: collapse btn 28×28 `--text-2` icon X 14
- Divider 1px `--hairline`
- Body 中央（垂直居中）：
  - 👋 32px
  - "你好！输入你的创意" 14px/600 `--text-1`，下行 "我来帮你完成剧本、分镜、角色设计等工作。" 14px/400 `--text-2` max-w 240 center
- Bottom sub-links（h 50 padding 12 16，flex justify-between，14px/500 `--text-2`）：
  - "✨ 技能库" / "🌐 技能社区" / "🎨 风格指导"
- Composer (h 110 m 12)：
  - bg `--panel-inset`, border `--hairline`, `--r-inner`, padding 12
  - placeholder "输入你的创意或请求，可拖拽/粘贴图片..." 12px/400 `--text-3`
  - 底部：
    - left: 图片 icon 16 + 文件 icon 16 gap 8 `--text-2`
    - right: chip "💬 询问 ▾" 76×28 `--r-chip` bg `--chip`，+ send btn 32×32 `--r-chip` bg `--cta-bg` text `--cta-text` icon ↑ 14 (disabled 状态)

#### 状态 B — Inspector Mode（选中 Agent 节点时）

- Header 同 A，但 chip "AI 助手 ▾" 变成 chip "节点检查器" + icon ⚙
- Body 顶部加一个 selected node card：
  - h 60 m 12，`--r-inner`，bg `--panel-inset`，border `--hairline`，padding 12
  - 左侧 type chip "🤖 Agent" + 右侧 status dot 8px `--emerald` + 标题 "未命名 Agent" 13px/600
- Body 主体（垂直 scroll）：
  - Section "Prompt"：label 11px/600 uppercase `--text-3` + textarea 显示当前 prompt（来自上游 composer）
  - Section "Planner Model"：label + model selector chip
  - Section "Breakdown" (if state == done)：
    - 5 个 counter 小卡（与 Agent 节点内的 counter 相同）
    - "查看完整结构 →" 按钮（h 34 `--r-chip` bg `--cta-bg` text `--cta-text`）
  - Section "Output history"：占位列表 3 行（time + thumb）
- Composer (h 110)：保持同 A，但 placeholder 改 "对这个 Agent 提问、要求修改…"

#### 状态 C — Collapsed

- 替换整个 dock 为单个圆形按钮 44×44 `--r-chip` bg `--panel` border `--hairline`
- 位置 absolute right 20 top 20
- 内部 ✺ icon 18px `--amber`
- 点击 → 展开回 A 或 B

### Frame 05 — Node Anatomy & Variants

1440×900，画 3 个组件的 anatomy 标注图（横向排列）+ 下方 9 种节点类型展示。

**上半部（h 460）**：

- Composer anatomy (left 80)：节点本身 + 5 条标注线指向 5 个组件（attach / textarea / chip bar / send / handle）
- Agent anatomy (left 540)：节点本身（done state）+ 标注 6 个组件（type chip / open-editor / 🤖 emoji / counters / planner footer / handle）
- Placeholder anatomy (left 1000)：以 characterImage 为例的 done state + 标注 6 个组件（type chip / status chip / hero card / blueprint chips / model picker / footer label）

**下半部（h 380）**：

- 标题 "节点类型" 16px/600 `--text-1` left 80 top 560
- 9 个节点横向排 3 列 × 3 行，每个缩到 320×220 empty state：
  - 第 1 行：shot (hub 380×260 大尺寸 spans 2 col) / shotText
  - 第 2 行：characterImage / backgroundImage / frameImage
  - 第 3 行：voice / seedance (hub 380×260) / 留空
- 每个节点下方 11px/500 `--text-2` 标注：类型名 + 主输入 + 主输出（例: "characterImage · 上游: shot · 下游: shot"）

### Frame 06 — Node State Matrix（9 × 7 = 63 小卡）

1440×1900（**比常规 frame 更高，900 不够**），画 9 种节点 × 7 种状态的完整矩阵。

**Grid 9 行 × 7 列**：

- 行（节点）：composer / agent / shot / shotText / characterImage / backgroundImage / frameImage / voice / seedance
- 列（状态）：draft / ready / running / succeeded / failed / stale / disabled
- 每个小卡 130×180，gap 8，整体起点 (80, 80)
- 行首左侧 80 宽 column 显示节点类型 + accent dot（垂直居中）
- 列首顶部 60 高 row 显示状态名 + status dot（水平居中）

**每个状态规则**（适用所有节点）：

- **draft**：缺主要 prompt/上游，hero placeholder，status dot `--slate`
- **ready**：所有必填齐了未生成，status dot `--emerald`
- **running**：spinner 在中央 + 底部 4px progress，status dot `--amber` 脉冲
- **succeeded**：见下方"各类型 done 预览规则"，status dot `--emerald`
- **failed**：⚠ 24px `--rose` + 错误简述 + 重试 chip，status dot `--rose`
- **stale**：done 内容半透明 0.5 + 黄色 banner "上游已变更" + 重新生成 chip，status dot `--amber`
- **disabled**：整卡 opacity 0.4 + 中央 "缺 API Key" + 配置 chip，status dot `--text-3`

**各类型 done 预览规则**（succeeded 状态独有）：

| 类型            | done 预览内容                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| composer        | textarea 内有用户文字（不可编辑态） + send 灰色（已发送状态）                                                           |
| agent           | logline 2 行 + 5 counter 卡（角色/场景/行为/段落/镜头）+ planner footer                                                 |
| shot            | hub 内 4 个子 slot 缩略图：character / background / frameImage / voice 各占一格 84×60，hub 节点显示 shot 名 + 时长 chip |
| shotText        | 文本片段 line-clamp 4 + 字数 chip "120 字" + 段落数 chip "3 节"                                                         |
| characterImage  | 4:3 角色图缩略图 + 角色名 chip "林小满" + LoRA chip                                                                     |
| backgroundImage | 16:9 背景图缩略图 + 场景名 chip "雪夜神社" + 时段 chip "黄昏"                                                           |
| frameImage      | 1:1 帧图缩略图 + 帧序号 chip "Frame 2/5" + 来源 chip "起始帧/中间帧/结束帧"                                             |
| voice           | 波形示意 64px 高 + 音色名 chip "温暖男声" + 时长 chip "12.4s" + 播放按钮                                                |
| seedance        | 16:9 视频帧 cover + 中央播放按钮 + 时长 chip "8s" + 分辨率 chip "1080p"                                                 |

### Frame 07 — Composer State Matrix

1440×900，画 Composer 节点的 6 种状态：

1. **empty**：placeholder 灰色文字，send disabled
2. **typing**：textarea 内有用户输入文字 14px `--text-1`，send enabled (白底)
3. **typing + no downstream**：同 typing，但 send disabled + 旁边 tooltip "请先连接到一个 Agent 节点"
4. **sending**：textarea readonly + 半透明，send 变 spinner
5. **chip dropdown open**："⌗ Agent 模式 ▾" 点击，下方浮出 menu（240×120 `--r-card` bg `--panel` border `--hairline`，3 个选项：Agent / Chat / Generate）
6. **attach filled**：左侧 attach slot 内显示 48×48 缩略图（圆角内嵌图片）+ 右上角 ✕ 关闭按钮

### Frame 08 — Bottom Dock + Top Bar Details

1440×900，三个区域：

**上半部 - Top bar 状态展示**（h 200）：

- 静态：所有 pill 默认状态
- hover 状态：mouse over 每个 pill 时的颜色变化（注释标注）
- 各种 button hover/active 状态展示（add node hover bg `--cta-bg-hover`，arrange 按钮 hover bg `--chip-hover` text `--text-1`）

**中部 - Bottom dock 9 个 button 详细状态**（h 300）：

- 横向排列 9 个 dock item，每个画 4 种状态（default / hover / active / disabled），总共 36 个示意图
- 9 个 button：
  1. **Pointer (Select)** 默认 active：bg `--cta-bg` text `--cta-text` icon MousePointer2 16
  2. **Hand (Pan)**：bg `--chip` text `--text-1` icon Hand 16
  3. **Connect**：bg `--chip` icon Spline 16
  4. **Cut**：bg `--chip` icon Scissors 16
  5. **− (Zoom out)**：bg `--chip` text `--text-1` icon Minus 16
  6. **76% (Zoom level)**：bg `--chip` text 11px/600 mono `--text-1`，h 34 min-w 52
  7. **+ (Zoom in)**：bg `--chip` icon Plus 16
  8. **↺ (Undo)**：bg `--chip` icon Undo2 16
  9. **↻ (Redo)**：bg `--chip` icon Redo2 16
- 状态 mapping：
  - **default**：见上
  - **hover**：bg `--chip-hover` text `--text-1`（active button hover 改 bg `--cta-bg-hover`）
  - **active**：bg `--cta-bg` text `--cta-text`（用于工具 mode 切换的 pointer/hand/connect/cut）
  - **disabled**：opacity 0.4 cursor not-allowed（undo/redo 在没历史时）

**下部 - Add Menu 详细**（h 300）：

- Add menu 弹窗 240×210 `--r-card` bg `--panel` border `--hairline` `--shadow-pop` padding 8
- header (h 22 padding 4 8)：left "新建节点" 10px/600/uppercase `--text-3`，right close X 14px `--text-2`
- 6 个 item，每个 h 30，`--r-dock-item`，padding 4 8 gap 10：
  - icon plate 28×28 `--r-dock-item` 对应 accent
  - label 14px/500 `--text-1`
  - 右侧 1.5px dot 对应 accent
- 顺序：Composer / Agent / Image / Video / Audio / Text
- hover：bg rgba(255,255,255,0.05)

### Frame 09 — Edge & Connection States

1440×900，画一对 Composer + Agent，演示连线的 6 种状态：

1. **default**：1.5px stroke `--hairline-3`，无 animation
2. **animated (data flowing)**：1.5px stroke `--hairline-3`，stroke-dasharray 5 5，animation dash flow 1.5s linear infinite
3. **hover**：stroke `--amber`，宽 2px
4. **selected**：stroke `--cta-bg`，2px，cursor 显示 "delete?"
5. **connecting (drag)**：从 source handle 拉出一条曲线跟随 mouse，stroke `--text-2` dashed
6. **invalid (target type mismatch)**：stroke `--rose` 2px，end 显示 ✕ icon

每个状态画一个 600×260 子 frame，上下排列。

### Frame 10 — Mobile Stack Mode

390×844 phone frame（单独一个 frame，居中显示）：

- Status bar 占位 h 47
- App top bar h 56：
  - left padding 16: "← 返回" 14px/500 `--text-1`
  - center: "未命名项目" 14px/600 `--text-1`
  - right padding 16: "⋯" 20px `--text-1`
- Tab bar h 44：
  - 居中 segment control 250×34 `--r-chip` bg `--chip` padding 2，两个选项 "列表" (active) / "画布"
  - active: bg `--text-1` text `--cta-text`
- Body (scroll)：
  - 节点 list，每个节点 h 88 m 12，`--r-card`，bg `--panel`，border `--hairline`，padding 14：
    - left icon plate 40×40 `--r-icon-plate` accent
    - center: type label 10px/uppercase + title 14px/600 + subtitle 12px `--text-2`
    - right: status dot 8px + chevron right 16px `--text-2`
  - 节点：Composer / Agent / Image 角色1 / Image 角色2 / Video 镜头1（共 5 个）
- 底部 sheet handle：56px 横线
- Bottom sheet 收起态 h 48：
  - 左右 padding 16，flex：左侧"💬 询问 Agent" 14px `--text-2` + 右侧 send btn 32×32 `--cta-bg`
- Bottom nav h 64：5 个 tab icon（画廊/工作/卡片/通知/我）

### Frame 11 — Mobile Bottom Sheet Expanded

390×844 phone frame：

- 上半部分（被 sheet 半遮）：之前的 list view 半透明 + dimmer
- Sheet 展开 h 600 bottom 0 bg `--panel` `--r-card` 顶部圆角
- Sheet 内容：
  - handle 36×4 `--text-3` center top 8
  - tabs (h 44 m 12)：segment "Assistant" / "Inspector" 同 desktop dock
  - content area：Assistant greeting 或 Inspector form
  - 底部 composer（同 desktop dock composer）

### Frame 12 — Connection Topology（连接拓扑总览）

1440×900，画 9 种节点之间的合法连接关系。

布局：节点圆形 chip + 连线箭头 + 通道名标签。每个节点圆 72×72，bg accent-fill，内部 icon + 类型名 12px/600。

**连线规则**（每条 1.5px stroke + 箭头 + 通道 chip 标在中点）：

- composer → agent（通道："prompt"）
- agent → shot（拆解输出，通道："镜头" 可多条）
- agent → characterImage（"角色"，可多条）
- agent → backgroundImage（"场景"，可多条）
- shot ← characterImage（"角色定妆"）
- shot ← backgroundImage（"场景图"）
- shot ← shotText（"台词/旁白脚本"）
- shot ← frameImage（"关键帧"，可多条）
- shot ← voice（"配音"）
- shot → seedance（"成片输入"）
- frameImage → seedance（直连，跳过 shot 的快速通道）
- voice → seedance（直连音轨）

布局建议：composer 最左 → agent → 中部 shot 作汇点 → 右侧 seedance 终点。characterImage / backgroundImage / shotText / frameImage / voice 横排在 shot 上下作输入。

下方图例区（h 200）：列出"端口规则"（哪些节点是 source-only / target-only / 双向 hub）。

### Frame 13 — Hub Anatomy（shot + seedance 详解）

1440×900，左右各画一个 hub 节点的放大解剖图（每个 580×420 放大版）。

**Shot Hub Anatomy（左 80, 100, 580×420）**：

- 整体 420×300 真实尺寸的 1.4x 放大
- 内部 4 个 slot 区，每个 80×56：
  - row 1: character slot（左）+ background slot（右）
  - row 2: frameImage slot（左）+ voice slot（右）
- 每个 slot 空时虚线边框 + 类型 icon + "未连"，已连时显示上游节点的 64×40 缩略图 + 节点名 truncate
- header 区 16px：type chip "🎬 Shot" + 镜头编号 chip "Shot 02" + 时长 chip "8s"
- footer 区：成片状态 chip + "生成镜头" 主按钮
- 右侧标注线 5 条：title chip / slots grid / 单 slot empty / 单 slot filled / footer

**Seedance Hub Anatomy（右 760, 100, 580×420）**：

- 同样放大 + 标注 5 条
- 内部 inputs：frameImage chain（最多 3 个关键帧序号 1/2/3 + 时长 timeline 条）+ voice 单 slot
- 中央大预览区 380×214 16:9，empty 时显示渐变占位 + "等待生成"
- footer 主按钮"渲染视频" + 模型 chip "Seedance Pro / 1080p"

### Frame 14 — Agent Distribute（Agent 拆解后的分发动画）

1440×900，左右对比画两个画布状态。

**左半（before, 80, 80, 600×740）**：

- 标题 "拆解前" 14px/600 `--text-1`
- 仅显示 Composer + Agent（state=done 但下游还没节点）
- agent 节点内部增加一个 chip "✨ 展开为节点 →"（主按钮 hover 高亮）

**右半（after, 760, 80, 600×740）**：

- 标题 "拆解后" 14px/600 `--text-1`
- Agent 自动生成 5-8 个下游节点：3 个 characterImage（每个上游标 "Char A/B/C"）+ 2 个 backgroundImage + 2 个 shotText + 1 个 shot（hub）
- 节点之间用 animated 虚线已连
- 整体自动 staircase 布局：从 agent 出发分流

中间一条向右大箭头 → + 注释文字 11px/500 `--text-2` "点击按钮一键生成下游节点 + 自动布局"

底部图例（h 100）：标注 "自动连线策略 / 自动布局算法（grid layered） / 用户可选性接受（每个新节点上方有 ✓/✕）"。

### Frame 15 — Inspector Variants（9 种节点的右侧 Inspector）

1440×1200（**比 900 高，要展示 9 种表单**），9 列 × 1 行的 inspector 形态展示（每个 dock 336×1100 缩小到合适尺寸）。

每个 inspector 顶部都包含：selected node card（type chip + status dot + title） + section list。各节点 section 内容不同：

| 节点            | Inspector sections                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| composer        | Prompt / Mode (Agent/Chat/Generate) / Skills enabled                                                                        |
| agent           | Prompt (from upstream composer) / Planner Model / Breakdown (counters) / Output history                                     |
| shot            | Cam motion / Start state / End state / Duration / 子节点列表（character/background/frames/voice 各自缩略图 + replace 按钮） |
| shotText        | 文本编辑 textarea / 字数 / 段落 / 关联角色                                                                                  |
| characterImage  | Name / Role / Visual seed / Personality / Goal / LoRA picker / Reference image slot                                         |
| backgroundImage | Location / Time / Mood / Lighting / Visual seed / Style reference                                                           |
| frameImage      | 角色 picker / 场景 picker / 帧序号 (radio: start/middle/end) / Visual seed / Negative prompt                                |
| voice           | Voice card picker / TTS model / Pitch / Speed / Preview button / 关联台词 link                                              |
| seedance        | Resolution / Duration / Motion strength / Audio sync / Cover frame picker                                                   |

每个 inspector 底部都有 composer（同 Assistant dock composer）但 placeholder 改成"对这个节点提问、要求修改…"。

### Frame 16 — Model Picker States（模型选择器多种状态）

1440×900，画 7 种节点类型对应的模型选择器 dialog 展开状态。

每个 dialog 480×560，3 列 × 3 行排版（最后只 1 个）：

| 节点类型                                      | 模型候选                                            |
| --------------------------------------------- | --------------------------------------------------- |
| agent / composer / shotText                   | Gemini 3 Pro / GPT-5.2 / Claude 4.6 / Auto          |
| characterImage / backgroundImage / frameImage | FLUX 1.1 Pro / Nano Banana / SDXL / Imagen 4 / Auto |
| voice                                         | Fish Audio v1.5 / ElevenLabs v3 / OpenAI TTS / Auto |
| seedance                                      | Seedance Pro / Hailuo 02 / Kling 2.0 / Auto         |

每个 dialog 内部：

- header h 56：标题 "选择模型" 14px/600 + 关闭 X
- search input h 36
- 模型 list：每行 h 56 padding 12，左侧 logo 24×24 + 中间名字 + 描述 12px `--text-2`，右侧 cost chip "1 credit" + 选中态 ✓
- footer h 48：confirm 按钮 + cancel 链接

### Frame 17 — Default Copy Matrix（默认文案矩阵）

1440×1400（高），表格形式列出 9 种节点的默认文案：

表头：节点类型 / Type chip / Draft title / Empty body / 3 chips / Footer label / Placeholder when typing

每行一个节点类型，所有 cell 都是真实中文文案，可以直接抄到 i18n 文件。

例（characterImage 行）：

- Type chip: "👤 角色"
- Draft title: "未命名角色"
- Empty body: "Agent 完成剧本拆解后会生成角色定妆，可接 LoRA 风格化。"
- chips: "角色定妆 / LoRA 风格 / 参考图"
- Footer: "IMAGE · 16:9 · 等待 Agent"
- Placeholder: "描述这个角色的外貌、性格、参考风格…"

这个 frame 是给 i18n 翻译 + codex 落代码时直接 copy-paste 用的，**必须每个 cell 都是最终文案，不要 lorem ipsum**。

---

## Section E — 状态机标注（在 Frame 05/06/07 边上的图例）

### E.1 Node Status

```
draft     ●  --slate          缺少 prompt，未连下游
ready     ●  --emerald        prompt OK，可发送
running   ●  --amber pulse    生成中
done      ●  --emerald        有产物
failed    ●  --rose           生成失败
stale     ●  --amber          上游变了
disabled  ●  --text-3         缺 API Key / 无权限
```

### E.2 Tool Mode (Bottom Dock)

```
pointer    active by default,    选择节点 + 框选
hand       drag canvas,          panOnDrag = true
connect    cursor 变 + 状态,     点击 source/target handle 拉线
cut        cursor 变 ✂,         点击节点删除
```

### E.3 Chip Dropdown Items（Composer 内）

**Agent 模式 ▾** 下拉：

- Agent (default) — "调用 Agent 拆解剧本"
- Chat — "直接对话"
- Generate — "调用图片/视频/音频生成"

**询问 ▾** 下拉：

- 询问 (default) — "Agent 回答问题"
- 计划 — "Agent 制定步骤"
- 执行 — "Agent 自动操作画布"

---

## Section F — Figma 命名 + 组织

- 每个 Frame 顶层命名按 spec：`02 Empty Canvas` / `03 Generated Workflow` / `04 Assistant Dock States` / `05 Node Anatomy` / `06 Node State Matrix` / `07 Composer State Matrix` / `08 Dock & Topbar Detail` / `09 Edge States` / `10 Mobile Stack` / `11 Mobile Bottom Sheet`
- 子元素命名按功能：`Project pill` / `Add node button` / `Composer node` / `Agent node` / `Image node` / `Edge composer-to-agent` 等等
- 把可复用组件提升为 Figma Components（按 Cmd+Opt+K）：Composer node、Agent node、Placeholder node (image/video/audio/text 各一个 variant)、Project pill、Top action group、Credits pill、Route pill、Assistant dock、Bottom dock、Minimap、Sidebar、Add menu
- 同一个组件的不同状态用 Variants：例如 Composer node 有 `state=empty / typing / typing-no-target / sending / chip-open / attach-filled`，Agent node 有 `state=empty / loading / done / failed / stale / disabled`
- Hover / active / focused 状态用 Variants 而不是 prototyping 交互（spec 是要看清所有状态，不是 demo 交互）
- 颜色全部建立成 Figma Local Variables（Color collection），命名 `surface/panel`, `surface/chip`, `text/1`, `text/2`, `accent/amber` 等等，Section A 给的就是命名空间
- 数字 token（圆角、字号）也建 Number variables：`radius/card = 22`, `text/sm = 12` 等等

## Section G — 验收清单（codex 完成后自检）

- [ ] Frame 03-17 全部在 node-design 文件的当前 page 创建（Frame 02 不动）
- [ ] 所有 frame 顶层命名严格按 Section F 列出的名字
- [ ] 所有颜色使用 Figma Color Variables，零 hardcoded fills
- [ ] Frame 04 含 3 个 dock 并排（empty / inspector / collapsed）
- [ ] Frame 06 含 **9 × 7 = 63** 状态卡（不是 7，9 种节点 × 7 种 state）
- [ ] Frame 07 含 6 种 composer state
- [ ] Frame 08 含 9×4 = 36 个 dock button 状态展示
- [ ] Frame 09 含 6 种 edge state
- [ ] Frame 10 + 11 是 mobile (390×844)，其他都是 1440×900 或 1440×1200/1400（Frame 06/15/17 高度可大于 900）
- [ ] Frame 12 列出 9 种节点的合法连接 + 通道标签
- [ ] Frame 13 含 shot + seedance 两个 hub 的放大解剖图
- [ ] Frame 14 含 before/after 对比的 Agent 分发动画
- [ ] Frame 15 含 9 种节点对应的 Inspector 表单
- [ ] Frame 16 含 4 套模型候选（planner / image / voice / video）的 dialog 展开
- [ ] Frame 17 是表格形式，所有 cell 都是真实中文最终文案（不留 lorem）
- [ ] Composer node / Agent node / Placeholder node 提升为 Components 且包含全部 Variants
- [ ] 阴影统一 drop-shadow `0/20/60` rgba(0,0,0,0.5)
- [ ] 所有 emoji 是文本字符（🤖 / 💬 等），不是 SVG 或图片
- [ ] 节点之间连线用 Vector + 1.5px stroke + dashed 5,5（animated 在静态稿里画成虚线表示即可）
- [ ] Frame 完成后用 `figma.viewport.scrollAndZoomIntoView(createdFrames)` 把视图自动聚焦到新建 frame

## Section H — 执行建议

按以下顺序逐个 frame 创建，不要一次性创建全部：

1. Frame 03 — Generated Workflow（最复杂、最能验证节点系统）
2. **停下让用户审**：把新 frame 的 node-id 报告出来
3. Frame 04 — Assistant Dock States
4. Frame 05 — Node Anatomy
5. Frame 06 — Node State Matrix
6. Frame 07 — Composer State Matrix
7. Frame 08 — Dock & Topbar Detail
8. Frame 09 — Edge States
9. Frame 10 — Mobile Stack
10. Frame 11 — Mobile Bottom Sheet

每个 frame 完成后报告：frame name / node-id / 元素数量 / 是否有警告（缺字体、缺 variable 等）。

如果中间某个 frame 报错，停下来，不要继续后面的 frame。
