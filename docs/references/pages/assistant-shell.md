# 统一助手 · 施工基准（改版 · assistant-shell.md）

> 状态：**现行施工基准（2026-09-06 owner 定：方向 C「工作日志」+ 四期次序 + 助手设置 + 计划卡图示词表）**。
> 本文取代 2026-08-05 方向 A「统一 AI 对话助手」外壳契约。旧契约里仍然成立的条目收在 §16 历史决策表，被本轮推翻的逐条标了「⛔ 2026-09-06 推翻」。
> 引擎唯一：**Operator 工具环**（SSE 步事件、服务端零会话态）。画布助手（`src/services/node/node-assistant.service.ts`）与旧 Prompt 助手（`src/services/kernel/prompt-assistant.service.ts`）分期收编，**搬完即删，不留兼容层**（CLAUDE.md Engineering Principles 1）。
> 分期（owner 2026-09-06 确认次序）：**一 图片域面板 → 二 视频域 → 三 画布（见 [`node-canvas-v2.md`](node-canvas-v2.md)）→ 四 LoRA 收编与旧路径删除**。
> 格式对齐：`docs/templates/ui-request.md` 四列动作表 · `docs/scenes/ui-page.md` 阶段 3/6 · `docs/checklists/ui.md` 8 项 · `docs/references/ui-defaults.md` §1–§6。
> ⚠ 本文是设计契约，不是实现记录。带 `文件:行号` 的都是**现状事实**（2026-09-06 读码核过）；不带的是目标态。

---

## 0. 定位 · 范围 · 非目标

**定位**：助手是工作台上唯一那只「替你拧旋钮的手」——它不生成媒体，它把参数、提示词、参考图和 LoRA 铺到你看得见的控件上，然后把扳机留给你。

**第一期范围**：桌面 `≥1024`，图片域纵向打穿——新 UI 骨架（图标轨 / 进度带 / 卡型 / 双行输入 / @ 选择器 / 灯箱）+ 模型方言注入 + 计划卡 + @ 看图评审 + 确认后触发生成 + 项目规则卡 + 助手设置（§8）+ 计划卡图示词表（§9）。声音本轮只做「声音库 + Fish Audio 音色库检索与挂载」。

**非目标**：

- ❌ 移动端。`StudioOperatorDock.tsx:320` 的 `if (isMobile) return null` **原样保留**，移动端下一轮。
- ❌ 网上搜声音并提取（`fish-audio-voice.service.ts` 的音色检索除外）。
- ❌ 自动全量评审——只在被点名时看图。
- ❌ 改生成模型 / 计费 / 归档 / LoRA 训练流程。
- ❌ 给助手新增任何能创建 generation 的工具（钱闸，`src/constants/assistant-operator.ts:17-21`）。

---

## 1. 域定义

**核心用户**：正在某个工作台上调一张图的创作者，不是来聊天的人。
**核心对象**：这一台工作台此刻的表单（模型 / 提示词 / 比例 / 张数 / 参考位 / LoRA 栈）+ 它刚吐出来的那批结果。
**最高频任务**：说一句人话让表单变对，然后自己按生成；结果不对时指着某一张说哪里不对。
**默认入口**：工作台右侧覆盖层 / 收起态图标轨。

**助手负责**：① 读表单快照（数据源是请求带上来的客户端快照，服务端不查库）；② 按目标模型方言写提示词（§13）；③ 检索素材库 / 联网参考 / LoRA / 音色，结果一律候选态，点「选用」才落地；④ 写回看得见的控件，每步留逆操作；⑤ `prime_generate` 算价备键（`src/constants/assistant-operator.ts:187`）；⑥ 被点名时看图给评审卡；⑦ 读项目规则、记一条规则（§10，第一期两条新工具）。

**助手不负责**：不创建 generation、不扣 credit、不写库、不下载上传素材；不动这台工作台上没有的旋钮（没槽就 `noSuchControl` 拒，判据见 `src/constants/assistant-operator.ts:367`）；不做跨域全局编排（域由宿主定）。

| 邻居       | 边界                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **工作台** | 唯一真相：表单与生成键都在它那里。助手只读快照、只吐 op，由客户端 apply 层落地。点工作台 = 助手让位                                      |
| **画布**   | 第三期收编（§14 / §17）。结构 op 免费直落，`generate` / `set_review_state` 逐条确认；全量结构见 [`node-canvas-v2.md`](node-canvas-v2.md) |
| **素材库** | 只读（`search_assets` / `list_asset_folders` / `inspect_asset_folder`）。「打开完整素材库」就地开弹层不跳页                              |

---

## 2. 结构账本（`scenes/ui-page.md` 阶段 3 · 一次只确认一项）

| #    | 层                         | 作用                                                                                                                           | 必要性判据                                                                                   | 去掉会怎样                                          |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 2.1  | **覆盖式面板几何**         | 右侧 fixed，top/right/bottom 各 24px，`rounded-xl`，默认 560                                                                   | 开合前后主区宽度不变                                                                         | 回到挤压式，每次开助手结果区重排                    |
| 2.2  | **左缘拖宽 420–860**       | `role=separator` 拖拽 + ←/→ 步进 + 宽度记忆                                                                                    | 现值已在 `src/constants/studio-assistant-operator.ts:25-32`                                  | 窄屏被 560 卡死；宽屏一行放不下 4 张                |
| 2.3  | **收起态 = 图标轨 48px**   | 域图标 · 状态点 · 进度环/计数 · 展开按钮                                                                                       | 收起后仍要能说「3/6」「4 张就绪」                                                            | 退回胶囊：横向占位不可预期，或状态全丢              |
| 2.4  | **顶部进度带 ~40px**       | 运行中 `3/6 · 正在挂 LoRA`，点开展清单；空闲退化为 `域 chip · 会话名 · ⋯ · 收起`                                               | 长任务里「还剩几步」是唯一的耐心来源                                                         | 过程折叠后进度完全不可见                            |
| 2.5  | **用户消息卡**             | 回显本轮说了什么，带 @chip 缩略图；沟里挂账户头像（§2.22）                                                                     | 多轮上下文的锚                                                                               | @ 指的哪张事后无法复核                              |
| 2.6  | **计划卡**                 | 阶段列表 + 1–3 待定项 + 预估 credits + 「修改 / 开始」；**出卡时机由客户端硬判**（§5）                                         | 生成前反问的唯一载体                                                                         | 退回「先做了再说」                                  |
| 2.7  | **ToolGroup 折叠行**       | 「5 个操作 · 4 成功 1 失败」，点开逐条                                                                                         | 结果优先、过程自动折叠                                                                       | 日志刷屏，结果被淹没                                |
| 2.8  | **反问单选卡**             | 中途缺一个决定就地问，选项即按钮                                                                                               | 比「请回复 1/2/3」少一次打字                                                                 | 多一轮 LLM 往返                                     |
| 2.9  | **确认卡（三档）**         | 覆盖手写三选 / 花钱硬确认（带「不再问」）                                                                                      | 拍板 3 + 新增花钱档                                                                          | 手写被静默覆盖，或每次生成点两遍                    |
| 2.10 | **候选网格卡**             | 缩略 + **URL（域名可点）· 发布者 · 可否作生成输入** + 勾选                                                                     | 拍板 21「浏览零下载」+ 溯源三字段                                                            | 来源不可见，版权与可用性无从判断                    |
| 2.11 | **结果行卡**               | 每轮 2–4 张缩略，点选=当前，hover 出「问助手 / 放大」，卡底「按这张继续」                                                      | 面板内能判好坏，是 @ 闭环入口                                                                | 面板与结果区来回扫视                                |
| 2.12 | **评审卡**                 | 内嵌被评那张图 + 否定 / 异常 / 建议三段                                                                                        | 拍板 6「证据长在结论里」                                                                     | 评语脱离图                                          |
| 2.13 | **checkpoint 薄卡**        | 每轮一张：`已改 N 项 · 只回参数 / 连对话一起回`                                                                                | 拍板 18 + 14 的合并形态                                                                      | 撤不到「这一轮之前」                                |
| 2.14 | **系统行**                 | 「你撤销了：××（助手已知晓）」「停顿点 · 接住排队消息」                                                                        | 撤销与排队后上下文不脱节                                                                     | 助手基于已撤状态继续说话                            |
| 2.15 | **输入区上行**             | `📎 附件 · 模型 chip · 先问我 · ⏹ Stop`                                                                                        | 四个高频开关明面化；模型 chip 复用自动路由组件                                               | 另造选择器 = 2026-08-19 生产事故重演                |
| 2.16 | **输入区下行**             | 输入框 + 发送；运行中不锁，回车=排队                                                                                           | 拍板 13 改口后的唯一入口                                                                     | 运行中不能打字，或打字即打断                        |
| 2.17 | **排队条**                 | 浮在输入框上方，可撤回，停顿点 = **每个工具步边界**                                                                            | 「已排队」必须看得见才敢排                                                                   | 用户以为丢了，重复发送                              |
| 2.18 | **@ 选择器**               | 打 `@` 唤出：最近生成在前、素材库可搜，成带缩略图 chip；**不设硬上限**，超 8 张提示「可能不准」不拦截                          | 四入口中的键盘入口                                                                           | 只剩 hover 一条路，无键盘可达                       |
| 2.19 | **灯箱**                   | 结果缩略 / 参考图 / 评审证据图共用同一个（拍板 17 现值）                                                                       | 一份实现三处复用                                                                             | 三种放大交互各写各的                                |
| 2.20 | **建议药丸**               | 语境化、点即发送、`minChanges` 门（已实现，`studio-assistant-operator.ts:97` 起）                                              | 空态起手势                                                                                   | 空态无可点动作                                      |
| 2.21 | **项目规则薄卡**           | 助手引用了某条项目规则时出现：规则原文 + 来源日期 + 「查看规则」                                                               | 规则是助手为什么这么做的唯一可核对证据                                                       | 规则命中不可见，用户以为助手在瞎猜                  |
| 2.22 | **时间线沟里的头像**       | 用户回合 = Clerk 账户头像 / 首字母圆标；助手回合 = AI 头像。工具步 / 系统行 / 计划 / 结果仍是形状节点。时间戳退到 hover 或行尾 | 「谁在说话」是对话流唯一必须一眼看出的事；时间戳一天里全是同一分钟，占了最贵的 78px 却零信息 | 20 行下来全是同款小圆点，用户回合与助手回合靠缩进猜 |
| 2.23 | **助手设置弹层**（§8）     | ⋯ 菜单「助手设置」→ `ResponsiveDialog`：名字 / AI 头像 / 语气 / 长度 / 默认行为 / 语言。用户级，一份，四域共用                 | AI 头像必须有地方选；「先问我」需要跨会话默认态                                              | 头像写死一个，语气不可调，「先问我」永远从关开始    |
| 2.24 | **计划卡待定项图示**（§9） | 待定项从「三个纯文字按钮」升为「34px 图示 + 标签」，图示取自封闭词表，词表外退化纯文字                                         | 一个线描比四个字快得多；封闭词表是不让模型自由发挥图标的唯一办法                             | 计划卡回到三段文字，扫读成本与聊天框持平            |

---

## 3. 交互动作表（四列）

> 动效列引用 §11.4 配方名 + `src/app/globals.css:198-202` 真值。只动 `transform`/`opacity`，高度折叠用 `grid-template-rows: 0fr→1fr`，每条带 `motion-reduce:` 降级。

### 3.1 图片域 13 步脚本（27 行）

| 触发                        | 即时反馈                                                           | 动效配方                            | 结果                                     |
| --------------------------- | ------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------- |
| ① 回车发第一句              | 用户消息落位（头像 + 卡），输入框清空，进度带亮起                  | `entryIn` base                      | 起一轮 run，SSE `open` 先到              |
| ② 计划卡到达                | 卡从下淡入，阶段逐条 stagger                                       | `cardIn` reveal + stagger 30ms      | 停在 `awaitingPlan`                      |
| ③ 点待定项「半身」          | 边框换 primary + 勾                                                | 选中态 fast                         | 待定项写入本轮上下文，「开始」转 enabled |
| ④ 点「开始」                | 按压 + 卡收成一行摘要                                              | `scale(.98)` fast + 折叠 base       | 带上下文重发，进 `working`               |
| ⑤ 点「修改」                | 回到可编辑态，焦点落第一个待定项                                   | 无                                  | 不发请求                                 |
| ⑥ ToolGroup 行出现          | 一行标题 + 计数，右侧耗时 mono                                     | 按词淡入 fast（opacity + blur）     | 步骤计入进度带 `1/4`                     |
| ⑦ 点 ToolGroup 展开         | 箭头旋转 + 子项缩进一级列出                                        | 折叠 base（0fr→1fr，锁滚动）        | 每步入参与结果摘要                       |
| ⑧ 思考区跑完                | 停留 1000ms 后自动收起，标题变「用时 6s」                          | 折叠 base，延时 1000ms              | 结果优先，可再点开                       |
| ⑨ 候选网格出现，勾 2 张     | 缩略逐格淡入；勾选格加 2px primary 环 + 角标                       | `tileIn` base，stagger 30ms         | 「选用」显示计数                         |
| ⑩ 点「选用」                | 卡收成一行「2 张已挂到参考槽」，参考位缩略弹入                     | 挂载 stagger 0.07s                  | 浏览零下载（拍板 21）                    |
| ⑪ 覆盖三选卡出现            | 卡入场，diff 两行（旧划掉 / 新），三分段按钮等宽                   | `cardIn` reveal                     | 停在 `awaitingConfirm`                   |
| ⑫ 点「覆盖」                | 按压；提示词框整段替换并高亮一拍                                   | 选中态 fast + `writeFlash` reveal   | `set_prompt` 落地，留 `inverse`          |
| ⑬ 项目规则薄卡出现          | 贴在动作卡下：规则原文 + 来源日期 + 「查看规则」                   | `entryIn` base                      | 助手声明本步依据了哪条规则               |
| ⑭ checkpoint 薄卡出现       | 左缘 2px applied 竖条 + applied-surface 底，「已改 3 项」+「撤销」 | 列表项进入 base                     | 本轮改动集合固化                         |
| ⑮ 花钱硬确认卡出现          | `card.warn`：warning 描边 + 四要素 + 「不再问」勾选                | `cardIn` reveal                     | 流停；显示模型 / 张数 / 比例 / credits   |
| ⑯ 勾「本会话此类不再问」    | 勾选框打勾                                                         | 选中态 fast                         | 写会话级偏好，作用域见 §6                |
| ⑰ 点「生成」                | 按钮转 loading，进度带切生成态                                     | loading 换图标，宽度不跳            | **客户端**触发生成（§6）                 |
| ⑱ 结果行卡到达              | 2×2 逐格淡入（宽档 4 列）；进度带回落                              | `tileIn` stagger 30ms               | 该批可被 @ 与「按这张继续」              |
| ⑲ hover 结果 ② 点「问助手」 | 底部渐变浮层出两颗按钮；输入框出 @chip 并聚焦                      | 浮层 opacity fast + chip fast       | 走 @ 四入口之一                          |
| ⑳ 发「@结果② 手指有问题」   | 用户消息带缩略 chip                                                | 列表项进入 base                     | `critique_result` 工具环启动             |
| ㉑ 评审卡到达               | 左 80×112 嵌图，右三段短评逐段淡入                                 | 按词淡入 fast                       | 否定 risk / 异常 warning / 建议 applied  |
| ㉒ 运行中回车插话           | 输入框上方 warning 虚线排队条「已排队 · 下一个停顿点处理 · 撤回」  | 排队条 `cardIn` base                | 不中断在飞任务                           |
| ㉓ 到达下一个工具步边界     | 系统行「停顿点 · 接住排队消息 → 插入为第 N 步」，进度带总步数 +1   | 列表项进入 base                     | 排队消息真的多跑一步                     |
| ㉔ 点排队条「撤回」         | 排队条淡出 + 系统行                                                | 元素移除 fast                       | 丢弃不发                                 |
| ㉕ 点 ⏹ Stop                | 按钮变 destructive 一拍，进度带「已停止」                          | 按压 fast                           | abort，`stopped/aborted`，已落 op 不回滚 |
| ㉖ 点工作台空白             | 面板收到 48px，内容交叉淡出                                        | width 过渡 slow + 内容 opacity fast | 折成图标轨（状态点 + 「4 张就绪」）      |
| ㉗ 点图标轨                 | 反向                                                               | 同上                                | 展开回记忆宽度                           |

### 3.2 面板与撤销（8 行）

| 触发                            | 即时反馈                                        | 动效                           | 结果                                                                                    |
| ------------------------------- | ----------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| 拖左缘 separator                | 光标 col-resize，实时跟手，左上角 mono 宽度提示 | 无（精密档）                   | 宽度写 `storageKey`，缩略图列数换档                                                     |
| 键盘聚焦 separator 按 ←/→       | 焦点环可见，每次 20px（`widthStepPx`）          | 无                             | 同上，键盘可达                                                                          |
| 点提示词框 / 面板内部           | 无变化                                          | 无                             | **不收起**（`data-operator-keep` + 提示词 textarea id）                                 |
| 点 checkpoint「撤销」           | 就地展开二选：只回参数 / 连对话一起回 / 取消    | 元素替换 fast                  | 不弹窗，不跳焦点                                                                        |
| 选「只回参数」                  | 薄卡变灰「已撤销 · 只回参数」+ 系统行           | 列表项进入 base                | 按 `inverse` 逆序回滚，对话保留，**结果不删**                                           |
| 选「连对话一起回」              | 本轮消息整体淡出                                | 元素移除 fast                  | 参数回滚 + 本轮对话截断                                                                 |
| 顶部「清掉助手全部改动」第 1 击 | 按钮变 destructive 并改文案                     | 选中态 fast                    | 进 3s 二击窗口（`STUDIO_OPERATOR_CLEAR_CONFIRM_MS`，`studio-assistant-operator.ts:41`） |
| 3s 内第 2 击 / 3s 不点          | 参数栏多处回落 + 生成键熄灭 / 自动变回原文案    | 回落值高亮一拍 / 颜色过渡 fast | 只清当前域；超时什么都没发生                                                            |

### 3.3 @ 四入口 与「先问我」（7 行）

| 触发                        | 即时反馈                                               | 动效                  | 结果                              |
| --------------------------- | ------------------------------------------------------ | --------------------- | --------------------------------- |
| 输入框打 `@`                | 就地弹选择器（最近生成在前 + 素材库搜索）              | Popover `cardIn` base | 上下键选、回车确认，成缩略图 chip |
| 结果缩略 hover → 「问助手」 | chip 插入并聚焦                                        | 浮层 + chip fast      | 同一条 chip 管线                  |
| 拖一张图进输入框            | 输入行 2px primary 环 + 落点提示                       | 描边 fast             | 落下成 @chip                      |
| chip 数 > 8                 | chip 区计数变 warning：「将看 N 张 · 超 8 张可能不准」 | 颜色过渡 fast         | **全部都看，不拦截也不截断**      |
| 助手歧义反问                | 单选卡列出候选缩略（4 列网格）                         | 卡入场 reveal         | 点一张 → 带上下文重发             |
| 「先问我」开                | 开关反相为 primary 实心，占位语加「本轮先出计划卡」    | 选中态 fast           | 本轮强制先出卡                    |
| 「先问我」关                | 回中性                                                 | 同上                  | 回到助手自判（花钱或多步才出）    |

### 3.4 头像 · 助手设置 · 计划卡图示（11 行）

| 触发                                          | 即时反馈                                                  | 动效                           | 结果                                           |
| --------------------------------------------- | --------------------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| 用户消息落位                                  | 沟里 20px 圆头像淡入（`avatarUrl`；无则首字母圆标）       | `entryIn` base，仅 opacity     | 与 8px 大节点**同轴**（沟内 x=18px），不改沟宽 |
| 助手消息 / 计划卡 / 评审卡落位                | 沟里 20px AI 头像淡入                                     | 同上                           | 一轮里连续助手行**只第一行挂头像**，避免头像柱 |
| hover 一行                                    | 行尾 mono 时间戳 `opacity-0` → 1                          | fast                           | 时间戳不占常驻视觉预算                         |
| 头像加载失败 / 无头像                         | 直接渲染首字母圆标（`FL` 式两位）                         | 无                             | 不出破图、不出骨架屏                           |
| 点 ⋯ →「助手设置」                            | `ResponsiveDialog` 打开，焦点落「助手名字」               | 弹层自带                       | 面板不收起（`data-operator-keep`）             |
| 选一款预设 AI 头像                            | 格子 `ring-2 ring-primary`，沟里助手头像即时换掉          | 选中态 fast                    | 乐观更新，保存失败回滚并出错误行               |
| 上传自定义头像                                | 选图 → 预览 → 保存；超 5MB / 非 JPEG·PNG·WebP 就地报错    | 无                             | 走 §8.3 管线                                   |
| 改语气 / 长度 / 语言 / 默认行为               | 分段控件选中态；底部 mono「已保存」                       | 选中态 fast                    | 下一轮请求带上新 persona，**不重发本轮**       |
| 「默认行为」= 总是先出计划                    | 「先问我」开关默认开，带 `title`「来自助手设置」          | 无                             | 单轮仍可关，关只对本轮生效                     |
| 计划卡待定项渲染                              | 每格 34px 图示 + 标签                                     | `cardIn` reveal + stagger 30ms | `visual` 在词表内才画图示                      |
| `visual` 不在词表 / 缺失 / 是「选哪张参考图」 | 退化为纯文字 chip（等高）/ 换成素材缩略图（`aspect-3/4`） | 同上                           | ⛔ 不猜、不回退到「随便一个图标」              |

**375px 列**：本轮 **不渲染**（`StudioOperatorDock.tsx:320` `return null`），移动端下一轮（owner 2026-09-06）。

---

## 4. 状态矩阵

### 4.1 面板态 × 运行态

| 面板态 \ 运行态 | idle                                                     | working                                                | awaitingPlan                     | awaitingConfirm                      | queued                       | error                              | stopped                                       |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------------ | ---------------------------- | ---------------------------------- | --------------------------------------------- |
| **展开**        | 进度带退化为 `域 chip · 会话名 · ⋯ · 收起`，建议药丸可见 | 进度带 `3/6 · 正在挂 LoRA`，ToolGroup 流式展开，⏹ 可点 | 计划卡钉在流末尾，输入框仍可打字 | 确认卡钉在末尾，其余流暂停，⏹ 仍可点 | 排队条浮在输入框上方，带撤回 | 错误行 inline + 重试，已发文本留屏 | 进度带「已停止 · N 步已完成」，已落 op 不回滚 |
| **图标轨**      | 状态点中性 + 「4 张就绪」                                | 进度环 `3/6` + 状态点 primary 脉冲                     | 状态点闪烁 + 「待你定」          | 状态点 warning + 「待确认」          | 计数徽标 +1                  | 状态点 destructive + 感叹号        | 状态点中性 + 「已停止」                       |
| **拖拽中**      | 内容按目标宽度重排（缩略 2→4 列），不阻断在飞流          | 同左，进度带文字按宽度截断                             | 待定项按宽度换 1/2 列            | 确认卡按钮永不换行（下限 420 保证）  | 排队条单行截断               | 错误行不截断                       | 同 idle                                       |

### 4.2 卡片态

| 卡片           | 态                 | 显示什么                                                                                                                                            |
| -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **计划卡**     | 待定 / 已定        | 阶段列表 + 待定项未选 + credits 灰显 + 「开始」disabled → 显示已选值，确认后整卡 `.resolved`，标题「计划 · 已确认」                                 |
| **确认卡**     | 待定 / 通过 / 拒绝 | 三选（追加/覆盖/保留）或花钱四要素 + 「不再问」勾选，流暂停 → `.resolved`「已处理 / 已批准」带撤销入口 → 「保留了你写的」，助手下一条说明改走哪条路 |
| **候选网格**   | 待选 / 已用        | 6 格：缩略 + 域名 + 发布者 + 可作输入勾/叉；底「已选 N 张」→ `.resolved`「N 张已挂到参考槽」                                                        |
| **结果行卡**   | 未选 / 已选 / 被 @ | 等权 → primary 内描边 + 角标 → @ 角标且 chip 同色                                                                                                   |
| **评审卡**     | 到达               | 嵌图 + 三段；标题注「仅看 结果②」                                                                                                                   |
| **checkpoint** | 可撤 / 已撤        | 「已改 N 项 · 撤销」→ 就地二选 → 「已撤销 · 只回参数」+ 系统行                                                                                      |
| **规则薄卡**   | 命中               | 规则原文 + `记于 2026-08-14` + 「查看规则」                                                                                                         |
| **排队条**     | 在队 / 已接 / 已撤 | warning 虚线条 → 系统行「插入为第 N 步」→ 淡出 + 系统行                                                                                             |

### 4.3 横切规则

- **缺 API key**：模型仍显示、入口不禁用，点击开 `QuickSetupDialog`（CLAUDE.md Hard Rule 8）。⛔ 不做置灰占位。
- **不支持的能力不渲染**，不做禁用占位。
- **七态**：每个可点元素覆盖 `default/hover/active/focus-visible/disabled/loading/selected`（`ui-defaults.md §5`）；命中区 fine ≥32px。
- **空态**：一句说明 + 建议药丸，不留白板。

---

## 5. 流程图

```mermaid
flowchart TD
  A[用户发消息] --> B{先问我 开着?}
  B -- 是 --> P[强制出计划卡]
  B -- 否 --> C{客户端硬判: 本轮 plan 帧含 prime_generate 或 步数 ≥ 3?}
  C -- 是 --> P
  C -- 否 --> W[直接进 working]
  P --> P1{用户选}
  P1 -- 修改 --> P
  P1 -- 开始 --> W
  W --> S[逐步 SSE step]
  S --> T{这一步是什么?}
  T -- 免费动作 --> F[直做, 留 inverse]
  T -- 命中项目规则 --> RU[规则薄卡: 原文+日期]
  T -- 覆盖用户手写 --> O[三选: 追加/覆盖/保留]
  T -- 花钱/不可逆 --> M{同会话+同模型+金额不超上次?}
  F --> S
  RU --> S
  O --> S
  M -- 否 --> H[硬确认卡: 模型/张数/credits]
  M -- 是 --> TH[薄卡: 按你的设置直接生成]
  H -- 确认 --> G[客户端触发生成]
  H -- 拒绝 --> S
  TH --> G
  G --> R[结果行卡]
  R --> CK[checkpoint 薄卡]
  CK --> END[进度带回落]
  S -.运行中回车.-> Q[排队条]
  Q -.每个工具步边界.-> S
  S -.Stop.-> X[abort, 已落 op 不回滚]
```

**计划卡出卡时机 = 客户端硬判（owner 2026-09-06 定）**：判据只落在**客户端**——本轮 `plan` 帧里含 `prime_generate`，**或**步数 ≥ 3，就出计划卡；两条都不满足直接进 working。⛔ **服务端不判**：不往 system prompt 里写「你自己决定要不要出计划卡」，模型自判既不稳定，也与「无服务端会话态」相冲。前提是 `plan` 帧先于第一个 `step` 到达（⚠ 未核实：现有 SSE 帧序是否已保证，实现时按 `src/lib/assistant-stream.test.ts` 的写法钉一条测试）。

```mermaid
flowchart LR
  E1[输入 @] --> CH[@chip 带缩略图]
  E2[结果 hover 问助手] --> CH
  E3[拖图进输入框] --> CH
  E4[助手反问 你指哪张] --> CH
  CH --> N{chip 数 > 8?}
  N -- 是 --> WARN[提示 超 8 张可能不准, 全看不截断]
  N -- 否 --> SEND[发送: 消息 + 图地址]
  WARN --> SEND
  SEND --> LOOK[critique_result 看图]
  LOOK --> CARD[评审卡: 嵌图 + 否定/异常/建议]
  CARD --> FIX[改提示词 + checkpoint]
  FIX --> MONEY[花钱确认 或 不再问薄卡] --> NEW[新一行结果] --> CH
```

---

## 6. 确认三档与钱闸

**钱闸不动**（`src/constants/assistant-operator.ts:17-21` 那段注释是本片的宪法）：工具表里没有任何一条能创建 generation，将来也不许有；`prime_generate` 只置 primed 并算价（`:187`）。

| 档               | 触发                                                 | 形态                                                                   | 落地                                                     |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| **免费直做**     | 改提示词 / 参数 / 挂 LoRA / 挂参考                   | 无卡，留 checkpoint 薄卡                                               | op 自动落，带 `inverse`                                  |
| **覆盖用户手写** | 目标字段已有用户手写内容（判据是客户端快照，拍板 3） | 就地三选：**追加在后 / 覆盖 / 保留**，字段旁小条不弹窗                 | 用户选完才落                                             |
| **花钱与不可逆** | 触发生成                                             | 硬确认卡：模型 / 张数 / 比例 / 预估 credits + 「本会话此类不再问」勾选 | **客户端扣扳机**（新增档，见 §12 拍板 2），服务端只吐 op |

**「不再问」作用域（拍板 24，2026-09-06 定）** = 同会话 **且** 同模型 **且** 单次不超上次确认金额。三者任一不满足重新硬确认。命中时不静默过，出 `.pass` 薄卡：「按你的设置直接生成 · 4 credits」+ 第二行 mono 写明命中条件 +「改回每次确认」。

⛔ 服务端钱闸一字不动。⛔ persona（§8）的任何取值都不得让 `prime_generate` 之外多出一条花钱的路。

---

## 7. @ 与看图

**四入口**（§3.3）：键盘 `@` 选择器 · 结果缩略 hover「问助手」· 拖图进输入框 · 助手歧义反问单选。四条走**同一条 chip 管线**，chip = 缩略图 + 文本 + `×`。

**看图上限：不设硬上限**（owner 2026-09-06）。chip 区显示「将看 N 张」；N > 8 时计数转 warning 并提示「超 8 张可能不准」，**全部都看，不拦截也不软截断**。⛔ 原型阶段的「只细看前 8 张」文案作废。

**归属票不再是看图唯一凭证**（拍板 4 推翻）：`@` 指定任意图一律可看。归属票保留作**自动开场白**路径（用户点了助手备的那一枪之后助手主动开口），不再作为 `critique_result` 的准入。

**评审卡**固定三段：**否定**（`--status-risk`）/ **异常**（`--status-warning`）/ **建议**（`--status-applied`），卡上内嵌被评的那张图（拍板 6 现值，`StudioOperatorCritiqueCard.tsx:4` 的注释就是这条）。视频域第二期扩成三帧抽帧版。

---

## 8. 助手设置（persona · 第一期）

> **一个用户一份，四域共用，全局生效**——它说的是「这个助手是谁、怎么说话」，不是「这台工作台怎么设」。⛔ 不做域级覆盖（Engineering Principles 2）。

### 8.1 入口与容器

- **主入口**：面板头部 ⋯ 菜单加一项「助手设置」。现有 ⋯ 菜单在 `src/components/business/studio/assistant-operator/StudioOperatorPanel.tsx:314-329`（今天只有停用的「分享 / 反馈」两项）；⛔ 不要塞进 `:236-260` 那个**会话菜单**（「新对话」住在那里，两个菜单职责不同）。触发器带 `data-operator-keep`。
- **容器**：`src/components/ui/responsive-dialog.tsx`（已存在），`max-w-lg` 单列，⛔ 不分栏。
- **第二入口**：仓库没有 `/settings` 路由，账户编辑就是 `src/components/business/ProfileEditModal.tsx`（由 `ProfileHeader.tsx:251` 传值打开）——在它底部加一行打开**同一个** `AssistantSettingsDialog`，⛔ 不把 persona 字段抄进它的表单。

### 8.2 字段表

| 字段                    | 控件                              | 取值                                             | 默认                        | 落到哪                                        |
| ----------------------- | --------------------------------- | ------------------------------------------------ | --------------------------- | --------------------------------------------- |
| **助手名字**            | 单行输入，≤24 字                  | 自由文本，可空                                   | 空 = 用域名（「图片助手」） | 沟里头像兜底首字母 · 系统提示第一句           |
| **AI 头像**             | 6–8 格预设 + 「上传」格           | `avatarPreset` 枚举 或 `avatarUrl`               | 预设第一款                  | §11.3 `TimelineAvatar`                        |
| **语气**                | 四段分段控件                      | `professional` / `friendly` / `terse` / `custom` | `professional`              | 系统提示风格段                                |
| **语气 · 自定义一句话** | 单行输入 ≤80 字，仅 `custom` 出现 | 自由文本                                         | —                           | 同上，原样引在风格段里                        |
| **回复长度**            | 三段                              | `concise` / `standard` / `detailed`              | `standard`                  | 系统提示风格段（给字数区间，不给「简短点」）  |
| **默认行为**            | 三段                              | `always` / `auto` / `direct`                     | `auto`                      | 「先问我」开关的**初始态** + 系统提示出卡判据 |
| **回复语言**            | 三段                              | `ui` / `chinese` / `english`                     | `ui`                        | 覆盖请求里的 `responseLanguage`               |

**AI 头像预设**：6–8 款（图形 / 字母 / 色块各 2–3 款），全部**内联 SVG 常量**放 `src/constants/assistant-persona.ts`，只用 `currentColor` + `--primary`。⛔ 不放静态图片文件。

### 8.3 自定义头像上传（复用既有 R2 管线）

现成链路：`uploadAvatarAPI()`（`src/lib/api-client/profile.ts:115`）→ `POST /api/users/me/avatar` → `uploadAvatar()`（`src/services/user.service.ts:422`）→ `uploadToR2()`（`src/services/storage/r2.ts`）。

⚠ 它写死 `User.avatarUrl`（`user.service.ts:445` 起）——那是**账户头像**不是 AI 头像。第一期加并行函数 `uploadAssistantAvatar(userId, imageData)`，同文件同形状（同 5MB 上限、同 JPEG/PNG/WebP 白名单、同「先删旧 storageKey 再传」顺序），两处不同：key 前缀 `profiles/<userId>/assistant-avatar/`（`generateProfileImageKey` 的 `type` 本就是入参，`user.service.ts:403`），写回 `AssistantPersona.avatarUrl` / `avatarStorageKey`。新路由 `POST /api/users/me/assistant-avatar`，仍走 `createApiRoute` + `RATE_LIMIT_CONFIGS.sensitiveWrite`。⛔ 不给 `uploadAvatar` 加 `target` 分支：它被账户头像与 Clerk 同步共用（`user.service.ts:283` / `:327`）。

### 8.4 数据：Zod + 存哪

```ts
// src/types/assistant-persona.ts
export const AssistantPersonaSchema = z
  .object({
    name: z.string().trim().min(1).max(24).nullable(),
    avatarPreset: z.enum(ASSISTANT_AVATAR_PRESET_IDS).nullable(),
    avatarUrl: z.url().nullable(),
    tone: z.enum(['professional', 'friendly', 'terse', 'custom']),
    toneCustom: z.string().trim().max(80).nullable(),
    verbosity: z.enum(['concise', 'standard', 'detailed']),
    planMode: z.enum(['always', 'auto', 'direct']),
    language: z.enum(['ui', 'chinese', 'english']),
  })
  .refine((p) => p.tone !== 'custom' || !!p.toneCustom, {
    path: ['toneCustom'],
  })
```

**结论：新建 `AssistantPersona` 表（1:1 于 `User`），不并进 `UserCreativePreference`（`prisma/schema.prisma:630`），也不加列到 `User`（`:112`）。** 四条理由：

1. `UserCreativePreference` 是**系统学出来的创作偏好**（五个字段全 `Json`，由行为推断并覆写）；persona 是**用户显式声明的人设**——读写时机、所有权、能否被系统改写三条全不同，混一张表 = 一个模块两件事（Principles 4）。
2. persona 每个字段都是有限枚举或短字符串，该是**列**；塞进那张表只能再加一个 `Json`，等于放弃 Prisma 的类型与默认值。
3. 自定义头像有 `avatarStorageKey` 要跟着删（换头像先删旧对象），需要独立列 + 独立生命周期。
4. 不往 `User` 加列：全仓最热的表。1:1 侧表按需 join，**缺行就用代码默认值** `ASSISTANT_PERSONA_DEFAULTS`，⛔ 不做首次访问自动建行。

### 8.5 服务端注入

落点 `src/services/kernel/assistant-operator.service.ts:2019` 的 `buildOperatorSystemPrompt`。现在的拼接顺序：域人设（`src/constants/assistant-protocol.ts:172` 的 `ASSISTANT_DOMAIN_BRIEFS`）→ 域槽位 → 域规矩 → HOW YOU TALK → TOOLS → OUTPUT。**风格段插在 HOW YOU TALK 末尾，`TOOLS:` 之前。**

- 请求侧：`AssistantOperatorRequest` 加可选 `persona`，**服务端自己按 `clerkId` 读**。⛔ 不从客户端收——它直连系统提示。
- **名字**非空时首句改 `You are ${name}, PixelVault's workbench operator.`，⛔ 不覆盖域人设。
- **语气**四档各一句英文指令；`custom` 原样单引号引入，前缀「the creator described how they want you to sound:」。⚠ 先过 `prompt-guard` 再拼。
- **长度**三档映射成**字数区间**（`under 2 sentences` / `2–4` / `up to 6`），⛔ 不给无边界形容词。
- **默认行为**：`always` → 「Always open with a plan card before touching anything」；`direct` → 「Skip the plan unless the request spends credits or needs more than three steps」；`auto` → 不写。⚠ 单轮「先问我」**永远压过** persona。
- ⚠ 风格段 ≤~400 字符。系统提示不参与 `OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH = 24_000`（`assistant-operator.service.ts:2153`）那段压缩，但 `toneCustom` 的 80 字上限是硬的。

### 8.6 i18n key 清单（`StudioOperator.persona.*`，en / ja / zh 三份同步）

```
壳    title description save saved cancel reset saveFailed scopeNote
名字  nameLabel namePlaceholder nameHint
头像  avatarLabel avatarPresets avatarUpload avatarUploading avatarRemove
      avatarTooLarge avatarUnsupported
语气  toneLabel tone.{professional,friendly,terse,custom}
      toneCustomPlaceholder toneCustomRequired
长度  verbosityLabel verbosity.{concise,standard,detailed}
行为  planModeLabel planModeHint planMode.{always,auto,direct}
语言  languageLabel language.{ui,chinese,english}
菜单  StudioOperator.more.assistantSettings   // 挂在现有 more 下，不新起命名空间
```

⚠ zh 最长：420 窄档下三段分段控件不得换行——`planMode.*` 三个标签各 ≤5 字。

---

## 9. 计划卡待定项图示词表（第一期）

**契约**：模型每个待定项返回 `{ label, visual? }`，`visual` 只能取自下面 32 项封闭枚举。前端三条分支按序：① `assetUrl` 有值 → 画缩略图（`.pick-grid`，`aspect-3/4`）；② `visual` 命中词表 → 画预置图示；③ 都没有 → **纯文字 chip**，与有图示的格子等高。⛔ 不留空图位、⛔ 不猜近似图标。⭐ 运行时不需要用户准备任何素材。

**词表（7 组 32 项）· 落点 `src/constants/assistant-plan-visuals.ts`**：

| 组   | 枚举值（前缀即组）                                                                               | 项数 |
| ---- | ------------------------------------------------------------------------------------------------ | ---- |
| 构图 | `comp.fullBody` `comp.halfBody` `comp.closeUp` `comp.birdsEye` `comp.wormsEye` `comp.fromBehind` | 6    |
| 比例 | `ratio.1x1` `ratio.3x4` `ratio.4x3` `ratio.16x9` `ratio.9x16`                                    | 5    |
| 时段 | `time.day` `time.dusk` `time.night` `time.dawn`                                                  | 4    |
| 天气 | `weather.clear` `weather.rain` `weather.snow` `weather.fog`                                      | 4    |
| 镜头 | `cam.push` `cam.pull` `cam.pan` `cam.track` `cam.static`                                         | 5    |
| 光线 | `light.front` `light.back` `light.side` `light.soft`                                             | 4    |
| 风格 | `style.anime` `style.realistic` `style.painterly` `style.lineart`                                | 4    |

**画法分配**（`lucide-react`，逐个确认过 `node_modules` 里有）：

| 画法                    | 项                                                                                                                                                           | 说明                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **lucide 直接用（12）** | 时段 `Sun`/`Sunset`/`Moon`/`Sunrise`；天气 `CloudSun`/`CloudRain`/`CloudSnow`/`CloudFog`；镜头 `ZoomIn`(推)/`ZoomOut`(拉)/`MoveHorizontal`(移)/`Frame`(固定) | 统一 `size-[18px] stroke-[1.5]`，居中于 34px 格                          |
| **自绘 SVG（16）**      | 构图 6（人形剪影 + 取景框裁切线）· 比例 5（同一个 `draw:'ratio'` 按参数画线框矩形）· 镜头「摇」1 · 光线 4（圆 + 光源方向短线，柔光多一圈虚化环）             | 图标库没有「方向」这一套；1.5px `currentColor` 描边，选中 `text-primary` |
| **渐变色块（4）**       | 风格 4：34px `rounded-md` + `bg-linear-to-br`，两端色只用 `color-mix(--muted / --primary / --status-*)`                                                      | 风格是气质，线描画不出来；⛔ 不引入脊柱外的新颜色                        |

**校验纪律**：非法 `visual` **剥成 `undefined` 并 `logger.warn`**，不让整张计划卡因为模型写错一个 id 就解析失败（失败大声暴露，但不中断这一轮）。

**系统提示怎么说**（拼进 §8.5 同一段之后，把 32 项分组逐项列全——只写「从预置词表里选」= 模型必然自造）：

```
Each pending option may carry "visual" — a picture hint the app draws for the creator.
Use it ONLY when one of these exact ids fits; otherwise omit it and the option shows as plain text.
Never invent an id, never translate one, never put a description there.
  composition: comp.fullBody comp.halfBody comp.closeUp comp.birdsEye comp.wormsEye comp.fromBehind
  ratio: ratio.1x1 ratio.3x4 ratio.4x3 ratio.16x9 ratio.9x16
  time: time.day time.dusk time.night time.dawn
  weather: weather.clear weather.rain weather.snow weather.fog
  camera: cam.push cam.pull cam.pan cam.track cam.static
  light: light.front light.back light.side light.soft
  style: style.anime style.realistic style.painterly style.lineart
When the choice is "which reference image", put the asset URL in "assetUrl" instead — the thumbnail IS the option.
```

---

## 10. 项目规则卡（第一期，拍板 23）

**为什么在第一期**：owner 的真实工作流把价值沉淀在版本状态与复盘文档里（`eva-flow-vs-assistant.md` S8 / S10），助手一条都读不到、写不回——缺的是一张表，不是一个 UI。

**第一期只做三件**：

1. **一张表**（项目级规则：规则原文 · 来源 · 记录日期 · 作用域）。
2. **两条工具**：`read_project_rules`（读）/ `record_project_rule`（记一条）。两条都是免费直做档，`record_project_rule` 留 `inverse`（删除刚记的那条）。
3. **规则薄卡**（§2.21 / §4.2）：助手引用了某条规则时贴在动作卡下——规则原文 + `记于 YYYY-MM-DD · 来源：××` + 「查看规则」。⛔ 不用状态色：规则不是成功也不是警告，走系统行档（`border-l-2 border-border bg-muted/40`）。

**后续（不在第一期）**：素材版本状态（`search_assets` 返回 `blocked` / 已确认 / 待确认）、素材黑名单。视频域第二期把「被判失败的素材不得再作首帧」串进工具环，命中时出规则薄卡 + 拒绝理由。

---

## 11. 视觉规范 · 方向 C「工作日志」（owner 2026-09-06 选定）

> 基准原型 `proto4-c-log.html`（§18）。合入代码时**只留结构与配方，不留原型的自造类名**：全部改写成 Tailwind 工具类 + `globals.css` 既有 token。原型阶段的「不受脊柱约束」在此结束。

### 11.1 面板几何

| 项       | 值                                                                                                                               | 依据                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 定位     | `fixed`，`top/right/bottom = 24px`，`z-40`                                                                                       | 覆盖不挤压（拍板 9）                               |
| 宽度     | 默认 **560**，拖拽 **420–860**，宽度记忆                                                                                         | `src/constants/studio-assistant-operator.ts:25-32` |
| 折叠态   | 宽 **48**，内容 `opacity 0 + pointer-events:none`，图标轨 `absolute inset-0`                                                     | 拍板 7                                             |
| 容器皮   | `bg-card` + `border` + `shadow-lg` + `rounded-xl`                                                                                | 全站脊柱，无自造材质（`ui-defaults.md §3`）        |
| 三段     | 进度带（`flex-shrink-0` + 下 1px border）/ 时间线（`flex-1 min-h-0 overflow-y-auto`）/ 输入区（`flex-shrink-0` + 上 1px border） | 只有中段滚                                         |
| 时间线沟 | `grid-cols-[78px_1fr] gap-x-2`；贯穿竖线 = `::before` 1px `bg-border`，`left: 18px`                                              | 节点与头像同轴                                     |
| 拖拽把手 | `absolute inset-y-0 left-0 w-[10px]`，内 6×56 圆条；hover/拖拽 `primary 40%/60%`                                                 | `role=separator` + `aria-valuenow`                 |
| 宽档     | `≥700`（`.wide`）时结果网格 2 列 → 4 列，候选 3 列不变                                                                           | 拍板 9「不留白」                                   |

### 11.2 脊柱用法（硬约束）

- **字体两槽**：正文 `font-sans`；`font-mono` 专管四类——时间戳 / credits 与金额 / 耗时与毫秒 / 过程行（op 行、快照片段、提示词代码块）。⛔ `font-display`（Fraunces）不进面板（`ui-defaults.md §1`：展示槽只给首页 hero、legal 标题、空态大标题）。
- **小字**：元信息统一 `text-2xs`(11px) + `tracking-nav`，第三层 `text-3xs`(10px)。数字一律 `tabular-nums`。
- **强调只用 `--primary`**（浅色档 = 纯黑）：选中态、勾选、@chip、进度环、生成按钮。⛔ 不引入第二强调色。**全站强调色只用 `--primary`（owner 2026-09-06 定）**：域强调色那套治理已废除，`--modality-*` 只留给 prompts 域（`ui-defaults.md §2.3`）。⛔ 不为助手面板或任何域新造强调色变量。
- **状态四 token 分工**（唯一允许的彩色）：

| token                           | 只用于                                    | 典型落点                                                                                   |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `--status-applied` / `-surface` | **checkpoint 与成功**                     | checkpoint 薄卡左缘 2px + 浅底 · op 行 `✓` · 进度清单 done · 评审卡「建议」段              |
| `--status-warning` / `-surface` | **花钱与排队**                            | 花钱确认卡描边与标题 · 免确认薄卡 · 排队条 · 进度清单 run · 评审卡「异常」段 · @ 超 8 计数 |
| `--status-risk`                 | **失败与否定**（无 `-surface`，有意为之） | ToolGroup 失败计数 · op 行 `✕` · 评审卡「否定」段                                          |
| `--destructive`                 | 破坏性按钮                                | ⏹ Stop · 「连对话一起回」· 「清掉全部改动」                                                |

- **`.dark` 只在灯箱**：面板全程浅色档（`ui-defaults.md §2.1`：`.dark` 只允许出现在媒体观看面）；灯箱容器挂 `.dark`，其余任何位置出现 `.dark` 即视为违规。
- **面与线**：卡片 `bg-card + border + rounded-xl`；卡脚 `bg-[color-mix(muted 45%)]`；提示词代码块 `bg-muted + rounded-md`；不用阴影堆叠层级（面板本身 `shadow-lg` 之外，卡片零阴影，按钮 `shadow-xs`）。

### 11.3 时间线沟：头像 + 形状节点分级

> 层级靠形状与缩进，不靠颜色和底色块。**会说话的两方用头像，其余仍用形状**。头像与形状节点**同轴**（沟内 x=18px），沟宽 78px 一格不动。

| 沟位       | 形态     | 尺寸 / 样式                                      | 承载                                             | 上间距 |
| ---------- | -------- | ------------------------------------------------ | ------------------------------------------------ | ------ |
| **用户**   | 账户头像 | 20px 圆，`ring-2 ring-card`；无头像 = 首字母圆标 | 用户消息                                         | 16px   |
| **助手**   | AI 头像  | 20px 圆，`ring-2 ring-card`                      | 助手消息 / 计划卡 / 评审卡（一轮只挂第一行）     | 16px   |
| **大节点** | 实心圆   | 8px，`bg-primary`，3px `card` 描边环             | 确认卡 / 候选卡 / 结果卡 / 动作卡                | 16px   |
| **工具步** | 空心圆   | 6px，`bg-card` + 1px `border`，3px 环            | ToolGroup 折叠行 / 思考区                        | 8px    |
| **系统行** | 短横     | 8×2px，`bg-muted-foreground`                     | 系统行 / checkpoint 薄卡 / 规则薄卡 / 免确认薄卡 | 8px    |

⛔ **用户方块节点（7×7 `bg-foreground`）删除**，被账户头像整体取代，不做「有头像走头像、没头像走方块」的双形态——首字母圆标就是没头像那一档（Principles 1）。

**`TimelineAvatar` 配方**（沟内绝对定位，与竖线同轴）：

```
容器  absolute left-2 top-0 size-5 shrink-0 overflow-hidden rounded-full ring-2 ring-card bg-muted
图片  size-full object-cover     // next/image unoptimized，同 AppSidebar.tsx:481-493 的写法
兜底  flex size-full items-center justify-center font-mono text-3xs tracking-nav uppercase text-muted-foreground
```

- **用户头像源**：`useMyProfile()`（`src/hooks/use-my-profile.ts:53`）的 `avatarUrl`——Clerk 的 `imageUrl` 首次入库时同步进 `User.avatarUrl`（`src/services/user.service.ts:283` / `:327`），之后可被自传头像覆盖。⛔ 面板内不另调 Clerk `useUser()`：两个真相源在用户换过头像后会各说各话。
- **首字母**：`(displayName ?? username).charAt(0).toUpperCase()`，同 `src/components/business/ProfileHeader.tsx:87`；本轮扩到两位（`FL` 式），中日文取一个字。
- **⚠ 仓库现状**：没有 `UserAvatar` 组件。`src/components/ui/avatar.tsx` 是 Radix 三件套（只有 `src/components/ui/message.tsx` 在用，三档 24/32/40），侧栏是裸 `span` + `UserCircle`（`AppSidebar.tsx:481-493`）。20px 不在那三档里，**本轮不为它改共享原语**，`TimelineAvatar` 自己写这几行。
- **AI 头像源**：`persona.avatarPreset`（内联 SVG）或 `persona.avatarUrl`（`next/image`），见 §8。未加载完先画首字母，⛔ 不出骨架屏。
- **时间戳**：头像行的挂行尾，`font-mono text-2xs tracking-nav tabular-nums text-muted-foreground/75`，默认 `opacity-0`，`group-hover:` / `focus-within:opacity-100`，过渡 `duration-(--duration-fast)`；`title` 带完整时刻供无 hover 设备与读屏。形状节点行不变：右侧常显 `font-mono text-3xs`。

### 11.4 卡型配方

> 容器统一 `.card` = `rounded-xl border border-border bg-card overflow-hidden`，三段 head(`px-3 py-2` + 下 border) / body(`p-3 flex flex-col gap-3`) / foot(`px-3 py-2` + 上 border + muted 45% 底)。标题 `text-xs font-semibold`，右侧注 `font-mono text-3xs text-muted-foreground`。已处理的卡加 `.resolved`（`opacity-[.92]` + 标题转 muted）。

| 卡型                | 配方要点                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **计划卡**          | head「计划 · 待确认」+ 注「4 阶段 · 2 个待定」；body：阶段 `<li>` 带 mono 序号 + 待定项 `grid-cols-3 gap-1.5`，每格 `rounded-lg border p-2.5`（选中 `border-primary` + inset ring 1px，带 34px 图示）；foot 注「预估 4 credits」+「修改」+「开始」primary                                                                                            |
| **ToolGroup**       | 无卡框，一行：标题 `text-xs` + mono 3xs 计数（失败数套 `text-status-risk`）+ 右侧箭头；展开体 `grid-rows-[0fr→1fr]` + 内缩进一级；op 行 = 状态字符（`✓` applied / `✕` risk）+ 描述 + 右对齐 mono 耗时                                                                                                                                                |
| **反问单选卡**      | 同计划卡的选项网格；歧义反问用 `grid-cols-4 gap-1.5`，格 `aspect-3/4 rounded-md`，hover 出 2px primary 外环                                                                                                                                                                                                                                          |
| **覆盖三选**        | body 上半 diff：`旧` 行 `line-through` + muted，`新` 行 foreground，标签列 46px mono；下半三等分连体按钮（`grid-cols-3` 内嵌 1px 分隔，选中格 `bg-primary text-primary-foreground`）                                                                                                                                                                 |
| **花钱确认**        | `.card.warn`：`border-[color-mix(status-warning 40%)]`，标题 `text-status-warning`；body `dl` `grid-cols-[auto_1fr] gap-x-3.5`，金额 mono 15px 600；勾选「本会话此类不再问」（accent-color = primary）；foot「取消」+「生成」primary                                                                                                                 |
| **候选网格**        | body `grid-cols-3 gap-2`；每格 `role=checkbox`：`aspect-square rounded-lg border`，右上 14px 勾选框（选中 = `ring-2 ring-primary ring-offset-2 ring-offset-card`）+ **三行元信息**：域名（mono 3xs，可点开新窗）· 发布者（2xs muted，缺失写「未知」）· 可否作生成输入（`✓ 可作输入` applied / `✕ 仅参考` risk）；foot「已选 N 张」+「跳过」+「选用」 |
| **结果行卡**        | body `grid-cols-2`（`.wide` 下 4 列）；格 `aspect-3/4 rounded-lg border`，左上 mono 序号，选中 `border-primary` + inset ring 2px；hover/focus-within 出底部渐变浮层两颗（「问助手」「放大」）；foot「未选定 / 已选 ②」+「按这张继续」                                                                                                                |
| **评审卡**          | body `flex gap-2.5`：左 `80×112 rounded-lg` 嵌图（带序号），右三段，标签列 26px mono——`否定` risk · `异常` warning · `建议` applied；建议里的语法片段套 `<code>`(`bg-muted rounded-[3px] px-[3px]`)                                                                                                                                                  |
| **checkpoint 薄卡** | 不是 `.card`：`border-l-2 border-status-applied bg-status-applied-surface rounded-r-md px-2.5 py-1.5 text-2xs`；右侧「撤销」ghost，点击**就地**替换为三颗（只回参数 / 连对话一起回 danger / 取消），完成后替换为 mono「已撤销 · 只回参数」                                                                                                           |
| **免确认薄卡**      | 同上但 warning 档；第二行 mono 3xs 写明命中条件「同模型 X · 本次 4 ≤ 上次确认 4 credits」+「改回每次确认」                                                                                                                                                                                                                                           |
| **项目规则薄卡**    | 系统行档，`border-l-2 border-border bg-muted/40 rounded-r-md px-2.5 py-1.5`：第一行规则原文（`text-2xs`，前缀「依据项目规则」）；第二行 mono 3xs「记于 2026-08-14 · 来源：第 12 镜复盘」+「查看规则」。⛔ 不用状态色                                                                                                                                 |
| **排队条**          | 输入框上方：`rounded-md border border-dashed border-[color-mix(status-warning 40%)] bg-status-warning-surface px-2 py-1.5 text-2xs text-status-warning`，内含被排队原文（`truncate`）+「撤回」                                                                                                                                                       |
| **@chip**           | `rounded-lg border-[color-mix(primary 30%)] bg-[color-mix(primary 10%)] text-primary`，18px 缩略 + 文本 + `×`；chip 区右端计数 mono，>8 时转 warning                                                                                                                                                                                                 |

### 11.5 动效（按 `src/app/globals.css:198-202` 真值）

> ⚠ **订正**：设计简报 §6 写的 `150 / 200 / 300 / 400ms` 与 `cubic-bezier(.2,0,0,1)` **作废**。唯一来源是 `globals.css:198-202` ↔ `src/constants/motion.ts`。

| 配方                     | 值                                                                                   | 用在哪                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `fast`                   | **120ms** + `--ease-standard: cubic-bezier(.22,1,.36,1)`                             | hover / 选中态 / 按压 `scale(.98)` / chip 入场 / 浮层显隐 / 按词淡入（opacity + blur 2px）                    |
| `base`                   | **200ms**                                                                            | 折叠展开（`grid-template-rows` 0fr↔1fr，锁滚动位置）/ 列表项进入 / 结果与候选 `tileIn`(opacity + y8) / 排队条 |
| `slow`                   | **320ms**                                                                            | 面板宽度过渡（图标轨 ↔ 展开，内容 opacity `fast` 交叉）/ 进度环 `stroke-dashoffset`                           |
| `reveal`                 | **500ms**                                                                            | 计划卡 / 确认卡 / 评审卡入场（opacity + y8）/ 表单写入高亮 `writeFlash`                                       |
| stagger                  | 30ms，最多前 12 项（`ui-defaults.md §4`）                                            | 结果格、候选格、阶段列表                                                                                      |
| 参考挂载                 | 0.07s stagger                                                                        | 参考槽填充（拍板 17 现值）                                                                                    |
| `prefers-reduced-motion` | 全部降为无动画；卡 / 结果格 / 候选格 / 入场行 / chip 强制 `opacity:1 transform:none` | 硬门（`checklists/ui.md` 第 5 项）                                                                            |

⛔ 只动 `transform` / `opacity` / `grid-template-rows`；进度环例外（`stroke-dashoffset`）。

---

## 12. 拍板变更表（20 条代码拍板 → 本轮新状态）

> 全套 = **20 条代码拍板**，编号沿用源码注释里的 2–22（无 1 与 5，这两个号在 `src/` 与 git 历史均零命中，2026-09-06 owner 确认作废）。落点表见 §12.1；本轮另立 23 / 24 两条新拍板。

| #            | 现行内容                                                                          | 2026-09-06 结论                                                                                                |
| ------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 2            | 钱是唯一硬闸：工具表无创建 generation 的工具，`prime_generate` 只置 primed 并算价 | **改**：服务端钱闸一字不动；新增**客户端花钱档**——硬确认卡点「生成」由客户端扣扳机，不必回工作台再点一次       |
| 3            | 就地确认：覆盖手写前停流问一次，判据是客户端快照                                  | **保留**，升级为三选：追加在后 / 覆盖 / 保留                                                                   |
| 4            | 归属票：只看自己备的那一枪                                                        | **推翻**：改为「@ 指定任意图一律可看」。归属票保留作自动开场白路径，不再是看图唯一凭证                         |
| 6            | 评价卡内嵌它评的那张图                                                            | **保留**，短评固定三段：否定 / 异常 / 建议                                                                     |
| 7            | 点工作台收成胶囊，点提示词框/面板不收，无定时器                                   | **改**：收放规则一字不改，形态从胶囊改 **48px 图标轨**；`PILL_TONES` 四档语义迁到状态点                        |
| 8            | 一个助手跨域：切域换工具不断会话                                                  | **保留**                                                                                                       |
| 9            | 覆盖层 560 / 420–860 / 宽度记忆                                                   | **改**：三数与记忆键不变，新增「内容随宽度自适应」硬要求（缩略 2/3/4 列换档，不留白）                          |
| 10           | 头部 = 身份 + 域 chip · 会话 · ⋯ · 收起                                           | **改**：头部改进度带（~40px），空闲时退化为原头部；会话/历史/新对话收进 `⋯`                                    |
| 11           | 模型 chip 住输入框上方，点开复用自动路由组件                                      | **保留**。⛔ 绝不另造选择器（2026-08-19 生产事故）                                                             |
| 12           | 输入区双行                                                                        | **改**：上行加第四颗「先问我」                                                                                 |
| 13           | 工作态下发送键就是插话                                                            | **改**：运行中不锁，回车 = 排队引导，**停顿点 = 每个工具步边界**；只有 ⏹ 才 abort                              |
| 14           | 「清掉全部改动」二击 3s + 熄灭生成键 + 只清当前域                                 | **改**：全局清除保留；新增每轮 checkpoint 薄卡作细粒度撤销。结果不删，只回参数                                 |
| 15           | 建议药丸 `minChanges` 门                                                          | **保留**                                                                                                       |
| 16           | 上传三通道 + 附件面板一屏 6 格                                                    | **保留**                                                                                                       |
| 17           | 参考挂载 stagger 0.07s + 灯箱共用                                                 | **保留**，灯箱范围扩到结果行卡缩略                                                                             |
| 18           | 逐步撤销 + 系统行 + 日志详情                                                      | **改**：粒度升到每轮一张薄卡，二选。`inverse` 契约与系统行原样保留                                             |
| 19           | 只动看得见的旋钮，没槽就 `noSuchControl`                                          | **保留**（可信度地基）                                                                                         |
| 20           | 「打开完整素材库」就地弹层不跳页                                                  | **保留**                                                                                                       |
| 21           | 联网候选浏览零下载                                                                | **保留**，UI 升为候选网格卡，**每格三字段：URL · 发布者 · 可否作生成输入**                                     |
| 22           | 用户递来的链接可接（「你递的就是确认」），失败面 `urlImportFailed`                | **保留**，并入 @ 四入口的拖图通道                                                                              |
| **23（新）** | —                                                                                 | **项目规则**：一张表 + 两条工具（读规则 / 记一条规则）+ 规则薄卡，第一期落地（§10）。版本状态 / 素材黑名单后续 |
| **24（新）** | —                                                                                 | **「不再问」作用域** = 同会话 + 同模型 + 单次不超上次确认金额；三者任一不满足重新硬确认（§6）                  |

### 12.1 operator 范式的 20 条代码注释拍板（落点表）

> 这 20 条从来只活在源码注释里，docs 从未收录。改这些行为前先读它旁边那段注释——每条都写了「去掉会怎样」。行号 2026-09-06 核过。

| #   | 一句话                                                                                       | 代码落点（代表处）                                                                |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2   | `prime_generate` 不是生成：服务端只吐 op，点的人永远是用户；它仍算「写」类，照样带 `inverse` | `src/constants/assistant-operator.ts:187`（钱闸总纲在 `:17-21`）                  |
| 3   | 目标字段已有用户手写内容时先走确认通道                                                       | `src/constants/assistant-operator.ts:109` · `StudioOperatorChangeRail.tsx:94`     |
| 4   | 归属追踪的「领票口」：自动只看它自己备的那次，用户自己发的不打扰                             | `src/components/business/studio/StudioPromptArea.test.tsx:1098`（判据钉在测试里） |
| 6   | 证据长在结论里——评价卡内嵌它评的那张图                                                       | `StudioOperatorCritiqueCard.tsx:4` · `StudioOperatorLogItem.tsx:94`               |
| 7   | 收起不掐在飞的那一轮：驱动 hook 调在**外壳**层，不在面板里                                   | `StudioOperatorDock.tsx:126` · `:132`                                             |
| 8   | 一个助手跨域，域是头部一枚 chip；切域换工具、不断会话（音频档有意不挂）                      | `src/components/business/StudioWorkspaceUI.tsx:78` · `assistant-operator.ts:518`  |
| 9   | 覆盖层 560 / 420–860 / 宽度记忆，**记忆键必须与旧 dock 分开**                                | `src/constants/studio-assistant-operator.ts:17-32`                                |
| 10  | 会话历史住在外壳里：水化每次页面加载只跑一次，收放会反复卸载面板                             | `StudioOperatorPanel.tsx:122` · `:215` · `:235`                                   |
| 11  | 模型 chip 点开就是现有「自动路由」组件——⛔ 不另造选择器                                      | `StudioOperatorPanel.tsx:9` · `:696`                                              |
| 12  | 输入区双行：上行 📎 + 模型 chip + ⏹，下行 输入框 + 发送                                      | `StudioOperatorPanel.tsx:12` · `:675`                                             |
| 13  | 工作态占位语「说，我在听 — 插话即转向」；发送键在工作态就是插话                              | `StudioOperatorPanel.tsx:13` · `:757`（⛔ 本轮被排队引导取代，见 §12 拍板 13）    |
| 14  | 「清掉全部改动」二击 3s 窗口；⛔ 别做「反清掉」                                              | `src/constants/studio-assistant-operator.ts:35-41`                                |
| 15  | 建议药丸语境化、点即发送；值是 i18n 键后缀不是文案                                           | `src/constants/studio-assistant-operator.ts:97`                                   |
| 16  | 📎 素材库就地预览，不做「按钮→弹窗」两跳，一屏 6 格                                          | `StudioOperatorAttachMenu.tsx:4` · `StudioOperatorPanel.tsx:193`                  |
| 17  | 灯箱是全屏单例：参考缩略、评价卡证据图、附件 chip 共用一个，状态放模块级                     | `StudioOperatorLightbox.tsx:4` · `StudioOperatorLogItem.tsx:244`                  |
| 18  | 改动必须看得见来源：标记长在被改的那一栏，不躲在面板里                                       | `StudioOperatorChangeRail.tsx:7` · `StudioOperatorLogItem.tsx:4`                  |
| 19  | 判据只有一条——**工作台上有没有把它挂上去的槽**；「有这个类型」不等于「哪个域都能挂」         | `src/constants/assistant-operator.ts:367`                                         |
| 20  | 「打开完整素材库」就地开弹层，不跳页                                                         | `StudioOperatorAttachMenu.tsx:254`                                                |
| 21  | 联网候选的「选用」走**同一个 `attachments` 数组**：搜来的、传上来的、库里挑的往后分不出来    | `StudioOperatorDock.tsx:200` · `:215`                                             |
| 22  | 「你递的就是确认」：用户自己粘的地址取图入库直接挂；助手搜出来的仍要点「选用」               | `src/constants/assistant-operator.ts:205` · `:231`                                |

⚠ 一条现状债记在这里：评价卡的历史条目**没有 `runKey`**，所以历史里那张卡画不出「还原这轮」——那颗钮撤的是内存登记簿，刷新之后不存在（`src/lib/studio-operator-history.ts:319-321`）。第一期的 checkpoint 薄卡要么解决它，要么明确不在历史里渲染撤销入口。

---

## 13. 准确性工作包（与 UI 并行，不阻塞）

> 五条都是服务端/常量的事，UI 不依赖它们落地；但**文档与原型里的提示词文本必须已是正确 NovelAI 语法**。a / b / d 是第一期 P0。

| 代号  | 落点                                                                                                                       | 问题                                                                                                                                                                                                                                                                                                                                                                                                                                      | 验收                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **a** | `src/constants/model-strengths.ts:129`                                                                                     | NovelAI 的 `enhanceHint` 写着 SD WebUI 语法 `(feature:1.3)`；NovelAI 吃的是 `{tag}` / `[tag]` / `1.3::tag ::`。`:179` 那条是 NoobAI/Illustrious 家族（跑 SD 生态），**它是对的，别顺手改**                                                                                                                                                                                                                                                | `grep "feature:1.3"` 只剩 `:179`；vitest 断言 NovelAI 四个 id 含 `1.3::` 且不含 `(`+`:1.`                                                                            |
| **b** | `model-strengths.ts:297-299`                                                                                               | `isTagBasedPromptModel` 只查 `MODEL_STRENGTHS`（`:76` 起，14 键），漏 6 个 tag 系 id（`ANIMA_PENCIL_XL` / `ILLUSTRIOUS_RECIPE_CLONE` / `ANIMA_PENCIL_XL_RUNNER` / `PONY_DIFFUSION_V6` / `SDXL_10_RUNNER` / `ANIMA_DIT_RUNNER`），Pony 的 score 串一个字都没有                                                                                                                                                                             | 遍历 `IMAGE_MODEL_OPTIONS` 断言六个 id `promptStyle === 'tag-based'`；Pony 单独断言 score 串                                                                         |
| **c** | `src/constants/models/video.ts`（30 个模型）· `models/audio.ts`（4 个）· `model-strengths.ts:54` 的 `ADAPTER_PROMPT_HINTS` | ✅ **hints 已完成**（commit `ec0b25e2`）：口径定为「只补媒体 adapter」，补齐 6 条（byteplus / fish_audio / elevenlabs / minimax / minimax_cn / runner）；纯文本线路 ANTHROPIC / XAI **有意不补**——它们不出图不出声，方言由各自任务系统提示词管，理由写在 `model-strengths.ts:86-91` 的注释里。因此**不改穷举 `Record<AI_ADAPTER_TYPES, string>`**，保持 `Record<string, string>`。⬜ 仍未做：视频/音频模型在 `MODEL_STRENGTHS` 里一条没有 | 已完成部分：媒体 adapter 六条各有 hint，两条纯文本路由的缺席在代码注释里写明。剩余：视频/音频至少按 adapter 兜底                                                     |
| **d** | `src/services/kernel/assistant-operator.service.ts:2019-2090`                                                              | `buildOperatorSystemPrompt` 整个文件不 import `model-strengths`——收编 Operator 反而丢了方言（「提示词不准」的根因）。旧 Prompt 助手做了这件事                                                                                                                                                                                                                                                                                             | 注入 `getModelEnhanceHint()` + 必要时 tag 系规则；断言 NovelAI 档含 `1.3::`、GPT 图像档不含。⚠ 注意 `OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH`（`:2153`）的截断顺序 |
| **e** | `workers/execution/src/index.ts:6424-6455`                                                                                 | `use_coords: false` + `char_captions: []` 全硬编码空：即使助手写出多角色分镜也没有通道传下去。规则侧同样零覆盖（多角色 caption / quality 前置 / UC 预设 / `Text:` 语法）                                                                                                                                                                                                                                                                  | 分两片：① 规则片（constants + system prompt）② 通道片（worker 载荷 + schema）。**只做 ① 会让助手承诺一个不存在的能力**，两片齐了才能声称支持                         |

视频域的 Seedance 规则是好消息：`src/constants/seedance-prompt-plan.ts:47` 的 `SEEDANCE_25_CONTROL_RULES` 与 owner 手写的控制手册高度同构，差三块——素材分工契约、硬否定串、以及它跑在独立路由而不是工具环里。第二期一起收。

---

## 14. 分期与文件清单

> Engineering Principles 3：先端到端跑通最小版本。⛔ 绝不为尚未完成的复杂度拆掉能跑的东西。文件顺序按 Hard Rule 6：constants → types → services → hooks → components → i18n。

### 第一期 · 图片域面板（方向 C）+ 项目规则卡 + 准确性 P0 + 助手设置 + 计划卡图示词表

| 层         | 文件                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| constants  | `studio-assistant-operator.ts`（图标轨 48 · 进度带 40 · 面板 inset 24 · 排队条 · 「先问我」默认 · checkpoint 文案键 · 时间线节点尺寸）· `assistant-operator.ts`（计划卡 / 三档确认 / `queued` 停止原因 / 规则工具两条 / 不再问作用域三要素）· `model-strengths.ts`（§13 a·b）· **新** `assistant-plan-visuals.ts` · **新** `assistant-persona.ts`                                                                                                          |
| prisma     | **新** `AssistantPersona` 表（§8.4）· 项目规则表（§10）                                                                                                                                                                                                                                                                                                                                                                                                    |
| types      | `types/studio-assistant-operator.ts`（计划卡 · 排队项 · checkpoint · 结果行卡 · 规则薄卡 · 候选三字段）· `types/assistant-operator.ts`（新事件 `plan_request` / `queued` / `rule_hit`；确认档扩三档；计划卡待定项加 `visual` / `assetUrl`）· **新** `types/assistant-persona.ts`                                                                                                                                                                           |
| services   | `assistant-operator.service.ts`（§13d 方言注入 · 计划卡自判 · 「先问我」强制 · 花钱档只吐 op · §8.5 风格段 · §9 词表段）· **新** `project-rule.service.ts` · **新** `assistant-persona.service.ts`                                                                                                                                                                                                                                                         |
| hooks      | `use-assistant-operator.ts`（排队队列 + Stop 语义分离）· `use-studio-operator-store.ts`（进度带 · 结果行卡选中）· `use-studio-operator-revert.ts`（checkpoint 二选）· `use-studio-operator-critique.ts`（@ 任意图，去归属票硬绑）· **新** `use-studio-operator-mention.ts` · **新** `use-assistant-persona.ts`                                                                                                                                             |
| components | `StudioOperatorDock.tsx`（胶囊 → 图标轨）· `StudioOperatorPanel.tsx`（进度带 · 上行加「先问我」· 排队条 · 时间线沟 · ⋯ 菜单加「助手设置」）· **新** `StudioOperatorPlanCard` / `ResultRow` / `CheckpointCard` / `WebCandidateGrid` / `MentionPicker` / `RuleChip` / `AssistantSettingsDialog` / `TimelineAvatar` / `PlanOptionVisual`；`StudioOperatorCritiqueCard`（@ 任意图）· `StudioOperatorLightbox`（范围扩容）· `ProfileEditModal.tsx` 加同一个入口 |
| i18n       | `src/messages/{en,ja,zh}.json` 三语同步                                                                                                                                                                                                                                                                                                                                                                                                                    |

**删掉什么**：胶囊态渲染分支与 `STUDIO_OPERATOR_PILL_TONES` 的胶囊文案用法（语义迁状态点，不留 fallback）；`StudioOperatorPanel.tsx:13` / `:757` 「工作态发送即插话」整段分支（被排队引导取代）；归属票作为看图唯一凭证的硬绑。

### 第二期 · 视频域

复用同一面板（拍板 8）。内容：**看片评审卡**（内嵌 3 张抽帧 + 否定/异常/建议）· **视频参考槽**（首帧 / 尾帧 / 参考视频）· **素材分工与硬否定串串进工具环**（被判失败的素材不得再作首帧，命中时出规则薄卡 + 拒绝理由）· 补 §13c 的 30 视频 + 4 音频模型规则 · **Seedance 2.5 首帧场景宽高比锁自适应**（owner 2026-09-06 定：选了首帧图就把宽高比锁成 `adaptive` 并显示提示；与画布首尾帧槽同一逻辑，见 `../model-catalog.md`）。
文件：`constants/models/video.ts` + `model-strengths.ts` → `types/assistant-operator.ts`（抽帧评审载荷 · 视频槽）→ `assistant-operator.service.ts`（视频域工具表）→ `use-studio-operator-critique.ts`（多帧）→ `StudioOperatorCritiqueCard`（三帧版）+ 视频工作台参考槽组件。
**删掉什么**：旧 `StudioAssistantDock` 的视频分支。

### 第三期 · 画布

四类节点（text/image/audio/video + 子型）· 具名槽端口与合法矩阵 · 镜头带时间轴与自动排布 · v4 迁移。**全量结构、端口矩阵、op 集、迁移脚本见 [`node-canvas-v2.md`](node-canvas-v2.md)**；面板 ↔ 画布的联动面见 §17。
**删掉什么**：`parentId` / `collapsed` 两个零消费者的桩（`src/types/node-workflow.ts:495-504`）；`imageCategory` 的 `frame` 取值；legacy 12 type 与迁移垫片（**必须回填验证之后再删**，顺序反了 = 全量数据不可恢复）。

### 第四期 · LoRA 收编与旧路径删除

宿主契约已就绪。`LoraAssistantDock` → 统一面板（LoRA 工作台今天已经在挂 operator 两颗入口，`src/components/business/studio/lora/LoraWorkbench.tsx:176-177`）。
**删掉什么**：`src/components/business/prompts/PromptAssistantPanel.tsx`（+ 导出 + 测试 + `PromptAssistantLoraResultCard.tsx`）· `src/app/api/prompt/assistant/stream` · `src/services/kernel/prompt-assistant.service.ts` · `[[canvas-ops]]` 标记协议（`constants/assistant-protocol.ts` · `lib/assistant-protocol-blocks.ts` · `lib/assistant-marker-block.ts` · `services/node/node-assistant.service.ts`）· 旧 `LoraAssistantDock` / `StudioAssistantDock`。⚠ 删前 `grep -r` 把调用方在同一改动里改完，不留垫片。

---

## 15. 完成定义（`checklists/ui.md` 8 项 + 机器门）

| #   | 项                          | 本轮口径                                                      |
| --- | --------------------------- | ------------------------------------------------------------- |
| 1   | lint + typecheck 绿         | `npm run lint && npm run typecheck` 贴输出                    |
| 2   | 对比度过                    | `contrast-check` 输出；强调只用 `--primary`，状态只用四 token |
| 3   | 移动端 e2e                  | 本轮 375 = 不渲染，e2e 断言「桌面助手在移动端不出现」         |
| 4   | 真机三截图 1440 / 820 / 375 | 375 图证明「本路由移动端等级 = 助手不渲染」                   |
| 5   | reduced-motion 目检         | width 过渡 / stagger / 按词淡入 / 边脉冲全部降静态            |
| 6   | i18n 三语同步               | 新键三语齐；zh 长文本在 420 窄档不破版                        |
| 7   | 状态矩阵每格实跑            | §4.1 的 3×7 + §4.2 的 8 组卡片态                              |
| 8   | 交互动作表每行实跑          | §3 的 27 + 8 + 7 + 11 = 53 行，动效引用 §11.5 配方名          |

**机器门**：`font-family` / `font-serif` / Tailwind 调色板类 / `^:root` 四条 grep 零命中（`checklists/ui.md` 机器门原文）。
**额外**：全量 vitest（`full-gate` skill），受影响 operator 测试约 20 个文件。

---

## 16. 历史决策表（2026-08-05 → 2026-09-03）

> 旧 `assistant-shell.md` 里 owner 的决策行，逐条给出本轮状态。**⛔ 推翻**的不要再照着施工；**✅ 仍有效**的本轮不动。

| 日期               | 决策                                                                                                                                      | 本轮状态                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-05         | owner 选**方向 A · 统一 AI 对话助手**，取代 2026-07-27「只统一外壳、暂缓内部内容」的旧契约                                                | ⛔ **2026-09-06 推翻**：方向改 **C「工作日志」**（§11）。「一个助手跨四域」这条内核保留（= 拍板 8）                                                                            |
| 2026-08-05         | 桌面几何：距顶 `64px`、右/下 `16px`，普通对话态默认宽 `360px`                                                                             | ⛔ **推翻**：改 inset 24px + 默认 560 / 420–860（拍板 9，`studio-assistant-operator.ts:25-32`）                                                                                |
| 2026-08-05         | 共享头部顺序：新对话 → 联网研究 → 模型选择 → 历史 → 分享 → 展开 → 收起                                                                    | ⛔ **推翻**：头部改进度带，会话/历史/新对话收进 `⋯`（拍板 10 / §2.4）                                                                                                          |
| 2026-08-05         | 助手不会直接生成媒体，也不会未经用户确认修改编辑器内容                                                                                    | ✅ **仍有效**，且被本轮细化成三档（§6）。钱闸一字不动                                                                                                                          |
| 2026-08-05         | 移动端 `<1024px` 用接近全屏的底部抽屉                                                                                                     | ⛔ **推翻（本轮不做）**：`isMobile → return null`（`StudioOperatorDock.tsx:320`），移动端下一轮                                                                                |
| 2026-08-05         | 多附件契约：单轮最多 8 个，图片视频混合，稳定 `http(s)` URL 进请求，不写 data URL                                                         | ✅ **仍有效**（= 拍板 16）。⚠ 注意与 §7 的区别：**@ 看图不设上限**是另一件事，附件仍是 8                                                                                       |
| 2026-08-05         | 模型能力真实性：按 `(adapterType, modelId)` 判能力，禁止用视频封面冒充视频分析                                                            | ✅ **仍有效**，是硬底线                                                                                                                                                        |
| 2026-08-05         | 缺 key 仍显示模型并开 `QuickSetupDialog`，不禁用整个入口                                                                                  | ✅ **仍有效**（Hard Rule 8 / §4.3）                                                                                                                                            |
| 2026-08-08         | **画布例外**：结构 op（建节点 / 连线 / 改名）不用确认直接落画布；`set_review_state` 与 `generate` 仍逐条确认                              | ✅ **仍有效**，第三期沿用并扩表：新增 `delete` 为**需确认档**（owner 拍板「画-2」，见 `node-canvas-v2.md` §5）                                                                 |
| 2026-08-11         | 画布桌面助手标题栏空白区可拖动、历史迁入左侧 activity rail、展开态 `min(64rem, 72vw)`                                                     | ⛔ **第三期随旧 dock 一起删**（§14 第四期删除清单）。统一面板不做自由拖移                                                                                                      |
| 2026-08-25         | 两条流式端点换 SSE 帧协议；`open` 帧必须第一帧（否则 504）                                                                                | ✅ **仍有效且是硬约束**：`open` 帧把响应头 flush 与「模型开没开口」解耦，⛔ 别把它挪到模型开口之后。判据钉在 `src/lib/assistant-stream.test.ts`                                |
| 2026-08-25         | 正文里仍留协议块 `[[ask]]` / `[[next]]` / `[[prompt]]` / `[[setup]]` / `[[lora]]`；升级成帧是下一片                                       | ⚠ **本轮改口**：Operator 工具环不用标记流，`[[canvas-ops]]` 与整套标记协议在**第四期整体删除**，不再「升级成帧」                                                               |
| 2026-08-31         | 工作台 operator 可按名称查素材文件夹并只读视觉检查（先 `list_asset_folders` 再 `inspect_asset_folder`，24 张 / 8 张批次，编造 id 直接拒） | ✅ **仍有效**，本轮不动。它是 §1「助手负责 ③」的现成实现                                                                                                                       |
| 2026-08-31         | P4 音频档有意不挂 operator（owner「声音那边不用管」）                                                                                     | ✅ **仍有效**：声音本轮只做「声音库 + 音色库检索与挂载」                                                                                                                       |
| 2026-09-02         | DeepSeek V4 Flash Vision Exp 独立助手档位；附件闸按 `(adapterType, modelId)` 判断                                                         | ✅ **仍有效**                                                                                                                                                                  |
| 2026-09-03         | §6.7 记账：画布对话助手写视频提示词没有电影语法 / 没有 Seedance 规则 / 看不到上游 / 不知 @token 两层，三件待改                            | ⚠ **改走法**：不再在 `node-assistant.service.ts` 上打补丁（那条路第四期删）。三件事并进**第二期视频域 + 第三期画布**的工具环（§13c / §14），规则 import 不复制文案这条纪律保留 |
| 2026-09-05         | 桌面助手入口改浅色描边按钮、仅工作中显示状态点                                                                                            | ⛔ **推翻**：收起态改 48px 图标轨（拍板 7 / §2.3），状态点语义迁到轨上                                                                                                         |
| 2026-09-06（旧行） | 桌面助手浮层半透明背景 + 轻微模糊                                                                                                         | ⛔ **推翻**：方向 C 面板是实底 `bg-card` + border + `shadow-lg`，不做玻璃材质（§11.1）                                                                                         |

---

## 17. 画布联动面（第三期）

> 全量结构见 [`node-canvas-v2.md`](node-canvas-v2.md)。本节只写**面板 ↔ 画布**这一层。

| #   | 契约                          | 面板侧                                                                                                                                                                                                                             | 画布侧                                                                                                                                                                                               |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **checkpoint hover 高亮节点** | hover 薄卡 → 该轮涉及的节点齐亮；点薄卡某一行（如「提示词」）→ 只亮那一个并展开                                                                                                                                                    | 2px 描边 + 变更角标；视口 `fitView` 到包围盒，缓动不跳变；高亮**不自动消失**，直到点「知道了」或开下一轮                                                                                             |
| 2   | **撤销回滚画布**              | 薄卡二选与系统行文案与图片域**完全一致**                                                                                                                                                                                           | 助手的一轮 = **一个 undo 条目**（事务式 push，不是 N 条），按 `inverse` **逆序**执行；纯视图 op 不进 undo 栈。现状是内存栈 50 步、刷新即失（`src/hooks/node/use-node-workflow.ts:887-891` · `:981`） |
| 3   | **@ 指节点**                  | `@` 选择器在画布域分三组：① 当前镜五槽 + 该镜产物 ② 最近改动 12 个（带缩略） ③ 全画布搜索。chip 组件与图片域同一个                                                                                                                 | 名字**创建即持久化**（`data.displayName`），格式 `S02·首帧`；`@` 写进 prompt 时同时写 `[[node:<id>]]` 锚，改名后历史消息里的 @ 跟着更新                                                              |
| 4   | **助手 `connect` 带槽名**     | ToolGroup 里一条 op 显示为 `connect · kf02-control-v5 → S02.firstFrame`；非法槽 = 一条失败步，不静默丢                                                                                                                             | `slot` 必填；拖线时只点亮合法入口，落空给一行理由；连上的内容**显示在目标节点对应槽内**                                                                                                              |
| 5   | **边进快照**                  | 快照按镜号排序，边**内联在目标节点下**（`slot ← 源`），跨镜边单列 `# 接续`；**分层送**（owner 2026-09-06）：当前镜 + 相邻两镜 + 选中 + 最近改动 = 完整结构，其余镜头只送一行标题，**不设节点数硬上限**（`node-canvas-v2.md` §4.4） | 现状快照**没有边**、上限 32 不排序取前 N（`src/constants/node-studio.ts:234`）——助手看不见「谁挂在谁的首帧上」，镜头模型下是致命的                                                                   |

**顺序**：`node-canvas-v2.md` §10 的 C1（槽与规则）/ C2（稳定名 + 快照带边）**不依赖 v4 迁移，可与第二期视频域并行起步**——视频域的「参考槽」在数据层就是画布的槽，两处各做一套会立刻分叉。

---

## 18. 原型与证据

本轮设计的可点原型（纯静态 HTML，不接真实 API，**未入库，owner 本地持有**）：

| 文件                 | 是什么                                                                                                       | 状态                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `proto4-c-log.html`  | 方向 C「工作日志」第 4 版：图片域 13 步 + 视频域 12 步双脚本可切换、助手设置弹层、计划卡图示、头像时间线沟   | **本文 §11 的视觉基线**                              |
| `proto4-canvas.html` | 画布原型并入方向 C 皮肤：四类节点两态、具名槽、镜头带时间轴、槽内版本轮播                                    | `node-canvas-v2.md` 的视觉参照                       |
| `spine-sheet.html`   | 全站脊柱抽样表（字体三槽 / 颜色脊柱 / 状态四 token / 动效 token 真值），用于判断「画布皮肤并入脊柱」可不可行 | 支撑 §11.2 与 `node-canvas-v2.md` §2.5 的 owner 拍板 |

来源：这三份产于 2026-09-06 的设计会话 scratchpad（同批还有方向 A `proto2-a-gallery.html` / 方向 B `proto2-b-console.html` 与各自截图，owner 选 C 后不再维护）。**按 `docs/README.md` 文档原则 3，原型不入库**：结论已全部固化进本文与 `node-canvas-v2.md`，需要复看时向 owner 要本地文件。

⚠ 原型阶段**不受**全站脊柱约束（CLAUDE.md「demo / 原型是例外」，2026-07-27 owner 定），所以原型里的配色与材质**不是**施工答案；施工答案只有 §11。

---

## Source of Truth

- 面板与常量：`src/constants/studio-assistant-operator.ts` · `src/constants/assistant-operator.ts` · `src/components/business/studio/assistant-operator/**` · `src/components/business/StudioWorkspaceUI.tsx`
- 服务端：`src/services/kernel/assistant-operator.service.ts`（系统提示 `:2019`、上下文压缩 `:2153`）
- 视觉 token：`src/app/globals.css`（动效 `:198-202`、三层浅底 `:355-365`）· `docs/references/ui-defaults.md`
- 画布：[`node-canvas-v2.md`](node-canvas-v2.md)（目标态）· [`node-canvas.md`](node-canvas.md)（现状）
- 域：`docs/references/domains/studio.md` · 画布域定义见 [`node-canvas-v2.md`](node-canvas-v2.md) §0.1

## Last Verified

- **2026-09-06 · 本文整体重写**：owner 定方向 C「工作日志」+ 四期次序（图片 → 视频 → 画布 → LoRA）+ 助手设置 persona + 计划卡图示封闭词表 + 项目规则卡进第一期 + @ 看图不设上限 + 移动端下一轮。新增 §12.1「20 条代码注释拍板落点表」（docs 此前从未收录）。所有 `文件:行号` 于本日读码核过；三处与设计稿不符已就地订正：`OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH` 在 `:2153`（不是 2157）· 面板宽度常量在 `studio-assistant-operator.ts:25-32`（不是 26-33）· ⋯ 菜单在 `StudioOperatorPanel.tsx:314-329`（`:236-260` 是会话菜单）。**代码未动，只改文档。**
- 2026-09-03 · 旧文 §6.7 记账（画布对话助手视频提示词现状）——本轮改走法，见 §16。
- 2026-09-02 · DeepSeek V4 Flash Vision Exp 独立档位；附件闸按 `(adapterType, modelId)` 判断。仍有效。
- 2026-08-31 · 工作台 operator 素材文件夹列举与只读视觉检查落地。仍有效。
- 2026-08-25 · 两条流式端点换 SSE 帧协议，`open` 帧必须第一帧。仍有效（标记协议第四期整体删除）。
- 2026-08-05 · owner 确认方向 A 与桌面关键切片。**已由本轮 2026-09-06 方向 C 取代**，逐条状态见 §16。
