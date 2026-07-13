# 画布模块与功能清单（PixelVault 已填充模板）

> 状态：**功能目录完成，作为画布概念板与后续 task packet 的选项表**（2026-07-13）。
> 范围：用户可见名“画布”，canonical URL 仍为 `/studio/node`。本文件列功能，不授权直接实施；总顺序与跨模块边界以 `canvas-modular-redesign-2026-07.md` 为准。

## 0. 使用方式

- 任何施工包必须引用本文件中的功能 ID，例如“实现 `CAN-L01 + CAN-S01`”，不能只写“优化画布”。
- 一个切片优先包含一个可验证的纵向结果；不要一次勾选五个模块的全部功能。
- 状态含义：`现有` = 当前已有；`首期` = 当前计划锁定；`后续` = 明确延期；`隐藏` = 不得渲染；`缺口` = 必须先补契约。
- 模板骨架见 `docs/templates/module-function-catalog.md`。

## 1. 模块总览

| 模块            | 产品定位                         | 核心对象                                | 首期结果                             |
| --------------- | -------------------------------- | --------------------------------------- | ------------------------------------ |
| 图片 `IMG`      | 图片生成、编辑、拆解与资产复用   | Image Object                            | 六项真实编辑能力在画布派生新图片     |
| 视频 `VID`      | 镜头生成、参考约束、版本与合片   | Video / Clip / Merge                    | 保持 Studio 轻入口，画布完成导演线路 |
| 语音/声音 `AUD` | 音色身份与可播放音频资产         | Voice Profile / Audio Clip              | 先完成 speech/TTS、试听和视频绑定    |
| 画布 `CAN`      | 项目、空间、对象、关系与结果编排 | Project / Node / Binding / Selection    | 稳定工作区、真实工具、统一结果落点   |
| 助手 `AST`      | 理解项目上下文并安全调用画布能力 | Conversation / Context / Capability Run | 真分栏、会话正确性、共享 capability  |

## 2. 图片 `IMG`

### 边界

- 输入：上传文件、粘贴图片、素材库图片、现有生成结果。
- 输出：图片对象、透明图片、所选图层对象、素材记录。
- 拥有：图片生成参数、图片对象编辑、结果派生与 lineage。
- 不拥有：视频生成、音频生成、全局项目布局、provider 计费策略。

### 2.1 来源与对象

| ID      | 功能                 | 用户入口                 | 输出                                                    | 状态          | 结果策略          |
| ------- | -------------------- | ------------------------ | ------------------------------------------------------- | ------------- | ----------------- |
| IMG-S01 | 上传图片             | 图片对象、画布 drop zone | 新图片对象                                              | 现有          | 新建对象          |
| IMG-S02 | 粘贴图片             | 画布粘贴                 | 新图片对象                                              | 现有          | 新建对象          |
| IMG-S03 | 从素材选择           | 图片对象、添加目录       | 新图片对象                                              | 现有          | 新建对象          |
| IMG-S04 | 选择图片角色         | 对象详情                 | loose / character / background / shot / keyframe 等角色 | 现有→首期收敛 | 更新对象角色      |
| IMG-S05 | 命名、来源与尺寸摘要 | 节点卡/详情              | 可识别的图片对象摘要                                    | 首期          | 更新 metadata     |
| IMG-S06 | 保存或确认素材记录   | 结果对象                 | Asset 记录                                              | 现有→首期收敛 | 绑定/保持已有记录 |

### 2.2 生成与参考

| ID      | 功能                         | 用户入口                  | 输入                              | 输出                  | 状态          | 结果策略             |
| ------- | ---------------------------- | ------------------------- | --------------------------------- | --------------------- | ------------- | -------------------- |
| IMG-G01 | AI 生成图片                  | 图片对象“AI 生成”         | prompt、模型与模型支持的参数      | 图片结果              | 现有          | `update-output-slot` |
| IMG-G02 | 生成镜头图                   | 镜头图对象/ScriptDoc 投影 | 镜头文本、角色/场景参考           | 镜头图片              | 现有          | `update-output-slot` |
| IMG-G03 | 参考图片与主图管理           | 对象详情                  | 图片、角色/场景卡、主图标记       | generation references | 现有→首期收敛 | `bind-only`          |
| IMG-G04 | 参考权重/分类                | 对象详情                  | 参考图片与用途                    | typed references      | 现有→首期收敛 | `bind-only`          |
| IMG-G05 | 生成中、失败、重试、刷新恢复 | 图片对象                  | generation job                    | 可恢复结果/错误       | 现有→首期收敛 | 更新 output slot     |
| IMG-G06 | 模型与模型支持参数           | 图片对象/详情             | model、prompt、比例等 typed input | generation request    | 现有          | 更新参数             |
| IMG-G07 | LoRA/StyleCard 参考绑定      | 图片对象/详情             | 已有风格与 LoRA 资产              | generation references | 现有→首期回归 | `bind-only`          |

### 2.3 六项图片编辑能力

| ID      | 功能     | 入口形态         | 输入                      | 输出                | 状态               | 结果策略        | 关键验收                    |
| ------- | -------- | ---------------- | ------------------------- | ------------------- | ------------------ | --------------- | --------------------------- |
| IMG-E01 | 超分辨率 | 选中工具快动作   | 单图片、2x/4x             | 新图片              | 首期               | `derive-right`  | 源图不覆盖；尺寸正确        |
| IMG-E02 | 去背景   | 选中工具快动作   | 单图片                    | 透明图片            | 首期               | `derive-right`  | alpha 保留；失败落源对象    |
| IMG-E03 | 元素提取 | 近场 prompt/预设 | 单图片、提取描述          | 透明图片 + 素材记录 | 首期               | `derive-right`  | 画布对象与素材记录一致      |
| IMG-E04 | 局部重绘 | 重编辑工作区     | 单图片、蒙版、prompt      | 新图片              | 首期               | `derive-right`  | 蒙版指针不与画布冲突        |
| IMG-E05 | 扩展画布 | 重编辑工作区     | 单图片、方向/尺寸、prompt | 新图片              | 首期               | `derive-right`  | 原图区域与扩展尺寸正确      |
| IMG-E06 | 图层分解 | 重编辑工作区     | 单图片、层选择            | 所选图层 + PSD      | 首期；lineage 缺口 | `derive-layers` | 先预览再铺开；批量一次 undo |

### 2.4 结果与后续

| ID      | 功能                   | 状态          | 说明                               |
| ------- | ---------------------- | ------------- | ---------------------------------- |
| IMG-O01 | 编辑结果高亮并进入视野 | 首期          | 聚焦派生对象，不移动源图           |
| IMG-O02 | 继续编辑结果           | 首期          | 新结果成为下一次 capability target |
| IMG-O03 | 对比源图与结果         | 后续          | 不阻塞六项能力迁移                 |
| IMG-O04 | 预览、下载、替换来源   | 现有→首期回归 | 管理对象媒体，不等于覆盖 lineage   |
| IMG-X01 | 对象替换               | 隐藏          | 当前只有占位，无真实 task 契约     |
| IMG-X02 | 风格迁移               | 隐藏          | 等 StyleCard/参考图契约            |
| IMG-X03 | 文字/海报              | 隐藏          | 先定义文字/图层领域对象            |

## 3. 视频 `VID`

### 边界

- 输入：镜头文本、图片/角色/场景/关键帧、参考视频、Voice Profile、未来 Audio Clip、上游视频。
- 输出：视频结果、Clip 版本、合成长片。
- 拥有：视频模型参数、参考约束、生成/重生成、版本、裁剪/排序/合片。
- 不拥有：完整 ScriptDoc 编辑器、Voice Profile 训练、素材库管理页。

### 3.1 镜头与输入

| ID      | 功能                            | 用户入口                | 状态           | 说明                                                  |
| ------- | ------------------------------- | ----------------------- | -------------- | ----------------------------------------------------- |
| VID-S01 | 添加视频生成对象                | 添加目录/ScriptDoc 投影 | 现有           | UI 使用“视频生成/视频镜头”；内部 `seedance` ID 暂保留 |
| VID-S02 | 镜头文本输入                    | 视频对象/上游 shotText  | 现有           | 不重新暴露手工 shotText 节点入口                      |
| VID-S03 | 绑定角色、场景、镜头图、关键帧  | 吞噬/Reference Manager  | 现有           | 遵守连接合法性矩阵                                    |
| VID-S04 | 上传/绑定参考视频               | 参考视频对象            | 现有           | Reference Video 是媒体输入，不是长期 provider 类型    |
| VID-S05 | 指定主图                        | Reference Manager       | 现有           | 主图与其他参考分离                                    |
| VID-S06 | 绑定 Voice Profile/参考音频     | 吞噬/详情               | 现有但语义有限 | 只代表声音身份/参考，不代表成品对白                   |
| VID-S07 | 绑定 Audio Clip                 | 吞噬/详情               | 缺口           | 依赖 Audio Clip 领域对象与消费契约                    |
| VID-S08 | 上传、替换参考视频并生成 poster | 参考视频对象            | 现有           | 上传限制与失败必须在对象上显示                        |
| VID-S09 | 参考容量与槽位摘要              | Reference Manager       | 现有→首期收敛  | 已连接与实际引用分开，容量诚实可见                    |

### 3.2 参考与生成

| ID      | 功能                               | 状态          | 结果策略               | 关键验收                         |
| ------- | ---------------------------------- | ------------- | ---------------------- | -------------------------------- |
| VID-G01 | 视频模型选择                       | 现有          | 更新参数               | 用户不看到 provider 型 node type |
| VID-G02 | Prompt 中引用创作名                | 现有          | `bind-only`            | 可见名字稳定                     |
| VID-G03 | 发送时翻译为 `@ImageN`             | 现有          | 运行时转换             | token 与实发素材位置一致         |
| VID-G04 | 只发送实际引用素材                 | 现有          | 运行时过滤             | 无 token 旧数据走诚实迁移护栏    |
| VID-G05 | 参考容量与兼容校验                 | 现有→首期收敛 | 校验                   | 超限/不兼容明确阻止              |
| VID-G06 | 生成、轮询与重新生成               | 现有          | `update-output-slot`   | 刷新后任务恢复、失败可重试       |
| VID-G07 | 创建视频 revision                  | 后续          | 新版本                 | 与简单覆盖 output slot 明确区分  |
| VID-G08 | 预览、下载与采用结果               | 现有→首期收敛 | 只读/选择              | 当前输出可追溯最终模型           |
| VID-G09 | 负面 prompt                        | 现有          | 更新参数               | 只在模型支持时显示               |
| VID-G10 | 时长、分辨率、比例                 | 现有          | 更新参数               | 选项随模型能力变化               |
| VID-G11 | 生成音频开关                       | 现有          | 更新参数               | 与外部 Audio Clip 绑定清楚区分   |
| VID-G12 | seed 随机、锁定与实际值回写        | 现有          | 更新参数/结果 metadata | 重生成可复现                     |
| VID-G13 | 播放、poster、thumbnail 与结果状态 | 现有→首期回归 | 只读预览               | pending/failed/done 表达一致     |

### 3.3 编排与输出

| ID      | 功能                           | 状态                  | 结果策略          | 说明                                                               |
| ------- | ------------------------------ | --------------------- | ----------------- | ------------------------------------------------------------------ |
| VID-O01 | ScriptDoc 投影镜头和视频对象   | 现有                  | 创建图对象        | Script → Scene → Shot → Video                                      |
| VID-O02 | 视频片段排序                   | 现有→首期收敛         | `append-sequence` | 合片只接受视频来源                                                 |
| VID-O03 | 片段裁剪                       | 现有→首期收敛         | 更新序列参数      | 不破坏原视频资产；当前可靠能力偏尾裁，任意头裁需另核 provider 契约 |
| VID-O04 | 2–9 段视频合成                 | 现有；Generation 缺口 | `append-sequence` | R2 输出需补 Generation/lineage                                     |
| VID-O05 | 合片状态恢复与最终输出记录     | 缺口                  | Generation        | 导演闭环前必须完成                                                 |
| VID-O06 | 节点图编译到既有 VideoPipeline | 后续                  | 编排执行          | 避免两套可见导演流程并存                                           |

### 3.4 明确不做

- 不为 Seedance、Kling、Veo 等每个 provider/model 新建一种画布节点。
- 不删除 Studio Video；它继续承担轻量短片入口。
- 第一轮不做通用 NLE、完整时间线、转场编辑或 DAW。
- Workspace/Capability/ResultPlacement seam 完成前不重写现有视频生成逻辑。

## 4. 语音/声音 `AUD`

### 边界

- 输入：Voice Profile、台词、情绪/语言、参考音频、音效/音乐描述。
- 输出：Voice Profile 或可播放的 Audio Clip。
- 拥有：音色身份、TTS/SFX/Music 的 typed capability、试听、音频结果和视频绑定。
- 不拥有：DAW、完整播客剪辑、视频画面参数。

### 4.1 Voice Profile（音色身份）

| ID      | 功能                       | 状态          | 说明                                                 |
| ------- | -------------------------- | ------------- | ---------------------------------------------------- |
| AUD-V01 | 从声音库选择音色           | 现有          | 当前 voice 对象的主要能力                            |
| AUD-V02 | 粘贴模型音色 ID            | 现有          | 保留 provider/model 校验                             |
| AUD-V03 | 上传参考音频               | 现有          | 作为 donor/听觉身份，不等于成品对白                  |
| AUD-V04 | 试听参考音频               | 现有→首期收敛 | 明确 reference 与 output                             |
| AUD-V05 | 绑定角色听觉身份           | 现有→首期收敛 | Voice Profile 可被角色/视频引用                      |
| AUD-V06 | 音色克隆/设计入口          | 后续          | 复用 Studio Audio/VoiceTrainer，不把训练表单塞进节点 |
| AUD-V07 | 情绪、速度、音量等表现参数 | 现有→首期收敛 | 参数属于生成/表演，不把 donor 当成成品               |

### 4.2 Audio Clip（实际音频）

| ID      | 功能                              | 状态 | 结果策略             | 说明                                        |
| ------- | --------------------------------- | ---- | -------------------- | ------------------------------------------- |
| AUD-C01 | 定义统一 Audio Clip + `audioKind` | 缺口 | 新建对象             | `speech / sfx / music` 是属性，不拆三种节点 |
| AUD-C02 | 台词 TTS                          | 首期 | `update-output-slot` | Dialogue + Voice Profile → speech clip      |
| AUD-C03 | ScriptDoc 台词投影                | 缺口 | 创建 Audio Clip      | 当前只创建 voice 身份，未投影成品台词       |
| AUD-C04 | 波形、试听、暂停和进度            | 首期 | 只读播放             | 对象上可辨认实际音频                        |
| AUD-C05 | 失败、重试和刷新恢复              | 首期 | 更新 output slot     | 与 generation 状态统一                      |
| AUD-C06 | 绑定 Audio Clip 到视频            | 首期 | `bind-only`          | 视频消费成品音频，不误用 donor              |
| AUD-C07 | 音效生成 `sfx`                    | 后续 | 新建 Audio Clip      | 服务能力已有，画布契约未完成                |
| AUD-C08 | 音乐生成 `music`                  | 后续 | 新建 Audio Clip      | provider/计费/许可复核后才显示              |
| AUD-C09 | 播客/长音频编排                   | 后续 | 序列                 | 不属于首期画布声音线                        |

### 4.3 明确不做

- 不把 `voice` 节点扩成音色、TTS、SFX、Music 四合一表单。
- 不为 speech、sfx、music 分别新增节点类型。
- 不在 Audio Clip 契约落地前宣称“台词自动配音导演闭环”已完成。

## 5. 画布 `CAN`

### 5.1 工作区与导航

| ID      | 子模块          | 功能                                              | 状态          |
| ------- | --------------- | ------------------------------------------------- | ------------- |
| CAN-L01 | WorkspaceLayout | 画布列 + 360px 助手列真分栏                       | 首期          |
| CAN-L02 | WorkspaceLayout | 统一 top/bottom/assistant/Cast/minimap 安全区变量 | 首期          |
| CAN-L03 | WorkspaceLayout | 移动端助手 drawer、ScriptDoc 独立宽态             | 首期          |
| CAN-S01 | CanvasSurface   | 暖炭连续平面与低噪点阵                            | 现有→首期收敛 |
| CAN-S02 | CanvasSurface   | 独立 surface/grid token，不复用端口/遮罩 token    | 首期          |
| CAN-V01 | Viewport        | 滚轮缩放、中键/右键/空格平移、手型                | 现有          |
| CAN-V02 | Viewport        | 单选、框选、节点拖动与聚焦                        | 现有          |
| CAN-V03 | Viewport        | 真实 zoom、fit view、安静 minimap                 | 首期          |

### 5.2 项目与对象

| ID      | 子模块          | 功能                                    | 状态          |
| ------- | --------------- | --------------------------------------- | ------------- |
| CAN-P01 | ProjectHeader   | 项目切换、新建、重命名、删除、节点数    | 现有          |
| CAN-P02 | ProjectHeader   | 保存、保存状态与刷新恢复                | 现有→首期收敛 |
| CAN-P03 | ProjectHeader   | 整理布局、折叠 header                   | 现有          |
| CAN-O01 | ObjectFrame     | 标题、类型、状态、预览、参数和 footer   | 现有→首期重构 |
| CAN-O02 | ObjectFrame     | 稳定 Frame/Preview/Composer/Status 边界 | 首期          |
| CAN-O03 | Selection       | 按对象 capability 生成近场工具          | 首期          |
| CAN-O04 | Selection       | 展开、删除、多选降级与真实命中区        | 现有→首期收敛 |
| CAN-O05 | DetailWorkspace | 轻菜单、对象任务面板、重编辑工作区三档  | 首期          |

### 5.3 添加、关系与素材复用

| ID      | 子模块       | 功能                                             | 状态           |
| ------- | ------------ | ------------------------------------------------ | -------------- |
| CAN-A01 | AddCatalog   | 图片、镜头图、音色、参考视频、视频生成、视频合并 | 现有           |
| CAN-A02 | AddCatalog   | 按“添加素材/生成媒体/组织流程”分组               | 首期           |
| CAN-A03 | AddCatalog   | 隐藏 provider、legacy type 与未实现能力          | 首期           |
| CAN-R01 | Relationship | 数据 edges、连接合法性和旧项目持久化             | 现有；必须保留 |
| CAN-R02 | Ingest       | 拖拽吞噬、磁吸、快投、成分 chip                  | 现有           |
| CAN-R03 | Ingest       | 默认不显示连线；移除无效连接/剪线工具            | 首期           |
| CAN-R04 | Ingest       | 兼容拖拽时临时端口与指针附近拒绝原因             | 首期           |
| CAN-R05 | Relationship | 只看选中关系/诊断关系                            | 后续           |
| CAN-C01 | CastTray     | 角色/场景 collector、计数、折叠、拖拽复用        | 现有           |
| CAN-C02 | CastTray     | 由工作区预留空间并压缩为素材/身份托盘            | 首期           |

### 5.4 状态与结果

| ID      | 功能                              | 状态           | 说明                                        |
| ------- | --------------------------------- | -------------- | ------------------------------------------- |
| CAN-F01 | 节点内 queued/running/done/failed | 现有→首期收敛  | 生成状态留在对象                            |
| CAN-F02 | 保存状态归 header                 | 首期           | 不用全局 toast 重复表达                     |
| CAN-F03 | 拖拽拒绝跟随指针                  | 现有→首期收敛  | 显示容量与原因                              |
| CAN-F04 | 系统级错误 toast 与 live region   | 首期           | 避免重复播报                                |
| CAN-U01 | undo/redo                         | 现有           | 批量派生必须一次 undo                       |
| CAN-U02 | 统一 ResultPlacement              | 首期           | update/derive/layers/sequence/bind 五种策略 |
| CAN-U03 | 旧项目迁移与 legacy type 解析     | 现有；必须回归 | 不把兼容类型重新放进添加菜单                |

### 5.5 明确不做

- 不恢复满屏可见连线，不把画布改成 ComfyUI。
- 不让顶栏、Cast、minimap、助手分别维护一套安全区计算。
- 不为每个编辑动作、provider 或媒体角色新增节点类型。
- 不把素材管理页、卡片管理页和所有 Studio 参数整页复制进画布。

## 6. 助手 `AST`

### 6.1 Shell 与会话

| ID      | 功能                               | 状态          | 说明                            |
| ------- | ---------------------------------- | ------------- | ------------------------------- |
| AST-S01 | 打开、收起、新对话                 | 现有→首期重构 | 收起后画布真实扩宽              |
| AST-S02 | 稳定 360px rail 与低 chrome header | 首期          | 不继续作为重阴影浮窗            |
| AST-S03 | ScriptDoc 独立宽工作区             | 首期          | 不把普通助手直接拖到 820px      |
| AST-S04 | route / research / 应用前询问      | 现有          | 只显示真实支持的控制            |
| AST-C01 | 文本输入与流式回答                 | 现有          | 普通助手当前仍以建议为主        |
| AST-C02 | 起手建议、错误与 retry             | 现有→首期修正 | retry 不得重复 user turn        |
| AST-C03 | 项目隔离并在收起后保留会话         | 首期          | conversation key 包含 projectId |
| AST-C04 | 最多 16 条成对 replay window       | 缺口          | 避免长会话请求 400              |
| AST-C05 | 历史、搜索、重命名                 | 后续          | 依赖真实持久化                  |
| AST-C06 | 分享只读会话                       | 后续          | 依赖权限与只读链接              |

### 6.2 上下文与能力

| ID      | 功能                                         | 状态          | 说明                         |
| ------- | -------------------------------------------- | ------------- | ---------------------------- |
| AST-X01 | 读取项目节点摘要                             | 现有          | 不发送完整 raw graph         |
| AST-X02 | 读取选择对象、相关资产和 ScriptDoc 片段      | 首期          | 按任务装载最小上下文         |
| AST-X03 | 显示可移除的引用 chip                        | 首期          | 用户知道本轮引用了什么       |
| AST-X04 | 点击引用聚焦对象                             | 现有→首期收敛 | 与 selection model 共用      |
| AST-A01 | `listFor/open/run` 查询并调用 capability     | 首期          | 不在助手内部复制执行实现     |
| AST-A02 | 图片能力调用                                 | 后续 AS1      | 只调用已注册的六项真实能力   |
| AST-A03 | 视频生成/重生成/合片调用                     | 后续 AS1      | 遵守 reference 与结果策略    |
| AST-A04 | TTS/试听/Audio Clip 绑定调用                 | 后续 AS1      | 依赖声音契约                 |
| AST-A05 | 创建派生对象、绑定关系并聚焦结果             | 后续 AS1      | 高费用/覆盖/删除前确认       |
| AST-A06 | 多步 Agent/Skills 自动编排                   | 后续          | 在单步 capability 稳定后评估 |
| AST-X99 | 无后端能力的“深度思考/自动模型/分享”装饰按钮 | 隐藏          | 不复制 Haivis 空 affordance  |

### 6.3 明确不做

- 不把右栏改成属性面板；对象参数继续留在近场工具或详情工作区。
- 不让助手重新实现图片、视频、声音执行逻辑。
- 不在没有持久化和权限契约时伪造历史、搜索或分享。
- 不允许未经确认的删除、覆盖源对象或高费用操作。

## 7. 跨模块最小流程

### 图片编辑

```text
CAN 选择单图片 → IMG-E01/E02 → CapabilityRuntime
→ CAN-U02 derive-right → 新图片对象 → AST 可引用结果
```

### 视频导演线

```text
ScriptDoc → Shot → IMG 镜头/关键帧 + AUD Voice Profile/Audio Clip
→ VID 视频镜头 → Clip → VID-O04 Merge → 最终 Generation
```

### 助手执行

```text
AST-X02 解析选择与项目上下文 → AST-A01 查询能力
→ 用户确认 → 共享 runtime 执行 → CAN ResultPlacement → AST 回报并聚焦
```

## 8. 推荐选择顺序

1. `CAN-L01/L02 + CAN-S01/S02`：先形成工作区与背景 seam，视觉/业务分离。
2. `AST-S01/S02/S03 + CAN-V03`：助手真分栏并统一视口几何。
3. `CAN-O02/O03/O05 + CAN-U02`：建立对象、选择、详情和结果落点。
4. `IMG-E01/E02`：用超分、去背景验证第一个端到端 capability。
5. `IMG-E03–E06`：完成图片线。
6. `VID-S01–VID-O05`：整理视频导演线并补合片 Generation。
7. `AUD-C01–C06`：补 Audio Clip 并形成最小声音闭环。
8. `AST-A01–A05`：助手接入已验证的共享能力。

## 9. Source of Truth

- 总计划：`docs/plans/canvas-modular-redesign-2026-07.md`
- 图片子计划：`docs/plans/canvas-image-edit-convergence-2026-07.md`
- 画布长期契约：`docs/references/pages/node-canvas.md`
- 音频域计划：`docs/plans/audio-domain-design-2026-07.md`
- 当前代码：`src/components/business/node/**`、`src/hooks/use-node-workflow.ts`、`src/constants/node-*`、`src/constants/edit-tasks.ts`、`src/lib/node-*`。

## 10. Last Verified

- Date: 2026-07-13
- Method: 复用同日 `/zh/studio/node` live audit；重新核对画布总计划、图片编辑能力、视频引用/合片、Voice Profile/Audio Clip 与两套助手边界。本轮只写文档，未运行生成、未改产品代码。
