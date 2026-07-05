# Node · 视频详情面板 UI 规范（v4 定稿）

> ⚠️ **部分取代**（2026-07-05）：本文档 **§7 部门条 / 参考素材分组** 已被 [`2026-07-05-video-shot-cast-redesign.md`](2026-07-05-video-shot-cast-redesign.md) 取代——参考素材改按**制作角色五卡**（角色/场景/镜头/动作/旁白），音色收进角色+旁白。**改参考素材区/prompt 编辑器先读那份**。本文档其余部分（监视器 C4、token 组件、封面工程 §9、动效 §6、字号/色彩规范）**仍然有效**，是那份重设计复用的基础。
>
> 对象：`/studio/node` 画布中视频（Seedance）节点的 ⤢ 详情面板（B3 浮层）
> 基线：Figma「Node \_ Video Detail v3」S1–S5 ＋ 线上代码 `main@230ca50`
> 关联文档：功能层问题清单见 [`2026-07-03-node-video-generation-review.md`](2026-07-03-node-video-generation-review.md)（F1–F8 / U1–U5），本文档只覆盖视觉规范、组件、交互、动效与封面图工程方案
> 状态：**定稿**。九轮反馈的完整讨论过程压缩在文末 §12「决策变更记录」，正文只写现在的结论，不穿插"owner 第几轮追问"叙事
> 权威线框：`svg/v4-final-assembled.svg`（骨架+语言融合定稿）＋ `svg/department-strip-workflow.svg`（部门条工作流）＋ `svg/prompt-reference-token.svg`（引用 token 组件）＋ `svg/motion-storyboard.svg`（动效故事板）

---

## 0. 范围、真源、功能不可丢清单

| 项                     | 位置                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| 面板容器 / 进出场      | `src/components/business/node/node-detail/NodeDetailPanel.tsx`                 |
| 视频详情体（全部功能） | `src/components/business/node/composer/VideoComposer.tsx`（density='detail'）  |
| 详情体分发             | `src/components/business/node/node-detail/registry.ts` → `VideoDetailBody.tsx` |
| 色彩 token             | `src/app/globals.css` `:root` 的 `--node-*`                                    |
| 动效 canon             | `src/constants/motion.ts` ＋ `globals.css` `--ease-standard / --duration-*`    |
| 面板宽度 token         | `--width-node-detail-panel-wide: 56rem`（视频节点专用宽版）                    |

**功能不可丢清单**（重构布局时逐条核对，来自 VideoComposer + Figma S1–S5）：
场记板信息（项目/镜头/版本/模式）· 预览播放 + TC · 参数 OSD（模型/分辨率/画幅/时长，点击任一段编辑）· 版本切换（F6）· 四个部门参考槽（选角/置景/动作/配音，单击插入 @、hover 删/禁用、拖拽排序、超限置灰⚠不静默丢、⊘手动换出）· 提示词（@token 插入、✨增强、运镜语法▾、⤢全屏编辑、来源提示回跳）· 负向提示词 · 模型两级切换（品牌/变体/供应商、needs-key → QuickSetupDialog、rebind 预览确认）· 时长滑杆＋自动 · 分辨率 chips · 画幅比例 tile · 同步音频开关 · 种子＋骰子＋锁定上次种子 · 生成按钮（禁用原因文案）· 错误条 · 空态（S2）· 移动端抽屉（S4）· 全屏编辑 overlay（S5）。

---

## 1. 现状问题（v1 六项诊断）

v1 的核心问题是「功能都在，但没有立起『导演监视器』这个概念」——全部元素都是同一灰度、同一密度的圆角矩形，无主次、无质感记忆点。

1. **场记板头部**：100px 高只放一行字段；标签 8px（letter-spacing 0.2em）低于可读下限。
2. **监视器太小**：430×242 只占 920×856 面板的 **13%**；OSD 参数条又叠在预览上互相挤压。作为视频节点，生成结果才是主角。
3. **版本条孤立**：左列底部三块灰 tile，无胶片语言；当前版本只靠 1.5px 描边区分。
4. **部门条同灰堆叠**：4 条 56px 灰条纵排，端口类型色只剩 3px 竖条；扫读时四条几乎不可分辨。
5. **命中区与字号**：✨增强/运镜语法按钮 19px 高（< 24px 最小命中区）；提示词正文 9px。
6. **CTA 太弱**：操作栏 100px 高，但生成按钮只有 100×29；同时整体缺少任何「电影/片场」的视觉记忆点——这就是「看着普通」的直接原因。

---

## 2. 视觉方向定稿：双栏骨架 + 监视器语言

三个方向曾逐一比较，最终定稿是 **B 双栏骨架为结构、A 导演监视器为语言皮肤**的融合；C 胶片场记的强视觉元素（齿孔胶片版本条、脚本行号 gutter、悬浮胶囊 CTA）留作 P2 增量单独吸收，不进 P0。

|            | A 导演监视器                      | B 双栏工作台                               | C 胶片场记                                   |
| ---------- | --------------------------------- | ------------------------------------------ | -------------------------------------------- |
| 核心动作   | 预览升为全宽 hero（888×420，46%） | 左创作 / 右参数双栏，对齐代码 56rem 宽版   | 监视器全出血 + 片场氛围（REC/波形/脚本行号） |
| 布局风险   | 低（单列顺序不变）                | 低（与 VideoComposer 现有 2 列 grid 同构） | 中（全出血需改容器 padding 逻辑）            |
| 开发成本   | 中                                | **最低**（重排现有控件）                   | 最高                                         |
| 视觉记忆点 | 强                                | 中                                         | **最强**                                     |
| 适合场景   | 以「看片」为主的迭代流            | 以「调参」为主的重度创作流                 | 品牌向、对外演示                             |

**定稿画面**：`svg/v4-final-assembled.svg` 是收敛后的唯一权威线框（双栏骨架 + 监视器语言 + OSD 修正 + 按下态反馈），作为 P0 实现的视觉基准；`compare-A/B/C-*.svg` 三张对比图只作决策记录保留，不再是待选项。

---

## 3. 共通设计规范

### 3.1 栅格与间距

- 间距只用 **4 / 8 / 12 / 16 / 24** 五档。面板 padding 16，区块间 gap 12（v1 是 14 —— 收敛到刻度上）。
- 面板宽 896px 内容区（= `--width-node-detail-panel-wide` 56rem − 2×16 padding），双栏 gap 16；单列满宽 888。
- 卡片内 padding：横 14–16、纵 10–12；圆角体系：面板 16 / 大卡 10–12 / 输入区 10 / 槽位 8 / 胶囊 999。
- 移动端（S4，390）：单列顺序 场记条 → 监视器 → 部门 → prompt → sticky；抽屉 padding 12，顶部把手 36×4。

### 3.2 字号层级（最小 10px）

| 角色               | 规格                        | Tailwind                                                              |
| ------------------ | --------------------------- | --------------------------------------------------------------------- |
| 区块标题           | 13/600                      | `text-sm font-semibold`                                               |
| 正文 / 提示词      | 12（行高 20）               | `text-xs leading-5`                                                   |
| 分组 label         | 10/600 大写 tracking 0.14em | `text-3xs font-semibold uppercase tracking-nav-dense text-node-muted` |
| 次要说明           | 10                          | `text-3xs text-node-subtle`                                           |
| TC / 版本号 / 计数 | mono，`tabular-nums`        | `font-mono tabular-nums`                                              |

v1 的 7–9px 全部升档；TC、REC、V03、镜号一律 mono——这是「片场仪器感」最便宜的来源。

### 3.3 色彩（只用现有 token，不新增色相）

- 面板层级：`--node-canvas #0b0b0a` → `--node-panel #1a1a1a` → `--node-panel-soft #202020` → `--node-panel-inner #2a2a2a`；层级靠明度不靠色相。
- 端口类型色（唯一的低饱和功能色）：选角 `--node-port-character #6f6a86` · 置景 `--node-port-background #5f7a73` · 动作/视频 `--node-port-video #647386` · 配音 `--node-port-voice #856a72`。用法：从 3px 竖条 → **4px 色轨 + @token 胶囊底（色 25% 透明度）**，让部门与提示词引用形成同色呼应。
- 绿色 `--node-success #10b981` 仍只属于生成按钮/增强（已批准例外）；REC 红用 `#e5484d`（= `--node-danger`，仅装饰性录制点 + 失败态）。
- 禁用/超限：内容 `text-node-subtle` + 槽位 40% 透明度 + ⚠ 徽标，保持「不静默丢」。

### 3.4 描边与阴影

- 描边一律 1px `--node-panel-inner`；选中/激活提亮到 `--node-edge-active`（= foreground），不加色。
- 面板阴影固定 `shadow-node-panel`（0 20px 60px rgba(0,0,0,.5)）+ `backdrop-blur-xl`；卡片内部不再叠阴影。

---

## 4. 组件规范（C1–C8）

**C1 场记板 → 44px 单行条**：左侧 3 道斜纹（场记板记号，`--node-foreground` 3px 线），项目 13/600、镜头 12 muted、版本 = mono 徽标 36×18、模式 11 muted；右端状态 LED（ready=绿点 / running=脉冲 / failed=红点）+ mono 状态词。信息零删减，高度 −56px。

**C2 部门条 → 2×2 卡片（436×64）**：4px 端口色轨、标题 12/600、副行「n 项引用」9px、右侧 40px 槽位 + 虚线添加位。超限态：第 10 张槽位置灰 + ⚠「不会发送」，卡片右上计数变 `10/9 ⚠`。**放文件与提示词引用的完整交互链路见 §7**。

**C3 参考槽 40–44px**：默认 `--node-panel-inner` 底 + 左下角标（图1/视1/音1）；hover 出现 删 / ⊘禁用 两个 20px 图标钮；拖拽排序时槽位跟手、落点显示 2px `--node-edge-active` 插入线。**缩略图内容按媒体类型有不同封面来源，见 §8/§9**。

**C4 监视器**：≥16:9，全宽；上下遮幅 30px `#050505`；四角取景框角标 1.5px `#4a4f5c`（inset 14）；左上 `A-03 · TAKE 03` mono 10；右上 REC 点（生成中才脉冲）+ `TC 00:00:42` mono 12。空态（S2）：无 TC，中央播放钮换为「生成后在此预览」10px subtle。

**C5 参数 OSD → 胶囊组 + 精确展开态**：OSD 是**摘要**不是唯一入口，摘要收窄视觉噪音，但编辑操作必须 1:1 还原现有控件，不能因为「进了 OSD」就阉割成简化版。收起态：20px 高胶囊组（`rgba(26,26,26,.92)` + inner 描边），模型/时长/分辨率/画幅比例四段各自可点；点击任一段展开为锚定弹层（复用现有 `.node-collapsible` 手风琴机制，非新交互）：

- 点模型段 → 现有两级切换器（品牌/变体/供应商 rail，含 needs-key 🔑 与 rebind 预览，原样不动）
- 点时长段 → 现有全宽滑杆 + 数值（如「10秒」）+「自动（由模型决定）」toggle，原样不动
- 点分辨率段 → 现有 480p/720p/1080p 三个 pill，原样不动
- 点画幅比例段 → 现有 6 个 tile（自动 + 16:9/9:16/1:1/4:3/3:4，每个按比例缩放的图标框，选中态描边加粗），原样不动
  同一时间只保留一个展开态，点新段自动收起上一个。
  **生成音频 + 种子不进 OSD 摘要**，在监视器下方另起两行常驻空间：生成音频始终可见单行（一个开关没有收纳必要，收纳反而多一次点击成本）；种子默认收起为可点摘要行「种子 · 随机」，点击展开为输入框 + 骰子按钮 + （有上次种子时）锁定上次种子提示行——收起态本身要在右列占一个可见入口，不能整体消失。

**C6 提示词区**：全宽大文本区，min-height ≈ 面板高 1/3，随内容自动增高，⤢ 全屏编辑承载完整长文本。@引用渲染为**内嵌真实缩略图的实体化 token**（不是纯色文字块），与左侧部门色一一对应，**完整组件设计见 §8**；工具钮（✨增强、运镜语法▾）升 26px；「来源提示 · 点击回跳」保留在容器底部（长文写作归助手，本区只做本镜头精修，改动剧本回助手、改本镜留面板）。

**C7 操作栏 → 60px**：场记摘要 11px muted 左置；按钮 140×40 圆角 10，文案「生成视频 ⌘↵」；禁用时按钮 `bg-node-panel-inner text-node-subtle` 且文案换禁用原因（无模型/无输入/生成中，与代码 `disabledReason` 一致）；按下态 `scale(0.98) + translateY(1px)`，`fast 120ms`，规则覆盖生成按钮 + 部门卡 + 槽位 + OSD 段 + tile/pill 全部可点元素（详见 §6/§11）。

**C8 版本条 → 胶片缩略图**：92×52 帧 + 上下齿孔点，mono `V01…`；当前帧 `--node-edge-active` 1.5px 描边 + 「当前」绿字徽标；尾随虚线「＋新版本」。快捷键 F6 提示保留在右端。

---

## 5. 交互状态矩阵

| 组件        | hover                  | active/选中            | 生成中                               | 空态                     | 错误/超限                                        |
| ----------- | ---------------------- | ---------------------- | ------------------------------------ | ------------------------ | ------------------------------------------------ |
| 参考槽      | 显示 删/⊘（fast 淡入） | 插入 @token + 落点辉光 | —                                    | 虚线 + 号                | 置灰 40% + ⚠ 角标                                |
| 部门卡      | 描边 → edge-active     | —                      | —                                    | 副行「拖入或点击添加」   | 计数 `10/9 ⚠` 变 fg 色                           |
| OSD 胶囊    | 底色 → panel-inner     | 展开编辑段             | 参数锁定（subtle）                   | —                        | —                                                |
| 版本帧      | 提亮 + 放大 1.02       | fg 描边 + 当前徽标     | 新帧骨架 shimmer                     | 「生成后此处出现版本条」 | —                                                |
| 监视器      | 显示播放控制           | —                      | REC 脉冲 + TC 跳动 + 底部 sweep 进度 | 提示文案                 | 错误条（红 10% 底）出现在监视器下方              |
| 生成按钮    | 明度 90%               | 按压 scale .98         | Loader 旋转 + 文案「生成中」         | 禁用 + 原因文案          | —                                                |
| 模型 picker | 描边提亮               | 展开品牌轨（0fr→1fr）  | —                                    | 未选：默认展开           | needs-key 🔑 → QuickSetupDialog；rebind ⚠ 确认卡 |

键盘：Esc 关面板 · F6 循环版本 · ⌘↵ 生成 · 面板内按键 `stopPropagation` 防画布快捷键（沿用 KEY_GUARD）。

---

## 6. 动效规范定稿（11 组，全部走同一 canon）

曲线唯一：`cubic-bezier(0.22, 1, 0.36, 1)`（`--ease-standard` / `EASE_STANDARD`）。时长四档：fast 120 / base 200 / slow 320 / reveal 500ms。`useReducedMotion` / `prefers-reduced-motion` 全局归零。只动 `transform`/`opacity`（画布尺寸形变例外，复用现有 `.node-canvas-panel-motion` 只过渡 `width`）。

| #   | 过渡                                  | 触发                          | 时长                               | 状态                                                            |
| --- | ------------------------------------- | ----------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| 1   | 顶栏收放                              | 点收起/展开按钮               | slow 320                           | 🔧 待实现（现状硬切）                                           |
| 2   | 助手 dock 开合                        | 点开关/首次移动端进入         | slow 320（桌面）/ base 200（移动） | 🔧 待实现（现状只有 width 过渡）                                |
| 3   | 详情面板进出场                        | 点 ⤢ / 关闭                   | slow 320，退场 scale→.97           | ✅ 已实现（`NodeDetailPanel.tsx`）                              |
| 4   | 面板内区块首现 stagger                | 面板刚打开                    | base 200，stagger 50ms 封顶 300ms  | 🔧 待实现                                                       |
| 5   | OSD 段展开/收起                       | 点模型/时长/分辨率/画幅任一段 | base 200                           | 🔧 待实现（复用 `.node-collapsible`）                           |
| 6   | 槽位插入 = 缩略图飞入 + 落点辉光      | 点已回填槽位                  | fly 240ms + glow 200ms             | 🔧 待实现（组件设计见 §8.3，取代早期「纯色块 300ms 淡出」草案） |
| 7   | 拖拽排序插入线                        | 拖动槽位                      | base 200（插入线淡入）             | 🔧 待实现                                                       |
| 8   | 按下态反馈                            | 任意可点元素按下              | fast 120                           | 🔧 待实现（覆盖所有可点元素，非生成按钮独享）                   |
| 9   | 生成中（REC 脉冲+TC 跳动+sweep 进度） | 生成状态=running              | REC 1.4s 循环 / sweep 1.2s 循环    | 🔧 待实现（唯一被批准的持续循环动效，对应真实后台状态）         |
| 10  | 版本新帧落位                          | 生成完成写入新版本            | base 200                           | 🔧 待实现                                                       |
| 附  | 模型轨开合                            | 点模型行                      | 180ms（`.node-collapsible`）       | ✅ 已实现，第 5 组直接复用同一套 CSS 机制，不重新发明           |

11 组里只有 1 组（详情面板进出场）已经在代码里，其余 10 组随本轮面板重构一起补——这不是额外的动效项目，是每个新组件（OSD/部门条/版本条/监视器/token）落地时顺手写好的一部分，不需要单独排期。

配图：`svg/motion-storyboard.svg`（10 组故事板原图；其中第 6 组的画法已被 `svg/prompt-reference-token.svg` 的飞入+辉光方案取代，本表格第 6 行以后者为准）。

---

## 7. 部门条完整交互工作流（放文件 + 提示词引用）

> ⚠️ **分组已取代**（2026-07-05）：本节的「四摄制部门 / 三模态卡」分组被 [`2026-07-05-video-shot-cast-redesign.md`](2026-07-05-video-shot-cast-redesign.md) 的**制作角色五卡**取代（音色收进角色+旁白，独立语音卡作废，@token 改原子化）。但本节下面的**交互闭环仍然有效且复用**：图结构=唯一事实源、放文件即建图（autospawn）、点槽位即写词、删槽=删连线、发送图例——这套 §7b-A 已落地的引擎在新五卡下原样搬。只有"卡怎么分组"变了。

四个摄制部门条（选角/置景/动作/配音）的完整闭环：图结构（画布连线）始终是唯一事实源，槽位只是它的投影——放文件即建图，点槽位即写词。

### 7.1 放文件（① 空槽位 → ④ 回填）

1. **空槽位**：部门卡右侧一个虚线 ＋ 槽，不强制先建节点再连线。
2. **点击 ＋**：弹出三选一——上传本地 / 从素材库选 / 粘贴。三个入口平权，不分主次。
3. **选定后 autospawn**：画布**自动创建**对应类型的上游节点（选角→角色图片节点、置景→背景图片节点、动作→视频参考节点、配音→语音节点）、**自动连线**到当前视频节点、**自动命名**（默认名如「参考图1」，可改）。
4. **槽位回填**：缩略图 + 编号角标（图1/视频1/音频1）+ 名字标签，回到部门卡里。

删除槽位 = 删连线（节点保留 + toast 提示），不是删节点数据；hover 出现的 ⊘ 是临时禁用（连线还在，只是这次生成不发送），两者是不同操作，UI 上必须用不同图标区分（× 删线 vs ⊘ 禁用）。

### 7.2 如何引用在提示词中（⑤ 插入 → ⑥ 改名漂移 → ⑦ 发送时图例）

5. **单击已回填的槽位** = 在提示词文本框**当前光标位置**插入 `@名字`（如 `@参考图1` 或改名后的 `@弗洛洛`），插入效果见 §8.3（缩略图飞入 + 落点辉光）。槽位不再只是画廊，点击即写入。
6. **改名漂移**：如果用户之后又给节点改了名字，**已经打进提示词文本里的旧 token 不会跟着自动改**——文本是静态字符串，不是活绑定。面板扫描当前 prompt 文本，检测到「文本里出现的 @旧名字」在当前槽位列表中已经找不到匹配时，给一条内联提示（长在 token 本体上，见 §8.1）：「`@参考图1` 已改名为『弗洛洛』，点击替换」，点了就原地替换，不点也不阻塞生成。
7. **发送时自动生成图例（不进用户可见文本框）**：真正发给模型的 payload = 用户敲的 prompt 原文 + 自动追加一段引用图例（「图1＝角色『弗洛洛』，图2＝角色『阿卡』…」），按槽位实际顺序生成，复用 shot 侧已有的 `buildShotReferenceLegend` 模式。图例只读、自动生成，不占用 textarea 空间，生成按钮旁给一个「查看发送内容」的可展开预览，避免它变成黑盒。

### 7.3 为什么这样设计

- **不强制手动命名**：autospawn 兜底默认名，用户不点名字也能正常引用，命名只是让 prompt 读起来更自然，不是功能前提。
- **引用永远指向名字，不指向编号**：编号只活在自动图例里，用户改连线顺序不会破坏已经写好的 prompt。
- **改名漂移只提示不阻塞**：把「静态文本 vs 活节点」这个真实的技术边界诚实地暴露给用户，而不是假装文本会自动跟着变，也不因为这个边界情况就不让用户改名。

配图：`svg/department-strip-workflow.svg`——①–⑦ 全流程图解。

---

## 8. 提示词引用 Token 组件（含封面机制）

Token 内嵌真实缩略图/头像，比纯色文字块更有实体感——用户扫一眼提示词就认得出每个引用具体是谁，不必回头核对部门条。

### 8.1 封面机制核对（对照代码现状，非假设）

三种媒体类型现状并不一致，不能一刀切设计：

| 类型 | 封面来源                                                                                                                                                                                                                                               | 现状                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 图片 | `mediaUrl` 本身                                                                                                                                                                                                                                        | ✅ 本身即封面，不需要额外机制                                                                                               |
| 视频 | `Generation.thumbnailUrl`（provider 回调自动生成首帧海报，见 `execution-callback.service.ts`）                                                                                                                                                         | ⚠ **现状缺口**：`thumbnailUrl` 目前没有流入 `node.data`，节点里的 `<video>` 标签也没设 `poster` 属性——需要补，工程方案见 §9 |
| 声音 | `voiceCoverImage`（系统音色自带头像）/ `voiceReferenceCoverImage`（参考音频跟随素材库封面，来自 `generation.previewUrl ?? generation.thumbnailUrl`，由 `AssetDetailSheet.tsx`「设置封面」按钮配置，PATCH `/generations/{id}/cover` 写入 `previewUrl`） | ✅ **已有完整机制**，已在 `VoiceDetailBody.tsx` 实现                                                                        |

### 8.2 Token 解剖（六态）

| 类型                    | 形状语言                                                      | 内容                                                                                                             |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 选角·角色               | 圆形裁切缩略图                                                | 该角色节点的真实参考图（不是图标），16% port 色描边环                                                            |
| 置景·背景               | 方形圆角裁切缩略图                                            | 区别于角色的圆形，暗示"场景"而非"人物"                                                                           |
| 动作·参考视频           | 方形缩略图（来自 `thumbnailUrl`，§9 接入）+ 右下角 ▶ 播放角标 | 一眼区分"这是动图不是静图"                                                                                       |
| 配音·声音（已配置封面） | 圆形裁切缩略图，同角色/背景                                   | 优先显示 `voiceCoverImage` / `voiceReferenceCoverImage` 真实头像                                                 |
| 配音·声音（兜底态）     | 圆形 port 色底 + 白色波形图标                                 | **仅当完全没配置封面时**才用，不是默认画法                                                                       |
| 漂移态（改名后）        | 任意上述形状 + 虚线描边 + 右上角 ⚠ 徽标                       | ⚠ 长在 token 本体上，不是脱离上下文的独立 banner，hover 提示"已改名为『新名字』，点击替换"（对应 §7.2 ⑥ 的逻辑） |

四色沿用既有 `--node-port-*`：选角 `#6f6a86` / 置景 `#5f7a73` / 动作·视频 `#647386` / 配音·声音 `#856a72`。名字文本，不是编号——编号只活在发送时自动生成的图例里（§7.2 ⑦）。

### 8.3 Hover 预览浮层

Hover token 时弹出预览卡（复用现有 `StudioToolPopoverContent` 暗面弹层 chrome，不新起样式）：72×72 放大缩略图（视频=`thumbnailUrl` 首帧、配音=真实头像或兜底波形的放大版）+ 名字 + 类型标签 + 「点击定位到画布对应节点」——把用户从文本带回图结构，形成双向导航。漂移态浮层多一行「已改名为『新名字』，点击替换」+ 一键替换按钮。

### 8.4 插入动效（飞入 + 落点辉光）

1. **点击槽位**（52×52 缩略图）
2. **飞入**：缩略图沿曲线路径飞向光标位置，尺寸从 52px 收缩到 16px（`fly 240ms`，`--ease-standard`）
3. **落点辉光**：token 落地瞬间用 **port 色**（不是纯灰白）向外脉冲一次（`glow 200ms`）
4. **定格**：辉光褪去，token 进入正常态，周围文字自然重排让位

飞行路径建立「部门卡 → 文本」的空间连续性（用户能感到"这张具体的图飞进了句子里"），port 色辉光强化"这是哪一类引用"。`reduced-motion` 下飞行/辉光全部归零，token 直接以定格态出现在光标处，不做替代方案。

配图：`svg/prompt-reference-token.svg`——封面机制核对 + 六态解剖 + hover 预览浮层 + 插入动效四帧故事板。

---

## 9. 封面图工程方案：`videoThumbnailUrl`

**Prisma 不需要加字段**——`NodeWorkflowProject.state` 是单个 `Json` 列（`prisma/schema.prisma:150-165`），节点数据只在 Zod 层校验（`NodeWorkflowNodeDataSchema`），加新字段是纯 schema 改动，不需要迁移。这是**两条独立路径**，现状不一致，方案也不同。

### 9.1 路径 A：AI 生成的视频 —— 数据已经在库里，只是没接线

`GenerationRecord`（`src/types/index.ts:1704`）**已经有** `thumbnailUrl` 字段；生成完成时由 `execution-callback.service.ts:395-418` 写入 DB（`createVideoPosterAsset()` 取 provider 自己返回的 poster 图，用 `sharp` 转 webp 后重新上传到我们自己的 R2）。缺口纯粹是这份已存在的数据从 hook 到组件的链路上被丢弃了。

**改动（3 处，零新增后端逻辑）**：

1. `src/hooks/node/use-node-media-generation.ts`（第 82-87 行成功返回类型 + 第 304-305 行组装处）：成功返回值里加 `thumbnailUrl: generation.thumbnailUrl`，和现有的 `mediaUrl: generation.url` 并列。
2. `src/components/business/node/StudioNodeWorkbench.tsx`（第 943-966 行，`nodeMediaGeneration.generate` 成功回调，image/video/audio 共用）：照抄已有的 `isImageMediaNode ? {...} : {}` 条件写入模式（第 948-955 行），加：
   ```
   ...(isVideoMediaNode ? { videoThumbnailUrl: result.generation.thumbnailUrl } : {}),
   ```
3. `src/types/node-workflow.ts`（`NodeWorkflowNodeDataSchema`，紧邻 `mediaUrl` 第 211 行）：加 `videoThumbnailUrl: z.string().url().optional()`。

**不需要碰**：`prisma/schema.prisma`、`execution-callback.service.ts`、任何 provider adapter——数据早就有了，纯粹是接线工作。

### 9.2 路径 B：用户手动上传的参考视频（`videoReference` 节点）—— 真正的新工作

`video-reference.service.ts:72-99` 的设计就是"不建 `Generation` 行，只写字节返回 URL"（服务自己注释这么写的）——这条路径完全没有 `Generation.thumbnailUrl` 可借用。`VideoReferenceInspector.tsx` 现有的 `readVideoDurationSeconds`（第 34-54 行）建了个隐藏 `<video>`，但只读 `.duration` 做 15 秒上限校验，读完就扔，从没 seek 取帧。

**改动（跨 5 个文件，是真实开发工作量，不是纯 UI）**：

1. **新增小工具** `src/lib/video-thumbnail.ts`（新文件，纯函数，方便单测）：`captureVideoThumbnail(file: File): Promise<Blob | null>`——建隐藏 `<video>`，加载 file 的 object URL，seek 到 `min(0.1, duration/2)`（避开纯黑首帧），等 `seeked` 事件，`canvas.drawImage` 后 `toBlob('image/webp', 0.8)`；捕获失败返回 `null`（不抛错，不阻塞上传）。
2. `VideoReferenceInspector.tsx`：选中文件后，在现有 `uploadReferenceVideoAPI(file)` 调用前先 `await captureVideoThumbnail(file)`，拿到的 Blob（可能为 `null`）一并传给上传函数。
3. `src/lib/api-client/node-workflow.ts`（`uploadReferenceVideoAPI`，第 150-176 行）：新增可选参数 `thumbnailBlob`，作为 FormData 第二字段（如 `thumbnail`）随视频一起 POST。
4. `src/app/api/node-workflow/upload-reference-video/route.ts`：读取可选的 `thumbnail` file 字段，透传给 service。
5. `src/services/video-reference.service.ts`（`uploadReferenceVideo`，第 79-99 行）：若收到 thumbnail buffer，调用已有的通用 `uploadToR2()`（`r2.ts:226-247`，本来就不限定用途）再上传一次，key 仿照 `createVideoPosterAsset()` 已用的派生 key 模式（`video-references/{userId}/{date}_{random}-thumb.webp`），返回值加 `thumbnailUrl`。
6. `VideoReferenceInspector.tsx` 上传成功回调：`updateNodeData` 里 `mediaUrl` 旁加 `videoThumbnailUrl: response.data.thumbnailUrl`。

**失败兜底**：浏览器解码失败/用户环境不支持时，`captureVideoThumbnail` 返回 `null`，上传照常继续，只是没有封面——节点/token 退回 §8.2 的「封面待接入」占位态，不阻塞核心上传功能。

### 9.3 消费层与落地顺序

两条路径写入同一个字段 `data.videoThumbnailUrl`，下游不用区分来源：部门条槽位/token 缩略图优先读它，没有则退回占位态；画布上所有 `<video>` 预览（`SeedanceNode.tsx` / `VideoDetailBody.tsx` / `VideoReferenceInspector.tsx`）加 `poster={data.videoThumbnailUrl}`（顺带修了视频加载前黑屏闪烁的小问题）。

落地顺序：**先做 9.1（路径 A）**——3 个文件，零后端新逻辑，风险最低；**再做 9.2（路径 B）**——涉及浏览器视频解码兼容性，需要更多手动验证。测试：`use-node-media-generation.test.ts` 加"成功返回携带 thumbnailUrl"断言；`video-reference.service.test.ts` 加"带 thumbnail 参数时二次上传"用例；`video-thumbnail.ts` 作为纯函数单独测试（mock `HTMLVideoElement`/`HTMLCanvasElement`）。兼容性：`videoThumbnailUrl` 是新增可选字段，老项目已保存的节点没有它完全正常，**不需要任何数据回填/迁移脚本**。

---

## 10. 开发落地清单

1. **P0 骨架三文件**：
   - `VideoComposer.tsx`：detail 密度下左列改为「@chips → prompt(hero) → 负向」，右列前置 `MonitorPreview` 区，其余控件顺序保持；间距统一到 §3.1 刻度。
   - `VideoDetailBody.tsx`：监视器块加遮幅/角标/REC+TC 装饰层（纯展示 div，`font-mono`）。
   - `NodeDetailPanel.tsx`：header 换 44px 场记条样式。
2. **Token 组件**：新增 token 渲染逻辑（§8.2 六态）+ hover 预览浮层 + 插入动效（§8.4）。
3. **封面工程**：§9.1 三文件 + §9.2 五文件（含新文件 `video-thumbnail.ts`）。
4. **零新增 token**：全部用现有 `--node-*`；@token 胶囊底用 `bg-[var(--node-port-character)]/25` 等。
5. **新增 CSS**（globals.css @layer components）：`.node-monitor-matte`（遮幅）、`.node-osd-chip`、`.node-filmstrip-frame`；REC 脉冲复用现有 keyframes。
6. **字号替换表**：`text-2xs`(11)→保留；出现的 `text-[9px]/[8px]` 类全部升 `text-3xs`(10)；TC/版本加 `font-mono tabular-nums`。
7. **验收**：对照 §0 功能清单逐条走查 S1（满配）/S2（空态）/S3（超限）/S4（移动端）/S5（全屏编辑）五个状态。

---

## 11. Taste-Skill 工艺审查记录

`design-taste-frontend` skill 自身声明范围外包含「dashboard / 密集产品 UI」，本面板正是密集工作台面板而非 landing page——因此不套用其营销版式规则（bento 网格、hero 首屏字数、eyebrow 计数、marquee 上限、「Trusted by」logo 墙等），只挪用跨场景通用的工艺纪律核对：

| 检查项                   | 结果                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| 单一强调色锁定           | ✅ 全程只有 `--node-success` 一处彩色                                         |
| 无 AI-purple / 霓虹光晕  | ✅ canvas-baseline D1 已清                                                    |
| 圆角体系锁定             | ✅ 面板16/卡10-12/输入10/槽位8/胶囊999                                        |
| 图标库统一               | ✅ 沿用项目既有 lucide-react（项目已依赖例外条款适用，不换库）                |
| Empty/Loading/Error 三态 | ✅ S2 空态、生成中态、错误条已在规范内                                        |
| reduced-motion 全局归零  | ✅ §6 已写                                                                    |
| 按下态触觉反馈           | ✅ 已补齐（§4 C7 / §6 第 8 组），覆盖所有可点元素不只生成按钮                 |
| 按钮对比度 WCAG AA       | ⚠️ `#10b981` 底配 `#0b0b0a` 字视觉估算 ≈6.2:1，达标；上代码前需用真实渲染复核 |
| em-dash 禁令             | 不迁移——中文「——」是标准破折号，不是该 skill 针对的英文 LLM 惯用 crutch       |

---

## 12. 决策变更记录

正文只写现在的结论；这里按轮次记录每次反馈改了什么，供回溯。

| 轮次 | 反馈摘要                                           | 结论                                                                                                                                                      | 影响章节 |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | 初版 UI 无特色，功能齐全但看着普通                 | 提出方向 A/B/C 三选一 + v1 六项诊断                                                                                                                       | §1 §2    |
| 2    | 提示词区太小；部门条应纯中文；按钮保留「生成视频」 | 提示词改全宽大文本区；部门条中文命名（选角/置景/动作/配音）；助手与本面板的剧本分工划清                                                                   | §3 §4 C6 |
| 3    | 部门条和引用 chips 是否可以合到一起                | 合并：部门条槽位＝唯一引用插入源，token＝@名字＋发送时自动图例，取消独立 chips 行                                                                         | §7 §8    |
| 4    | 重点关注部门条：怎么放文件、怎么引用               | 补齐①–⑦ 完整工作流（放文件/autospawn/插入/改名漂移/发送图例）                                                                                             | §7       |
| 5    | 过渡动画设计了吗                                   | 收敛为 11 组动效故事板，标注已实现/待实现                                                                                                                 | §6       |
| 6    | 引用 token 这块 UI 太简单                          | Token 重设计：内嵌真实缩略图 + 六态解剖 + hover 预览 + 飞入辉光插入动效                                                                                   | §8       |
| 7    | 图片/视频/声音是否都有配置封面                     | 核对代码：图片自带、声音已有完整机制、视频有真实缺口（`thumbnailUrl` 未接入 node.data）                                                                   | §8.1     |
| 8    | 把 `videoThumbnailUrl` 具体改动方案理清楚          | 两条独立路径（AI 生成=接线，手动上传=新工程），Prisma 无需加字段，列出具体文件改动                                                                        | §9       |
| 9    | 用 taste-skill 审查全面 UI                         | 声明范围外（本面板非 landing page），只挪用跨场景工艺纪律，补齐按下态反馈                                                                                 | §11      |
| 10   | 把文档整理全面                                     | 本次重组：结论前置，历史压缩进本表，正文改为定稿语气                                                                                                      | 全文     |
| 11   | 按计划落地 P0（2026-07-04）                        | 分五阶段实现：监视器 C4 / token 组件 §8 / 封面工程 §9 双路径 / CSS·字号 / 验收。C1·C5·C8·部门条 §7·prompt 工具·S4 抽屉·S5 全屏按 owner 决策延后。详见 §14 | §14      |

---

## 13. 文件索引

- `svg/compare-A-monitor-hero.svg` — 决策记录：方向 A（全宽 hero 监视器），已并入 §2 定稿
- `svg/compare-B-two-column.svg` — 决策记录：方向 B（双栏工作台），已并入 §2 定稿
- `svg/compare-C-filmic.svg` — 决策记录：方向 C（胶片场记），元素留作 P2 增量
- `svg/osd-params-expanded.svg` — OSD 画幅比例展开态 + 生成音频行 + 种子行布局，内容已并入 §4 C5
- `svg/v4-final-assembled.svg` — **§2/§4 权威线框**：双栏骨架 + 监视器语言 + OSD 修正 + 按下态，P0 唯一实现基准
- `svg/department-strip-workflow.svg` — **§7 权威图**：部门条放文件 + 提示词引用完整 ①–⑦ 工作流
- `svg/motion-storyboard.svg` — **§6 权威图**：11 组过渡动画起止帧故事板（第 6 组已被下一条文件取代）
- `svg/prompt-reference-token.svg` — **§8 权威图**：封面机制核对 + token 六态解剖 + hover 预览 + 插入动效，取代 motion-storyboard 第 6 组旧画法

前三张（compare-A/B/C）与 osd-params-expanded 是过程性对比图，保留作决策依据；标"权威图"的四张是当前唯一定稿参照，与本文档正文一一对应。

---

## 14. 实现状态（2026-07-04 落地）

正文（§1–§11）是**目标定稿**；本节记录**已落地到代码的现状**，供后续施工读取准确起点。Claude 端到端实现，未走 Codex。

### 14.1 已交付并验证

> ⚠️ 下表 §7a/§7a修正/§7b-A 三行是**部门条分组落地过程**，其分组（三模态卡）已被 [`2026-07-05-video-shot-cast-redesign.md`](2026-07-05-video-shot-cast-redesign.md) 的**制作角色五卡**取代。这些行的**引擎（槽位/token/角标/×删连线/spawnReference autospawn）在新分组下原样复用**，只是 DEPARTMENTS 分组表会重写为五卡。代码现状仍是三模态卡，直到 cast-redesign S1 落地。

| 阶段                                                           | 交付内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 关键文件                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 骨架                                                        | 监视器 C4（四角取景框 / 上下遮幅 / 生成中 REC+TC 客户端计时 / 空态「生成后在此预览」）移入 VideoComposer 右列首位；VideoDetailBody 瘦身为纯分发                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `composer/VideoComposer.tsx`（`VideoMonitor`/`useElapsedSeconds`）· `node-detail/VideoDetailBody.tsx` · `lib/video-utils.ts`（`formatTimecode`）                                                                                                                                                                       |
| P1 CSS                                                         | `.node-monitor-matte` / `.node-monitor-corner` + token `--node-monitor-frame`/`--node-monitor-matte`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `app/globals.css`                                                                                                                                                                                                                                                                                                      |
| P2 Token §8                                                    | 引用 token 组件：选角(圆)/置景·镜头(方)/配音(圆·封面或 Mic2 兜底)/漂移(虚线+⚠) 四类；hover 预览浮层（72px + 类型标签 + 定位到画布）；飞入+落点辉光插入动效（走 canon `base` 200ms，非文档 240ms 自定义值）；改名漂移检测+替换                                                                                                                                                                                                                                                                                                                                                                                                                                  | `composer/ReferenceTokenChip.tsx`（新）· `hooks/node/use-video-composer.ts` · `lib/node-workflow-graph.ts`（`AudioBinding` +nodeId/coverImage）· `types/node-workflow.ts`（`insertedReferenceNames`）· `NodeWorkflowActionsContext.tsx`+`StudioNodeWorkbench.tsx`（暴露 `focusNode`）· i18n ×3                         |
| P3a 封面路径A                                                  | AI 生成视频 `thumbnailUrl` 接线（零后端新逻辑）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `hooks/node/use-node-media-generation.ts` · `StudioNodeWorkbench.tsx` · `types/node-workflow.ts`（`videoThumbnailUrl`）                                                                                                                                                                                                |
| P3b 封面路径B                                                  | 手动上传视频客户端抓帧（`captureVideoThumbnail` 纯函数）→ service 二次上传 `-thumb.webp`（失败兜底不阻塞）→ route 透传 → api-client `thumbnailBlob` → Inspector 回写；§9.3 四处 `<video>` 加 `poster`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `lib/video-thumbnail.ts`（新）· `services/video-reference.service.ts` · `app/api/node-workflow/upload-reference-video/route.ts` · `lib/api-client/node-workflow.ts` · `inspector/VideoReferenceInspector.tsx` · `nodes/SeedanceNode.tsx`·`nodes/NodeMediaPreview.tsx`·`inspector/NodeMediaInspector.tsx`               |
| 修复                                                           | 引用 token hover 浮层「点击后鼠标移开不断刷新」= Radix Popover 焦点振荡（触发器 onFocus/onBlur ⇄ auto-focus 开合）；改纯 hover + `onOpenAutoFocus`/`onCloseAutoFocus` 各 preventDefault                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `composer/ReferenceTokenChip.tsx`                                                                                                                                                                                                                                                                                      |
| §7a 部门条·视觉+插入（2026-07-05）                             | 部门卡替换左列扁平 chips 行：4px 端口色轨 + 标题 + 「n 项引用」计数 + 每部门空态；槽位 = 原 ReferenceTokenChip（hover 预览/单击插入@/漂移替换全保留），wrapper 叠两件部门条装饰——左下 图N/音N/视N 角标（编号来自真实 payload：`harvestUpstreamImageUrls`/audio bindings/`harvestUpstreamVideoUrls` 索引，keyframe 占位可跳号=诚实）+ hover × 删连线（`deleteEdge`+toast「节点保留」；仅有直连边的槽显示，经角色路由的声音无 ×）                                                                                                                                                                                                                                | `composer/DepartmentStrip.tsx`（新）· `hooks/node/use-video-composer.ts`（`ComposerReferenceToken`：+`imageSlotIndex`/`audioSlotIndex`/`videoSlotIndex`/`edgeId`）· `composer/VideoComposer.tsx` · i18n ×3                                                                                                             |
| §7b-A ＋添加位 autospawn·素材库（2026-07-05）                  | 每张部门卡末尾一个虚线 ＋ 添加位：语音/视频卡直接触发，图片卡先弹 role 子菜单（角色/背景/镜头，因一卡三 role，owner 拍板）。选定后开 `AssetSelectorDialog`（三卡统一，voice→audio mediaType）；选中素材 → 高层 context action `spawnReference` 建上游节点(`addNode`)+ 盖 role/媒体字段(复用 `createDefaultNodeData` + 镜像 NodeMediaInspector 的 existing-image 字段集)+ 连线(`onConnect`)+ 默认命名。**上传本地/粘贴延后**(各模态上传端点不同,`useNodeReferenceUpload` 仅图片)——素材库已覆盖"加已有素材"主流程且三卡一致。                                                                                                                                    | `NodeWorkflowActionsContext.tsx`(+`SpawnReferenceInput`/`spawnReference`)· `StudioNodeWorkbench.tsx`(`handleSpawnReference`)· `composer/DepartmentStrip.tsx`(`AddReferenceTile`+role 子菜单)· `composer/VideoComposer.tsx`(pending 态+AssetSelectorDialog)· `constants/node-studio.ts`(`referenceSpawn` 定位)· i18n ×3 |
| §7a 修正·三模态分组 + 语音不显示 bug（2026-07-05，owner 改判） | **部门卡改判为按模态三卡「图片/语音/视频」**（覆盖 §4 C2 四摄制部门；对齐节点类型 + payload 三族 image_urls/audio_urls/video_urls）。修 owner 报的两 bug：①**语音经图片节点路由到视频却不显示**——`harvestUpstreamAudioBindings` 只收「有参考音频」的语音，未上传参考音的语音被整个丢掉；新增未就绪语音扫描（voice 直连 + voice→character→video 1 跳），以 40% 置灰、不可插入、无 audio 槽的 token 出现（§3.3 不静默丢，hover 提示「未上传参考音频·本次不发送」）。②**视频参考无归类**——`isVideoSourceNode` 上游视频以 video token（▶ 角标 + `videoThumbnailUrl` 封面 + 视N + auto-send 提示）进「视频」卡，projection-only 不可插入（随连线自动进 video_urls） | `ReferenceTokenChip.tsx`（+`video` kind/`insertable`/`dimmed`/▶角标/not-send 提示）· `use-video-composer.ts`（未就绪语音+视频源扫描）· `node-workflow-graph.ts`（导出 `readVoiceUrl`/`readVoiceCoverImage`）· `DepartmentStrip.tsx`（三模态卡）                                                                        |

**验证**：新增/扩展单测 `video-utils`·`video-thumbnail`·`video-reference.service`·`ReferenceTokenChip`·`VideoComposer`·`VideoDetailBody`·`use-node-media-generation`·`node-workflow-graph`；full vitest 2882 passed（9 个失败均为**未触碰**的 Lora/Audio 文件在满负载下的 worker 饥饿超时，隔离重跑 44/44 绿）；tsc 0 个 `src` 错误；lint 干净。**`npm run build` 未跑**（dev server 在跑，避免污染 `.next`）——push 前须停 dev 单独跑。

### 14.2 既有保留（本轮未动，仍完好）

B2 composer 原有参数控件全部保留并经浏览器/单测确认在位：模型两级切换（品牌/变体/供应商 + needs-key→QuickSetupDialog + rebind 预览）· 时长滑杆+自动 · 分辨率 chips · 画幅比例 tile · 同步音频开关 · 种子+骰子+锁定上次种子 · 负向提示词 · 生成按钮（禁用原因文案）· 错误条。

### 14.3 延后（owner 决策 / 无数据 / 本轮 scope 外）

| 项                                                                                 | 章节     | 原因                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 场记板头 C1（项目/镜头/版本/模式）                                                 | §4 C1    | 版本/模式依赖 F6 版本历史（P2·无数据）；NodeDetailPanel 是全节点类型共享组件，改动半径大收益低                                                                                                                                                                     |
| OSD 胶囊折叠 C5                                                                    | §4 C5    | 独立工作量；参数当前以完整控件在右列（可编辑，未收成 OSD 摘要）                                                                                                                                                                                                    |
| 胶片版本条 C8                                                                      | §4 C8    | 依赖 F6 版本历史，无数据                                                                                                                                                                                                                                           |
| 部门条 §7b 剩余引擎（上传本地/粘贴入口 · 拖拽排序 · 超限⚠ · ⊘禁用 · 发送图例预览） | §7.1/7.2 | §7a + §7b-A（＋号 autospawn·素材库）已交付见 §14.1；**拖拽排序需先定排序建模**（节点数组序 vs 新 order 字段）；**超限⚠需先抽共享 payload 装配函数**（去重+model 上限现内联在 StudioNodeWorkbench 生成路径，两处各算会漂移）；上传本地/粘贴各模态端点不同，单独一档 |
| prompt 工具：✨增强 / 运镜语法▾ / ⤢全屏编辑 / 来源提示回跳                         | §4 C6    | 交付的 composer 未含这些工具                                                                                                                                                                                                                                       |
| 移动端抽屉 S4                                                                      | §3.1     | 当前为居中 Dialog + `@container` 窄屏收单列（`maxWidth: calc(100vw-2rem)`），非「抽屉+把手」变体                                                                                                                                                                   |
| 全屏编辑 overlay S5                                                                | §4 C6    | 未实现                                                                                                                                                                                                                                                             |

### 14.4 已知偏离

- **动效时长**：§8.4 写「飞入 240ms」，实现用 canon 四档最接近的 `base`(200ms)——遵守「时长走刻度不自创数值」优先于文档具体数字。
- **分组 label 字号**：§3.2 定 10px(`text-3xs`)，代码库全局约定 `text-2xs`(11px，26 处/16 文件)。为与其余节点 inspector 一致，保持 11px；如需贴 §3.2 须全站统一改（待 owner 定）。
- **token 第四态「动作·参考视频」**：§8.2 列了参考视频 token，但 `videoReference` 节点无命名字段、从未接入 token 系统，本轮只做 选角/置景/镜头/配音 四类，「动作」态延后。
- **部门卡按模态三分「图片/语音/视频」非 §4 C2 的四摄制部门**（owner 改判，2026-07-05）：对齐节点类型与 payload 三族，比 cinema 部门更贴用户心智模型；四色端口仍在（角色/背景/镜头同属图片卡内共用 image 族色）。§4 C2 的「选角/置景/动作/配音」四卡语言作废，正文待随后同步。
- **整体骨架仍为双栏**（§2/权威 SVG 偏离，P0 既有）：`v4-final-assembled.svg` 实为单列全宽流（监视器 hero → 参数 → 部门 2×2 → 版本条 → prompt hero），但 P0 交付时保留了 VideoComposer 的双栏 grid（监视器右列首位）。§7a 部门条因此放在左列 prompt 正上方（2×2 紧凑卡，引用源贴插入目标），未按 SVG 的 422×56 全宽几何。转单列是骨架级重排，待 owner 决定是否跟进。
