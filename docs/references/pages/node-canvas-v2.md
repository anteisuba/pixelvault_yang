# 节点画布 · 现行基准（node-canvas-v2.md）

> 状态：**画布 v4 的唯一基准**。四类节点 / 具名槽 / 展开态 / 动作出口 / 助手 op / 存储都以本文为准，实现事实源见文末 Source of Truth。
> 与 [`assistant-shell.md`](assistant-shell.md) 的分工：面板 ↔ 画布的联动契约写在那边 §17，本文不重复。
> 视觉：脊柱与配方以 [`../ui-defaults.md`](../ui-defaults.md) 为准（画布节点卡的圆角例外在 §3.1、弹簧三档在 §4.1），本文只写画布特有的结构与行为。

---

## 0. 定位 · 范围 / 非目标

**定位**：以镜头为一等单元、助手能读能改能撤销的制片台——节点分四类且各带子型，端口按具名槽，名字稳定可 `@` 寻址，助手的每一次改动在画布上可见可回滚。

**范围**：节点分类法与数据模型 · 两态渲染 · 具名槽与连线矩阵 · 添加菜单词表 · 动作出口与撤销 · 拖入落槽 · 剧本投影 · 助手 op 与提案卡 · 生成回填 · 存储与升级。

**非目标**：多人协作；素材库、项目记忆层、视频看片分析三条服务的接入——本文只在槽与 op 上给它们留接口，不设计它们。

## 0.1 域定义

Canvas 是 PixelVault 的北极星能力之一（与 LoRA 并列双核，见 [`../product.md`](../product.md)），定位是**长视频导演台**：把「剧本 → 分镜 → 逐镜生成 → 拼接」的可控流程放在一张无限画布上编排。三条核心承诺：

- **可控编排** — 不是「一句 prompt 出一个结果」，而是把创作拆成可见、可复用、可追溯的节点与关系。
- **一致性** — 角色、声音、场景、镜头规格靠身份单元 + 参考约束跨镜头保持稳定，不靠单一 prompt。
- **跨能力汇聚** — 图片、声音、参考视频、剧本文本作为素材汇入视频生成；画布负责它们如何被组织、绑定、送进生成请求。

具体责任：在无限画布上创建/排布/连接/编辑节点并维持视口与选择；承载导演工作流（剧本 → 镜头 → 镜头图 → 视频镜头 → 合并长片）；组织跨模态素材的汇聚与绑定；维持资产复用（一个身份跨多镜复用）；把图结构编译为真实生成请求（按具名槽收割上游 → 装配 payload → 容量校验）；承载画布助手；画布项目的创建/切换/命名/保存与刷新恢复（与 Assets 的 Project 归类文件夹是两回事）；保存产出谱系（lineage）使其可追溯并进入 Assets。

### 与相邻域的分工

| 相邻域       | 边界                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Studio Image | 通用/单次图片生成与专业图片编辑归 Studio；画布消费图片作为镜头素材，不复制完整图片工作台。                     |
| Studio Video | 轻量短片快速入口归 Studio；画布承接长视频/系列镜头/角色一致性/分镜/参考约束/片段合并。两边不合成一套拥挤表单。 |
| Studio Audio | 主力音频生成（TTS/试音/音效/音乐）归 Studio；画布只消费音频资产与音色身份作为视频成分。                        |
| LoRA         | LoRA 的发现/挂载/组合/训练归 LoRA 域；LoRA 可作生成输入，画布内不复制 LoRA 编排。                              |
| Assets       | 长期归档/整理/批量/复用归 Assets；画布产出资产但不复制资产管理器，素材复用走既有选择器入口。                   |
| Cards        | 角色/画风/声音/背景卡的持久身份管理归 Cards；画布消费卡片并可就地新建/编辑局部，长期管理页不搬进画布。         |
| Prompts      | 持久化的个人配方与版本复用归 Prompts；画布只负责本次编排中的装配状态，用户明确保存后才成为配方。               |
| 执行基础设施 | Runner / provider / 队列 / 回调负责真实执行；画布只暴露已接通的能力，**不用 UI 伪装未支持的参数**。            |

**深浅两档是产品级契约**：Studio = 轻量、单次、快速拿一个结果的入口；Canvas = 高级编排与连续制作。同一能力两处都在不是重复，是深浅两档——画布不吞并 Studio，也不降成通用白板。

### 不能破坏的业务事实

- **一致性单位不退化**：「名字 + 出场图组 + 音色」整体参照、一卡多镜复用、每镜可覆写，是画布相对 Studio 的核心价值，不能退化成散图堆。
- **合法性事实源唯一**：端口与容量以 `src/constants/node-slots.ts` 为准、判定以 `src/lib/node-connection-rules.ts` 为准；呈现层查表，不反向影响合法性。
- **产出可谱系化**：画布产出保留足够 lineage 且能进 Assets。
- **全局品质底线继承**：可访问性、键盘可达、焦点管理、状态真实性、reduced-motion、i18n 三语——见 `../../brand-dna.md`，画布不例外。

### 移动端

`/studio/node` 是**降级**档，配方见 `../ui-defaults.md §6`「降级 · 画布」与 §8「375」：卡宽跟随视口、展开仍是原地长高、卡内不限高改页面滚、卡头压两行、槽轨 4 格降 2 格、左侧竖排浮动玻璃工具栏 + 底部工具条 + composer 收起态一行、命中区抬到 44、右键菜单改整宽底部菜单。

---

## 1. 节点分类法

### 1.1 四类 + 子型

顶层四类 = `NODE_MEDIA_KIND_IDS`：`text / image / video / audio`。ReactFlow 的 `node.type` **就是 kind**（`NODE_V4_COMPONENTS`），子型住在 `data.subtype`。

**一条贯穿全文的判断：子型 = 节点的身份，槽 = 它在某条边里的用途，两者不合并。** 同一张关键帧既可以是 S02 的 `firstFrame`，也可以是 S03 的 `reference`——把「首帧」写成节点子型，复用就退化成复制。

| kind  | 子型         | 是什么                                                 | 可被生成          |
| ----- | ------------ | ------------------------------------------------------ | ----------------- |
| text  | `script`     | 剧本 / 叙事分段                                        | ✅                |
| text  | `shotNote`   | 单镜说明（带 `shotNo`）                                | ✅                |
| text  | `rule`       | 规则 / 风格说明 / 否定项                               | ✅                |
| image | `character`  | 角色设定图（可收参考 / 特写 / 音色 / 文本，自己出图）  | ✅                |
| image | `background` | 背景 / 场景设定                                        | ✅                |
| image | `shot`       | 镜头图 / 关键帧候选                                    | ✅                |
| image | `reference`  | 外来参考：网图、原片截帧、风格校准图（叶子源，无入口） | ❌（只上传/导入） |
| image | `result`     | 生成落点：还没被归类的散图                             | ✅                |
| audio | `voice`      | 角色配音 / 音色                                        | ✅                |
| audio | `ambience`   | 环境声                                                 | ✅                |
| video | `shot`       | **一个镜头**：一次视频生成的完整配置与产物             | ✅                |
| video | `clip`       | 参考片段（叶子源，无入口）                             | ❌                |
| video | `merge`      | 接片 / 合成成片（2..9 段）                             | ✅                |

**镜头不是容器节点**：一个镜头 = 一个 `video.shot` 节点 + 它左侧的五个具名入口。镜头带（shot lane）是**布局层按 `data.shotNo` 派生的分组**，不是节点、没有 `parentId`、不折叠。24 镜横排靠节点收起态 + 缩放解决信息密度，⛔ 不再造一层带级折叠状态。

### 1.2 槽内版本轮播

版本是**槽的属性，不是节点的身份**：同一张图可以是 S02 的首帧第 5 版、同时是 S03 的构图参考。所以容量恰为 1 的槽（`firstFrame` / `lastFrame` / `timbre` / 单值 `text`）绑定的不是「0..1 条边」，而是 `SlotBinding = { slot, versions[], cur }`；`versions[]` 的每一项带 `edgeId` / `sourceNodeId` / `blocked` / `blockedReason` / `addedAt`。`0..N` 的槽本来就是多值并列，不做轮播（`slotSupportsVersions` 的判据就是 `max === 1`）。

- **边是事实，binding 是指针**：`versionId` 由**边 id 派生**而不是随机生成——同一份 state 重算两次必须得到同一批 `versionId`。`reconcileStateSlots` 是幂等重算：从边表补齐 `versions`、剔掉指向已删边的版本、把 `cur` 修回合法值。迁移产物只写边的 `slot`，这条重算就是它们的读路径。
- **翻着看不改 `cur`**：左右角标翻版立刻预览，点「设为当前」才算改（翻页不该产生撤销条目）。
- **停用版打叉**：`blocked` 的版本压暗打叉，「设为当前」**禁用而不是隐藏**，槽内一行短标 + 轨下完整理由。拖线进槽被拒与已在槽里不许设为当前，是同一条规则的两个出口。
- **新连入自动成为新版并设当前**，旧版**不删边**。
- **只有当前版进生成载荷**：`assembleSlotPayload` 读 `cur`；`cur` 为空且该槽必填 → 生成前置校验失败，**不是静默用第一版**。停用版永不入列。

---

## 2. 两态渲染

### 2.1 收起态（默认）

缩略图 + 卡头 + 状态点。宽度走 `NODE_V4_CARD`：常规 320、`video.shot` 400（要显示五槽）。槽在**左缘竖列**排成 20px 小格，已连的格里显示上游缩略，空槽为虚线圈。

### 2.2 展开态（方向 A · 原地长高）

同一张卡 320 → **480 原地长高**，卡内纵向单列堆叠、卡内滚动、**邻居让位**、同一时刻**最多一个展开态**（`expandedNodeId` 是画布级唯一状态，⛔ 不新增第二份）。展开高上限 720，超出走卡内滚动；展开卡**不遮生成边脉冲、不遮助手新落的节点**。

卡内自上而下的顺序是固定的：**媒体 → 审核 → 槽轨 → 生成编排 → 图集 → 证据 → 关系带**。

- **卡头 44px 一行**：状态点 · 序号（等宽，只有镜头节点有，是**显示前缀不落库**）· 名字（就地改名）· kind 标 · 读数 · 展开钮（旋转 chevron）。层级靠字号字重字距，⛔ 不靠颜色区分名字与 kind 标。
- **媒体面**坐在沉底的井里；播放控件是贴在媒体面底部的一条玻璃胶囊，⛔ 不用原生 `controls`；抓首帧 / 抓尾帧 / 下载在媒体外。
- **槽轨**：展开态多出一条横轨（槽卡 100px + 8px 间隙 ⇒ 448 可用宽下一屏 4 格整齐、第 5 格露 24px，这段算术是 `NODE_V4_CARD` 三个数的由来），横向 snap；收起态左缘竖列不变。
- **生成编排区在卡内**：分区头（含模型名）→ 填充式提示词 → 模型 pop-up 行 → 五档参数的 inset 分组（互斥参数用分段控件、布尔用开关、连续量用滑杆）→ **槽校验文案贴在主按钮正上方**（琥珀 = 不阻塞，红 = 阻塞且主按钮 disabled 但保持可见）→ 整宽实心主按钮 + 无边框次动作 + 居中 credits 脚注。
- **折叠段统一成 disclosure**：图集是常驻分区（它是 `reference` 槽的另一种视图，藏起来会让人以为没连）；证据默认收起；**关系带（谁在用我）默认展开**——它是「删完才发现下游空了」的解药。

### 2.3 材质与动效

材质、圆角、留白、层级的完整配方在 `../ui-defaults.md §3.1`，动效在 §4.1。画布这边只钉三条边界：

- **`backdrop-filter` 只给浮层**（工具条 / 右键菜单 / 媒体 transport / composer / 移动端浮动条）；卡面用不透明卡色——画布上可能同时有上百张卡。
- **画布节点卡是全站唯一的圆角例外**：`--radius-node` + `corner-shape: squircle` 渐进增强，其他页面的卡片不跟着抬。
- **弹簧三档**（`spring-expand` / `spring-slot` / `spring-press`）只给节点卡；**邻居让位与卡宽同一条曲线同一个时长**，否则两件事读起来会脱节；**移除不用弹簧**；生成中的边脉冲**不随展开暂停或隐藏**。

### 2.4 文本节点

收起：首行作标题 + 字数。展开：预览 / 编辑走**分段控件**两态，`⌘E` 切换，正文坐在填充面上；底部一行五个派生动作。

---

## 3. 端口与连线

### 3.1 具名端口表

事实源是 `NODE_V4_PORTS`（`src/constants/node-slots.ts`），键是 `${kind}.${subtype}`。**`inputs` 数组的顺序就是槽自上而下的顺序**，也是排布时左侧那一摞源节点的顺序——两处不许各排各的。

| 节点                                               | 入口槽（左，自上而下）                                                                                                        | 出口（右）                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `text.*`                                           | `source`（0..N，任意 kind）                                                                                                   | `out`                                     |
| `image.character`                                  | `reference`(0..N image) · `closeup`(0..N image) · `voice`(0..N audio) · `text`(0..1)                                          | `out`                                     |
| `image.background` / `image.shot` / `image.result` | `reference`(0..N image) · `text`(0..1)                                                                                        | `out`                                     |
| `image.reference`                                  | —（叶子源）                                                                                                                   | `out`                                     |
| `audio.voice`                                      | `text`(0..1) · `timbre`(0..1 audio)                                                                                           | `out`                                     |
| `audio.ambience`                                   | `text`(0..1)                                                                                                                  | `out`                                     |
| `video.shot`                                       | `firstFrame`(0..1 image) · `lastFrame`(0..1 image) · `reference`(0..N image\|video) · `voice`(0..N audio) · `text`(0..N text) | `out` · `tailFrame`（接续镜用的产物末帧） |
| `video.clip`                                       | —（叶子源）                                                                                                                   | `out`                                     |
| `video.merge`                                      | `clip`(**2**..9 video)                                                                                                        | `out`                                     |

### 3.2 合法矩阵（源 kind × 目标槽）

| 目标槽 \ 源                 | text | image                             | audio | video |
| --------------------------- | ---- | --------------------------------- | ----- | ----- |
| `firstFrame` / `lastFrame`  | ✗    | ✓                                 | ✗     | ✗     |
| `reference`（image 家族）   | ✗    | ✓                                 | ✗     | ✗     |
| `reference`（`video.shot`） | ✗    | ✓                                 | ✗     | ✓     |
| `voice`                     | ✗    | ✗                                 | ✓     | ✗     |
| `text`                      | ✓    | ✗                                 | ✗     | ✗     |
| `timbre`                    | ✗    | ✗                                 | ✓     | ✗     |
| `closeup`                   | ✗    | ✓（子型 = reference / character） | ✗     | ✗     |
| `clip`（merge）             | ✗    | ✗                                 | ✗     | ✓     |
| `source`（text）            | ✓    | ✓                                 | ✓     | ✓     |

两条 kind 之外的门：

- **文本槽带角色**：`video.shot.text` 的边带 `role: script | style | character`，容量按角色分（`script` 0..1、其余 0..N）。三档就是三种编译去向——正文 / 约束段 / 角色段。不带 `role` 的连线一律按 `script` 算。角色是**边的属性**：同一个文本节点可以在 A 镜当剧本、在 B 镜当风格约束。
- **语义门**：`blocked` 的素材连 `firstFrame` 被拒并给理由。`0..N` 槽的实际上限跟模型走（`resolveReferenceAssetLimit`），由调用方在 `canConnect` 的 `capacity` 里传进来，⛔ 不硬编码在端口表里。

### 3.3 交互

- **拖线**：从出口拖出时只点亮合法入口，不合法连不上；落空给一行理由，⛔ 不静默失败。
- **连上后显示在槽内**：槽格直接显示上游缩略 / 波形 / 文本摘要。点槽内内容 = 高亮并平移到源节点（不是打开）。
- **断开**：槽卡 hover 动作或右键；「断开」⛔ 不常驻。
- **拖入（吞噬手势）是三态判据**，不是 yes/no（`planV4IngestDrop`）：`rejected` → 抖 + 说理由；`single` → 直接落不问；`choose` → **不替用户挑**，把候选槽交回 UI 点亮，由用户点一个。磁吸 / 咬合 / 吞咽 / 抖动那套 DOM 动作与节点形状无关，复用同一批 helper。

---

## 4. 命名与快照

- **格式**：`S<两位镜号>·<子型标签>[<序号>]`，散节点 `<子型标签><序号>`。稳定名由 `buildStableNodeName` 用 `NODE_V4_SUBTYPE_LABELS` 拼，⚠ 那张表一改存量节点的名字就跟着漂——所以它是**稳定名的构件，不是 UI 文案**（菜单文案走 i18n）。
- **镜头标签不随换序变**：镜头有不变的 `label` 作为 `@` 名主体，`shotNo` 只是显示序号，换序只动序号不动名。
- **创建即持久化**：任何路径新建节点都在同一次提交里写名字，⛔ 不再「显示时才编号」。
- **改名不改 id**：显示层用名字，边 / op / 快照一律用 `id`；`@` 写进 prompt 时同时写 `[[node:<id>]]` 锚，改名后历史引用跟着更新。重名**就地拒绝**，⛔ 不静默加后缀。
- **快照分层，不设节点数硬上限**（`NODE_V4_SNAPSHOT` + `buildNodeAssistantContext`）：当前镜 + 相邻两镜 + 选中 + 最近改动走**完整档**（镜头行 + 每槽 `slot ← 源` + prompt / 参数），其余镜头走**标题档**一行。文本槽在快照里**按角色分行**——混成一行模型就分不出「要拍的内容」和「不许违反的约束」。`maxNodes` 是**标题档的行数上限**，⛔ 不再用它截断完整档。轮播槽只报当前版 + 版本数。

---

## 5. 添加菜单

`CANVAS_ADD_CATALOG` 按 v4 四类分组，每一项的**全部定义就是 `{kind, subtype}`**，意图 id = `<kind>.<subtype>`。

| 组   | 项                            |
| ---- | ----------------------------- |
| 文本 | 剧本 · 规则 · 备注            |
| 图片 | 镜头图 · 角色 · 背景 · 生成图 |
| 声音 | 语音 · 音色                   |
| 视频 | 镜头 · 片段 · 合并            |

- ⛔ **没有「组织」分组**：角色和背景**就是** `image` 的两个子型，拆出去会让用户在「我要加一张角色图」时先想这算图片还是组织。
- ⛔ **没有「关键帧」项**：首/尾帧不是一种节点，是一张图**连进镜头的哪个口**。
- **文案走 i18n 三语**（`StudioNode.addCatalog.*`），⛔ 不拿稳定名当文案。
- 这张词表**同时是助手 `add_node` 的载荷词表**，有测试锁住两处同步：菜单加不了的东西助手也加不了——助手不该比人手多一条建节点的暗路。

---

## 6. 动作出口与撤销

### 6.1 `useNodeCanvasActions()` 是外壳组件的唯一入口

画布外壳（CastDock / RosterRail / 审阅条 / 剧本工作区 / 移动端视图 / 助手 dock / 卡内动作）一律从 `NodeCanvasActionsProvider` 取动作，⛔ 组件里没有第二条写入路径。

### 6.2 op 表是唯一的语义写入口

图引擎（`use-node-graph-v4.ts`）里**每一个改图语义的动作都走 `applyNodeAssistantOpV4`**——与助手同一张 op 表、同一份 inverse、同一批 `changedNodeIds`。⛔ 不在组件或 hook 里直接 `connectIntoSlot` / `setSlotVersion`：那会让「用户点的」和「助手做的」变成两条会漂的路径。

**每条 op 带 `tier`（free / confirm / hardConfirm）与 `inverse` 形状**（`NODE_ASSISTANT_OP_V4_SPECS`）。算不出 inverse 的不进自动落集合。`delete` 的 inverse 不是一条 op 而是一份 `restore` 载荷（整份 data 快照 + 边列表 + 各槽 `versions`/`cur`），撤销在客户端回放、不回服务端。

### 6.3 一份撤销栈，四类例外

撤销栈只有一份（图引擎持有，Provider 消费）——两份栈会让「卡里点的」和「工具栏点的」各撤各的。**助手的一轮 = 一个撤销条目**，撤销时按 inverse **逆序**回放。

**不发 op、不进撤销栈的只有四类**，每一类都因为它根本不是「用户的一步意图」：

1. `moveNodes`（拖动坐标）——进栈等于把一次拖拽拆成几十条记录；
2. `tidyLayout`（按镜头带整理）——只动坐标不动语义；
3. `setMedia`（上传 / 生成回填）——助手不许塞 URL，它只可能来自用户自己的上传或回填；
4. `setRunState`（生成进度信号）——进栈等于给每一次进度跳变产生一条撤销记录；⛔ 也不为它往 `set_field` 的封闭词表里加 `status`。

「整理」的边界写死：它是**布局操作**，⛔ 绝不能顺手改 `shotNo` 或删边——否则用户不敢按它。快捷键（对齐 `alt+a/d/w/s` · 等距 `shift+h/v` · 整理 `shift+A` · 复制粘贴撤销重做）在 `WorkbenchShortcutsV4`，⚠ alt 组合先看 `event.code`：macOS 上 alt 会把字母键的 `key` 变成 `å`/`∂`。

---

## 7. 剧本投影

`projectScriptDocToGraphV4` 是**唯一**的生产投影，**单向**：剧本文档投影出图，图上改文本**不回写文档**。

三条纪律：① **纯函数**（`now` / `makeId` 注入，不碰 DOM）；② **每条边都带槽**，槽由端口表决定，⛔ 不在投影里现推；③ 创建顺序固定（角色 → 每镜的 文本/静帧/镜头/音色 → 成片），同一个 doc 两次投影产出同一批 id。

⚠ **角色投影成 `image.character` 而不是文本节点**：角色卡是生成落点（它自己出图），降成一段文字会让「先出角色图再进镜头」整条路径消失。镜头文本走**单一 Markdown 正文**（`text.shotNote`，`defaultRole: script`），四栏合并成带小标题的正文，拆合在投影层。

---

## 8. 助手

### 8.1 助手读什么

助手读的是 **v4 快照**（§4）：分层、带边、边内联在目标节点下按 `slot ← 源` 排、文本槽按角色分行、轮播槽只报当前版。

### 8.2 op 集

`NODE_ASSISTANT_OPS_V4` 分五组：

- **读**（`read_canvas` / `find_node` / `plan_rerun_downstream`）——没有副作用也就没有 inverse。⚠ `plan_rerun_downstream` **只列名单，一个字不改一分钱不花**；真正的重跑是紧随其后的一串 `generate`，⛔ 别把它做成「顺便把那几个也跑了」，那是在钱闸上开后门。
- **结构**（`add_node` / `connect` / `disconnect` / `delete` / `move_to_shot` / `reorder_shot` / `set_slot_version` / `mark_version_blocked`）。
- **内容**（`set_text` / `set_prompt` / `set_field` / `attach_asset` / `set_model` / `set_params` / `set_voice_profile` / `set_merge_clips`）。
- **审阅**（`set_review_state`）。⚠ 助手**不得自批**（`approvalForbidden`，无开关）。
- **花钱**（`generate`）。

**三条纪律**：

1. `connect` / `disconnect` / `attach_asset` 载荷里**只有节点引用没有 URL**——让模型写 URL 等于让它编地址；写节点 id 则天然被规划器的 `resolve()` 校验。
2. `connect` 的 `slot` **必填**——没有槽的连线在 v4 里不存在。
3. `generate` 是**唯一扣 credit** 的 op，服务端只吐 op、执行在客户端。这道结构性钱闸不能动。

⛔ 没有 `collapse` / `collapse_lane`：展开是画布级视图状态（§2.2），镜头带不折叠。

### 8.3 提案卡三档纪律

提案卡（`CanvasOpProposalCard`）把一批 op 分成三种落法，**分档依据是「错了要付多大代价」，不是「改动大不大」**：

| 落法         | 谁                                                        | 怎么落                                                                                                                          |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **自动落**   | `tier: free` 且不覆盖手写内容的结构 / 内容 op             | 不用点，**恰好一次**——账记在消息级（`autoAppliedRef` 按 `message.id`），⛔ 不记在按消息渲染的卡里：流式期间同一条消息会重渲多次 |
| **三选**     | 覆盖用户手写内容的 `set_text` / `set_prompt`              | 追加 / 覆盖 / 保留，逐条选；「保留」整条不落                                                                                    |
| **就地确认** | `delete`（`confirm` 档）与 `generate`（`hardConfirm` 档） | 与花钱卡同形的就地卡，长在对话流里而不是盖住画布；逐条点                                                                        |

`delete` 的确认卡必须写清**删除影响**（槽内容项数 + 连带删除的边数），可勾「本会话此类不再问」——作用域 = **同会话 + 同类动作**，换会话失效、**不写进用户设置**。理由：连删 12 个空节点不该点 12 次，而跨会话记住「随便删」是一个太便宜的权限。批量删算**一张卡一次确认**，卡上列总数。

### 8.4 生成回填

`use-node-generation-reconcile-v4` 负责后台落地：**有 job id 就是还在飞**（⛔ 不另看 `status`，两个判据迟早对不上），轮询到结果就 `setMedia` 回填（不进撤销栈，§6.3 例外 3）。⚠ 后台落地的失败必须走**翻译过的**那一条说给用户听——不给这条路径，同一个失败会有前台/后台两种读法；⛔ 不在 hook 里直接 toast。

---

## 9. 存储与升级

### 9.1 写端只有 v4

`state` 的事实形状是 `NodeWorkflowStateV4`（顶层 `version: 4`）。新建项目落库的第一份 state 也带 `version: 4`——否则它一出生就是 v3，下一次打开还要再走一遍备份 + 升级。写端 v3 payload 在路由层就是 400，⛔ 不兜空、不降级。

### 9.2 读端 v3 透传，客户端「打开即备份升级」

服务端读到 `version === 4` 走 v4 schema 解析；其余（无 version / v3）**过 v3 schema 只做校验，随后原样透传**，字段不删不补——判版本与升级都归客户端。

客户端的顺序**不能反**：

```
v3 记录 → POST /api/studio/node-workflow/[id]/backup 成功 → upgradeNodeWorkflowStateToV4 → 内存持有 v4 → 下一次正常写入落库成 v4
```

**备份失败 → 不升级、不写、只读**，并给用户一句看得见的话。静默失败等于用户的 v3 原件在几秒后被覆盖且没有退路。四种结果 `alreadyV4 / upgraded / backupFailed / migrationFailed`，只有 `canPersist` 为真时画布才被允许写回。

⚠ 惰性升级与批量回填**跑同一份映射**（`migrateNodeWorkflowStateToV4` + `upgradeNodeWorkflowStateToV4`），结果必须一致；⛔ 脚本不许自己再写一份。

### 9.3 回填脚本

```bash
npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/migrate-node-workflow-v4.ts --dry-run
npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/migrate-node-workflow-v4.ts --apply [--project <id>] [--limit N]
```

⚠ `--conditions=react-server` 不是装饰：`--apply` 要调备份服务，而它顶着 `import 'server-only'`，默认条件下加载即抛。

**备份纪律**：每个项目改写前先把原始 `state` 传上 R2（key 由 `buildV3BackupKey` 拼，同项目重跑不互相覆盖），**备份不成功就不写这个项目**并计入失败清单。备份保留 90 天，按 projectId 可找回任一次迁移前的原样 v3。

### 9.4 v3 读端保留的条件

v3 读端（服务端透传 + 客户端惰性升级 + `legacy` 节点空壳 + v3 schema/enum）**在回填跑完并验证之前不许删**。

⚠ **顺序不能反**：`NodeWorkflowStateSchema.nodes` 是 `z.array()` **无逐项 `.catch()`**——先删 legacy enum 再回填 = 存量项目整份 parse 失败 → 兜成空状态 → 用户看到空画布且静默无报错，下一次防抖写入就把空状态持久化。**先删 enum 再迁移 = 全量数据不可恢复丢失。**

回填完成并验证之后，这一整套（透传分支、`upgradeNodeWorkflowStateToV4` 的调用点、`LegacyMigratedNode`、v3 schema 与 legacy enum、几个 v3 迁移垫片）一起删，⛔ 不留兼容层。

---

## 10. 皮肤收尾（仍在执行的约束）

画布皮肤并入全站脊柱，`src/app/canvas.css` 的 `--canvas-*` 自建令牌世界**整体删除、不留兼容层**：两套令牌并存等于每加一个组件都要先判断「这里算画布还是算全站」，而对比度、暗色档、reduced-motion 各算各的。

**画布专属只保留两组**（其余一律用脊柱）：

| 保留                                                   | 用在哪                                     | 不许用在哪                              |
| ------------------------------------------------------ | ------------------------------------------ | --------------------------------------- |
| 四族端口色（text / image / audio / video，**降饱和**） | 端口点填充 · 槽名前的方色标 · 边的族色描边 | ⛔ 卡面底色、卡边、任何面积填充、文字色 |
| 边三态（空闲 / 生成中脉冲 / 失败）                     | 边的 stroke 与那一条流光                   | ⛔ 卡上的状态点（状态点走脊柱语义色）   |

`.dark` **只在媒体观看面**（灯箱 / 卡内媒体井），其余跟随全站主题，⛔ 不再有画布私有的第二套暗色档。

**验收口径**：`grep -c 'var(--canvas-' src/app/canvas.css` 为 0，且全仓 `grep -rn -- '--canvas-' src/` 零命中——**留一个就是留了兼容层**。

---

## Source of Truth

- 分类与端口：`src/constants/node-types.ts` · `src/constants/node-slots.ts` · `src/constants/canvas-add-catalog.ts` · `src/constants/node-studio.ts`（`NODE_V4_CARD` / `NODE_V4_SNAPSHOT` / `NODE_V4_SUBTYPE_LABELS`）
- op 与助手：`src/constants/node-assistant-ops.ts` · `src/lib/node-assistant-op-apply-v4.ts` · `src/lib/node-assistant-op-plan.ts` · `src/lib/node-assistant-context.ts` · `src/services/node/node-assistant.service.ts` · `src/components/business/node/CanvasOpProposalCard.tsx`
- 槽与装配：`src/lib/node-slot-binding.ts` · `src/lib/node-slot-payload.ts` · `src/lib/node-connection-rules.ts` · `src/lib/node-shot-layout.ts`
- 图引擎与存储：`src/hooks/node/use-node-graph-v4.ts` · `use-node-workflow-store.ts` · `use-cast-ingest-engine-v4.ts` · `use-node-generation-reconcile-v4.ts` · `src/services/node/node-workflow.service.ts` · `prisma/schema.prisma`（`NodeWorkflowProject.state`）
- 迁移：`src/lib/node-workflow-migrate-v4.ts` · `src/lib/node-workflow-v4-upgrade.ts` · `scripts/migrate-node-workflow-v4.ts`
- 投影：`src/lib/node-workflow-script-doc-v4.ts`
- 渲染：`src/components/business/node/workbench-v4/**` · `src/components/business/node/nodes/v4/**`（见 `src/components/business/node/CLAUDE.md`）
- 视觉：`docs/references/ui-defaults.md` §3.1 / §4.1 · `src/app/globals.css` · `src/app/canvas.css`（§10 收尾中）

## Last Verified

- **2026-09-08 · 重写为现行基准**：v4 落地（v4 数据层与图引擎 · workbench v4-only · 助手跑 v4 图 · 版本过滤回填脚本）后，本文从「第三期目标态」改写为现状基准——四类节点与子型、具名槽与 `SlotBinding`、连线矩阵、展开态方向 A、添加菜单四类词表、动作出口与单撤销栈、拖入三态、剧本单向投影、助手 op 与提案卡三档、生成回填、存储写端只 v4 / 读端 v3 透传 + 打开即备份升级、回填脚本与 v3 读端删除条件。已完成的分期与迁移步骤描述删除，仍在执行的约束（§9.4 顺序纪律、§10 皮肤收尾）保留。只改文档。
