# 画布 UI 组件台账（2026-08-01）

> **权力级别**：清单 / 工作台账，**非设计授权、非实现授权**。
> **用途**：owner「画布上的 UI 是一口气生成的，不符合我的标准，后面修一处审一处，不满意就退回」——这份台账是那个循环的**工作面**：一行一个可独立修缮的 UI 单元，带状态清单、真机证据、当前问题。
> **范围**：路由 `/studio/node`。含画布域自己的全部表面；全局左 rail（`AppSidebar`）虽同屏但属全局壳，只登记不入修缮队列。
> **采集条件**：真机 `localhost:3000/zh/studio/node`，Chrome 1568×744 视口，项目 `AI拟人剧场`（19 节点，有真实媒体）+ `群星璀璨 PV`（0 节点，空态）+ `包6-网格素材`（13 节点，空节点）。

---

## 0 · 怎么用这份台账

| 列       | 含义                                                             |
| -------- | ---------------------------------------------------------------- |
| **编号** | 修缮时的唯一称呼（例：「改 C1」= 图片近场能力条）                |
| **状态** | 该组件**自己**的全部可视状态；这是「改一处」时要一次性看全的清单 |
| **真机** | ✅ = 本轮已采到实况 · ⬜ = 未采（附复现路径）                    |
| **进度** | ⬜待改 · 🔧改中 · 👀待审 · ✅已审 · ↩退回（owner 填）            |

**修缮循环**：选一个编号 → 我给「现状截图 + 问题清单 + 改法」→ owner 点头 → 改 → 真机复验截图 → owner 审 → ✅ 或 ↩。

### ✅ owner 2026-08-02 三条拍板（决定了后面怎么排）

| #     | 决定                                                                                                                                | 后果                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **画布视觉方向保持原样** —— `canvas-ui-redesign-2026-07-31.md` §5 #1 那三个视觉世界（光台 / 暗房 / 场记板）**不选了，维持现有皮肤** | 原先写在这里的「前置未决」**就此解除**。配色/材质**不动**，不是「暂缓」。所有修缮都在现有 token 内进行；碰颜色只为可读性（且必须跑 `contrast-check`）               |
| **2** | **加两条新轴：动效「丝滑」+ 响应式**                                                                                                | 基准 = [`research/UI与设计/UI丝滑交互与动效库选型-2026-07.md`](research/UI与设计/UI丝滑交互与动效库选型-2026-07.md)。落到本台账的可验条款见 **§13**                 |
| **3** | **设计载体改用 Fable 出 HTML 原型，照着 HTML 改 `src`**                                                                             | 覆盖 `feedback-fable-toplevel-sonnet-exec` 里「CD 主力 / Fable 降为 fallback」那条 —— owner 原话「之前走 CD 效果不好，不如 Fable 那边设计 HTML 然后根据 HTML 去修」 |

> ⚠ 第 3 条只是**换载体**，不豁免门禁：HTML 原型属于探索产出（CLAUDE.md「demo / 原型是例外」），要合入 `src/` 仍走 `scenes/ui-page.md`。

---

## 1 · 层级地图

画布用的是 `globals.css` 里 `--z-index-canvas-*` 那套 0–60 阶梯（domain-scoped）。台账按这个层分组，因为**同层的东西会互相打架**，改一处常要连着看同层的其它几个。

```
L6 助手 rail（浮动卡，不挤压舞台）        E1–E9
L5 重档浮层（详情面板 / 重编辑工作区 / 对话框） F1–F6
L4 瞬态浮层（添加菜单 / 项目菜单 / 外观面板）  D1–D8
L3 近场层（贴卡工具条 / 快编面板）           C1–C7
L2 节点卡                                B1–B11
L1 卡壳共用件                            A6–A10
L0 舞台底（点阵 / 连线 / 骨架 / 空态）        A1–A5
```

---

## 2 · L0 舞台底

| 编号   | 组件       | 文件                               | 职责                              | 状态清单                                                                                 | 真机                        | 进度 |
| ------ | ---------- | ---------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------- | ---- |
| **A1** | 画布底     | `CanvasSurface.tsx`                | 点阵背景 + 壁纸层 + 壳色          | 纯色底 · 带壁纸图（cover/contain × 透明度）· 各 zoom 档点阵密度                          | ✅                          | ⬜   |
| **A2** | 连线       | `edges/NodeWorkflowStatusEdge.tsx` | 节点关系可视                      | 骨干边（常显）· 成分边（常显/收起）· 选中升级石绿 · 生成中 · 端点墨点 · 虚线（未过审？） | ✅                          | ⬜   |
| **A3** | 启动骨架   | `CanvasStartupSkeleton.tsx`        | `useSearchParams()` suspense 兜底 | 单态：点阵 + 3 块灰卡骨架                                                                | ⬜ 硬刷新后 <1s，本轮没抓到 | ⬜   |
| **A4** | 空画布前门 | `NodeCanvasEmptyGuide.tsx`         | 0 节点时的起手势                  | 单态：标题 + 副文案 + 「跟助手聊大纲」黑丸 + 「手动加节点」次级                          | ✅                          | ⬜   |
| **A5** | 投放层     | `IngestDragLayer.tsx`              | 拖文件/拖节点进画布               | 待机（不渲染）· 拖入高亮 · 落点提示                                                      | ⬜ 需拖一个文件进画布       | ⬜   |

**A1/A2 现场发现**

- 30% 缩放下连线是一片**灰白细线糊成的面**，读不出走向（见全景图）。
- 边端点的小方块（端口）在浅底上几乎不可见，`⊙` / `▫` 两种形状混用。

---

## 3 · L1 卡壳共用件

| 编号    | 组件           | 文件                                | 职责                   | 状态清单                                                                                                                         | 真机                         | 进度 |
| ------- | -------------- | ----------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---- |
| **A6**  | 卡外标签行     | `NodeShell.tsx` `canvas-card-label` | 族图标 + 名字 + 状态位 | 只读 · hover 露铅笔 · 编辑中（input）· 空名字回落类型名 · 超长截断                                                               | ✅                           | ⬜   |
| **A7**  | 盖章徽标       | `nodes/NodeStatusBadge.tsx`         | 节点 8 态盖章          | `idle`=不渲染 · `queued`（转圈）· `ready` · `running`（脉冲点）· `done` · `failed` · `stale` · `disabled`                        | ⬜ 只见到 idle               | ⬜   |
| **A8**  | 成分栏         | `NodeShell.Ingredients`             | 「这张卡吃了哪些上游」 | 0 条=不渲染 · 1–4 chip · >4 折「+N」· hover 露 × 解绑 · 新 chip 落定 pop                                                         | ⬜ 需有上游连线的卡          | ⬜   |
| **A9**  | 端口           | `NodeShell.NodeCardPorts`           | 边锚点 + 唯一建边手势  | 4 族形状（image/audio/video/identity）× 空闲 / hover / 连接中                                                                    | ✅（空闲）                   | ⬜   |
| **A10** | 图片状态共用件 | `nodes/ImageCardMediaState.tsx`     | 图片族状态语言         | 徽标 `空`/`上传中`/`生成中`/`失败` · 上传遮罩（真百分比 + ×取消）· 生成遮罩（无百分比、不可取消）· 失败（原因 + 重试）· 替换胶囊 | 部分 ✅（空徽标 / 替换胶囊） | ⬜   |

**A7 的坑**（2026-08-02 夹具实拍订正）：八态**都有**自己的徽标文案，`done` 是「已收」，不是我先前写的「没有专属视觉」——那句话错了。真实的问题是**编码强度**：

| 态         | 徽标     | 视觉                                    |
| ---------- | -------- | --------------------------------------- |
| `idle`     | 不渲染   | 素卡                                    |
| `queued`   | ↻ 待拍   | 灰白牌                                  |
| `ready`    | 就绪     | 灰白牌                                  |
| `running`  | ● 拍摄中 | 灰白牌 + 媒体窗变灰 + 转圈 + **进度条** |
| `done`     | 已收     | 灰白牌                                  |
| `failed`   | NG       | **红牌 + 卡边转红**                     |
| `stale`    | 过期     | 灰白牌                                  |
| `disabled` | 停用     | 灰白牌                                  |

- **七个态里五个共用同一张灰白牌**，只有 `failed` 有色差 —— 扫读时「等着跑 / 跑完了 / 过期了 / 被停用」四件完全不同的事长得一样。
- **`running` 的媒体窗里有一条进度条** —— 坐实 `canvas-ui-redesign` 诊断 #8「生成中假装有进度」。而 `ImageCardMediaState` 里 `ImageCardGeneratingOverlay` 的注释明写生成态「无百分比，规格 §5 明确禁止假造一个」：**同一个产品里两条相反的做法并存**（图片族守规矩，text/video/audio 族这条没守）。
- 文案是一套片场隐喻（待拍/拍摄中/已收/过期/停用），但 **`NG` 是唯一的英文缩写**，不同族。

---

## 4 · L2 节点卡

| 编号    | 组件                   | 文件                                           | 职责                             | 状态清单                                                                                                     | 真机                                    | 进度                                          |
| ------- | ---------------------- | ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------- |
| **B1**  | 图片起步卡             | `nodes/ImageSourceStarter.tsx`                 | role-less 空图片节点             | 空（虚线框）· 拖入高亮 · 上传中 · 上传失败 · **生成中** · **生成失败**                                       | ✅ 空态                                 | ⬜                                            |
| **B2**  | 图片就绪卡             | `nodes/LooseImageCard.tsx`                     | 卡即媒体                         | 就绪 · hover/选中露「替换」· 选中蓝环 · 替换中 · 替换失败 · **待审（卡边）** · **已打回（卡边）** · 尺寸读数 | ✅ 就绪+选中+替换胶囊                   | ⬜                                            |
| **B3**  | 媒体预览卡             | `nodes/NodeMediaPreview.tsx`                   | 未落媒体的 shot/frame/voice/text | kind=image 空/生成中/失败 · kind=video · kind=audio · kind=text · footer 两种文案                            | ✅ text（镜头文本）· image 空（关键帧） | ⬜                                            |
| **B4**  | 身份档案卡             | `nodes/IdentityCollectorCard.tsx`              | 角色 / 场景 一致性身份           | 有代表图 · 无代表图（「选一张代表图」虚线）· 参考张数徽标 · 听觉身份 chip                                    | ✅ 两态都有                             | ⬜                                            |
| **B5**  | 镜头图卡               | `nodes/ShotNode.tsx`                           | 镜头（有图走 B2）                | 空 · 有图 · 生成中 · 覆写模型（虚线边）                                                                      | ⬜ 有图态未采                           | ⬜                                            |
| **B6**  | 关键帧卡               | `nodes/FrameImageNode.tsx`                     | 视频首帧                         | 空 · 有图                                                                                                    | ✅ 空态                                 | ⬜                                            |
| **B7**  | 视频生成卡             | `nodes/SeedanceNode.tsx`                       | Seedance 出片                    | 空 · 有片（原生 `<video>` 控件）· 生成中 · 失败                                                              | ✅ 有片                                 | ⬜                                            |
| **B8**  | 参考视频卡             | `nodes/VideoReferenceNode.tsx`                 | 上传参考片                       | 空 · 有片 · 上传中                                                                                           | ⬜                                      | ⬜                                            |
| **B9**  | 视频合成卡             | `nodes/VideoMergeNode.tsx`                     | 片盒 / 多段合并                  | 空 · 待合成（列出片段）· 合成中 · 有成片                                                                     | ⬜                                      | ⬜                                            |
| **B10** | 音色卡                 | `nodes/VoiceNode.tsx`                          | 音色 + 台词                      | 无音色 · 有音色（缩略图 + ▶ + 波形 + provider 行）· 生成中 · 失败                                            | ✅ 有音色                               | ⬜                                            |
| **B11** | ~~旧编排器 / planner~~ | ~~`nodes/ComposerNode.tsx` · `AgentNode.tsx`~~ | **已退役并删除**（2026-08-02）   | —                                                                                                            | ✅ 实拍证明**渲染不出来**（见 §15.2）   | ✅ 组件已删；enum 与迁移垫片按 §15.2 永久保留 |

**现场发现**

- **B7 视频卡**：卡外名字直接显示模型 id `seedance-2.0-fast-reference`（不是人话名字），媒体窗是**浏览器原生 `<video>` 控件**（灰底 mute 图标、原生进度条、⋮ 菜单），与其它卡的语言完全不搭；且首帧未加载时是纯黑窗 + 一个转圈。
- **B3 text 态**：黑窗 + 文档图标 + 一句说明，footer「等待镜头文本」——与图片族的白窗语言不一致（黑 vs 白两套窗）。
- **B6 关键帧**：`□ 空` 徽标 + 图标 + 说明 + footer「等待关键帧设定」+ 一个魔杖圆钮，信息重复三遍（徽标说空、正文说要干嘛、footer 又说等待）。
- **B4 身份卡**：选中态与 B2 的蓝环同色同粗，两张卡挨着时读不出谁是谁。

---

## 5 · L3 近场层

| 编号   | 组件           | 文件                              | 职责                 | 状态清单                                                                                                                                                                                    | 真机                               | 进度 |
| ------ | -------------- | --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---- |
| **C1** | 图片能力条     | `CanvasImageSelectionToolbar.tsx` | 有图卡的近场工具条   | 常驻 6 项（分类▾ / ⤢ / ⬇ / 快捷编辑 / 🗑 / ⋯）+ ⋯ 溢出 8 项（超分辨率 / 去背景 / 局部重绘 / 扩展画布 / 图层分解 / 提取元素 / 物体替换 / 风格迁移）· 分类已选/未选 · 多选时隐藏 · 拖拽时隐藏 | ✅ 两态                            | ⬜   |
| **C2** | 通用工具条     | `GenericSelectionToolbar`         | 非图片族             | 有能力区 + 有媒体 · 只有能力区 · 只有媒体 · **两者都无 = 整条不渲染**                                                                                                                       | ✅                                 | ⬜   |
| **C3** | 能力区（5 种） | 同文件                            | 按族给动作           | Collector「添加素材 / 出演·N」· Seedance「生成 / 重新生成视频 / 生成中」· VideoMerge「合成 / 重新合成 / 合成中」· Voice「声音库 / 从素材选择」· Shot「生成 / 重新生成 / 生成中」            | ✅ 3/5（Collector·Seedance·Voice） | ⬜   |
| **C4** | 审核按钮       | `MediaReviewButtons`              | 通过 / 打回          | 待审（两个都在）· 已通过（只剩打回）· 已打回（只剩通过）                                                                                                                                    | ✅ 「打回」单钮态                  | ⬜   |
| **C5** | 快捷编辑面板   | `CanvasQuickEditPrompt.tsx`       | 贴卡下方的一句话改图 | 空（运行禁用）· 有输入 · 运行中 · 失败                                                                                                                                                      | ✅ 空态                            | ⬜   |
| **C6** | 多选合成条     | `VideoMergeComposeToolbar.tsx`    | 多选视频 → 一键成盒  | <2 选 = 不渲染 · ≥2 选「合成 N 段」                                                                                                                                                         | ⬜ 需选 2 个视频节点               | ⬜   |
| **C7** | 分类下拉       | C1 内                             | 给图片打分类         | 未分类 · 已分类                                                                                                                                                                             | ⬜ 未展开                          | ⬜   |

**现场发现**

- **C1**：工具条常驻 6 项 + 溢出 8 项 = 一张图 14 个动作，全是同等重量的灰色图标钮；「快捷编辑」是唯一带文字的，视觉上却不比别的重。
- **C5 快捷编辑**：正文写着 `正在编辑 [cbf13d8d9e967d35c185019db8431c8…]` ——**把原始 generation id 直接漏给用户**，该显示的是卡的名字。
- **C4**：审核按钮住在**底部编辑框的参数条首位**（owner 2026-07-31 拍板），不在近场工具条上——改 C1 时别顺手把它搬回来。

---

## 6 · L4 底部编辑框 + 瞬态浮层

| 编号   | 组件         | 文件                                                   | 职责                 | 状态清单                                                                                                                        | 真机            | 进度 |
| ------ | ------------ | ------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- |
| **D1** | 图片生成框   | `composer/GenerateComposer.tsx`                        | 选中图片卡时贴卡下方 | 参考槽（0/N 张 + ＋）· 提示词空/有字 · 模式切换 · 模板 · 模型丸 · 比例 · 份数 · 送出 · 生成中 · ⤢ 展开                          | ✅              | ⬜   |
| **D2** | 视频编排框   | `composer/VideoComposer.tsx`                           | 选中视频卡时         | 两 tab（参考生成 / N 个素材）· 素材槽 · 提示词 + 字数 · 监视器 · 场记条 · 参数（分辨率/时长/比例）· 送出 · 生成中（计时）· 失败 | ✅              | ⬜   |
| **D3** | 提示词输入   | `composer/MentionInput.tsx` + `ReferenceTokenChip.tsx` | @提及参考            | 空 · 有字 · @下拉打开 · token chip · token 失效                                                                                 | ⬜              | ⬜   |
| **D4** | 参考管理面板 | `composer/ReferenceManagerPanel.tsx`                   | 参考素材增删排       | 空 · 有素材 · 超限 · 拖排序                                                                                                     | ⬜              | ⬜   |
| **D5** | 模板选择器   | `composer/GenerateComposerTemplatePicker.tsx`          | 提示词模板           | 收起 · 展开列表 · 空                                                                                                            | ⬜              | ⬜   |
| **D6** | 相机语法钮   | `composer/CameraGrammarButton.tsx`                     | 镜头语言注入         | 收起 · 展开                                                                                                                     | ⬜              | ⬜   |
| **D7** | 模型选择器   | `WorkflowModelPicker.tsx`                              | 节点级模型           | 有值 · **无值（空丸）** · 禁用 · 缺 key                                                                                         | ✅ 见到空丸缺陷 | ⬜   |
| **D8** | 添加节点菜单 | `CanvasAddMenu.tsx`                                    | ＋添加               | 四组：图片（镜头图/关键帧）· 视频（视频生成/参考视频/视频合成）· 声音（音色档案）· 组织（角色档案/场景档案）+ 顶部「图片」上传  | ✅              | ⬜   |

**现场发现**

- **D2 视频框**：左下模型选择器**整个是空的**（只剩一个 ▾），参数丸写着 `480p / 12ss / 4…`（`12ss` 疑似拼错 + 截断），字数计数 `0/2000` 被正文压在下面，滚动条是一条黑杠。
- **D1 图片框**：参数条是「打回 / 用模板 / 模型 / 比例 / ×1」五个丸挤在两行，`打回`（审核动作）和 `用模板`（编辑动作）同等重量并排。
- **D2 素材 tab** 标题是「5 个素材」——数字当标题，切过去之前不知道那 tab 是干嘛的。

---

## 7 · L4/L5 chrome 与重档浮层

| 编号   | 组件               | 文件                                           | 职责                     | 状态清单                                                                                          | 真机                   | 进度 |
| ------ | ------------------ | ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------- | ---- |
| **E1** | 顶栏               | `CanvasTopBar.tsx`                             | 贴边通栏玻璃             | 常态 · 保存中（spinner）· 0 节点（整理/保存禁用）· 窄屏（文字收起）                               | ✅ 常态 + 0 节点禁用态 | ⬜   |
| **E2** | 项目切换器         | `CanvasTopBar` 内 dropdown                     | 当前项目 + 切换 + 增删改 | 当前项目卡 · 重命名 · 删除 · 其它项目列表 · 无其它项目 · 新建 · 未保存                            | ✅                     | ⬜   |
| **E3** | 画布外观           | `CanvasAppearancePanel.tsx`                    | 底色 + 壁纸              | 无壁纸（色板 4 + 自定义）· 有壁纸（预览 + cover/contain + 透明度滑条 + 移除）· 恢复默认           | ✅ 无壁纸态            | ⬜   |
| **E4** | 左侧合体面板       | `CanvasLeftPanel.tsx`                          | 56 轨 + 240 内容         | 展开 · 收起（只剩轨）· 内容空（「画布还没有节点」）· 搜索有/无结果                                | ✅ 三态                | ⬜   |
| **E5** | 节点定位器         | `CastDock.tsx` + `CastCard.tsx`                | 按族分组的节点清单       | 分组头 + 计数 · 行（缩略图/图标 + 名 + 类型 + 「N 个引用」）· hover · 当前定位高亮 · 无缩略图占位 | ✅                     | ⬜   |
| **E6** | 工具胶囊           | `CanvasBottomDock.tsx`                         | 视图控制                 | 指针/抓手 二选一 · 缩放 ±/百分比/适应 · 关系线开关（按下/弹起）· 撤销/重做（可用/禁用）           | ✅                     | ⬜   |
| **E7** | MiniMap            | `CanvasMiniMap.tsx`                            | 全局位置                 | 0 节点=不渲染 · 有节点 · 视口框跟随                                                               | ✅                     | ⬜   |
| **E8** | 项目名对话框       | `ProjectNameDialog.tsx`                        | 新建 / 重命名            | 新建 · 重命名 · 空名校验                                                                          | ⬜                     | ⬜   |
| **F1** | 详情面板           | `node-detail/NodeDetailPanel.tsx` + 10 个 body | 档 2 重档面板            | 10 种 body（角色/背景/关键帧/镜头/散图/视频/视频合成/参考视频/音色/通用）× 有/无媒体              | ✅ 散图 body           | ⬜   |
| **F2** | 重编辑工作区       | `CanvasImageEditWorkspace.tsx`                 | 档 3 全屏改图            | 未打开 · 编辑中 · 运行中 · 失败                                                                   | ⬜                     | ⬜   |
| **F3** | Inspector（11 个） | `inspector/*.tsx`                              | 面板里的字段表单         | 每个 inspector 各自的空/有值/校验失败                                                             | ⬜                     | ⬜   |
| **F4** | 声音选择器         | `VoiceSelector.tsx`                            | 挑音色                   | 收起 · 展开 · 试听中 · 空                                                                         | ⬜                     | ⬜   |
| **F5** | Fish 音色库        | `FishVoiceLibraryDialog.tsx`                   | 外部音色库               | 加载中 · 有结果 · 空 · 失败                                                                       | ⬜                     | ⬜   |
| **F6** | 素材选择器         | `AssetSelectorDialog.tsx`（共享）              | 从素材库挑图             | 加载 · 有结果 · 空 · 已选                                                                         | ⬜                     | ⬜   |

**现场发现**

- **E4 收起态**：收起后是一条**从顶到底的 56px 纯白长条**，里面只有两个图标顶在最上面，下面 600px 全空——白条比画布还抢眼。
- **F1 详情面板**：右半栏三个 tab（素材库 / AI 生成 / Studio）**下面什么都没有**，一大片空白；左半栏只有一张图 + 一个「未分类」原生 `<select>`（原生下拉，和全站 shadcn Select 不一致）。
- **E1 顶栏**：右侧四个图标钮（外观 / 整理 / 保存 / ？）全是同一个灰度、同一个尺寸，读不出主次；「添加节点」纸色丸是唯一有重量的。

---

## 8 · L6 助手

| 编号   | 组件         | 文件                                 | 职责                 | 状态清单                                                                                                                                              | 真机             | 进度 |
| ------ | ------------ | ------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---- |
| **G1** | 助手把手     | `StudioNodeAssistantDock.tsx` 的 FAB | 收起时的入口         | ⚠**订正**：原记「收起（竖排「助 手」两字）」是把 bug 当成了设计 —— 那是 shrink-to-fit 被 0 宽包含块压成逐字换行，日文六字才暴露（§16.4，已修）· hover | ✅               | ✅   |
| **G2** | 助手 dock 壳 | `StudioNodeAssistantDock.tsx`        | 浮动卡（不挤舞台）   | 关闭 · 单栏（chat）· 两栏（chat + 剧本笺）· 移动端全幅底 sheet                                                                                        | ✅ 三态          | ⬜   |
| **G3** | 对话流       | `AssistantConversation.tsx`          | 消息列表             | 空态（引导句 + 3 chips）· 用户气泡 · 助手回复 · 长文折叠「展开全文」· 思考中 · 停止 · 失败                                                            | ✅ 空态 + 有对话 | ⬜   |
| **G4** | 提案卡       | `CanvasOpProposalCard.tsx`           | 助手要改画布前的确认 | 待确认（N 条 op）· 展开明细 · 已应用 · 已拒绝 · 应用中                                                                                                | ⬜ 需跑一次助手  | ⬜   |
| **G5** | 澄清卡       | `ClarifyingQuestionCard.tsx`         | 助手反问             | 待答 · 已答                                                                                                                                           | ⬜               | ⬜   |
| **G6** | 路由选择器   | `CanvasAssistantRouteSelector.tsx`   | 换模型               | 收起丸 · 展开（搜索 + 4 厂商 × 「未验证 你的 key」/「需要 API key」）· 已选                                                                           | ✅               | ⬜   |
| **G7** | 参考挑选器   | `CanvasAssistantReferencePicker.tsx` | 给助手喂节点         | 收起 · 展开 · 已选 N                                                                                                                                  | ⬜               | ⬜   |
| **G8** | 历史         | `CanvasAssistantHistory.tsx`         | 会话列表             | 空 · 有列表 · 当前项高亮                                                                                                                              | ⬜               | ⬜   |
| **G9** | 剧本笺       | `ScriptDocWorkspace.tsx`             | 大纲→镜头→节点 三段  | 步骤器 ①②③ · 精简/标准/完整 · 大纲空态 · 大纲编辑 · 镜头段 · 节点段 · 生成中 · 缺字段 chips                                                           | ✅ 大纲空态      | ⬜   |

**现场发现**

- **G3 助手回复不渲染 Markdown**：正文原样显示 `### 1) 角色与穿搭概述 (Overview)`——`###` 直接打在屏幕上。这是最扎眼的一条。
  - **2026-08-02 补**：同一个病根的**全站那一半已修**（另一条线，不含本条）。`src/components/ui/message.tsx` 的 `MessageContent` 原先套的 `prose` 是 prompt-kit 上游残留的死类——`@tailwindcss/typography` 本项目从未安装，`.prose` 在全部样式表里无定义，叠上 Tailwind v4 preflight 抹平 h1–h6 与 list-style，markdown 渲染出来标题列表全与正文同形。现已在 `src/app/globals.css` 落一份 `.message-md` 窄栏配方（尺度用 em 随调用方字号自适应；颜色全部从 `currentColor` 派生，因为实测 `--muted-foreground` 在浅色 `bg-primary/10` 上只有 3.80、`--border` 只有 1.01），并摘掉 `prose` / `not-prose` 两个死类。
  - **本条（画布侧）仍未做**，且**不复用**上面那份配方（域皮肤纪律）：`AssistantConversation.tsx` 至今是 `<p className="whitespace-pre-wrap">`，要改成走 `Markdown` 原语，并在 `canvas.css` 里另写一份作用域内的 `.canvas-md`。`.message-md` 可以当**尺度参照**，不要把它扩到 `.domain-canvas`。
- **G2 单栏时头部项目名被压成「新.」「AL…」**（`canvas-ui-redesign` 诊断 #4 记的就是它，仍在）；**切成两栏后同一个名字完整显示**——说明是单栏布局的宽度分配问题，不是文案问题。
- **G3 输入区**「应用前先询问」是一个没有开关外观的纯文字 + 回形针图标，读不出它是个可切换的选项。
- **G9** 三段步骤器 `① 大纲 › ② 镜头 › ③ 节点` 与下面的 `精简/标准/完整` 挨得极近，两组分段控件视觉同权。

---

## 9 · 未采集清单

> ⚠ 本节 2026-08-02 已重写。原表列的十几项在夹具建成后**全部拍到了**，留着会误导。

| 编号                                             | 情况                      | 怎么补                                                                                                                         |
| ------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **A3 启动骨架**                                  | ⬜ 唯一的「能拍但没拍到」 | 存活 <1s。给夹具的 route 加一层全局延迟，或在 `page.route` 里把首个文档请求拖慢                                                |
| **F3 各 Inspector**                              | ⚠ 部分                    | 11 个 inspector 长在详情面板里，F1–F1h 覆盖了它们的宿主，但没有逐个单拍                                                        |
| `VideoReferenceDetailBody` · `GenericDetailBody` | ✅ **已解**（2026-08-02） | 当时的判断「不是没拍，是产品侧进不去」是对的。两者分别在 §14（#28）与 §15.1 修掉；`composer`/`agent` 的兜底随 §15.2 删组件作废 |

其余全部已采，见 §12。

---

## 10 · 建议的修缮顺序（2026-08-02 按三条拍板重排）

原第 4 批「等视觉方向」**作废** —— 方向已定为保持原样，配色/材质不动。腾出的位置给新增的动效与响应式两轴。

| 批                                    | 内容                                                                                                                                                                      | 为什么这么排                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **批 1 · 纯错** ✅ 已实现待审         | #12 生成键点了不发请求 · G3 Markdown 不渲染 · C5 漏 generation id · D7/D2 空模型丸 · F1 详情面板右栏空白 · #25 有图卡没名字 · #26 空卡不能点选文件 · #28 两个 body 进不去 | 全是**功能性缺陷**，与皮肤无关，任何方向下都得修。**实现记录见 §14** |
| **批 2 · 信息层级**（改结构不改配色） | E4 白长条 ✅ · E1 顶栏无主次 ✅ · F1b 面板只填 1/3 ✅ · C1 十四个等权动作 ✅ · D1/D2 参数条 ✅                                                                            | 「谁该重谁该轻」，靠布局 / 尺寸 / 留白解决。**进度与两处订正见 §16** |
| **批 3 · 状态语言**                   | A7 五态共用一张灰白牌 · #2 假进度条 · #14 两套「生成中」语言 · B7 原生 video 控件 · B6 信息说三遍 · #16 选中环与失败边打架                                                | 现有 token 内重排编码强度，不新造颜色                                |
| **批 4 · 动效「丝滑」**               | 见 §13 —— 面板/浮层统一 150–250ms · 只动 transform/opacity · 布局连续不跳 · 精密控件禁惯性 · `prefers-reduced-motion`                                                     | 基准是 owner 指定的调研；**只用 `motion`，画布内禁 GSAP**            |
| **批 5 · 响应式**                     | 768 档两个 header 叠 + 左面板退化成空白长条 + 多一条 tab bar（#18–20）· 375 档 rail 占 23% + 卡与生成框溢出 + minimap 盖输入区 + 画布被关一半（#21–24）                   | 两个断点现在都不能用；证据齐（`@tablet` / `@mobile` 共 11 张）       |

---

## 11 · 采集工具链现状（2026-08-02）

owner 要求「文档需要图片并且标注」。本节记录为什么图**暂时还没进文档**，以及打通的路径 —— 这是可复用的基建，不只服务这一份台账。

### 11.1 实测：本机截不出可落盘的图

| 试过什么                                           | 结果                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-in-chrome `computer` + `save_to_disk: true` | **不产出文件**。`~/Downloads`、`~/.claude/downloads`、`~/.claude/chrome`、会话 `tool-results/`、全盘近 15 分钟内新图片，全部扫过，零命中。返回值里也没有路径字段 |
| Chrome 远程调试口（Playwright `connectOverCDP`）   | 9222 / 9223 / 9229 / 21222 **全部无监听** —— 本机 Chrome 不是带调试口起的，挂不上去                                                                              |
| Playwright + `e2e/.auth/user.json`                 | 那份 storageState 是 **2026-06-16** 的，早过期；重新生成受阻，见 11.2                                                                                            |

👉 结论：本轮那 30 张实况**只存在于会话里**，换个会话就看不到。

### 11.2 阻塞点：E2E Clerk 测试账号登不上

`e2e/auth.setup.ts` 用 `.env.local` 的 `E2E_CLERK_USER_*` 以密码策略登录一个专用测试用户。冷/热服务器各跑一次，**稳定复现同一失败**（热跑 32s，排除超时假象）：

```text
clerk.signIn() 没抛错 → 随后 goto('/en/studio') 被弹到 /en/sign-in
```

一次性探针（`e2e/_diag/`，跑完已删）分两步打出关键值。第一步确认「客户端就没登上」：

```text
CLERK_TESTING_TOKEN present: true            ← 测试令牌机制正常
clerk.signIn resolved without throwing       ← 没报错
after signIn: {"user":null,"sessionId":null} ← 但客户端压根没建出 session
cookies: __clerk_db_jwt, __client_uat        ← 只有匿名 client cookie，无 __session
```

第二步直接调 `Clerk.client.signIn.create({strategy:'password'})` 读原始返回，**根因就在这一行**：

```json
{
  "status": "needs_second_factor",
  "firstFactors": ["password", "email_code", "reset_password_email_code"],
  "secondFactors": ["email_code"]
}
```

### ✅ 根因：Clerk **Client Trust**（新设备验证），不是 MFA

⚠ 这条排查绕了三圈，前两个结论都是错的，过程留在这里当反面教材：
① 以为「实例开了 email MFA」→ 真机看 Multi-factor 页**三个策略全关**，`Require MFA` 也关且置灰；
② 以为「测试邮箱少了 `+`」→ 补上 `+clerk_test` 并确认邮箱 Verified，**结果一模一样**。

决定性证据来自 dump 整个 `signIn` 对象（只打印 status 是不够的）：

```json
{
  "_status": "needs_second_factor",
  "firstFactorVerification": {
    "status": "verified",
    "strategy": "password",
    "attempts": 1,
    "error": null
  },
  "supportedSecondFactors": [{ "strategy": "email_code", "primary": true }],
  "clientTrustState": "new",
  "createdSessionId": null
}
```

**`firstFactorVerification.status === "verified"`** —— 账号密码从头到尾都是对的。真正卡住的是 **`clientTrustState: "new"`**。

Clerk 官方文档：「Client Trust automatically requires a second factor when the user enters a valid password, hasn't enabled MFA, and is signing in from a new device.」它**不是 MFA**，住在 `Configure → Attack protection`，所以 Multi-factor 页面全关也不影响它。**Playwright 每次跑都是全新浏览器上下文 → 永远算「新设备」→ 永远被拦**，而 owner 自己的 Chrome 早就是受信客户端，所以人工登录一直正常 —— 这个不对称正是它难查的原因。

实例侧的配置也印证了「不是 MFA」（从 `Clerk.__unstable__environment.userSettings` 实读）：

```json
"email_address": {"used_for_second_factor": false, "second_factors": []}
"authenticator_app": {"enabled": false}
"backup_code": {"enabled": false}
"signIn.second_factor": {"required": false}
```

**已排除**：生产 key（实测 `pk_test_`）· 两把 key 跨实例 · 密码策略未开 · 用户不存在 · 密码不对 · MFA · 邮箱未验证。

### 两条修法

|                | A · 关 Client Trust                                                                        | B · 让 auth setup 自己过这道验证                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **做什么**     | Dashboard（**Development** 实例）→ `Configure → Attack protection` → 关掉 **Client Trust** | 改 `e2e/auth.setup.ts`：撞上 `needs_second_factor` 时 `prepareSecondFactor({strategy:'email_code'})` + `attemptSecondFactor({strategy:'email_code', code:'424242'})` |
| **为什么可行** | 实例隔离已确认，dev 改动不触碰生产                                                         | `+clerk_test` 邮箱在测试模式下验证码恒为 `424242`（Clerk 官方为自动化留的口子），所以不需要真收信                                                                    |
| **代价**       | dev 实例少一道新设备防护（用户库隔离、上限 100，风险可忽略）                               | 改一个已入库的 e2e 文件；且 clerk-js 新旧两套 API 并存（`prepareSecondFactor/attemptSecondFactor` vs `signIn.mfa.sendEmailCode/verifyEmailCode`），要按实际版本挑    |
| **附带好处**   | 一步到位，零代码                                                                           | 不削弱防护，且 CI 上也能跑                                                                                                                                           |

⚠ Client Trust 对 **2025-11-14 之后创建的 Clerk 应用默认开启**；文档没写这类应用能否关闭，需要在 Attack protection 页面实看。

### ✅ 已解决（owner 选 B，2026-08-02）

`e2e/auth.setup.ts` 两处改动，`auth setup` 项目 **3 passed**：

1. **补一段 Client Trust 处理**：`clerk.signIn()` 之后读 `signIn.status`，是 `needs_second_factor` / `needs_client_trust` 就
   `prepareSecondFactor({strategy:'email_code'})` + `attemptSecondFactor({strategy:'email_code', code:'424242'})` + `Clerk.setActive()`。
   用 legacy API 是实测决定的 —— 探针列过该 clerk-js 版本的方法表，`prepareSecondFactor`/`attemptSecondFactor` 存在，更新的 `signIn.mfa.*` 命名空间**不存在**。
   ⚠ 这条依赖 `E2E_CLERK_USER_EMAIL` 是 `+clerk_test` 形式（固定码 `424242` 只对 Clerk 保留测试邮箱有效），文件里已写死这个前提。
2. **超时 30s → 180s**：改完第 1 条后失败点前移到 `page.goto('/en/studio')`，纯粹是**已登录** studio 子树第一次现编译（`global.setup.ts` 暖的是未登录版，会被重定向走），不是登录问题。与 global setup 的 warm-up 同一档。

Client Trust 保持开启，dev 实例防护未削弱；CI 上同样能跑。

**实例坐标**（从运行中的 app 解 publishable key 得到，公开信息）：

| 项           | 值                                       |
| ------------ | ---------------------------------------- |
| Frontend API | `generous-muskrat-87.clerk.accounts.dev` |
| 实例类型     | Development（`pk_test_Z2Vu…`）           |

**修法**（owner 侧，Dashboard → 该 application → 切到 **Development** 实例）：

- `Configure → User & authentication → Multi-factor` → 关掉 **Email verification code**；
- 或保留实例级 MFA，只在 `Users → 该用户` 详情里移除它的二次验证。
- ⚠ 别把 owner 正式账号改成测试账号 —— 夹具脚本会往它的画布写数据。

验证：`npx playwright test --project="auth setup" --reporter=line` 绿即通，会写一份新的 `e2e/.auth/user.json`。

### 11.3 夹具的设计（✅ 已建成 —— `e2e/tools/canvas-ui-shots.mjs`）

`scripts/canvas-ui-shots.mjs`（或等价 Playwright project）：

- **不写库**：`page.route('**/api/node-workflow/projects**')` 拦截 —— GET 返回夹具项目，POST/PUT/DELETE 一律 200 空操作。画布状态的权威来源是服务端（`use-node-workflow.ts` §「Server hydration」：`serverProjects.length > 0` 时整体覆盖 localStorage），所以只拦这一个口就能完全接管，且测试账号的库一个字节都不动
- **夹具媒体**：`mediaUrl` 指向 `https://canvas-fixture.local/*.png`，同样用 `page.route` 从本地 PNG 兜底 —— 不往 `public/` 塞文件
- **按台账编号出图**：每个编号一条 `{ id, prepare(page), clip }`，落到 `docs/plans/assets/canvas-ui-2026-08-01/<编号>-<名>.png`
- **标注烤进图里**：截图前注入绝对定位的编号圆点 + 说明条，截完移除 —— 标注和图同源，不会漂
- **复用价值**：以后每个「修一处」都能一条命令出 before/after 对照图

夹具节点要覆盖的分派（`ImageNode.tsx` 已读实）：无 role + 无媒体 → `ImageSourceStarter`；无 role + 有媒体 → `LooseImageCard`；`character`/`background` → `IdentityCollectorCard`；`shot`/`frame`/`closeup` 有媒体 → `LooseImageCard`，无媒体 → `NodeMediaPreview`。

---

## 12 · 实拍图（夹具产出 · 2026-08-02）

全部由 `node e2e/tools/canvas-ui-shots.mjs` 一条命令产出，1600×900 @2x，**可重复跑**。
改完某一处再跑一次同编号即可出 after 图，与这里的 before 并排看：`node e2e/tools/canvas-ui-shots.mjs B2b`。

### L0 舞台底

**A0 · 画布全景**（所有场景摊开，看整体密度与 chrome 占屏）
![A0](assets/canvas-ui-2026-08-01/A0-canvas-overview.png)

**A4 · 空画布前门**
![A4](assets/canvas-ui-2026-08-01/A4-empty-guide.png)

**A8 · 成分栏 + 连线** —— 看点：镜1 卡顶的两个成分 chip（小林 / 深夜便利店）；⚠ **两条边渲染完全不同**（一条实心深墨、一条虚线浅灰），但它们是同一类「上游喂进来」的关系；⚠ 底部工具胶囊压住了生成框，minimap 压住了虚线边
![A8](assets/canvas-ui-2026-08-01/A8-ingredients-and-edges.png)

### L1 卡壳共用件

**A7 · 盖章徽标八态** —— 看点见 §3 的订正表：五个态共用同一张灰白牌；`running` 的媒体窗里有**假进度条**
![A7](assets/canvas-ui-2026-08-01/A7-status-badges.png)

### L2 节点卡

**B1 · 图片起步卡：空 / 生成失败** —— 看点：空态是虚线框 +「拖入即可上传」；失败态给了具体原因 + 重试（这条是做对的）
![B1](assets/canvas-ui-2026-08-01/B1-image-starter-empty-failed.png)

**B2 · 图片就绪卡**
![B2](assets/canvas-ui-2026-08-01/B2-image-card-ready.png)

**B2b · 图片卡选中** —— 同屏能看到 C1 近场能力条 + D1 生成框；⚠ **工具胶囊与 minimap 直接压在生成框上**
![B2b](assets/canvas-ui-2026-08-01/B2b-image-card-selected.png)

**B2c · 审核态卡边：待审 / 已打回**
![B2c](assets/canvas-ui-2026-08-01/B2c-review-state-borders.png)

**B3 · 镜头族空态**（镜头图 / 关键帧 / 生成中）
![B3](assets/canvas-ui-2026-08-01/B3-shot-family-empty.png)

**B4 · 身份档案卡**（有代表图 / 无代表图）
![B4](assets/canvas-ui-2026-08-01/B4-identity-cards.png)

**B4b · 身份卡选中**（带「添加素材 / 出演·N」能力区）
![B4b](assets/canvas-ui-2026-08-01/B4b-identity-card-selected.png)

**B7 · 视频三族空态**（视频生成 / 参考视频 / 视频合成）
![B7](assets/canvas-ui-2026-08-01/B7-video-cards-empty.png)

**B10 / B10b · 音色卡（未选 / 选中）**
![B10](assets/canvas-ui-2026-08-01/B10-voice-card.png)
![B10b](assets/canvas-ui-2026-08-01/B10b-voice-card-selected.png)

### L4/L5 chrome

**E1 · 顶栏** · **E2 · 项目切换器** · **D8 · 添加节点菜单** · **E4 · 左侧面板** · **E6 · 工具胶囊**
![E1](assets/canvas-ui-2026-08-01/E1-topbar.png)
![E2](assets/canvas-ui-2026-08-01/E2-project-menu.png)
![D8](assets/canvas-ui-2026-08-01/D8-add-menu.png)
![E4](assets/canvas-ui-2026-08-01/E4-left-panel.png)
![E6](assets/canvas-ui-2026-08-01/E6-bottom-dock.png)

### 点开之后的态（第二批 · 2026-08-02）

owner：「节点扩大的 UI、模型的选择、所有按钮点击后的 UI」。

**C1a · 工具条 ⋯ 溢出**（8 项编辑能力：超分辨率 / 去背景 / 局部重绘 / 扩展画布 / 图层分解 / 提取元素 / 物体替换 / 风格迁移）
![C1a](assets/canvas-ui-2026-08-01/C1a-toolbar-overflow-menu.png)

**C1b · 分类下拉**
![C1b](assets/canvas-ui-2026-08-01/C1b-toolbar-category-dropdown.png)

**C5 · 快捷编辑面板** —— ⚠ 正文把原始 generation id 漏给用户
![C5](assets/canvas-ui-2026-08-01/C5-quick-edit-panel.png)

#### F1 · 节点「扩大」= 详情面板（五个族各一张）

**散图**（右半栏三个 tab 下面一片空白）
![F1](assets/canvas-ui-2026-08-01/F1-detail-panel-loose-image.png)

**角色档案** —— ⚠ 三处：内容只填了面板上方 1/3，下面 ~600px 全空；「角色卡库」是**原生 `<select>`**（全站其它地方用 shadcn Select）；**卡上那张代表图在展开后完全不显示**
![F1b](assets/canvas-ui-2026-08-01/F1b-detail-panel-character.png)

**镜头图**
![F1c](assets/canvas-ui-2026-08-01/F1c-detail-panel-shot.png)

**音色**
![F1d](assets/canvas-ui-2026-08-01/F1d-detail-panel-voice.png)

**视频生成**
![F1e](assets/canvas-ui-2026-08-01/F1e-detail-panel-video.png)

**背景档案** · **关键帧** · **视频合成**
![F1f](assets/canvas-ui-2026-08-01/F1f-detail-panel-background.png)
![F1g](assets/canvas-ui-2026-08-01/F1g-detail-panel-frame.png)
![F1h](assets/canvas-ui-2026-08-01/F1h-detail-panel-video-merge.png)

##### ⚠ 10 个 detail body 里有 2 个**从画布上进不去**

> ✅ **已修（2026-08-02）**：`VideoReferenceDetailBody` 见 §14（#28，加了上传能力区）；`shotText` 见 §15.1（加了编辑能力区 + 专属 body）。`composer`/`agent` 的兜底 body 随 §15.2 组件删除一并作废。下面这段保留为当时的诊断记录。

`NODE_DETAIL_REGISTRY` 一共 10 个 body。拍到 8 个，`VideoReferenceDetailBody` 与 `GenericDetailBody` 两个**拍不到，而拍不到本身就是结论**：

链路是这样断的 ——

1. `ToolbarCapabilityRegion` 的 switch **只有四个分支**：`seedance` / `videoMerge` / `voice` / `shot`。`videoReference`、`shotText`、`composer`、`agent` 都不在里面 ⇒ 能力区为 `null`。
2. `GenericSelectionToolbar` 在「既无能力区、又无媒体」时**整条工具条不渲染**（代码注释是有意为之：「⤢ 对着空卡没有可看的东西」）。
3. 没有工具条 ⇒ **没有「展开」按钮** ⇒ 详情面板无从进入。

| Body                       | 什么时候够不着                    | 影响                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VideoReferenceDetailBody` | 参考视频卡**没片时**              | ⚠ `registry.test` 原话说它是「the **upload** body for reference-video nodes」—— **上传面板在还没上传时打不开**。所幸卡本身另有上传入口（`useReferenceVideoUpload`），不是死路，但注册表配的那个面板在空态下等于不存在 |
| `GenericDetailBody`        | `shotText` / `composer` / `agent` | 这三类**永远**没有能力区也没有媒体 ⇒ 兜底 body 恒不可达                                                                                                                                                               |

「⤢ 对着空卡没有可看的东西」这个前提对图片族成立，对**参考视频**不成立 —— 那正是最该打开面板的时刻。

#### D · 生成框与它的每个下拉

**D1 · 生成框完整态**
![D1](assets/canvas-ui-2026-08-01/D1-generate-composer.png)

**D7 · 模型选择器展开** —— ⚠ 三处：**默认选中的「OpenAI GPT Image 2」在列表里标着「需要 API key」**（默认值指向一个用不了的 provider）；「需要 API key」重复五遍占满右侧，而**唯一可用的 Gemini 只有一个小绿点** —— 可用/不可用的编码强度反了；弹层向下越出生成框，盖住发送键与张数
![D7](assets/canvas-ui-2026-08-01/D7-model-picker-open.png)

**D1a · 比例 / 分辨率** · **D1b · 张数** · **D1c · 用模板**
![D1a](assets/canvas-ui-2026-08-01/D1a-aspect-dropdown.png)
![D1b](assets/canvas-ui-2026-08-01/D1b-batch-dropdown.png)
![D1c](assets/canvas-ui-2026-08-01/D1c-template-picker.png)

**E3 · 画布外观面板** · **G2 · 助手 dock**
![E3](assets/canvas-ui-2026-08-01/E3-appearance-panel.png)
![G2](assets/canvas-ui-2026-08-01/G2-assistant-dock.png)

#### GEN · 真实生成序列（owner 2026-08-02 授权「可以生成图片试一下」）

⚠ 这一条会**真的发请求、消耗测试账号额度**，所以在脚本里标了 `explicitOnly`，不进全量，只有显式 `node e2e/tools/canvas-ui-shots.mjs GEN` 才跑。

**结果本身就是一条缺陷**：在一张镜头图卡上点近场工具条的「生成」——

| 时刻          | 卡面                                        |
| ------------- | ------------------------------------------- |
| 点击前        | 空态（`□ 空` 徽标 + 图标 + 说明 + 魔杖钮）  |
| 点击后 2.5s   | **完全一样**                                |
| 点击后 3 分钟 | **完全一样**（两张 PNG 字节数一致：227157） |

服务端日志同一时间窗内**没有任何生成请求的 POST**，只有 `assistant/conversation` / `usage-summary` / `profile` / `api-keys` 这些 GET。

所以：**「生成」按钮是可点的**（脚本检查过 `isDisabled()` 为 false 才继续），点下去**没有发出任何请求**，卡面**没有任何变化**，事后**没有任何痕迹**。守卫在点击之后才判（这张卡没有提示词、也没有上游），反馈只有一个会消失的 toast。

![GEN-01](assets/canvas-ui-2026-08-01/GEN-generation-sequence-01-before.png)
![GEN-02](assets/canvas-ui-2026-08-01/GEN-generation-sequence-02-generating.png)
![GEN-03](assets/canvas-ui-2026-08-01/GEN-generation-sequence-03-timeout.png)

#### GEN2 · 换生成框主路径，真的跑通了一次

因为 GEN 那条根本没发请求，另开一条走主路径：空图片卡 → 打提示词 → 换模型 → 发送。这次**请求真的发出去了**，拿到了读码永远看不到的两态。

**发送前**（提示词已填、模型已换）
![GEN2-01](assets/canvas-ui-2026-08-01/GEN2-generate-via-composer-01-ready-to-send.png)

**生成中** —— ⚠ 卡**膨胀成约 980×980 的巨型白盒**（原空态卡约 460px），中间只有「生成中」三个字：没有 spinner、没有骨架、没有尺寸提示、没有取消。
⚠ 对照 A7：同一个产品里 **shotText 的生成中是 spinner + 进度条，图片的生成中是一个空白盒 + 三个字** —— 两套完全不同的「生成中」语言。
![GEN2-02](assets/canvas-ui-2026-08-01/GEN2-generate-via-composer-02-just-sent.png)

**失败** —— 原因给到了（「你的 API Key 无效或已过期」）+ 重试按钮，这部分是守规矩的。但 ⚠ 三条：卡**没有回缩**，仍是巨型白盒配一行小字；**蓝色选中环与红色失败边同时挂在同一张卡上**（看上下缘）；同一句话在**卡内和右下 toast 里说了两遍**。
![GEN2-03](assets/canvas-ui-2026-08-01/GEN2-generate-via-composer-03-failed.png)

> 失败本身是测试账号没有可用 key 导致的，不是产品缺陷；有价值的是**它把失败态的真实形态暴露了出来**。

##### ✅ 真实「出图」态已拿到（2026-08-02 晚）

owner 配好 key（图片 Gemini）并 `wrangler login` 后，我起了本地 execution worker（`npm run dev -- --port 8787`，R2 走 remote），GEN2 跑出 `生成结果：image` —— **真实链路端到端通了**，拿到一张深夜便利店的图。

![GEN2-04](assets/canvas-ui-2026-08-01/GEN2-generate-via-composer-03-image.png)

看点：

- 出图后卡按 1:1 收成约 550px，「替换」胶囊常驻在图中央（选中态）
- 右下 toast「节点素材已生成。」
- ⚠ **minimap 又压在生成框的参数条上** —— 与 B2b/A8 同一处 L3/L4 冲突，这次盖住的是审核按钮那一段

##### ⚠ 附带结论：生成框主路径出的图**没有**被标待审 —— 与包 6 ①-bis 的描述不符

光看截图判不出审核态（蓝色选中环会盖住 warn 边；参数条上的「打回」也不能作证，祖父条款下「查不到记录」本身就算 `approved`，照样渲染打回）。所以在夹具里加了一道确定性探针：出图后直接读 `LooseImageCard` 写在卡根上的 `data-status`。

```text
生成结果：image
出图后的 data-status：(无)
```

`(无)` 意味着 `resolveMediaReviewState` 解出的是 `approved` —— 也就是**这张图根本没有 `mediaReview` 记录**，`markMediaAwaitingReview` 在这条路径上没跑。

**这与 [`canvas-review-grid-2026-08-01.md`](canvas-review-grid-2026-08-01.md) §3 ①-bis 的描述冲突**，那里写的是「❌ 不区分触发来源。`markMediaAwaitingReview` 在 `StudioNodeWorkbench` 的 **4 处生成成功路径**上无条件调用（1068 / 1615 / 1884 / 2872）」，并据此把「来源区分」定为包 6 的**前置片 1**。

⚠ 我这次只走了**一条**路径（空图片卡 → 生成框打提示词 → 发送，即 `handleRunGenerateComposer`），所以准确的说法是：**至少生成框主路径没有标待审**。包 6 片 1 开工前值得先把四个调用点逐个验一遍 —— 如果主路径本来就不标，片 1 的范围和必要性都要重估。验法就是上面这个：夹具里生成一次，读 `data-status`。

##### 前置：本地 execution worker（记录备查）

owner 2026-08-02 给测试账号配了 key（文本 DeepSeek / 图片 Gemini / 视频 Gemini Omni）后重跑，失败点前移了一层：

```text
POST /api/studio/generate 502
"error":"Execution worker dispatch failed: fetch failed"
```

图片生成要派发给**本地 execution worker**（`workers/execution`，`EXECUTION_WORKER_BASE_URL=http://127.0.0.1:8787`），而它没起。起它的前置是 Cloudflare 登录：

- `workers/execution/wrangler.jsonc` 的 R2 绑定是 **`remote: true`**，注释写明「Local wrangler dev must write to real R2 so CDN URLs saved by Next.js resolve to objects that actually exist」，所以 `wrangler dev` 走 remote 模式，未登录直接报 `You must be logged in to use wrangler dev in remote mode`。
- **不要用 `--local` 绕**：那样 R2 是本地模拟，出图 URL 指向 `cdn.anteisuba.com` 上不存在的对象，卡上是一张裂图 —— 当「出图态」的台账图没有意义。
- 解法：在 `workers/execution` 下 `npx wrangler login`（一次 OAuth），之后 `npm run dev -- --port 8787`。

跑法：`cd workers/execution && npx wrangler login`（一次 OAuth），然后 `npm run dev -- --port 8787`，`/health` 返 200 即通。

#### 助手线（mock `/api/studio/node-assistant`）

助手回复是**纯文本流**，op 提案用 `[[canvas-ops]]…[[/canvas-ops]]` 包在正文里，所以 mock 只要 fulfill 一段文本 —— 脚本里的 `ASSISTANT_REPLIES` 就是这个。**不真跑的理由**：真回复每次都不一样，截图无法复现，而且花钱。

**G3 · 助手回复（markdown）** —— 这张就是为了照出「markdown 不渲染」那条
![G3](assets/canvas-ui-2026-08-01/G3-assistant-reply-markdown.png)

**G4 · op 提案卡**（5 条 op：建角色 / 建场景 / 建镜头 / 两条连线）
![G4](assets/canvas-ui-2026-08-01/G4-assistant-op-proposal.png)

**G5 · 反问澄清卡**（mock `/api/studio/node-script-doc` 返回 questions 而不是大纲）
![G5](assets/canvas-ui-2026-08-01/G5-clarifying-questions.png)

**G9 · 剧本笺两栏工作区**
![G9](assets/canvas-ui-2026-08-01/G9-scriptdoc-workspace.png)

#### F2 · 重编辑工作区 · F4 · 声音库

**F2**（从工具条溢出菜单的「局部重绘」进）
![F2](assets/canvas-ui-2026-08-01/F2-image-edit-workspace.png)

**F5 · Fish Audio 声音库** —— ⚠ 加载态是**一个居中转圈占着约 700px 空白**，没有骨架；底部「已选择」在解析不到名字时**直接显示原始 voiceId**（与 C5 漏 generation id 同类）
![F5](assets/canvas-ui-2026-08-01/F5-fish-voice-library.png)

#### 状态补拍（owner 2026-08-02「先补状态」）

前两轮基本只拍到默认态与选中态。这一轮专门补台账「状态清单」列里点了名、但一直没有实拍的那些。

**C4 · 真正的待审态 = 通过 + 打回两个键** —— 此前只拍到 approved 下的「打回」单钮（祖父条款让「查不到记录」也算 approved），两个键同时在的样子第一次拍到
![C4](assets/canvas-ui-2026-08-01/C4-review-buttons-awaiting.png)

**B7b · 视频族的生成中 / 失败** · **B10c · 声音族的生成中 / 失败** —— 此前只验过图片族和 shotText，这两族的同名状态第一次有据
![B7b](assets/canvas-ui-2026-08-01/B7b-video-running-failed.png)
![B10c](assets/canvas-ui-2026-08-01/B10c-voice-running-failed.png)

**A1b · 带壁纸的画布底**（`canvasAppearance` 走夹具数据；⚠ 该字段是 `z.httpUrl()`，data URI 过不了校验，所以用假域名 + route 兜）
![A1b](assets/canvas-ui-2026-08-01/A1b-canvas-with-wallpaper.png)

**hover-only 的三处** —— 这些态在静态截图里永远看不到，必须专门停住鼠标：

- **B2d** 「替换」胶囊的 hover-only 那份（之前拍到的都是选中态带出来的）
- **A8b** 成分 chip hover → 露出 × 解绑
- **A9b** 端口 hover

![B2d](assets/canvas-ui-2026-08-01/B2d-replace-pill-hover-only.png)
![A8b](assets/canvas-ui-2026-08-01/A8b-ingredient-chip-hover.png)
![A9b](assets/canvas-ui-2026-08-01/A9b-port-hover.png)

**E4b · 左面板搜索无结果**
![E4b](assets/canvas-ui-2026-08-01/E4b-left-panel-no-results.png)

**G3b · 助手「思考中」** · **G3c · 助手请求失败** · **G4b · 提案卡「已应用」** · **E1b · 顶栏「保存中」**
（前两个靠把 mock 的回复延迟 25s / 返 500 停住；E1b 靠把项目写入接口延迟 20s，否则 spinner 一闪而过）
![G3b](assets/canvas-ui-2026-08-01/G3b-assistant-thinking.png)
![G3c](assets/canvas-ui-2026-08-01/G3c-assistant-error.png)
![G4b](assets/canvas-ui-2026-08-01/G4b-op-proposal-applied.png)
![E1b](assets/canvas-ui-2026-08-01/E1b-topbar-saving.png)

##### ⚠ 补状态时撞出来的一条实锤 bug：有图的图片卡**没有卡外名字**

A6b（卡名 hover 露铅笔）连试两个选择器都超时。看 B2d 才发现原因 —— **那张卡上方根本没有名字**：没有族图标、没有「散图就绪」、更没有铅笔。而 A7 的 shotText、A8 的镜头卡，名字都好好挂在卡外。

核实到根因，两行就能说清：

```css
.domain-canvas .canvas-card-label {
  position: absolute;
  bottom: 100%;
} /* 定位在卡框「外」 */
```

| 组件                                                | 卡根类             | 结果           |
| --------------------------------------------------- | ------------------ | -------------- |
| `NodeShell`（shotText / 空镜头 / 关键帧 / 身份卡…） | `overflow-visible` | 名字正常显示   |
| `LooseImageCard`（**所有有媒体的图片卡**）          | `overflow-hidden`  | **名字被裁掉** |

**影响面**：画布上每一张出了图的卡 —— 生成结果、上传的图、出了图的镜头/关键帧/特写 —— 全都没有名字。名字在数据里（左面板列得出「散图就绪」），只是画布上看不见。

**连带**：`EditableNodeLabel` 那个「点名字原地改名」的入口在这类卡上**够不着**。而 `NodeShell.tsx` 的注释写明，S4 加这个入口正是因为「近场工具条那份重复的改名输入被删掉后，有媒体的图片卡完全没有改名入口了」—— **修是修了，但在 `LooseImageCard` 上没落地**。

⚠ 别急着把 `overflow-hidden` 改成 visible：那个类是给「卡即媒体」的圆角裁切用的（`canvas-card--image-bounds`），直接翻会让图片溢出圆角。这条要真修得先想清楚裁切与标签怎么共存。

#### 补齐剩余表面（owner 2026-08-02「把那 9 个表面 + 4 类状态补完」）

**节点卡补两个族**：B5 有图的镜头卡 · B11 旧编排器 / planner

⚠ **2026-08-02 订正**：下面这张 B11 图**不是**「旧编排器长什么样」—— 夹具明确注入了 `n-composer` + `n-agent`，而图上是「0 个节点」+ 空画布前门。它拍到的是**这两类节点渲染不出来**（迁移在渲染前剥掉了）。这张图因此是 B11 去留的判据，不是它的外观档案。详见 §15.2。
![B5](assets/canvas-ui-2026-08-01/B5-shot-card-with-media.png)
![B11](assets/canvas-ui-2026-08-01/B11-legacy-composer-agent.png)

**C3 剩下两个能力区**（Seedance「生成视频」/ VideoMerge「合成」）· **C6 多选「合成 N 段」条**
![C3b](assets/canvas-ui-2026-08-01/C3b-capability-seedance.png)
![C3c](assets/canvas-ui-2026-08-01/C3c-capability-video-merge.png)
![C6](assets/canvas-ui-2026-08-01/C6-multi-select-compose-bar.png)

**D2 · 视频编排框（紧凑态）** —— ⚠ 这里的**模型丸同样是空的**，和图片框那条是同一个病
![D2](assets/canvas-ui-2026-08-01/D2-video-composer.png)

**D3 · @提及下拉** · **E8 · 项目重命名对话框**
![D3](assets/canvas-ui-2026-08-01/D3-mention-dropdown.png)
![E8](assets/canvas-ui-2026-08-01/E8-project-rename-dialog.png)

**F4b · VoiceSelector**（⚠ 它住在音色卡的**详情面板**里，不是独立弹窗；先前那张 `F4-voice-library` 其实是 **F5** Fish 音色库，文件名起错了）
![F4b](assets/canvas-ui-2026-08-01/F4b-voice-selector.png)

**助手 dock 剩下三件**：G6 路由选择器 · G7 参考挑选器 · G8 历史对话
![G6](assets/canvas-ui-2026-08-01/G6-assistant-route-selector.png)
![G7](assets/canvas-ui-2026-08-01/G7-assistant-reference-picker.png)
![G8](assets/canvas-ui-2026-08-01/G8-assistant-history.png)

**A5 · 拖入高亮** · **A9c · 端口「连接中」**（后者是按住端口拖出去不松手那一帧）
![A5](assets/canvas-ui-2026-08-01/A5-drag-over-highlight.png)
![A9c](assets/canvas-ui-2026-08-01/A9c-port-connecting.png)

**D4 · 管理素材抽屉** · **D6 · 运镜语法** —— ⚠ 两者都**不在**贴卡的紧凑视频框里（D2 那张只有 tab / 提示词 / 参数），要先「展开」进视频详情面板才有
![D4](assets/canvas-ui-2026-08-01/D4-reference-manager.png)
![D6](assets/canvas-ui-2026-08-01/D6-camera-grammar.png)

**F6 · 素材选择器**（身份卡工具条的「添加素材」）
![F6](assets/canvas-ui-2026-08-01/F6-asset-selector.png)

**A10a · 上传中（真百分比 + 取消）** · **A10b · 上传失败**
（拦的是预签名 PUT 那一步：延迟 25s 停在上传中，返 500 就是失败；真 R2 一个字节没碰）
![A10a](assets/canvas-ui-2026-08-01/A10a-upload-in-progress.png)
![A10b](assets/canvas-ui-2026-08-01/A10b-upload-failed.png)

##### ⚠ 又一条实读发现：空图片卡**只能拖，不能点选文件**

A10（上传中 / 上传失败）第一次按空态卡去触发，`setInputFiles` 超时。读码确认：**`ImageSourceStarter` 里一个 `type="file"` 都没有**，只有 `onDragOver` / `onDrop`。

所以那张写着「拖入即可上传」的空卡，字面意思就是全部意思 —— **点它不会弹文件选择器**。真正带 file input 的是 `LooseImageCard` 的「替换」。对没有拖拽习惯（或在触屏上）的用户，空卡等于没有上传入口。

#### 断点：768 平板 / 375 手机（`--tablet` / `--mobile`）

同一份清单换视口跑第二、三遍，文件名带 `@tablet` / `@mobile` 后缀。**两个断点都是坏的**，而且比调研文档记的「768–1023 是最丑区间」更严重 —— 375 也一样。

**768 平板 · 全景**
![A0-tablet](assets/canvas-ui-2026-08-01/A0-canvas-overview@tablet.png)

**375 手机 · 全景**
![A0-mobile](assets/canvas-ui-2026-08-01/A0-canvas-overview@mobile.png)

**375 手机 · 选中图片卡**
![B2b-mobile](assets/canvas-ui-2026-08-01/B2b-image-card-selected@mobile.png)

其余断点图：
![E4-tablet](assets/canvas-ui-2026-08-01/E4-left-panel@tablet.png)
![D1-tablet](assets/canvas-ui-2026-08-01/D1-generate-composer@tablet.png)
![F1-tablet](assets/canvas-ui-2026-08-01/F1-detail-panel-loose-image@tablet.png)
![G2-tablet](assets/canvas-ui-2026-08-01/G2-assistant-dock@tablet.png)
![B2b-tablet](assets/canvas-ui-2026-08-01/B2b-image-card-selected@tablet.png)
![D1-mobile](assets/canvas-ui-2026-08-01/D1-generate-composer@mobile.png)
![G2-mobile](assets/canvas-ui-2026-08-01/G2-assistant-dock@mobile.png)

⬜ **375 档拍不到的两张也是信息**：`E4`（左面板）与 `F1`（详情面板）在 375 下超时 —— 左面板挂着 `md:flex`，<768 **根本不渲染**；工具胶囊同样（`CanvasBottomDock` 注释原话「`md:flex` 保留——<768 不渲染完整画布是既有约定」）。所以 375 不是「布局挤」，是**画布本体被有意关掉了一半**，但顶栏、生成框、助手 FAB 仍然照渲。

### 覆盖对账（2026-08-02 收口）

台账定义 **59 个编号**，实拍 **88 张图**。差集逐条对过，**只剩一个真缺**：

| 编号                                     | 情况                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A3 启动骨架**                          | ⬜ **唯一真缺**。硬刷新后存活 <1s，夹具没做网络节流，抓不到。要拍得给 route 加一层全局延迟 |
| A2 连线                                  | ✅ 在 A8 / A0 里（无独立文件）                                                             |
| A6 卡外标签行                            | ✅ 在 A7 / A8 / B3 / B5 / B11 里；**它在有图卡上的「缺席」本身就是发现 #25**               |
| B6 关键帧 · B8 参考视频 · B9 视频合成    | ✅ 分别在 B3 / B7 / C3c 里                                                                 |
| C2 通用工具条                            | ✅ 在 B4b / B10b / C3b / C3c 里                                                            |
| C7 分类下拉                              | ✅ = C1b                                                                                   |
| D5 模板选择器                            | ✅ = D1c                                                                                   |
| E5 节点定位器 · E7 MiniMap · G1 助手把手 | ✅ 几乎每张图里都有                                                                        |
| F3 Inspector ×11                         | ⚠ 部分 —— 它们长在详情面板里，F1–F1e 覆盖了大部分，但没有逐个单拍                          |
| F5 Fish 音色库                           | ✅ 已把先前起错的文件名 `F4-voice-library` 改正为 `F5-fish-voice-library`                  |

### 这一轮实拍新暴露的问题（原先读码没看出来）

| #   | 编号         | 问题                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A7           | 八态里**五个共用同一张灰白牌**，只有 `failed` 有色差 —— 「等着跑 / 跑完了 / 过期 / 停用」四件不同的事长得一样                                                                                                                                                                                                                                |
| 2   | A7           | ~~`running` 的媒体窗里有**进度条**，与「禁止假造」相反~~ **⚠ 2026-08-03 推翻，见 §17.1**：那条是**不定式扫光**（38% 固定宽块 1.2s 循环平移），不携带也不接收百分比、无 `aria-valuenow`；`canvas.css:220-222` 注释自陈「A real percentage needs backend progress events」——是**遵守**而非违反那条禁令。**此项不修**                           |
| 3   | A7           | 徽标文案是片场隐喻（待拍/拍摄中/已收/过期/停用），`NG` 是唯一的英文缩写，不同族                                                                                                                                                                                                                                                              |
| 4   | A8           | 同一类「上游喂进来」的关系，**两条边一实一虚、一深一浅**                                                                                                                                                                                                                                                                                     |
| 5   | B2b · A8     | **底部工具胶囊和 minimap 直接压在生成框上** —— L3/L4 抢同一块屏底空间                                                                                                                                                                                                                                                                        |
| 6   | E6 · E4      | **「适应画布」不把浮在上面的 296px 左面板算进去** —— fit 完最左边的节点被面板盖住、点不着。这条是拍摄脚本连着踩两次踩出来的（F1e 与生成序列都因此超时），不是推测                                                                                                                                                                            |
| 7   | D7           | **默认选中的模型（OpenAI GPT Image 2）在列表里标着「需要 API key」** —— 开箱即用的默认值指向一个用不了的 provider                                                                                                                                                                                                                            |
| 8   | D7           | 可用/不可用的**编码强度反了**：不可用的五个各写一行「需要 API key」，唯一可用的 Gemini 只有一个小绿点                                                                                                                                                                                                                                        |
| 9   | D7           | 模型弹层向下展开、越出生成框边界，盖住发送键与张数；且这一层只有厂商名，看不到任何模型名，要再点一层 `>`                                                                                                                                                                                                                                     |
| 10  | F1b          | 详情面板里的「角色卡库」是**原生 `<select>`**，与全站 shadcn Select 不一致（F1 散图的「未分类」同病）                                                                                                                                                                                                                                        |
| 11  | F1b          | 角色详情面板**内容只填了上方 1/3**，下面约 600px 全空；且**卡上的代表图在展开后完全不显示**                                                                                                                                                                                                                                                  |
| 12  | GEN · C3     | **近场工具条的「生成」按钮可点，但点下去不发请求、卡面零变化、事后无痕**。守卫在点击之后才判，反馈只有一个会消失的 toast —— 用户无法判断自己到底点没点上。服务端日志实证：同窗口零 POST                                                                                                                                                      |
| 13  | GEN2 · A10   | **图片的生成中 = 一个约 980×980 的空白盒 + 「生成中」三个字**（原空态卡约 460px，一发起就膨胀一倍）：无 spinner、无骨架、无取消                                                                                                                                                                                                              |
| 14  | GEN2 · A7    | 承上：**shotText 的生成中是 spinner + 进度条，图片的是空白盒 + 三个字** —— 同一产品两套「生成中」语言，且其中一套还带假进度                                                                                                                                                                                                                  |
| 15  | GEN2         | 失败后**卡不回缩**，仍是巨型白盒配一行小字                                                                                                                                                                                                                                                                                                   |
| 16  | GEN2 · B2    | ~~蓝色选中环与红色失败边同时挂在同一张卡上，两个环打架~~ **⚠ 2026-08-03 推翻，见 §17.1**：两者落在**正交属性**上（选中=`box-shadow`@canvas.css:730，失败=`border-color`@canvas.css:733），层叠里碰不到；`NodeShell.tsx:426` 注释写明「原来的 ring + border 组合去掉，避免和 canvas-card 的 box-shadow 打架」——**打架是过去时**。**此项不修** |
| 17  | GEN2         | 失败原因在**卡内和右下 toast 里各说一遍**，同一句话重复                                                                                                                                                                                                                                                                                      |
| 18  | 768 平板档   | **两个 header 叠在一起** —— 一条「工作台」标题栏压在画布顶栏上，画布顶栏（项目名 / 添加节点 / 桌面）被冲淡到几乎不可见                                                                                                                                                                                                                       |
| 19  | 768 平板档   | **左面板退化成约 100px 宽、从顶到底的空白长条**，只有顶部两个图标，下面约 1600px 全空 —— 桌面那条「白长条」在这里被放大到极致                                                                                                                                                                                                                |
| 20  | 768 平板档   | **底部多出一条移动端 tab bar（创作 / 画廊）**，与画布工具胶囊上下叠着；画布本体只剩右侧一小块                                                                                                                                                                                                                                                |
| 21  | 375 手机档   | **全局左 rail 仍占 88px（屏宽的 23%）**，十个图标竖排照渲，没有为窄屏收起                                                                                                                                                                                                                                                                    |
| 22  | 375 手机档   | **节点卡与生成框都溢出屏幕右缘被裁**；模型丸截断成「OpenAI GPT Im…」                                                                                                                                                                                                                                                                         |
| 23  | 375 手机档   | **minimap 浮在生成框正中央**，把提示词输入区盖住                                                                                                                                                                                                                                                                                             |
| 24  | 375 手机档   | 画布本体（左面板 / 工具胶囊）按 `md:` 门槛**被有意关掉**，但顶栏、生成框、助手 FAB 仍照渲 —— 「关一半」比「不给」更难用：看得到入口，用不了画布                                                                                                                                                                                              |
| 26  | **B1 · A10** | ⚠ **空图片卡只能拖、不能点选文件** —— `ImageSourceStarter` 没有任何 `type="file"`，只有 `onDragOver`/`onDrop`。「拖入即可上传」字面就是全部：点它不弹文件选择器。没有拖拽习惯或在触屏上，空卡等于没有上传入口                                                                                                                                |
| 27  | D2           | 视频编排框的**模型丸同样是空的** —— 与图片框 D7 那条同源，不是个例                                                                                                                                                                                                                                                                           |
| 28  | **F1 · C2**  | ⚠ **10 个 detail body 里 2 个从画布上进不去**。`ToolbarCapabilityRegion` 的 switch 只覆盖 seedance/videoMerge/voice/shot，其余类型无能力区；`GenericSelectionToolbar` 又在「无能力区且无媒体」时整条不渲染 ⇒ 没有「展开」。受影响：**空参考视频卡**（而它的 body 恰恰是上传面板）与 `shotText`/`composer`/`agent` 的兜底 body                |
| 29  | D4 · D6      | 「管理素材」「运镜语法」**不在贴卡的紧凑视频框里**，必须先展开进详情面板 —— 紧凑态只有 tab / 提示词 / 参数                                                                                                                                                                                                                                   |
| 25  | **A6 · B2**  | ⚠ **所有有媒体的图片卡都没有卡外名字** —— `.canvas-card-label` 定位在 `bottom:100%`（卡框外），而 `LooseImageCard` 的卡根是 `overflow-hidden`，把它整个裁掉；`NodeShell` 是 `overflow-visible` 所以正常。连带让「点名字改名」入口在这类卡上够不着 —— 而那正是 S4 为「有媒体的图片卡没有改名入口」加的修复                                    |

---

## 13 · 动效与响应式的验收条款（owner 2026-08-02 新增两轴）

把 [`UI丝滑交互与动效库选型-2026-07.md`](research/UI与设计/UI丝滑交互与动效库选型-2026-07.md) 翻译成本台账能逐条验的东西。**这不是新设计，是给「改一处审一处」加两列判据。**

### 13.1 库的硬规则（先立，免得越改越乱）

| 区域                                                  | 允许的库                                   |
| ----------------------------------------------------- | ------------------------------------------ |
| **画布 / Studio / LoRA / Assets / Prompts / ui 原语** | **只有 `motion`（framer-motion）**         |
| 首页营销域                                            | GSAP 允许，且必须动态 import、不进主 chunk |

⚠ 调研 §3.2 逐条否掉了「工程页引入 GSAP」：问题类型不匹配（工程页 90% 是状态驱动 UI）· 双运行时成本 · **GSAP 直接 tween DOM 会与 React Flow 自管的 transform 抢源** · ScrollTrigger 会破坏虚拟列表与 a11y。
⚠ gsap-skills 的 description 里写着「默认推荐 GSAP」——**那是厂商自荐话术，在本仓被显式覆盖**，别被带偏。

### 13.2 逐条判据（改任何编号时对照）

| 维度         | 判据                                                                                  | 怎么验                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **跟手**     | 拖 / 滚零滞后；指针事件直连 `transform`；不在 `scroll`/`pointermove` 里整树 re-render | Performance 面板看目标路径是否 60fps                                                                                                                                     |
| **时长统一** | 面板 / Sheet / Popover / 下拉展开 **150–250ms**，同一条 ease                          | 逐个量：C1a 溢出菜单 · C1b 分类 · D1a 比例 · D1b 张数 · D1c 模板 · D7 模型 · D8 添加菜单 · ~~E2 项目菜单~~（批 2 已删，项目管理搬进左面板）· E3 外观 · G6 路由 · G8 历史 |
| **布局连续** | 展开不「跳」——详情面板 F1–F1h、助手 dock 单栏↔两栏、左面板展↔收                       | 用 `layout` 动画 / FLIP；对照 §12 的对应图看有没有位移突变                                                                                                               |
| **合成层**   | 只动 `transform` / `opacity`，不动 width/height/top/left                              | 搜改动里的动画属性                                                                                                                                                       |
| **精确优先** | **参数旋钮 / 滑条禁止松手惯性**                                                       | E3 的透明度滑条、D1b 张数、视频参数条                                                                                                                                    |
| **画布视口** | pan / zoom 交给 React Flow 与浏览器，**不要外包一层库抢指针**                         | 别在 `.react-flow__viewport` 上挂第三方 tween                                                                                                                            |
| **克制**     | 主路径短、装饰少；尊重 `prefers-reduced-motion`                                       | `NodeDetailPanel` 已用 `useReducedMotion()`，是现成先例，其余照抄                                                                                                        |

### 13.3 响应式：两个断点现在都不能用

证据在 §12「断点」，11 张 `@tablet` / `@mobile`。要修的**不是「挤一挤」**，是四件结构问题：

1. **两层 header 叠着**（768）—— 全局「工作台」标题栏与画布顶栏同时渲染
2. **左面板在 768 退化成一条约 100px 的空白长条**，顶部两个图标、下面 1600px 全空
3. **底部同时有移动端 tab bar 和画布工具胶囊**，上下叠
4. **375 上画布本体按 `md:` 门槛被关掉一半**（左面板 + 工具胶囊不渲染），但顶栏、生成框、助手 FAB 照渲 —— **「关一半」比「不给」更难用：看得到入口，用不了画布**

📌 布局模式表（`响应式设计优秀实践调研-2026-07.md`）：compact <768 · cozy 768–1023 · comfortable 1024–1439 · wide ≥1440。**768–1023 被该调研点名是「当前最丑的区间」，本轮实拍坐实了。**

---

## 14 · 批 1 实现记录（2026-08-02，待 owner 审）

流程按 §0 拍板 3 走：先出 HTML 原型 [`prototypes/canvas-batch1-fixes.html`](prototypes/canvas-batch1-fixes.html)（每项 before/after + 落点 + 拍板点），owner 逐项点头后照着改 `src`。

### 14.1 owner 四条拍板（原型汇总页的问答）

| #     | 决定                                                                                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **#26 改方案**：不在空卡上加「选择文件」按钮 —— 原话「上传功能放入节点那边。右键最上面出现上传，下面是图片等节点」。即**添加菜单顶部主行改成真上传**（原来那行只是建一张空图片卡） |
| **2** | **D7 刀 1 取「工作台根挂 .dark 这个修复」** = 根治，不做最小止血                                                                                                                   |
| **3** | **刀 3 / 刀 4 全站统一**：`BaseModelPickerPanel` 是 studio-shared，LoRA / Studio 的同款选择器一并变（属行为统一）                                                                  |
| **4** | 三个小项按推荐：Seedance 顺手同治 · F1 其余 4 处原生 select 列后续片 · C5 方括号保留                                                                                               |

### 14.2 逐项改动与落点

| 项                            | 改法                                                                                                                                                                                                                                                                                                         | 落点                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **D7 刀 1**（配色地基，先做） | `.domain-canvas` 补一段**语义脊柱映射**（`--background/--foreground/--border/...` → `var(--canvas-*)`，做法同 `lora.css` 的 `.domain-lora`）；工作台根摘掉暗色时代遗留的 `dark` class + `colorScheme:'dark'`，改 `light`                                                                                     | `canvas.css` §15 · `StudioNodeWorkbench.tsx:446`                                                                          |
| **#25**                       | 卡根去 `overflow-hidden`，圆角裁切下沉到新类 `.canvas-card-media`（`calc(radius - 1px)` 免深色图四角露白弧）                                                                                                                                                                                                 | `LooseImageCard.tsx:307/397` · `canvas.css`                                                                               |
| **#26**（按拍板改方案）       | 添加菜单顶部主行 = **真上传**（弹系统文件选择器 → 在菜单打开处逐张建空图片节点 → File 走 `pendingPasteFilesRef` 交给 `ImageSourceStarter` 的单文件上传链，与画布级粘贴同一条路径）；「图片」空卡回到下方 image 分组                                                                                          | `CanvasAddMenu.tsx`（新增 `onUpload`）· `StudioNodeWorkbench.tsx` · i18n ×3 新增 `addCatalog.upload`                      |
| **#12**（含 Seedance）        | 守卫**前移到渲染期**：抽 `getMediaGenerateBlockReason()`（与 handler 判据同序：先 model 后 prompt），disabled + Radix Tooltip 说明原因；handler 的 toast 守卫**保留**当触屏兜底（助手 op 共用同一入口）                                                                                                      | `lib/node-workflow-prompt.ts`（新函数）· `CanvasImageSelectionToolbar.tsx`（`ShotGenerateButton` + `SeedanceCapability`） |
| **#28**                       | 新增 `VideoReferenceCapability`（上传/替换，与卡面钮同一条 `useReferenceVideoUpload` 通道）并注册进能力区 switch ⇒ capability 恒非空 ⇒ 空卡也有工具条 ⇒ ⤢ 可达 ⇒ 上传面板打得开。**owner 那条「无能力无媒体不渲染」的规则本身没动**。顺带把三处重复的 `ACCEPTED_VIDEO_MIME` 收敛成 `NODE_STUDIO_VIDEO_INPUT` | `CanvasImageSelectionToolbar.tsx` · `constants/node-studio.ts` · `VideoReferenceNode/Inspector`                           |
| **C5**                        | 读侧 `notModelId` 扩成 `notMachineValue`，加 generation id 三字段的**精确相等**守卫（判据纪律不变：绝不做「长得像 hash」的模式匹配）；写侧三处 `file.name` 落库前 `stripFileExtension()`                                                                                                                     | `lib/node-display-name.ts` · `StudioNodeWorkbench` / `ImageSourceStarter` / `NodeMediaInspector`                          |
| **G3**                        | 助手回复展开态改走 `Markdown` 原语 + 自定义 code/pre components；`canvas.css` 新写一份作用域内的 `.canvas-md`（**不复用** `.message-md`，域皮肤纪律；尺度照抄、颜色全部从 `currentColor` 派生）                                                                                                              | `AssistantConversation.tsx` · `canvas.css`                                                                                |
| **F1**                        | `NodeMediaInspector` 加 `defaultEditTarget` prop（默认 `null`，其余 5 个调用方零变化），散图 body 传 `'ai'` —— 右栏那片空白其实是**早就写好的生成表单被初始 null 藏着**；分类原生 `<select>` 换 shadcn Select（Radix 禁空串 value → 加 `NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID` 哨兵，落库映射回 `undefined`）  | `NodeMediaInspector.tsx` · `LooseImageDetailBody.tsx` · `constants/node-studio.ts`                                        |
| **D7 刀 2**                   | 默认模型从 `modelOptions[0]` 改「第一个**能真跑的**」，判据抽成 `isRunnableModelOption()`（= `useSplitModelOptions` 的 saved/platform 两桶），两处共用                                                                                                                                                       | `hooks/use-split-model-options.ts` · `GenerateComposer.tsx:313`                                                           |
| **D7 刀 3**                   | 厂商行编码强度**对调**：可跑侧升权（绿点 8px + 「平台免费额度」文案），缺 key 侧降到一枚静音钥匙图标（「需要 API key」已由第二步分组标题承担）。⚠ 只做减法不再调淡                                                                                                                                           | `BaseModelPickerPanel.tsx:314`                                                                                            |
| **D7 刀 4**                   | `avoidCollisions={false}` —— 既有 `max-h` 公式会把面板钳进上方空间内滚，恒向上、不再翻到下方盖住发送键                                                                                                                                                                                                       | `BaseModelPickerPanel.tsx:500`                                                                                            |
| 顺带                          | `CanvasRoutePicker` media 分支把 `triggerLabel` 显式映射成 `triggerEmptyLabel`（此前被 spread 静默丢弃，是个死 prop）                                                                                                                                                                                        | `CanvasRoutePicker.tsx`                                                                                                   |

### 14.3 验收证据

夹具重跑出的 after 图已覆盖同名 before（可用 `node e2e/tools/canvas-ui-shots.mjs <编号>` 复现）：
`D2`（模型丸从「白字白底只剩 ▾」变成可读的「Seedance 2.0 Fast」）· `D1` / `D7`（丸与兄弟同皮 · 默认 Gemini 带绿点 · 缺 key 只剩钥匙 · 弹层向上不盖发送键）· `B2` / `B2b`（卡外名字 + 像素读数 + 端口完整回来）· `D8`（菜单顶部「上传图片」）· `B7`（空参考视频卡有工具条了）· `G3`（Markdown 真渲染）· `F1`（右栏生成表单 + shadcn 分类下拉）。

新增/更新的测试：`CanvasImageSelectionToolbar.test.tsx` 24 项（+「缺前提即 disabled」+「空参考视频卡仍有工具条」）· `node-display-name.test.ts` 34 项（+ generation id 守卫 + `stripFileExtension` 8 例）· `CanvasAddMenu.test.tsx` 5 项（+ 顶部行走 `onUpload`）。

### 14.4 本批**没做**的（有意留下）

- F1 其余 4 处原生 `<select>`（Character / Background / ReferenceControls / ScriptDoc）—— owner 拍板列后续片，别混进本批
- `ImageSourceStarter` 那 5 个死 i18n 键（`uploadTitle`/`library`/`aiGenerate`/`libraryDialogTitle`/`libraryDialogDescription`）
- 空图片卡**仍然只能拖不能点** —— #26 按 owner 新方案改的是添加菜单，空卡本身的入口没动
- A3 启动骨架仍是唯一没拍到的编号（存活 <1s，夹具没做网络节流）

---

## 15 · 批 1 收尾：shotText 统一建模 + B11 退役（2026-08-02，待审）

这两条原本列在 §14.4 的「有意留下」里，owner 要求「把批 1 干净了再进批 2」，于是在同一轮做掉。**两条的调查都推翻了此前的记载**，先说结论再说改法。

### 15.1 shotText：不是「面板进不去」，是**建模错了**

调查（读码 + 实测）逐条核出来的事实：

| 字段          | 投影来源          | 改这一轮之前，谁能写它                                              |
| ------------- | ----------------- | ------------------------------------------------------------------- |
| `action`      | `shot.summary`    | 剧本笺可编 ✅                                                       |
| `camera`      | `shot.camera`     | 剧本笺可编 ✅                                                       |
| `scene`       | `shot.sceneLabel` | ❌ **只读** —— `script-doc-edit.ts` 的 `setShotField` switch 少一支 |
| `composition` | 恒写 `''`         | ❌ **ScriptDoc 里压根没这个概念**，却照样参与 prompt 拼接           |

所以「节点上不能编 = 有意设计（去剧本笺里改）」这个辩护**只成立一半**：四个字段里有两个谁都写不了，其中 `composition` 是一个**无人可写却会被送进模型**的死字段。加上卡面窗内恒走空态（`NodeMediaPreview` 对 text kind 不回显任何内容），用户连这一镜写了什么都看不到。

**owner 的判断（2026-08-02）**：

> 「思考一下可不可以一起做。因为是一种东西。助手这边只是自动生成，不用助手则用户手动输入然后生成」

这句话把问题从「两份数据怎么同步」改成了「一个数据模型、两个入口」。核实下来现有架构**早就为它留好了位置**：

- `scriptRef` 字段的注释原文就是 **“Absent on hand-added nodes”**（`types/node-workflow.ts`）
- 投影的孤儿清扫**只删有 `scriptRef` 的节点**（`node-workflow-script-doc.ts:517-523`），手工节点它根本不碰
- `sceneLabel` 在 ScriptDoc schema 里本来就有，只是写入端漏了

于是「覆盖」不需要豁免去绕 —— 它只是两份数据没对齐。

**落地的五件事**

| #   | 改动                                                                                                                                                  | 落点                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ①   | 能力区「编辑文本」→ 详情面板可达（与 #28 逐字同构，owner 的「无能力无媒体不渲染」规则**没动**）                                                       | `CanvasImageSelectionToolbar.tsx` `ShotTextCapability` |
| ②   | `setShotField` 放行 `sceneLabel` + `composition`                                                                                                      | `lib/script-doc-edit.ts`                               |
| ③   | `ScriptDocShotSchema` 加 `composition`（**必须 optional** —— 它嵌在 `NodeWorkflowStateDataSchema` 里，收紧会让存量项目在服务端读路径整体 parse 失败） | `types/script-doc.ts`                                  |
| ④   | **节点编辑回写 ScriptDoc** —— `syncShotTextPatchToScriptDoc`，落在 `updateNodeData` 里                                                                | `node-workflow-script-doc.ts` + `use-node-workflow.ts` |
| ⑤   | 加号菜单 + 助手 op 暴露 shotText（手动那条路的入口）                                                                                                  | `canvas-add-catalog.ts` · `node-assistant-ops.ts`      |
| ⑥   | 专属详情 body（registry 有条约定：菜单能建的类型不许落 `GenericDetailBody` 兜底）                                                                     | 新增 `node-detail/ShotTextDetailBody.tsx`              |
| ⑦   | 删死代码 `ShotTextInspector`（生产零引用的三行透传壳，只被一个测试当夹具养着）                                                                        | 测试改为直接渲染它包的 `NodeMediaInspector`            |

**④ 的落点为什么选在 `updateNodeData`**：`scriptDoc` 与 `nodes` 同在一个 state 对象上，一次 `setState` 就能原子更新两者；而且以后任何新增的编辑入口都自动一致，不必各自记得回写。

**两条路的对称**（这是整件事的验收标准）：

- 剧本笺起草 → 投影出的节点带 `scriptRef` → 在节点上编辑 → 回写 ScriptDoc → **再投影读到的是用户改过的值**
- ＋添加 菜单手工建 → 节点无 `scriptRef` → 字段就存自己身上 → **投影完全不碰它**

### 15.2 B11：那张实拍图拍到的是「它们不存在」

`assets/canvas-ui-2026-08-01/B11-legacy-composer-agent.png` 一直被当作「旧编排器长什么样」。实际上夹具（`canvas-ui-shots.mjs`）**明确注入了** `n-composer` + `n-agent` 两个节点，而截图上是顶栏「0 个节点」、左面板「画布还没有节点」、舞台中央空画布前门 —— `migrateRetirePlanner` 在渲染前就把它们剥掉了。台账 B11 行那句「⬜ 先确认是否还该存在」由此得到回答：**用户今天根本看不到它们**，`NODE_COMPONENTS` 里那两条是永不命中的死注册。

**owner 拍板：删组件层。** 已删 `ComposerNode.tsx`（49 行）+ `AgentNode.tsx`（163 行）+ 去注册 + 清两处死分支（`NodeCardControls` 的两个 case 与 `default` 完全同义；`StudioNodeAssistantDock` 的 agent 特判读的是三个**没有任何写入方**的幽灵字段）+ 三语各删 ~13 个死 i18n 键。

⚠ **enum 值与迁移垫片都保留**，而且这一轮把「为什么不能删」的承重警告**从 `migrate-planner.ts` 搬到了 `NODE_TYPE_IDS` 定义处** —— 这是调查点出的真正危险：组件删掉后那两个 enum 键看起来就像孤儿，而删它们的后果是 `z.array(NodeWorkflowNodeSchema)`（**没有逐项 `.catch()`**）整份 parse 失败 → `validateState` 兜成 `EMPTY_STATE` → 存量项目打开即空画布、静默无报错、下一次防抖写入把空状态持久化，**不可恢复**。这类节点至今仍躺在 DB 里（迁移是读路径垫片，没有一次性回填）。

### 15.3 真机验证

**F1j 是最硬的那张证据**。这条夹具用例当初就是为「验证进不去」写的，注释原文：「⚠ 预判可能拍不到：`GenericSelectionToolbar` 在『既无能力区又无媒体』时整条不渲染，而 shotText / composer / agent 正好都是这种 —— 那样就**没有「展开」按钮**，兜底 body 从画布上进不去。**拍不到本身就是结论**，别当成脚本坏了。」

现在它拍到了：面板打开，四个字段（场景 / 动作 / 镜头 / 构图）齐备，底部是新加的去向说明。

![F1j](assets/canvas-ui-2026-08-01/F1j-detail-panel-generic.png)

**D8 添加菜单**：「镜头文本」已进视频组（参考视频与视频合成之间），手动那条路有了入口。

![D8](assets/canvas-ui-2026-08-01/D8-add-menu.png)

⚠ 该用例的注释与 name（`detail-panel-generic`）需要在下一轮顺手更新 —— 它现在打开的是专属的 `ShotTextDetailBody`，不再是 `GenericDetailBody` 兜底。

### 15.4 测试

新增/改动：`node-workflow-script-doc.test.ts` 18 项（+5 条回写验收：四字段各写回对应 shot 字段 · 回写后再投影不被覆盖 · 手工节点不碰 doc · 非镜头字段不产生新 doc · 无 doc 时安全返回）· `CanvasImageSelectionToolbar.test.tsx`（shotText 从「不渲染工具条」改为「有编辑能力区」，并补一条 composer 用例继续守着 owner 那条不渲染规则）· `canvas-add-catalog.test.ts`（那条 “or manual shot text” 排除断言**反转**成 “exposes shot text so the manual path has an entry point”，并写清前提为何作废）· `registry.test.ts`（补 mock）· `NodeMediaInspector.test.tsx`（改为直接渲染宿主）。

---

## 16 · 批 2 进度（2026-08-03，待审）

owner 五条反馈**改了三处方案方向**，原型 v2 据此重画（`prototypes/canvas-batch2-hierarchy.html`）。已完成 3/5。

### 16.1 owner 反馈与由此产生的两处订正

| #   | owner 原话                                                                    | 影响                                                                                                        |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | 「E4 那边要不要加上一个项目管理。就是历史记录那种的。把顶部的迁移刀侧边栏来」 | **换方案**：我原提「把 600px 空柱子缩成 97px」是治标；owner 的解法是**给它内容**。填充率 6% → 约 85%        |
| 2   | 「打回要不要放在生成按钮附近。工具那一栏确保在一行」                          | 打回移到发送键旁（同属提交动作）；单行已验算：354 / 416 px，余 62                                           |
| 3   | 「E1 这边移出统一」                                                           | 项目切换 → 侧边栏 · 保存 → 片名旁 spinner · 添加节点 → 只留 rail 那颗                                       |
| 4   | 「D2 一起修」                                                                 | `12ss` 随批 2 修掉                                                                                          |
| 5   | 「F1b 角色面板应该不能生成，只负责收集」                                      | **换方案**：我 v1 原型画了「生成角色图」按钮是错的。`identityAssetsOnly` 砍掉 AI 表单**本来就对**，不该放开 |
| 6   | 「『＋』我感觉可以，顶部的『＋』可以去掉」                                    | rail 保留，顶栏移除                                                                                         |
| 7   | 「我发现日文这边跃出图标」                                                    | 新发现的真 bug，见 16.4                                                                                     |

**⚠ 调查报告有两处结论被实拍推翻，记在这里免得下一轮再信**：

- 调查说 F1b 要「补上注释里承诺的听觉身份区 + 出演区」—— 实拍确认**两个区块早就在**（`CharacterImageInspector.tsx:300+`）。那张实拍图之所以看着空，是因为夹具用的是**空角色卡**（参考图 0/3），不是内容被藏。
- 调查建议代表图「面板改用 `getNodePrimaryMediaUrl`」—— 方向反了。`IdentityCollectorCard.tsx:101` 的注释写明「图集是唯一事实源，mediaUrl 只是封面」，那个建模是对的。正解是给面板加**同款兜底**（图集为空时才并入主图），不是让它改读 mediaUrl 优先。

### 16.2 已完成三项

| 项            | 改法                                                                                                                                                                                                                                                                                                                                                    | 落点                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **F1b**       | 图集为空时把卡片主图并进陈列，走 `extraItems` 通道（只读、标来源），与卡面同源；`extraItems` 加 `badge` 字段（此前徽标写死「特写」，那时它的唯一来源确实只有 closeup）；角色卡库原生 `<select>` 换 shadcn（哨兵 `NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID`）。**AI 表单/上传区保持关闭**（owner：只收集）                                                  | `CharacterImageInspector.tsx` · `CharacterImageReferenceControls.tsx`                                  |
| **D2 `12ss`** | 摘要曾直接 `${data.duration}s`，助手写的 `'12s'` 因此成 `12ss`；那行还**绕过了整套解析**，`Number('12s')`=NaN 让滑条回落中位数 —— 摘要 / 滑条 / 真正发出去的值**三处互不一致**。改为共用已解析的 `durationSummary`，并把 `Number` 换成 `parseFloat`（`plan.duration` 是自由字符串，ScriptDoc 的 `targetDuration` 注释里给的例子就是 `"8s"`/`"12-15s"`） | `VideoComposer.tsx`                                                                                    |
| **E4 + E1**   | 新增 `CanvasProjectPanel`；左面板加 `view` 概念（班底架 / 项目），rail 第三个图标，点当前视图=折叠（activity bar 手感）；顶栏删项目下拉、保存、添加节点，项目名降为只读面包屑。**手动保存没有消失**——挪进项目面板「更新于…」旁的图标钮，自动保存失败时仍有路                                                                                            | `CanvasProjectPanel.tsx`（新）· `CanvasLeftPanel.tsx` · `CanvasTopBar.tsx` · `StudioNodeWorkbench.tsx` |

⚠ 项目面板做完后真机发现两处 240px 宽度问题，已在同轮改掉：`toLocaleString()` 的完整时间戳被截成「更新于…」（零信息量）→ 改「月/日 时:分」；「删除当前项目」文字挤扁重命名 → 收成红色图标钮，全文进 aria-label。

### 16.3 后两项（C1 · D1，2026-08-02 已做）

| 项          | 改法                                                                                                                                                                                                                                                                                                                                                               | 落点                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **C1**      | 常驻条重排成三组：**快捷编辑**（唯一常显文字，13px/600 + 软底）+ 类型专属动作 ｜ ⤢ ⬇ ｜ ⋯ 🗑。删除此前紧贴主动作，改到末组、由 ⋯ 隔开。**分类收进 ⋯**（属性不是动作，一张图只设一次却占最左带文字位；详情面板里本就有一份更全的，不会变成唯一入口）。溢出八条按 **`interaction` 字段推导**分三段：一键出结果 / 要在图上圈范围 / 要写一句话                         | `CanvasImageSelectionToolbar.tsx` · `canvas-ui-shots.mjs`（C1b 改路径）      |
| **D1**      | 参数条 `flex-wrap: wrap` → **nowrap**（owner「确保在一行」）。先减内容再锁 nowrap：**打回挪到发送键左邻**（−48px，加发丝线分组）+ **用模板收成图标**（−52px），414px 的内容降到 314px 才装得进 376px；只锁 nowrap 不减内容等于把折行换成裁切。窄屏兜底=模型丸是唯一可收缩项（自带 truncate），其余 `flex: none`                                                    | `GenerateComposer.tsx` · `GenerateComposerTemplatePicker.tsx` · `canvas.css` |
| **D2 三处** | 字号 10px→12px（同职责的图片框是 12px，`480p · 12s · 4:3` 全数字串在 10px 最难认）· 去掉 `max-width: 46%` 硬帽，改**按内容密度分工**（模型名截一半仍认得出、摘要截掉就丢一个字段 ⇒ 模型 `flex:1 1 auto` + `min-width:4.5rem` 吃富余也先吐出来，摘要 `flex:none`）· 字数计数搬出输入框（原 `absolute` 压在框内右下角，textarea 一滚正文就从它底下穿过去），9px→11px | `canvas.css` · `VideoComposer.tsx`                                           |

### 16.3b 拍 C1 时发现的两处（同轮修掉）

**① 200% 缩放下近场工具条压在卡外名字上。** `NodeToolbar` 的 `offset` 是**屏幕像素**（它故意不随缩放变），而要让开的卡外名字长在卡里、是**画布像素**。写死的 `offset={36}` 只在 100% 缩放对：200% 时名字实际占 48 屏幕像素，工具条就骑上去。与 #25「名字移出卡框」同批引入，**不是 C1 造成的** —— C1 把工具条改窄之后才露出来。修法 `offset = NODE_STUDIO_CARD_LABEL_LANE.height × zoom + toolbarGap`，zoom 取 `useStore(s => s.transform[2])`（平移只动 `[0]/[1]`，选到同一个数字不会重渲染）。

**② `LooseImageCard.tsx` 里 `MediaReviewButtons` 是死导入**（只 import 没用过），一并删。

### 16.5 owner 追加三条（2026-08-02，做 C1/D1 途中）

| 要求                           | 改法                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 「＋这个 css 样式也同步一下」  | 全画布三处墨底实底（左轨 ＋添加 · 助手唤起 · 生成框发送）此前**各写各的** —— 颜色 token 确实同源，但过渡属性、按下态、禁用态三样全不一致（只有发送键有 `:disabled`）。收成一份共享定义，三个类名保留各自的形状/尺寸                                                                                                                                                                                          |
| 「点击前后的过渡动画补充」     | ⚠ 在这之前 `canvas.css` 里**一条 `:active` 都没有**，按下到松手之间画面纹丝不动。主动作 `scale(0.94)`、chrome 幽灵钮 `scale(0.96)`，后者用容器级选择器（顶栏/底部胶囊/近场工具条/左面板）一条规则扫掉。⚠ 该选择器特异度 0,2,1 高于 Tailwind 的 `.transition-colors`，`transition` 必须把颜色一起写上否则会把原有颜色过渡覆盖没。`prefers-reduced-motion` 下整条按下态撤掉（时长压到 1ms 仍是可见的尺寸跳变） |
| 「右上整理画布加在底部编辑栏」 | 它重排的是**节点位置**，跟底部胶囊里的缩放/适应/关系线同属「看画布」，不是项目级 chrome（顶栏经 E1 瘦身后已回归纯 chrome）。落在关系线开关左邻；空画布禁用与顶栏原实现同判据；`onArrange` 未接线时的占位 toast 一并搬过去                                                                                                                                                                                    |

### 16.4 顺手修掉的日文 bug（owner 在日文版发现「图标跃出」）

助手 FAB 是 `absolute` 定位，而它的包含块 `.rail` 在收起态宽度是 **0**，于是 `lg:size-auto` 的 `width:auto` 走 shrink-to-fit 时可用宽度也是 0 —— 内容被压到最窄，**逐字换行**。

中文「助手」两字压成两行，看着像刻意的竖排 —— **台账 §8 的 G1 行一度就是这么记的**（「收起（竖排「助 手」两字）」），那其实不是设计，是同一个 bug 的中文表现。日文「アシスタント」六字才暴露成明显溢出：内容需要 67px 高，容器固定 40px。

修法：`whitespace-nowrap`。真机实测 62×40（内容 67，溢出）→ **122×40（内容 38，零溢出）**。

---

## 17 · 批 3 状态语言 —— 调查与拍板（2026-08-03）

原型：`docs/plans/prototypes/canvas-batch3-state-language.html`
调查方式：六路并行读码 + 三条对抗性复核（各自被要求**推翻**主张而非确认）+ 我在真浏览器里的确定性实测。

### 17.1 ⚠ 台账六条里有三条定性是错的

| 台账原话                             | 判定           | 实际                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#2** 假进度条                      | **推翻**       | 是**不定式扫光**：38% 固定宽块 1.2s 内 `translateX(-100%)→260%`，不携带也不接收百分比，无 `aria-valuenow`。`canvas.css:220-222` 自陈「A real percentage needs backend progress events」——**遵守**而非违反 `ImageCardMediaState.tsx:107` 那条禁令。画布里唯一带百分比的是**上传**，走 XHR 真实字节数且有回归测试锁着                           |
| **#16** 选中环与失败边打架           | **推翻**       | 两者落在**正交属性**上：选中 = `box-shadow: 0 0 0 2px`（canvas.css:730），失败 = `border-color`（canvas.css:733），层叠里碰不到。`NodeShell.tsx:426` 注释写明「原来的 ring + border 组合去掉，避免和 canvas-card 的 box-shadow 打架」——**打架是过去时**                                                                                       |
| **A7** 八态一张灰白牌，只认得出 idle | **推翻其推理** | 「只认得出 idle」是**设计意图**（`NodeStatusBadge.tsx:22` `idle → return null`，素卡=idle）。看不到别的态的真实原因是**这枚章在五族卡上被 `hideStatusBadge` 显式关掉**（IdentityCollectorCard / ImageSourceStarter / SeedanceNode / VoiceNode + NodeMediaPreview 的 `hideStatusBadge={isImageKind}`），今天只活在 video/audio/text 与详情面板 |

⚠ 这三条是同一类错误：把「看不出来」直接归因成「做得不好」，没查为什么看不出来。**#2 与 #16 照原样修会改坏东西，不做。**

### 17.2 真正的病（比记的那版更糟）

- **八态里只有五态可达**：`queued` / `stale` / `disabled` **全仓无 writer**，只活在 `node-types.ts:309-315` 的枚举里；`NodeStatusBadge.tsx:19` 的 `isQueued` 分支是死代码
- **`ready` 与 `done` 的 `STATUS_COLORS` 值逐字符相同**（`border-current text-node-foreground`）—— 语义相反的两个态同一枚章，只有文案差
- **`stale` 与 `disabled` 同上**（`border-current text-node-subtle`）
- **`running` 两重失效**：① `canvas.css:1635` 在 `.domain-canvas` 里把 `--node-paint` 从石绿 `#3e8c6c` 重映射成连线色 `--canvas-edge-active` `#2a2a2a`，徽标搭了这趟车 —— 与 ready/done 的 `#26231e` 对比 **1.09**，OKLCh 彩度 0.000 vs 0.010（均无彩色），ΔE-ok **0.029** = 真同色；而 `node-tokens.ts:137` 自己写着「进行中靠动效 + 石绿」 ② 剩下唯一的区分手段——那颗脉冲点——**不动**（见 §17.4）
- **徽标画在卡外、压在画布底上**（`.canvas-card-label` 是 `position:absolute; bottom:100%`），却继承 `.node-card-paper` 那套**按纸背 `#ebe5d8` 算过的**墨色。这是 stale/disabled 只有 **3.44** 的根因 —— `canvas.css:529` 给 `--canvas-ink-subtle` 的注释原话就是「只在卡背上用，别放画布底」

### 17.3 owner 拍板（2026-08-03，四问四答）

| 问                         | 拍板                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| ① done 还盖不盖章          | **不盖**。完成的证据是卡上那张图；`ready ≡ done` 这个 bug 恰恰说明多余的是 done                                                           |
| ② ready 由章说还是生成钮说 | **章保留但压到最轻**（详情面板那条链路上没有生成钮）                                                                                      |
| ③ 三个永不发生的态         | **枚举留着、编码不设专属档**，走中性兜底。⚠ 枚举值**不能删** —— 老项目 JSON 里可能存着，删了 Zod 解析整份失败（`NODE_TYPE_IDS` 同款教训） |
| ④ 章进卡内（把 S4 做完）   | ~~这一批一起做~~ → **2026-08-03 当日撤销，维持卡外**（理由见 §17.5）                                                                      |

强度梯度（判据 = 这个状态出现时用户需不需要停下来）：
`idle` 无章 → `done` 无章 → `ready` 最轻 → `running` 唯一带动效 → `failed` 唯一的红。

**running 用色（算过，禁目测）**：石绿 `#3e8c6c` 色相分离最好（ΔH 83°），但**作 12px 文字不达标**（3.59 底 / 4.06 卡，需 4.5）。故拆开用 —— **章文留墨色**（13.86 / 15.65），**信号交给会动的点 + 石绿描边**（图形只需 3:1，石绿 3.59 / 4.06 过）。既兑现 `node-tokens.ts:137` 的承诺又不牺牲可读性。

### 17.5 ⚠ ④ 当天就被撤销：章维持卡外

做完编码那一片之后回头看，④ 的**前提已经不成立**，另有两处原型没想透，owner 据此撤销：

1. **前提没了。** ④ 的理由是「不然颜色怎么调都是在错的底色上调」。但按三个底色预设
   （`#FFFFFF` / `#F4F4F3` / `#F1F1F1`）重算后，留用的色档最差 6.15 全部达标；那条 3.44
   不达标已经在编码这一片里换掉了。「错的底色」这件事本身已经解决。
2. **卡内更糟不是更好。** 卡内是纯媒体（规格 §12.1）。把章压在**用户的图**上，底色变成
   **不可知**（`canvasAppearance` 还能设背景图）；画布底至少是三个近白预设。
3. **挪进去会制造重复。** 图片族 / Seedance 的 `hideStatusBadge` **不是漏配** —— 它们的
   媒体窗已经在说状态了（生成中遮罩、失败原因 + 重试）。章挪进去 = 同一件事说两遍，
   正是发现 B6「信息说三遍」那个病。

⟹ 「**有媒体窗的族靠窗内说、没有媒体窗的族靠章说**」是**对的分工**，不是缺陷。
真正待统一的是两套窗内说法长得不一样 —— 那就是发现 **#14**，批 3 六条里唯一还完全成立的一条。
`NodeShell.tsx` 里那条「挪进媒体窗是 S4 的事」的旧注释已改成记录**为什么最终没挪**，
免得下一个人照着它再挪一次。

### 17.4 ⚠ 顺带挖出的全站 bug：`animate-pulse` 四个月没动过

查 running 那颗脉冲点时发现，**波及面远超画布**。

`globals.css:219` 在 `@theme inline` 里写 `--animate-pulse: pulse var(--duration) ease-out infinite` + 同名 `@keyframes pulse`，**同时盖掉了 Tailwind 内建的 utility 与 keyframe**。而 `--duration` 在任何 CSS 里都没有全局定义（唯一落点是 `ui/pulsating-button.tsx:108` 的内联 style），别处用到时 `var(--duration)` 属「计算时无效」，整条 `animation` 简写作废。

**真浏览器实测**（往 `localhost:3000` 页面插一个 `.animate-pulse` 读计算值）：

|                          | 修复前   | 修复后    |
| ------------------------ | -------- | --------- |
| `animationName`          | `"none"` | `"pulse"` |
| `animationDuration`      | `"0s"`   | `"2s"`    |
| `getAnimations().length` | `0`      | `1`       |

波及 **39 处 / 18 文件**，含 `ui/skeleton.tsx`（11 个消费方）与两个路由级 `loading.tsx` —— **全站骨架屏静止了约四个月**。追溯到 `757c083c`（2026-04-05「redesign Gallery page … pulsating load more」）。

⚠ 讽刺的是：那个覆盖是为 `PulsatingButton` 加的，而 **`PulsatingButton` 零消费方**。

修法 = 改名（`--animate-pulse-glow` / `@keyframes pulse-glow`），Tailwind 内建那条自动恢复。属**纯错**（批 1 类），单独提交单独验。

---

## 18 · #14「生成中」统一（2026-08-03）

原型：`docs/plans/prototypes/canvas-batch3-generating.html`

### 18.1 ⚠ 又一处订正：不是「两套」，是**一套遮罩配了四种器件**

台账原话「图片族是半透明白+扫光+文字（无条），视频族是**暗底**+脉冲图标+文字+扫光条」。
「暗底」那半句是错的：视频族用的 `bg-node-canvas/70` 里 `--node-canvas` 的值是
`#ffffff`（canvas.css:40），那也是**白遮罩**，只是 70% 而不是 82%。两族遮罩本来就同族。
真正分家的是中间那个动的东西，而且是**四种**：

|     | 落点                                            | 遮罩              | 动效器件                          |
| --- | ----------------------------------------------- | ----------------- | --------------------------------- |
| A   | `ImageCardGeneratingOverlay`（起步卡 / 散图卡） | 白 82% + blur 2px | 115° 扫光横扫                     |
| B   | `NodeMediaPreview` 图片 kind 无媒体             | **无**            | Spinner                           |
| C   | `NodeMediaPreview` 视频 / 音频 / 文本 kind      | 白 70% + blur 4px | Spinner **和** 扫光条（两个器件） |
| D   | `SeedanceNode`                                  | 白 70% + blur 4px | 脉冲 Film 图标 + 扫光条           |

四份并存的根因是**没有共享件** —— 所以这次先造一个（`NodeProgressState.tsx`），
再把四处都换成它。

### 18.2 owner 拍板（两问两答）

| 问                               | 拍板                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ① 器件选哪个                     | **不定式扫光条**。扫光的渐变峰值只有墨色 10%，压在 82% 白遮罩上非常弱，而生成动辄 30s+，长任务里用户会以为卡住 |
| ② 顺带把「上传中」纳入同一条轴吗 | **纳入**。上传走 XHR 真实字节数却只在文案里给数字、视觉上没有条（只有一个 `sr-only` 的 progressbar）           |

统一后的规矩：

- **器件恒定** —— 一条扫光条 + 一句文案，四个落点全用它
- **遮罩看情况** —— 底下有内容要遮（已有媒体 / 深窗）才上；空态不上
- **一条轴** —— 有真实百分比走**确定式**（宽度随进度），拿不到走**不定式**（38% 固定宽来回扫）
- 遮罩统一到 **82%** 而非 70%（70% 下深窗 `#1b1917` 透上来太多，文字压在半黑半白上），blur 统一 2px

### 18.3 顺带

- **文案也统一了**：同一个状态原本三种说法（`mediaNodes.generating`「生成中...」/
  `imageSourceStarter.generating`「生成中」/ `videoGeneration.generating`「正在生成视频...」），
  三语九处对齐到「生成中...」。模态名不进文案 —— 卡本身已经写着「视频生成」。
- **顺手治了一处 B6**：统一之后暴露出图片族窗内既有「↻ 生成中」角标、中央又写一遍。
  加 `labelShownElsewhere`（文案降 `sr-only`，读屏与进度条可访问名不受影响）。
  ⚠ 上传态**不**降级 —— 它的中央文案带百分比（「上传中 42%」）而角标只有「上传中」，
  那是多一档信息不是重复。
- **删了三个类**：`.canvas-image-upload-scrim` / `.canvas-image-generating-scrim` /
  `.canvas-image-upload-text`（后者的 `tabular-nums` 已移进新配方 —— 上传百分比每帧在变，
  比例数字会让整行左右抖）。
- **没动的两处**：`VideoComposer` 的监视器条（REC 角标 + 时码，是有意的另一套语言）；
  `VideoReferenceNode` 的参考视频上传（没有百分比，本来就是不定式条）。

### 18.4 夹具取景

`B7b` / `B10c` 的 running 卡在最左，展开态左面板正好压住 —— 同 A7，已加「先收面板」。

---

## 19 · B6 / B7（2026-08-03）—— 批 3 收尾

### 19.1 B6「信息说三遍」：真正重复的是两处，不是三处

台账原话：关键帧卡「徽标说空、正文说要干嘛、footer 又说等待关键帧设定」。
读下来三者里**正文说的是这个节点是干什么的**（与状态无关，不算重复）。真正重复的是
**徽标 vs footer** —— 而 footer 是**具体**的（「等待关键帧设定」告诉你缺什么），
徽标只是泛泛的「空」。

⟹ 撤掉泛的那个：`ImageCardStatusBadge` 的 `empty` 档整个不渲染
（`uploading` / `generating` / `failed` 三档照旧）。这也与 §17.3 刚定下的梯度同源 ——
**空 / idle 不盖章，因为空本身看得见**：空窗 + 虚线卡边（`canvas-card--dashed`）
已经是两层编码，第三层只是占掉一行。

⚠ 顺手修掉同一条 footer 的对比度：它用 `text-node-subtle` = `#8a8070`，对**白**卡背
只有 **3.89**，够不到 11px 文字的 4.5（就是 §17.2 判掉的那一档）。卡背早在 S1 被
`.canvas-card` 刷成 `#ffffff`，而这套墨色是按纸面 `#ebe5d8` 算的 —— 又一处
「颜色按纸背算、实际压白卡」的错位。改 `text-node-muted`（6.94）。

### 19.2 B7(a) 原生 `<video>` 控件：画布上早就有对的放法，只是没人共用

台账记的两条都成立：原生控件（灰底 mute 图标 / 原生进度条 / ⋮ 菜单）与其余卡语言
不搭；`videoThumbnailUrl` 缺席时窗里是纯黑。

⚠ 但这**不是**一个「要设计一套播放器」的活 —— `VideoReferenceNode` 一直是
**无 `controls` + 自带播放/静音钮 + `preload="metadata"`**，那正是卡上该有的放法。
只是 `SeedanceNode` 与 `NodeMediaPreview` 没用它，各自写了一份带 `controls` 的。
**又是「没有共享件」那个老毛病**（同 #14 的四份「生成中」、同 §18）。

抽成 `NodeVideoSurface`，三处共用。两个细节是有理由的，别顺手拿掉：

- **`preload="metadata"`** —— 这才是「首帧未加载是纯黑窗」的真正解。没有它浏览器
  可能一帧都不取，而 `poster` 不是每条生成链路都会写。
- **不给 `controls`** —— 原生控件在 400px 的卡上又挤又是另一套语言；卡内是纯媒体
  （规格 §12.1），完整播放/拖拽交给详情面板（⤢）。

### 19.3 B7(b) 卡名显示模型 id：守卫在，但两处绕过去了

`resolveNodeDisplayName` 里的 `notMachineValue` 守卫（批 1 的 C5 加的）专挡
「把模型 id / generation id 当人起的名字」。但：

| 落点                     | 原样                                             | 后果                                                                                  |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `SeedanceNode:115`       | `title={data.mediaLabel?.trim()}`                | **绕过守卫** —— 一张没被命名过的视频卡就叫 `seedance-2.0-fast-reference`              |
| `ImageSourceStarter:253` | `title={mediaLabel?.trim()}`（调用方递原始字段） | 同上，但**是潜在的**：空态起步卡没有 generationId，没有链路往它的 mediaLabel 写机器值 |

修法：两处读侧都接回 `resolveNodeDisplayName`；`SeedanceNode` 的写侧也从手写
`{mediaLabel, sourceLabel}` 换成 `buildDisplayNamePatch`（兜底分支写的就是这两个字段，
行为不变）。`ImageSourceStarter` 的 prop 从 `mediaLabel` 改名 **`displayName`** ——
就是为了让「把原始字段递进去」这件事不再看起来天经地义。

### 19.4 夹具补一张

⚠ 2026-08-03 之前夹具里**一张带媒体的视频卡都没有**，而 B7(a) 记的恰恰是有媒体时
那套控件 —— 那条发现当初根本验不了。新增 `B7c video-card-ready`
（`mediaUrl` 指假域名走 `page.route` 兜底，首帧走 `videoThumbnailUrl`；看的是控件
语言不是能不能播，所以不往仓库塞 mp4）。

---

## 20 · 批 4 · 动效（2026-08-03）

原型：`docs/plans/prototypes/canvas-batch4-motion.html`
方法：全部在真浏览器里读 computed style，不是读源码猜。

### 20.1 七条判据实测：五条本来就合规

| 判据         | 结论                 | 实测                                                                                                                                                                             |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 画布视口     | ✅                   | `.react-flow__viewport` 上零第三方 tween                                                                                                                                         |
| 库的硬规则   | ✅                   | 画布域内 GSAP **零命中**                                                                                                                                                         |
| 精确优先     | ✅                   | `ui/slider.tsx` 只有 `transition-[color,box-shadow]`，位置不带过渡 → 松手即停、无惯性                                                                                            |
| 克制         | ✅                   | `useReducedMotion()` 已用于 NodeDetailPanel / VideoComposer / ReferenceManagerPanel；CSS 侧另有 `globals.css:1728` 全局兜底                                                      |
| 合成层       | ⚠ 三处动尺寸但都有据 | `.node-canvas-panel-motion`（拖拽改宽，拖动时 `data-resizing` 关掉过渡好 1:1 跟手）· 顶栏给助手让位的 `padding-right` · 确定式进度条的 `width`。三者都非装饰性，且都用了动效基准 |
| **布局连续** | ✗                    | 左面板展/收 **完全没有动效**                                                                                                                                                     |
| **时长统一** | ✗                    | 三套词汇并存                                                                                                                                                                     |

### 20.2 时长统一：不是「某个下拉太慢」，是三套词汇并存

|                 | 时长                                          | ease                        |
| --------------- | --------------------------------------------- | --------------------------- |
| ① 全局 canon    | `.12 / .20 / .32s`                            | `cubic-bezier(.22,1,.36,1)` |
| ② 画布域        | `.15 / .25 / .42s`                            | `cubic-bezier(.4,0,.2,1)`   |
| ⚠ ③ shadcn 原语 | 下拉 150 · dialog 300/200 · sheet **500**/300 | **浏览器默认 `ease`**       |

⚠ 第三套**是没人选的** —— shadcn 模板自带的硬编码值。台账点名的 11 个表面里除画布自写的几个，
其余全落在这一套上，所以「同一条 ease」这条判据此前根本不成立：画布里的过渡走 `(.4,0,.2,1)`，
画布里弹出的下拉走 `(.25,.1,.25,1)`，两者贴在一起出现。`dialog` 里还藏着**第四条曲线**
（`ease-[cubic-bezier(0.16,1,0.3,1)]`，顺带违反 Hard Rule 5 的禁任意值）。

**owner 拍板 B**：保留两层（全局 canon 管通用 UI、画布 token 管画布专属），把第三套并进全局 canon。
六个原语（dropdown / popover / select / tooltip / dialog / sheet）统一挂 `duration-200 ease-standard`。
真机复核：六个全部读到 **0.2s / `cubic-bezier(0.22, 1, 0.36, 1)`**，与 `--duration-base` /
`--ease-standard` 逐位对上。

⚠ 用数字 `200` 而不是 `duration-base`：实测 Tailwind v4 只给 `--ease-*` 生成了具名工具类，
`--duration-*` 没有 —— 写 `duration-base` 会静默回落默认值。

### 20.3 左面板展/收：CSS 注释早就把这件事指给了这一批

实测 computed 是 `transition-property: all` / `duration: **0s**`，296↔56px 硬切。

`canvas.css:1550` 的注释记着为什么：「故意不写 `transition: width`，真机实测带上它这条过渡永远不
推进……展开/收起的动效属于动效那一片，**到时候用内容区的 opacity/transform 做，不要再回来给
aside 的 width 加过渡**」。owner 拍板②就按这条做：新增 `canvas-left-panel-reveal`（opacity +
translateX，画布域 base 档）。真机复核 `0.25s / cubic-bezier(0.4, 0, 0.2, 1)` ✓

⚠ 只做**进场**：内容区在收起时是条件卸载的（不是 hidden），退场没有时机可挂。

⚠ 订正：我在批 2 给 `CanvasLeftPanel.tsx` 写的「过渡仍由 `.canvas-left-panel` 的
`transition: width` 负责」是**错的**，与实测和 canvas.css 的注释都矛盾，已改。

### 20.4 owner 追加：「所有按钮的动效都要加上对应的，不可以直接打开」

画布上有 **7 处 React Flow `NodeToolbar` 浮层**，在这之前**全是瞬时挂载** —— 选中一张卡，
生成框「啪」地出现，没有任何从无到有的过程。owner 点名的「节点点击展开编辑」就是其中的
`GenerateComposer`。

新增共享件 `CanvasPopIn`（又是「没有共享件」那个老毛病的解法），七处全部接上：

| 浮层                                   | 方向         |
| -------------------------------------- | ------------ |
| `GenerateComposer` 生成框              | bottom       |
| `LooseImageCard` 近场工具条 / 快编面板 | top / bottom |
| `NodeShell` 通用近场工具条             | top          |
| `SeedanceNode` 侧车                    | right        |
| `VideoReferenceNode` 工具条            | top          |
| `VideoMergeComposeToolbar` 合成条      | top          |

⚠ **只做进场，不做退场**：`NodeToolbar` 的 `isVisible` 转 false 会直接卸载 children，
`AnimatePresence` 拿不到退场时机 —— 要做退场得改成自己接管挂载，会动到这块 chrome 与
React Flow 的配合方式，不在这一片里。而「不可以直接打开」这条要的正是进场。

⚠ 只动 `opacity` / `transform`，时长走 canon 的 `base` 档（200ms，落在 150–250 判据内），
曲线是全站唯一那条 `EASE_STANDARD`，`useReducedMotion()` 为真时时长归零。

---

## Last Verified

2026-08-01 · 真机 `localhost:3000/zh/studio/node`（Chrome，owner 账号，1568×744 视口）采到 30 个表面实况；读码覆盖 `components/business/node/**` 全部 85 个非测试 `.tsx` 的清单，其中 18 个逐行读过。
2026-08-02 · 截图工具链**已打通**：Clerk Client Trust 阻塞定位并修复（§11.2），`e2e/tools/canvas-ui-shots.mjs` 一条命令产出实拍图落盘到 `assets/canvas-ui-2026-08-01/`（§12），可重复跑、可出 before/after、可换断点（`--tablet` / `--mobile`）。

覆盖：舞台底 / 卡壳共用件 / 七族节点卡 / chrome · 五个族的**「扩大」详情面板** · **模型选择器展开** · **每个下拉与溢出菜单点开后的态** · **助手全线**（对话流 / op 提案卡 / 反问澄清卡 / 剧本笺，mock `/api/studio/node-assistant` + `/api/studio/node-script-doc`）· 重编辑工作区 · 声音库 · **真实生成端到端**（owner 授权 + 配 key + `wrangler login` 起本地 execution worker）· **768 / 375 两个断点**。

**覆盖已收口**：59 个编号 / 91 张图，差集逐条对过（§12「覆盖对账」）。真缺只剩 **A3 启动骨架**；另有 2 个 detail body 是**产品侧进不去**（发现 #28），不是没拍。

实拍新暴露 **29 条**读码看不出来的问题（§12 末表），另外：

- 订正了 §3 里关于 `done` 态的一处错误结论（我原先说「没有专属视觉」，实际有徽标「已收」）
- **发现包 6 ①-bis 的一个前提与实测不符**：生成框主路径出的图**没有**被标待审（`data-status` 实读为空）。包 6 片 1 开工前应逐个复验四个调用点

2026-08-02 晚 · owner 三条拍板落文（§0）：视觉方向**保持原样**（原「前置未决」解除）· 新增**动效 + 响应式**两轴（判据见 §13）· 设计载体改 **Fable 出 HTML 原型 → 照着改 `src`**。§10 修缮顺序据此重排为五批。

2026-08-02 深夜 · **批 1 八项全部实现并提交**（§14，commit `24a504e0`）。这是本文件第一次真的改 `src/**` —— 此前只动过 `e2e/`。流程走通了一遍完整闭环：HTML 原型 → owner 四条拍板（含把 #26 换成「添加菜单顶部真上传」）→ 改码 → 夹具重跑出 after 图 → 待 owner 逐项审。
⚠ 两条改动**溢出画布域**，审的时候要多看一眼：① `.domain-canvas` 的脊柱令牌重映射（刀 1）影响画布子树里**所有**吃脊柱令牌的共享组件；② `BaseModelPickerPanel`（刀 3/4）是 studio-shared，**LoRA / Studio 的同款模型选择器一并改变**（owner 已拍板接受，属行为统一）。
