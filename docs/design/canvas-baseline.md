# 画布 UI 基准 v1（草案）

> 日期：2026-06-15
> 状态：**草案（待 owner 逐节确认）**。本文件是「只针对画布（`/studio/node` Node 导演台）」的设计基准，约束未来所有画布 UI 改动。
> 依据：继承 [`direction.md`](direction.md) 主基调 v1（已确认）；2026-06-15 owner 对现状画布的审查 + 决策；代码层审查（见 §11 来源）。
> 范围：**面向目标导演台（Shot Board 主视图 + Node Graph 高级视图），但先落到今天能跑的 Node Graph**。Board 的视觉规范随 `ScriptDoc` 地基跟上后补（§8 占位）。
> 配套阅读：[`pages/node-workflow.md`](pages/node-workflow.md)（现状事实）、[`system/css-and-tokens.md`](system/css-and-tokens.md)（token 现状）。

---

## 0. 继承声明

画布是 `direction.md`「双面模式」里的**工作面 = 深色暗房工作台**，必须继承全局基调，不另起炉灶：

- **无彩中性**：UI 只用中性灰阶；彩色只留给状态语义与用户作品。
- **反相 CTA**：最高优先级控件用黑/白反相丸。**例外见 §1**。
- **手感即品质**：Figma 级交互细节（焦点环 / 键盘可达 / 44px 触达 / 光标语义），画布尤甚。
- **动效三用途**：只为状态澄清 / 空间连续性 / 操作反馈；缓动 `cubic-bezier(0.22,1,0.36,1)`，时长刻度 fast120/base200/slow320，接 `useReducedMotion`。
- **圆角阶梯**：面板 `rounded-2xl` · 卡片 `rounded-xl` · 控件 `rounded-lg` · chip `rounded-full`。

画布参考集（`direction.md` 已锁定）：**ComfyUI**（端口/连线语义）· **Figma**（交互金标准）· **Flora**（节点卡）。本基准新增 **updream** 作为「信息密度 + 右栏 IA」的对照样例。

---

## 1. 已锁定决策（owner 2026-06-15）

| #   | 决策                         | 说明                                                                                                                                     |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **全面去黄/橙**              | 画布禁用 amber/orange/lime；连线、状态、节点强调色一律改中性，错误才用红。                                                               |
| D2  | **近黑 + 信息密度提升**      | 节点卡放大、加留白；密度做成可调 token，不再 inline 硬编码。                                                                             |
| D3  | **中键平移**                 | 左键=选择/框选；**鼠标中键拖拽=平移画板**；空格临时平移；滚轮缩放（对齐 Figma）。                                                        |
| D4  | **参数在节点 + 右侧纯助手**  | 采用 updream 模式：每个生成节点自带 composer（参数随节点）；右栏固定**只放助手**，参数永不进右栏。替代「固定右侧 Inspector」的早期设想。 |
| D5  | **绿色生成按钮保留（例外）** | 生成按钮保留绿色 `--node-success #10b981`，是「无彩反相 CTA」的**已批准例外**。其余 CTA 仍走反相/中性。                                  |

---

## 2. Token

### 2.1 现状 `node-*` 调色板（代码实测，`globals.css` L255–266）

| Token                | 值        | 评估                                     |
| -------------------- | --------- | ---------------------------------------- |
| `--node-canvas`      | `#0b0b0a` | 保留（近黑画布）                         |
| `--node-panel`       | `#181716` | 偏暖，建议中性化（见 2.2）               |
| `--node-panel-inner` | `#2d2b28` | 偏暖，建议中性化                         |
| `--node-panel-soft`  | `#22211f` | 偏暖，建议中性化                         |
| `--node-foreground`  | `#f4f1ea` | 暖白，建议中性化                         |
| `--node-muted`       | `#a6a098` | 暖灰，建议中性化                         |
| `--node-subtle`      | `#6f6a63` | 暖灰，建议中性化                         |
| `--node-amber`       | `#d97757` | **删除（D1）**                           |
| `--node-danger`      | `#ca8a04` | **删除（D1，amber-yellow）**             |
| `--node-success`     | `#10b981` | **保留（D5，仅生成按钮）**               |
| `--node-lipsync`     | `#9c77f6` | 评估：lipsync 语义紫，按需保留或降为中性 |

### 2.2 基准调整

1. **中性化暖灰（推荐，需 owner 确认）**：当前灰阶带暖/棕调，叠加锈橙后整体「不耐看」。建议把 `panel / panel-inner / panel-soft / foreground / muted / subtle` 调到**真中性**（对齐 `direction.md` 的 Vercel Geist 灰阶纪律），近黑画布不变。这是一次可见的整体降温，列为 §10 待确认项。
2. **删除 `--node-amber` / `--node-danger`**：全仓 grep 替换（含 32 处 `focus-visible:border-node-amber`）。
3. **新增中性语义 token**（替代被删的彩色）：
   - `--node-edge`：连线默认色 = `--node-subtle`（中性灰），不再用 amber。
   - `--node-edge-active`：流动/选中 = `--node-foreground`（提亮，非换色）。
   - `--node-focus-ring`：`--node-foreground` 40% 的 2px 焦点环，替代所有 inline amber 焦点环。
   - 状态色见 §6。
4. **新增密度 token（D2）**：`NODE_SIZING`（卡宽/最小宽/最大宽/缩略图/icon/handle）、`NODE_SPACING`（header/body/footer padding、section gap、grid gap）。规则：节点尺寸/间距**只能引用这套 token**，禁止组件内 inline（防止再次散落）。

### 2.3 连线 / 端口语义（去色后怎么表达「类型」）

端口类型靠 **图标 + 极低饱和类型色调**（功能性 · 连接配对，**无彩的功能性例外**，参照 `direction.md` 画布参考集里的 ComfyUI 端口语义；同绿生成键的例外性质）：角色/背景/声音/视频 各一档**淡到近灰**的类型色 + 各自图标；**输出=实心 ● · 输入=描边 ○**；同类型才连，不匹配 → 拒绝/标灰。连线**统一中性灰**，default/hover/选中靠**明度**而非色相；进行中=**中性脉冲动效**（删除原 `lime-300`）；非法连接=红（保留，语义）。节点状态去黄见 §6。

> 待 owner 选:端口色 =「极低饱和类型色 + 图标」(已采·推荐) vs「纯无彩·只图标」。

---

## 3. 节点卡规范（密度，D2）

现状卡片偏挤（owner：「小气」）。基准放大并 token 化：

| 项             | 现状（`NodeShell.tsx`）      | 基准                                                    |
| -------------- | ---------------------------- | ------------------------------------------------------- |
| 卡宽           | `w-80`（320px）              | 默认 **400px**，min 360 / max 520（长内容可伸）         |
| Header padding | `px-4 py-3`（16/12）         | `px-5 py-4`（20/16）                                    |
| Body padding   | `px-4 py-3`                  | `px-5 py-4`                                             |
| Section 间距   | `space-y-3`（12px）          | `space-y-4`（16px）                                     |
| 内层块 padding | `p-3`（12px）                | `p-4`（16px）                                           |
| Icon 徽章      | `size-7`（28px）             | `size-8`–`size-9`（32–36px）                            |
| 端口 Handle    | `size-4`（16px），hover 125% | `size-5`（20px），hover 130% + 中性 glow 环             |
| 缩略图         | 填充 ~304px                  | 随卡宽放大（~360px+），保持比例；媒体节点可「展开预览」 |
| Summary grid   | `grid-cols-3/5 gap-2`        | 列数收敛（≤3）、`gap-3`，避免「小格子墙」               |
| 圆角           | `rounded-2xl`（~18.75px）    | 保持 `rounded-2xl`（与面板阶梯一致）                    |
| 状态 badge     | `h-6 text-2xs`               | `h-7 text-xs`（更易读），去黄（§6）                     |

**节点卡 anatomy（解剖）**：顶部 = 类型徽章 + 状态 chip + **`⤢` 放大键**；中部 = Flora 式大缩略图（生成进度呈现在节点上）；下部 = 标题 + prompt 摘要 + 时长/元信息；左缘输入端口 / 右缘输出端口；**底部挂自带 composer（见 §5）**；选中时上方浮出工具条（Figma 式：审阅/编辑/删）。

**节点展开（⤢ → 详情编辑，每种节点都有）**：画布上是**紧凑卡（轻编辑）**；点 `⤢` 进**全屏/大面板（重编辑，不挤画布）**，承载该节点类型的**全部参数 + 高级**。每类一套:镜头 = 全 composer(全参数 + 参考 + 高级);角色 = 参考图集 + 音色集 + 卡绑定;背景 = 场景图 + 环境音/氛围;声音 = 台词 + 音色(继承自角色) + 语速/语调/情绪(对上 updream 音频面板)。这是「轻编辑卡上 / 重编辑展开」的分级披露——即原 B3「composer 展开」泛化为**通用节点展开**。

---

## 4. 画布交互 canon（Figma 级，D3）

现状：ReactFlow 仅 `panOnScroll:true`；无中键平移；底部工具条（pointer/hand/connect/cut）**全是占位 toast**，未接线；minimap `pannable/zoomable=false`。

**目标交互矩阵（Phase 1b 实现契约）：**

| 模式/动作 | 触发              | 行为           | 光标              | ReactFlow 配置                               | 现状         |
| --------- | ----------------- | -------------- | ----------------- | -------------------------------------------- | ------------ |
| 选择      | 左键单击          | 选中节点/边    | default           | `elementsSelectable`                         | ✓            |
| 多选      | Shift+左键 / 框选 | 累加/marquee   | default/crosshair | `selectionOnDrag`, `selectionMode='partial'` | 部分（默认） |
| **平移**  | **中键拖拽**      | 平移画板       | grabbing          | **`panOnDrag={[1,2]}`**（1=中键,2=右键）     | ✗            |
| 临时平移  | 空格+左键拖       | 平移           | grab/grabbing     | `panActivationKeyCode='Space'`               | ✗            |
| 缩放      | 滚轮              | 缩放           | —                 | `zoomOnScroll`（关 panOnScroll，改 zoom）    | 现为 pan     |
| 删除      | Delete/Backspace  | 删节点         | —                 | `deleteKeyCode`                              | ✓            |
| Hand 工具 | 点底部 hand       | 进入纯平移模式 | grab              | 切 `panOnDrag=true`                          | ✗（占位）    |

附则：

- **底部工具条必须接线**：pointer/hand/connect/cut 从占位 toast 改为真正切 ReactFlow 行为 + 光标语义。
- **minimap**：放大、`pannable/zoomable=true`，作为小屏次级导航；位置避让节点 composer 与助手栏。
- 框选 `selectionMode` 定为 `partial`（触碰即选）。
- 吸附 / 对齐线：Phase 2，先记 backlog。

---

## 5. 右栏 IA：参数在节点 + 右侧纯助手（D4）

现状（`StudioNodeAssistantDock.tsx`）：Inspector 与 Assistant **焊死在同一列**（默认 55/45 分屏，仅一根 2.5px 把手分隔，两者永远同时渲染）→ 这就是 owner 说的「两个粘在一起」。

**基准（updream 模式）：**

1. **参数上节点**：每个生成节点底部挂一个自带 composer（生成模式 / 模型 / 比例·时长 / 积分 / 生成按钮），重参数（如音频音色/情绪）点 ⤢ 展开全屏。**复用 Studio 的 composer / `tool-surface` 契约**（`direction.md` 决议 5），不新发明一套。
2. **右栏固定 = 纯助手**：只放对话 / 建议 chips / 输入。**参数永不进右栏** → 「粘在一起」从根上消失。**默认安静**(1 句起手 + 3 短 chips + 精简输入 `/`技能 · `@`素材);**反问澄清卡 = 对话中按需浮现、不常驻**(出题跳选项 → 填 ScriptDoc;产出走 `llm-output-validator` 校验);头部 = 多 LLM **自动路由** + 新建 / 对话管理。
3. **助手三态:折叠 `»` / 默认窄 dock / 展开 `⤢`**。展开 = **左对话 + 右剧本/大纲(ScriptDoc)工作区**并排,边聊边看剧本成形,确认 → 触发自动生成节点;折叠后画布全宽。移动端 = 底部抽屉(ResponsiveOverlay)。与节点「轻在卡 / 重进 ⤢」同一种克制。
4. **重构方向**：把 `StudioNodeAssistantDock` 里的 `InspectorPanel` 堆叠拆除，参数迁到节点 composer；右栏组件只保留 `AssistantConversation`。（具体改名/拆分留实现阶段，按高危模块先 grep 再动。）

---

## 5.1 模型切换器 · 作用域 · 能力契约（owner 2026-06-16）

**切换器**（节点 composer 顶部）= 两级:① **品牌分段**（Seedance / Kling V3 Pro / Veo 3.1 / Vidu Q2 · `＋更多`）—— 换品牌换**整张参数面板**;② **具体模型下拉**（变体,如 Seedance Reference / Fast）—— 同面板**收窄可选项**（如 Fast 灰掉 1080p）。Wan 2.2 / Hunyuan 1.5 显示「敬请期待·待 comfy」（可见不可选）。参数由「模型能力描述符」驱动,**不写死**;运镜类（Seedance）走 prompt 非参数。`t2v/首尾帧/全能参考` 等「模式」由输入或子 tab 决定,不占切换器两级。

**作用域** = 画布默认 + 镜头覆盖:

- **画布默认模型** → 放**顶栏**常驻 chip（`默认模型 · X ▾`）。每个视频节点默认继承,定跨镜一致性基线。判据:它是牵动全局的最有后果设置,要常驻可改,不藏进设置。
- **镜头覆盖** → 节点可单独覆盖为其它模型。**入口低调**（模型菜单二级项,不抢「生成」层级,避免诱人乱混毁一致性）;**状态高调**（被覆盖节点打 ⚠ 徽标 + 描边,画布扫一眼看出哪镜跑偏）。覆盖即提示「可能与其它镜不一致」。

**能力契约 + 类型化绑定**（让切换安全 = roadmap「能力契约·不硬绑 Seedance」+「Cards=Elements 类型化绑定」合体落地）:

- 绑定（角色 / 背景 / 声音·台词 / 视频 参考）**挂在图上、与模型无关、可恢复**。
- **音色属角色（听觉身份,CharacterCard `defaultVoiceCardId`,= roadmap「角色=视觉+听觉身份」+ VOICE-4 软引用）;台词属镜头（剧本 speakerRoleId）。声音节点 = 继承角色音色 + 取镜头台词 → 生成 audio(喂镜头 `@A1`),不每句重挑音色,可低调覆盖。** → 同角色跨镜听觉一致,对位视觉一致。
- **元素对称(视觉面 + 听觉面)**:角色 = 视觉(参考图集) + 听觉(**音色集**:主 + 情绪变体,声音节点在集内切·默认主);背景 = 视觉(场景图) + 听觉(**环境音/氛围**:如雨声/远处车流 + 强度,锁场景氛围一致)。镜头最终音频 = 角色语音(台词 × 选定音色) + 背景环境音,按模型能力契约处理(native / donor / 无 → 标灰)。**默认简单(1 音色 / 基础氛围);多音色 + 氛围细化 = 进阶,不强加。**
- 每个模型一份**能力契约**:声明收哪些绑定·各几个·映射到哪个 provider 字段（角色参考 → Seedance `image_urls`+@Image / Vidu `reference_image_urls`(≤7,无 token) / Veo `image_urls`(≤3) / Kling `start_image`|`elements`）· 音频 / 时长 / 分辨率 / 比例 集 · 是否单次多镜。composer 面板也读它。
- **切换 / 覆盖模型 = 按新契约重映射**:兼容绑定自动接;**不兼容大声标灰 + 提示,不静默丢**（例:声音节点 → Vidu,Vidu 无配音 → 此绑定忽略并提示）;参数夹到最近合法值;切换前可预览「将映射 / 将忽略」。

**跨缝分工**:契约校验 / 绑定重映射 = 引擎（Codex / roadmap）;切换器 UI / 顶栏默认 chip / 覆盖入口 / 切换预警 / 标灰可视化 = 本基准（UI）。各模型已逐个代码×官方参数核对（详见 §11 来源补充与会话记录）。

---

## 6. 状态系统（去黄，D1）

节点/镜头状态色全面去 amber/lime：

| 状态               | 现状      | 基准                                          |
| ------------------ | --------- | --------------------------------------------- |
| idle               | 中性      | 中性（`panel-inner` / `muted`）               |
| queued             | **amber** | **中性 + 轻动效**（去黄）                     |
| running/generating | sky       | **中性脉冲/shimmer 动效**（进度呈现在节点上） |
| ready              | lime      | 中性（克制提亮）                              |
| done               | emerald   | 克制（小绿勾或中性「完成」，不喧宾夺主）      |
| failed             | red       | **红（保留，唯一语义色）**                    |
| stale/disabled     | 中性      | 中性                                          |

原则：**进行中靠动效不靠色，完成克制，错误才用红**。

---

## 7. Board ↔ Graph 视觉对应（占位）

Board 主视图依赖 `ScriptDoc` 地基（见 `docs/plans/execution-roadmap-2026-06.md` 的 VID-UI-1/2）。地基落地后补：Board 行卡 与 Graph 节点的视觉对应（同 `Shot.id`）、审阅循环（approve/retry/regenerate）的状态色与按钮层级。本基准先约束 Graph，Board 视觉规范留此节。

---

## 8. 空 / 载 / 错 / 空画布引导

- 空画布：Figma 式起手引导（一句说明 + 起手动作），不留死空白。
- 节点级：queued/running/done/failed/stale 状态齐全（§6）。
- 助手：空态起手势 + 建议 chips。
- 错误：节点上明确错误态 + 文案，不静默。

---

## 9. 验证基准（Step 3，需 dev server）

- **视觉回归快照**：`e2e/visual.spec.ts` 增画布专属用例，截图基线按 OS 分套（`-win32` / `-darwin`），锁死防跑偏。
- **断言具体值**：间距 / token / 触达区用 `toHaveCSS` / `getByRole` 断言（呼应 Hard Rule 5 与 44px）。
- **交互验证**：中键平移 / 框选 / 空格平移 / 工具条 实跑（`verify` skill 或 Chrome MCP）。
- 机械门：`npm run lint && npm run build`（dev server 在跑时勿并行 build）。

---

## 10. Do Not Break / 待确认

**Do Not Break：**

- `/studio/node` 仍是 Studio 高级工作区；React Flow 渲染与 `@xyflow/react/dist/style.css` 全局引入。
- 服务端 `NodeWorkflowProject` 持久化、用户态 localStorage fallback、节点 `generationId` 链接、卡/voice/reference 注水路径。
- `node-*` token 仍 domain-scoped 于画布，不外泄到通用页。
- UI-only：不碰 `src/app/api/**` / `prisma/**` / `src/services/**` / Clerk / credit。

**待 owner 确认：**

1. **暖灰中性化**（§2.2-1）：是否把 node 灰阶整体降温到真中性？（可见的整体色温变化）
2. `--node-lipsync` 紫：保留语义紫还是降中性？
3. 节点卡默认宽 400px 是否合适（vs 380 / 420）。

---

## 11. 来源（Source of Truth）

- 设计方向：[`direction.md`](direction.md)、[`system/css-and-tokens.md`](system/css-and-tokens.md)、[`pages/node-workflow.md`](pages/node-workflow.md)
- 代码（2026-06-15 审查）：`src/app/globals.css`（L255–266 node tokens）、`src/constants/node-studio.ts`（edge/canvas/dock）、`src/constants/node-tokens.ts`（accents/status/edge colors）、`src/components/business/node/StudioNodeWorkbench.tsx`（ReactFlow 配置 L1005–1033）、`src/components/business/node/nodes/NodeShell.tsx`（卡 anatomy/尺寸）、`src/components/business/node/CanvasBottomDock.tsx`（工具条占位）、`src/components/business/node/CanvasMiniMap.tsx`、`src/components/business/node/StudioNodeAssistantDock.tsx`（右栏 55/45 堆叠）、`src/components/business/node/inspector/SeedanceInspector.tsx`（生成按钮 amber/green）

## 12. Last Verified

- 2026-06-15：基于代码层审查（4 路）与 owner 现状审查决策落成 v1 草案。未跑浏览器截图（Step 3 待 dev server）。
- 2026-06-16：补全模型切换器/作用域/能力契约（§5.1）、元素视觉+听觉对称、节点 ⤢ 展开、助手三态；落定全套视觉草稿（见 §13）；视频阵容定为 Seedance/Kling/Veo 3.1/Vidu Q2（Wan/Hunyuan 稍后）。

---

## 13. 草稿清单（视觉稿速查 · 文字规格）

> 这些是会话里逐张确认过的视觉稿（SVG mockup）。**视觉稿文件 = [`canvas-drafts/`](canvas-drafts/README.md)（可在 VS Code/浏览器直接打开看图，索引 `canvas-drafts/README.md`）**；下表是文字规格（稿子丢了可据此重画）。状态：✅=已确认。

- **A1 · 整体布局** ✅：近黑去暖 + 点阵网格；左轨 = 全站共享 app 侧栏（现状，瘦身属 app-shell 决定，超画布范围）；顶栏 = 项目名 + **默认模型 chip** + 添加节点；中区 = 节点 + 自带 composer + 中性连线；右栏 = 固定纯助手；底部工具条（中键平移）；左下 minimap 放大。
- **A2 · 空画布引导** ✅：空态不留死白 = 一句引导 +「🗨 跟助手聊大纲」**反相白丸**（主）+「＋ 手动加节点」（次）；助手 dock 默认开、起手「看了你的画布，还空着。先聊大纲?」呼应。默认走助手（剧本脑）。
- **B2 · model-aware composer** ✅：节点自带；**两级切换器** = 品牌分段（Seedance/Kling/Veo 3.1/Vidu Q2 · ＋更多）换整张面板 + 变体下拉收窄可选项；Seedance 面板真参数（prompt含运镜 / resolution 480·720·1080 / aspect / duration auto或4–15 / generate_audio / seed / 参考槽 图·视频·音频 @token 共享≤12）；**运镜走 prompt 非参数**；绿生成例外；覆盖低调入口；切换弹「将映射 ✓ / 将忽略 ⚠」预览。
- **B3 · 节点 ⤢ 展开详情** ✅：每节点顶部 `⤢` → 全屏/大面板编辑全部参数+高级；声音展开 = 台词 + 音色(继承角色) + 语速/语调/情绪（对上 updream 音频面板）；**轻在卡 / 重进展开**。每类一套（镜头=全 composer / 角色=参考集+音色集+卡 / 背景=场景+环境音 / 声音=台词+音色+情绪）。
- **B4 · 角色节点** ✅：**视觉身份(参考图集) + 听觉身份(音色集:主+情绪变体)**；绑 CharacterCard；输出 角色参考 + 音色。
- **B7 · 背景节点** ✅：**视觉(场景图) + 听觉(环境音/氛围:雨声/车流 + 强度)**；绑 BackgroundCard。
- **B5 · 声音节点** ✅：**继承角色音色 + 取镜头台词 → audio**（喂镜头 `@A1`）；不每句重挑、可低调覆盖。
- **B6 · 镜头节点** ✅：消费参考槽（角色 @I1 / 背景 @I2 / 声音 @A1）= B2 composer；生成。
- **C · 连线 / 端口 / 状态** ✅：端口 = **图标 + 极低饱和类型色**（功能性例外，输出实心/输入描边，同类型才连）；连线**全中性灰 + 明度**（default/hover/选中/进行中-中性脉冲），**仅非法用红**；状态**去黄**（排队非 amber，进行中=中性动效 + 进度在节点上，完成克制中性勾/极淡绿，仅失败红）。
- **D · 交互控件** ✅：底部工具条**真接线**（选择/手/连线/裁剪 + 光标语义）；**中键平移** `panOnDrag=[1,2]` + 空格临时平移 + 滚轮缩放 + Shift 多选 + Del 删；选中**浮动工具条**（上下文：镜头=审阅循环 审阅/重试/重生成/编辑/删）；minimap `pannable/zoomable=true` 放大避让。吸附/对齐 = Phase 2。
- **E1 · 助手 dock** ✅：右栏固定纯助手；**默认安静**（1 句起手 + 3 短 chips + 精简输入 `/`技能 `@`素材）；**反问澄清卡 = 对话中按需浮现**（出题跳选项 → 填 ScriptDoc，产出走 `llm-output-validator`）；多 LLM 自动路由 + 新建/对话管理；**三态 折叠 `»` / 默认窄 dock / 展开 `⤢`**，展开 = 左对话 + 右剧本/大纲(ScriptDoc)工作区，确认 → 触发自动生成。
- **（初稿）反问澄清卡**：LLM 输出结构化提问 `{ question, options[], multiSelect?, allowCustom?, allowSkip? }` → 渲染 chips → 回填 ScriptDoc 具名字段；只问改方向的、给「自填/让 AI 定」、选项按上下文生成不写死。
- **（初稿）自动生成流**：助手写/改 ScriptDoc（事实）→ 确认 → 投影 `scriptDocToGraph`（复用现有 `spawnFullWorkflowFromAgent`，按 roleId/Shot.id 幂等）→ spawn 角色/背景/声音/镜头节点（**助手不直接戳节点**）。

---

## 14. 进度 · 下一步 · 续接指南

**进度**：Step 1 代码层审查 ✅ · Step 2 基准文档 + 全套视觉草稿 ✅（本文档）· **Step 3 视觉快照基准（待，需起 dev server）** · 落地实现（待，一次一个组件，走 UI 契约）。

**续接（换一个 chat 继续）——读这三处即可接上**：

1. **本文档 `docs/design/canvas-baseline.md`** —— 全部决策 + 草稿清单（§13）+ 待办（本节）。
2. `docs/plans/execution-roadmap-2026-06.md` —— 视频收敛的**引擎/后端路线**（ScriptDoc/Planner/lineage/VID-UI/DIR-DATA）。
3. memory：`project-canvas-ui-baseline`、`project-video-systems-convergence`、`feedback-ui-on-claude`、`feedback-prefer-direct-api`。

**引擎待办（交 Codex/roadmap，不挡 UI 实现）**：Kling `extend-video` 删 · Seedance（duration 传字符串 / 标准档 1080p 先验 / audio 需配图视频 / seed 接线）· Veo 补 Fast/Lite + 时长×分辨率约束 + 首尾帧模式 · 能力契约 + 类型化绑定重映射 · 自动生成投影 `scriptDocToGraph` · ScriptDoc 地基（VID-UI-1 / DIR-DATA-01）· Vidu Q2 新 builder（`reference_image_urls`）。

**待 owner 拍板**：暖灰中性化（§2.2-1，推荐做）· `--node-lipsync` 紫去留 · 卡宽 400 · 端口色「极淡类型色+图标 vs 纯无彩」。

**UI 实现契约**：UI-only **不碰** `src/app/api/**` / `prisma/**` / `src/services/**` / Clerk / credit；一次一个组件；每步 `npm run lint && npm run build`（dev server 在跑勿并行 build）+ `e2e/visual.spec.ts`（有意改动 `--update-snapshots` 并点名，基线按 OS 分套 win32/darwin）+ 44px/a11y 断言。建议起点：去黄橙 token + 中键平移（低风险、影响面大）。
