# Codex 指令：生成 PixelVault Node Studio Figma Plugin

## 目标

读取 `docs/plans/frontend/studio-node-design-codex-spec.md`（设计规格），输出一套 Figma Plugin，用户在 Figma desktop app 里 import 后运行，自动在当前文件的当前 page 里创建所有 frame（02 Empty Canvas 到 11 Mobile Bottom Sheet）。

## 输出文件结构

```
docs/plans/frontend/figma-plugin/
├── manifest.json
├── code.js              ← 主逻辑，纯 JavaScript（不要 TypeScript，省编译）
├── ui.html              ← 简单 UI（一个按钮 + log 区域）
└── README.md            ← 用户怎么用（import + run）
```

不要写 `tsconfig.json` / `package.json` / `node_modules`。Figma Plugin API 全局可用，无需 import。

## manifest.json 规格

```json
{
  "name": "PixelVault Node Studio Generator",
  "id": "pixelvault-node-studio-generator",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
```

## ui.html 规格

简单 UI 即可：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        font-family: ui-sans-serif, system-ui;
        padding: 16px;
        margin: 0;
        background: #1e1e1e;
        color: #fff;
      }
      h2 {
        font-size: 14px;
        margin: 0 0 8px;
      }
      p {
        font-size: 12px;
        color: #aaa;
        margin: 0 0 12px;
        line-height: 1.5;
      }
      button {
        width: 100%;
        height: 36px;
        border: 0;
        border-radius: 6px;
        background: #18a0fb;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover {
        background: #0d8de3;
      }
      button:disabled {
        background: #444;
        cursor: not-allowed;
      }
      #log {
        margin-top: 12px;
        font-family: ui-monospace, monospace;
        font-size: 11px;
        color: #888;
        max-height: 240px;
        overflow-y: auto;
        white-space: pre;
      }
      .row {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }
      label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #ddd;
      }
    </style>
  </head>
  <body>
    <h2>PixelVault Node Studio Generator</h2>
    <p>
      在当前 Figma 文件的当前 page 里创建 10 个设计 frame。已存在的 frame
      不会覆盖（按名字判断）。
    </p>
    <div class="row">
      <label><input type="checkbox" id="overwrite" /> 覆盖已存在的 frame</label>
    </div>
    <button id="run">生成全部 frame</button>
    <div id="log"></div>
    <script>
      const log = document.getElementById('log')
      const btn = document.getElementById('run')
      btn.onclick = () => {
        btn.disabled = true
        const overwrite = document.getElementById('overwrite').checked
        parent.postMessage({ pluginMessage: { type: 'run', overwrite } }, '*')
      }
      window.onmessage = (event) => {
        const msg = event.data.pluginMessage
        if (!msg) return
        if (msg.type === 'log') log.textContent += msg.text + '\n'
        if (msg.type === 'done') {
          btn.disabled = false
          log.textContent += '\n✅ 完成\n'
        }
        if (msg.type === 'error') {
          btn.disabled = false
          log.textContent += '\n❌ ' + msg.text + '\n'
        }
      }
    </script>
  </body>
</html>
```

## code.js 规格（核心实现）

### 入口

```js
figma.showUI(__html__, { width: 360, height: 480 })

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'run') {
    try {
      await runGenerator(msg.overwrite === true)
      figma.ui.postMessage({ type: 'done' })
    } catch (e) {
      figma.ui.postMessage({
        type: 'error',
        text: String((e && e.message) || e),
      })
    }
  }
}

function log(text) {
  figma.ui.postMessage({ type: 'log', text })
}
```

### 字体预加载（必须先加载所有用到的字体）

```js
const FONTS = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Inter', style: 'Medium' },
  { family: 'Inter', style: 'Semi Bold' },
  { family: 'Inter', style: 'Bold' },
]

async function loadFonts() {
  for (const f of FONTS) {
    await figma.loadFontAsync(f)
  }
}
```

不要用其他字体（PingFang/Noto 等）— Figma plugin 在本地字体不可用时会失败。

### 颜色转换 helper

所有 hex（spec Section A）转 Figma RGB 0-1：

```js
function hex(h, a = 1) {
  const m = h.replace('#', '')
  return {
    r: parseInt(m.slice(0, 2), 16) / 255,
    g: parseInt(m.slice(2, 4), 16) / 255,
    b: parseInt(m.slice(4, 6), 16) / 255,
    a,
  }
}

function fill(color, opacity = 1) {
  return [
    { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity },
  ]
}

function stroke(color, opacity = 1) {
  return [
    { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity },
  ]
}
```

### Token 常量（从 spec Section A 抄进来）

```js
const TOKEN = {
  canvasBg: hex('#0b0b0a'),
  railBg: hex('#030303'),
  panel: hex('#181716'),
  panelInset: hex('#1f1d1b'),
  chip: hex('#22211f'),
  chipHover: hex('#2d2b28'),
  preview: hex('#2d2b28'),
  hairline: { ...hex('#f4f1ea'), a: 0.08 },
  hairline2: { ...hex('#f4f1ea'), a: 0.15 },
  hairline3: { ...hex('#f4f1ea'), a: 0.25 },
  text1: hex('#f4f1ea'),
  text2: hex('#a6a098'),
  text3: hex('#6f6a63'),
  textOnLight: hex('#0d0c0b'),
  amber: hex('#f59e0b'),
  emerald: hex('#22c55e'),
  rose: hex('#e11d48'),
  slate: hex('#94a3b8'),
  violet: hex('#a78bfa'),
  ctaBg: hex('#f4f1ea'),
  ctaBgHover: hex('#ffffff'),
}

const R = {
  card: 22,
  pill: 23,
  chip: 999,
  inner: 16,
  dockItem: 12,
  iconPlate: 10,
}
```

### 创建 helper（必须实现这些可复用函数）

```js
function makeFrame({
  name,
  x,
  y,
  w,
  h,
  fillColor,
  radius,
  strokeColor,
  strokeWidth = 1,
  parent,
}) {
  const f = figma.createFrame()
  f.name = name
  f.x = x
  f.y = y
  f.resize(w, h)
  if (fillColor) f.fills = fill(fillColor)
  else f.fills = []
  if (radius) f.cornerRadius = radius
  if (strokeColor) {
    f.strokes = stroke(
      strokeColor.a !== undefined ? strokeColor : { ...strokeColor, a: 1 },
    )
    f.strokeWeight = strokeWidth
    if (strokeColor.a !== undefined) f.strokes[0].opacity = strokeColor.a
  }
  f.clipsContent = true
  if (parent) parent.appendChild(f)
  return f
}

async function makeText({
  x,
  y,
  w,
  h,
  characters,
  fontSize,
  fontFamily = 'Inter',
  fontStyle = 'Regular',
  color,
  opacity = 1,
  align = 'LEFT',
  parent,
  lineHeight,
  letterSpacing,
}) {
  await figma.loadFontAsync({ family: fontFamily, style: fontStyle })
  const t = figma.createText()
  t.fontName = { family: fontFamily, style: fontStyle }
  t.characters = characters
  t.fontSize = fontSize
  t.fills = fill(color, opacity)
  t.x = x
  t.y = y
  if (w) {
    t.resize(w, h || t.height)
    t.textAutoResize = 'HEIGHT'
  }
  if (align === 'CENTER') t.textAlignHorizontal = 'CENTER'
  if (align === 'RIGHT') t.textAlignHorizontal = 'RIGHT'
  if (lineHeight) t.lineHeight = { value: lineHeight, unit: 'PIXELS' }
  if (letterSpacing) t.letterSpacing = { value: letterSpacing, unit: 'PIXELS' }
  if (parent) parent.appendChild(t)
  return t
}

function makePill({ name, x, y, w, h, parent }) {
  return makeFrame({
    name,
    x,
    y,
    w,
    h,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  })
}

function shadow() {
  return {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.5 },
    offset: { x: 0, y: 20 },
    radius: 60,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL',
  }
}
```

### Frame 创建顺序（按 spec Section H）

每个 frame 一个函数。函数签名：`async function createFrame02(parent, baseX, baseY)`。

`parent` 是当前 page。`baseX/baseY` 决定 frame 在 page 上的位置（每个 frame 之间 y 间距 60，所以下一个 frame baseY = 上一个 baseY + 900 + 60）。

### 主流程

```js
async function runGenerator(overwrite) {
  await loadFonts();
  log('字体加载完成');

  const page = figma.currentPage;

  // 删除已存在的同名 frame（如果 overwrite）
  const targetNames = ['02 Empty Canvas', '03 Generated Workflow', '04 Assistant Dock States', ...];
  if (overwrite) {
    for (const n of targetNames) {
      const existing = page.children.find(c => c.name === n);
      if (existing) existing.remove();
    }
  }

  // 找一个空白位置开始放 frame
  let y = 0;
  // 跑过的 frame 名集合，避免重复
  const existing = new Set(page.children.map(c => c.name));

  const tasks = [
    { name: '02 Empty Canvas',           fn: createFrame02, h: 900 },
    { name: '03 Generated Workflow',     fn: createFrame03, h: 900 },
    { name: '04 Assistant Dock States',  fn: createFrame04, h: 900 },
    { name: '05 Node Anatomy',           fn: createFrame05, h: 900 },
    { name: '06 Node State Matrix',      fn: createFrame06, h: 900 },
    { name: '07 Composer State Matrix',  fn: createFrame07, h: 900 },
    { name: '08 Dock & Topbar Detail',   fn: createFrame08, h: 900 },
    { name: '09 Edge States',            fn: createFrame09, h: 900 },
    { name: '10 Mobile Stack',           fn: createFrame10, h: 844 },
    { name: '11 Mobile Bottom Sheet',    fn: createFrame11, h: 844 },
  ];

  for (const t of tasks) {
    if (existing.has(t.name) && !overwrite) {
      log('跳过已存在: ' + t.name);
      y += t.h + 60;
      continue;
    }
    log('生成中: ' + t.name);
    await t.fn(page, 0, y);
    y += t.h + 60;
  }

  // 把视图聚焦到刚生成的所有 frame
  const created = page.children.filter(c => targetNames.includes(c.name));
  if (created.length) figma.viewport.scrollAndZoomIntoView(created);
}
```

### 每个 frame 的实现细节

按 spec Section D 实现，注意：

#### Frame 02 — Empty Canvas

```js
async function createFrame02(parent, baseX, baseY) {
  // Artboard 1440×900
  const art = makeFrame({
    name: '02 Empty Canvas',
    x: baseX,
    y: baseY,
    w: 1440,
    h: 900,
    fillColor: TOKEN.canvasBg,
    radius: R.card,
    parent,
  })
  art.effects = [shadow()]

  // 左侧 Sidebar 226 宽
  await createSidebar(art, 0, 0) // helper

  // 顶栏
  await createTopBar(art, 247, 21, {
    projectName: '未命名项目',
    eyebrow: '节点工作流',
    nodeCount: '2 个节点',
  })

  // Composer 节点 (canvas local 220, 400 → artboard x: 220+226=446, y: 400)
  await createComposerNode(art, 446, 400, {
    placeholder: '输入你的创意或请求，可添加上游连线以引入参考素材',
    sendDisabled: true,
  })

  // Agent 节点 (320+226=546, 110)
  await createAgentNode(art, 546, 110, { state: 'empty' })

  // 连线：从 composer top-center 到 agent bottom-center（用 VECTOR 节点画曲线）
  await createEdge(
    art,
    { x: 446 + 280, y: 400 }, // composer top middle
    { x: 546 + 180, y: 110 + 240 }, // agent bottom middle
    { animated: true, color: TOKEN.hairline3 },
  )

  // Assistant dock (right 20)
  await createAssistantDock(art, 1440 - 20 - 336, 20, { state: 'empty' })

  // Bottom dock (centered bottom 20)
  await createBottomDock(art, (1440 - 332) / 2, 900 - 20 - 50, {
    activeMode: 'pointer',
    zoomPercent: 100,
  })

  // Minimap (bottom-left)
  await createMinimap(art, 20, 900 - 20 - 132)
}
```

每个 helper（createSidebar / createTopBar / createComposerNode / createAgentNode / createAssistantDock / createBottomDock / createMinimap / createEdge）按 spec Section B 和 C 实现：

#### `createSidebar(parent, x, y)`

- 226×900 frame，bg `TOKEN.railBg`
- 品牌 "PixelVault" text 28/Bold/text1 at (15, 23)
- main nav 4 项: 画廊 / 提示词 / 素材 / 卡片管理（每项 y 间距 34，icon at (17, y) text at (41, y) 13/Medium/text1）
- divider + label "工具" 11/SemiBold/text3 at (15, 303)
- tool nav 8 项（含 active "节点编辑" with bg）
- credits card at (9, 723) 206×54
- language switch at (9, 811) 206×50

#### `createTopBar(parent, x, y, props)`

- 项目药丸 260×56 at (x, y)：spec B.1
- action group at (x+484, y)：含 3 个按钮 96+92+94=282 width
- credits pill at (x+858, y)
- route pill at (x+950, y)

注意计算 x 坐标，确保不超出 1440 宽 - assistant dock 336 - margin。

#### `createComposerNode(parent, x, y, props)`

按 spec C.1：

- 560×180 frame at (x, y)，bg panel，radius 22，stroke hairline，shadow
- attach slot 48×48 at (x+12, y+12)
- expand button 18×18 at (x+530, y+14)
- textarea 区域：placeholder text at (x+78, y+48) width 396 height 96
- chip bar at (x+12, y+140)：
  - chip "⌗ Agent 模式 ▾"：102×28
  - chip "💬 询问 ▾"：82×28 at gap 8
  - chip "✨ 技能库"：78×28
- send button 36×36 at (x+512, y+128)
- handle 圆点 left/right

#### `createAgentNode(parent, x, y, props)`

按 spec C.2：state 决定 body 内容。

- 360×240 outer，bg panel
- inner card 340×222 inset 9，bg preview
- type chip "🤖 Agent" 74×24 at (x+19, y+19)
- body 根据 state：empty 显示 🤖 emoji + 标题 + 描述

#### `createEdge(parent, from, to, opts)`

用 `figma.createVector()`：

```js
const v = figma.createVector()
const dx = to.x - from.x
// 曲线 path
const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
v.vectorPaths = [
  {
    windingRule: 'NONE',
    data: `M ${from.x} ${from.y} C ${from.x} ${mid.y}, ${to.x} ${mid.y}, ${to.x} ${to.y}`,
  },
]
v.strokes = stroke(opts.color)
v.strokeWeight = 1.5
if (opts.animated) v.dashPattern = [5, 5]
parent.appendChild(v)
```

Vector path 在 absolute 坐标。注意 from/to 是 frame 内部相对坐标。

#### Frame 03 — Generated Workflow

按 spec Section D Frame 03，节点：composer / agent (state done with breakdown) / image×2 / video×2 / audio×1。每个节点需要画 6 条 edge 连接。

agent state done 时显示 5 个 counter 卡片 + planner footer。counter 卡用 `makeFrame` 36×36 with icon 12 居中 + 数字 11 居中。

#### Frame 04 — Assistant Dock 三态

并排画 3 个 dock 336×860 + 标注。

#### Frame 05/06/07/08/09 — Component/State matrix

按 spec Section D 各自规格。重点是组件 + 标注线（用 VECTOR 节点画细线 + 文字标注）。

#### Frame 10/11 — Mobile

artboard 390×844（注意尺寸不同于 1440×900）。

### 节流 + 进度日志

每完成一个 frame 调 `log('完成 ' + name)`。每个 frame 内部如果元素 > 50 个，每创建 10 个调一次 `await new Promise(r => setTimeout(r, 0))` 让 UI 不卡死。

实际上 Figma plugin 是同步执行，但 `await figma.loadFontAsync` 已经是异步点。每个 frame 之间自然有 await 缓冲。

## README.md 内容

```markdown
# PixelVault Node Studio Plugin

## 安装

1. 下载 Figma Desktop App: https://www.figma.com/downloads/（必须 desktop，Web 版不支持 plugin development）
2. 打开你的 node-design 文件 (https://www.figma.com/design/5mKh7zmE1tcjLo9BvO30n9/node-design)
3. 菜单：Plugins → Development → Import plugin from manifest...
4. 选择本文件夹里的 `manifest.json`
5. 完成。

## 使用

1. 在 Figma 里打开你想生成 frame 的 page
2. 菜单：Plugins → Development → PixelVault Node Studio Generator
3. 弹出 UI，点击 "生成全部 frame"
4. 等 30 秒左右
5. 完成后所有 10 个 frame 排成一列，自动 zoom 到视图中

## 重新运行

如果想重生成，勾选 "覆盖已存在的 frame" 再点按钮。

## 调试

如果 plugin 报错，菜单：Plugins → Development → Open Console，看 console 输出。
```

## 实施约束（codex 必须遵守）

1. **不要 npm install / package.json / tsconfig.json**：纯 JS plugin，零依赖
2. **不要导入任何外部库**：Figma plugin sandbox 没有 npm modules
3. **不要用 console.log**：用 `figma.ui.postMessage` 发到 UI 显示
4. **不要假设字体存在**：只用 `Inter` 字体的 Regular/Medium/Semi Bold/Bold 四个 style
5. **emoji 用 unicode 字符**：直接写在 `characters` 字符串里（🤖 / ⌗ / 💬 / ✨ 等）。Figma 会用系统 emoji 渲染
6. **所有 hex 用 `hex()` helper 转换**，不要硬编码 RGB
7. **大段重复的元素用循环创建**：比如 Frame 08 的 9×4=36 个 dock button，写一个数组遍历
8. **避免一次性创建 > 1000 个节点**：如果 frame 内元素很多，分块创建并 log 进度
9. **每个 createFrameXX 函数独立**：可以单独 debug 某个 frame
10. **错误用 throw new Error('描述')**：UI 会捕获并显示

## 验收

codex 完成后用户执行：

1. `ls docs/plans/frontend/figma-plugin/` 应看到 4 个文件（manifest / code.js / ui.html / README）
2. `wc -l docs/plans/frontend/figma-plugin/code.js` 应该 1500-3000 行
3. 在 Figma desktop import 后能看到 plugin 名字
4. 点击运行 30 秒内完成，无报错
5. 10 个 frame 都生成
6. 每个 frame 内的节点位置、颜色、文字与 spec 对齐
7. 字体加载没报错（如果 Inter 不可用，提示用户安装 Inter 字体）

## 分批策略（codex 不要一次写完）

按以下顺序逐步实现，每完成一步停下来等用户确认：

1. **第 1 批**：manifest.json + ui.html + code.js 骨架（含所有 helper：hex/fill/stroke/makeFrame/makeText/makePill/shadow/loadFonts/log/runGenerator 主流程，但只实现 `createFrame02` 一个 frame，其他 createFrameXX 函数 throw 'not implemented'）
2. **第 2 批**：实现 createSidebar / createTopBar / createComposerNode / createAgentNode / createBottomDock / createMinimap / createAssistantDock (state empty only) / createEdge
3. **第 3 批**：实现 createFrame03（generated workflow，最复杂的）
4. **第 4 批**：createFrame04（assistant 三态）
5. **第 5 批**：createFrame05 + 06（anatomy + state matrix）
6. **第 6 批**：createFrame07 + 08（composer state + dock detail）
7. **第 7 批**：createFrame09 + 10 + 11（edges + mobile）

每批写完，用户在 Figma 里跑 plugin 验证。如果 Frame 02 第一次跑就 OK，说明色调和 helper 都对了，后续 frame 复用同样的 helper 风险低。

## 给 codex 的执行命令模板

```bash
# 第 1 批
codex exec "读 docs/plans/frontend/codex-figma-plugin-prompt.md 和 docs/plans/frontend/studio-node-design-codex-spec.md。按 prompt 的'分批策略'第 1 批，生成 docs/plans/frontend/figma-plugin/ 里的 manifest.json + ui.html + code.js（骨架 + helper + createFrame02）。生成完后 print code.js 行数和文件清单。"
```

完成第 1 批后用户在 Figma 跑 plugin，把效果反馈给 Claude，然后跑第 2 批：

```bash
codex exec "在 docs/plans/frontend/figma-plugin/code.js 基础上，实现 prompt 第 2 批：所有 helper 函数（createSidebar / createTopBar / createComposerNode / createAgentNode / createBottomDock / createMinimap / createAssistantDock empty 态 / createEdge）。code.js 行数应到 ~800。"
```

以此类推。
