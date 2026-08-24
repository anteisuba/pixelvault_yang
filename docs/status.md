# 项目状态

最后更新：2026-08-23

唯一活跃进度文档。保持短，覆盖更新，不追加历史。

## Current Focus

- **NovelAI 已捞回 Image（2026-08-24）**：V4.5 Full/Curated + V5 Full/Curated，四档 `available: true`、**只 BYOK**。Worker 认 V5 id（`params_version: 4`，不发 `skip_cfg_above_sigma`）。参考图可选、最多 1 张、按 img2img 发。不进 LoRA。助手 LLM 路由不改（NovelAI 不是聊天模型）；enhance / 工作台目录会随 catalog 自动看见这四档。

- **C+F 素材页与选择器 UI 正在做 Codex / Claude 设计对比**：域要求与 shared/dedicated shell 边界已确认；右侧 Dock 是当前工作方向。Owner 2026-08-11 否决 V1 视觉，Codex 已重做“编辑型私人档案馆”V2（文件夹/详情两态），并准备独立的 [`Claude 设计简报`](plans/assets-claude-design-brief-2026-08-11.md)。完整账本见 [`docs/plans/assets-cf-design-2026-08-09.md`](plans/assets-cf-design-2026-08-09.md)；`src/**` 继续冻结，待 owner 对比后选向。
- **本周十条待办**（owner 2026-08-07 口述），索引 =
  [`docs/plans/week-2026-08-07-backlog.md`](plans/week-2026-08-07-backlog.md)，交接 = 同目录
  `week-backlog-session-handoff-2026-08-07.md`。
  已完成：**H** LoRA 挂载不设上限（`eb295d23` + `6c3add69`）· **C4** 上传图画质（`84487a71`）·
  **J4** 无依据常量普查（`f9522e44`）· **K** LoRA 库重构（`a77901db`）· **L** TTS 上限按 provider
  拆分（`1cf1fe2a`）· **M** 角色图 LoRA 加号闸退役（`dafa2898`）· **E** 文档清理 + **J3** 悬空引用（`c2729530`，
  见 `plans/docs-cleanup-2026-08-07.md`）。
  C+F 已进入设计治理；其余并行条目的实时状态以各自 active plan 与代码为准：A 助手分域回复 · B 画布助手→节点 · D 图像优化 ·
  G 首页 UI · I 侧边栏 UI（前置 = J1 补视觉基线）· J1/J2。
- **调研落地路线图主链 7 / 10 已交付**，入口 =
  [`docs/plans/research-landing-plan-2026-07-30.md`](plans/research-landing-plan-2026-07-30.md) §6。
  已完成：包 1 文档止血 · 包 2 现状实测校准 · 包 2.5 剧本长度悬崖 ·
  包 3 分镜静帧投影 · 包 4 审核态门禁 · 包 4.5 显示名收口 · 包 5 助手写画布。
- **下一个 = 包 6 审阅网格**，是主链上**第一个要过 `ui-page` 设计门**的包：
  域定义 → 三方向 → 关键切片（桌面 + 375）→ owner 逐项确认 → 写 page 文档 → 才实现。
- 节点详情页 Round 2 A「媒体优先」已按确认契约实现并完成定向验证；后续真机反馈中的
  左栏圆角、参考视频比例、音色选择后试听与助手默认模型显示也已修复。详情双栏断点已从
  `1120px` 收窄到 `960px`，避免 1092px 画布误进上下布局。方向 E 只保留为历史基线。
- 图片族详情来源已收口：右栏只保留「参考图 + 添加参考图」，其浮层统一上传 / 素材库 / 粘贴；
  主图上传/素材库替换迁到左侧媒体上的「替换图片」，Studio 与未完成 LoRA 不再占用详情 UI。
- ⚠ 上一版这里写着「本地另有未提交改动（MiniMax adapter / Seedance 2.5 预留 / VolcEngine
  video builder）」—— 2026-08-07 核对 `git status` 时那批改动已不在工作区，本条作废。

## Completed / Stable Enough to Build On

### 图片工作台结果区

- owner 2026-08-23 选定方向 A「对照台」打底，并采用方向 B 的顶部常驻参考轨与底部唯一动作栏。
  `CompareGrid` 现按模型分行、点击只聚焦、定最佳需显式提交；图上不再叠按钮或 Gallery 元信息。
  `StudioReferenceRail` 让参考图在生成前后都可切换 / 编辑 / 删除；编辑舞台高度与标注图框同步修正。
  施工契约见 [`docs/references/pages/studio-image-workbench.md`](references/pages/studio-image-workbench.md)。

### 画布管道（本轮主链产出）

- **「聊 → 大纲 → 镜头 → 投影 → 出图」整链真机走通**（包 2 实测，两轮复跑）。
  投影幂等成立；缺口清单 = [`canvas-pipeline-gap-2026-07-31.md`](plans/canvas-pipeline-gap-2026-07-31.md)，
  它**取代** `canvas-assistant-pipeline` §0 的 07-26 断层表。
- 剧本提示词改**按预算装配**，修掉 4000 字符静默悬崖（此前故事一丰富就全线 500）。
- 分镜静帧已能投影（`role=shot`）；`role=background` **有意砍出**——它会渲染成身份卡，
  而身份卡存废未定（G5）。
- **审核态门禁**：生成物默认待审，未过审不进 `image_urls`；过审可逆。
- 助手拿到的是**真实显示名**，不再是本地化类型标签。
- **助手能写画布**：建节点 / 连线 / 改名 / 标审核态 / 触发生成五种 op，
  全部经「提案 → 用户点 → 才发生」；助手**不得自批** `approved`。
- 2026-08-10 owner 真机反馈已收口：删除视频节点重复工具条及文本/图片状态脚；镜头文本改白色纸面；
  身份代表图按原图比例展示并恢复卡外名字；声音节点恢复卡外名字；MiniMap 可直接拖动画布；
  节点拖动不再叠两张图；模型选择行悬停不改变高度。Seedance 2.0 选择器现明确区分
  fal.ai、火山方舟（国内）与 BytePlus ModelArk（国际）三条独立通道；2026-08-11 Seedance 2.5
  也已补齐同样三渠道，并按官方 schema 分开 fal 与 Ark 的参考音频约束。桌面画布助手现可直接拖动
  标题栏空白区且保持原尺寸，按钮不会误触拖动；历史记录迁入左侧第三视图；Script 展开态由约 627px
  提升到约 811px（当前 1127px 视口），仍限制在画布工作区内；助手默认顶部改为 64px，画布外观入口固定在顶栏最右侧。

### 早前已稳定

- 画布视频节点 = 纯视频卡 + 固定右侧紧凑编排器；仅显式扩大按钮进详情。
- 视频引用沿真实连线收割图/视频/声音；预览与提交共用 `buildVideoSendPreview`。
- `video-model-send-plan.ts` 按 Seedance / Kling / HappyHorse / Gemini 定义素材槽与能力。
- 旧 `fusedIntoNodeId` 隐藏通路已退役；旧项目走兼容迁移。
- 左侧 Cast 卡匣已降级为定位器（分组 / 搜索 / 定位 / 选中），不再编辑与新建。
- 首页模型卡使用官方品牌素材；LoRA 底模选择器接入同源素材。
- 本地化 Clerk 登录/注册 catch-all 路由已恢复。
- 本地 dev「跑不出生成」根因已解：`NEXT_PUBLIC_APP_URL` 的 `https://localhost`
  协议错配；已加派发前守卫，生产零行为变化。

## Design Status

- 2026-08-05 LoRA 域已按 owner 真机反馈统一为系统白色浅色工作台；无 `section` 的
  `/studio/lora` 默认入口改为 Generate，Library / Mine / Train 显式深链保持不变。
- 2026-08-05 后续反馈已完成：首页图片案例改为“左侧文案内含交互 / 右侧纯图片”；视频生成、
  参考视频、视频合成共享白色浅色初始空态；添加菜单只保留一个直接创建的「收集」入口。
- Round 2 共同要求：主体媒体显著放大；镜头图/关键帧重做；删除独立「视频素材/文生模式/空闲」摘要条；
  视频模型复用通用两级选择器；管理素材不得覆盖提示词。
- 已选向：A「媒体优先」；详情展开层的信息 / DOM / 键盘顺序已确认改为
  **主体 → 编排 → 素材 → 关系/证据 → 动作**。
- 关键切片“视频详情 + 管理素材开/关”已完成三档验证；现行 `>960px` 保持“大媒体左 / 编辑右”，
  只有 `681–960px` 才切换为“媒体上方全宽 + 下方提示词 / 素材双列”。
- 宽屏编辑栏已确认固定为 `384px`；素材管理已确认在参考素材栏内原位切换，不遮挡提示词并保留焦点回返。
- 移动端已确认在 `≤680px` 进入“媒体 → 提示词/模型 → 参考素材”的完整单列，主动作粘附底部。
- Round 2 A 已按逐项确认结果实现；现行结构与验证事实见 `docs/references/pages/canvas-node-detail.md`。
- 图片族主图与参考图保持不同数据语义，但来源入口不再重名堆叠；LoRA 存量字段未做破坏性迁移。
- **包 6 审阅网格的造型同样未确认**，必须走完设计门再实现。
- 稳定方向与未决问题见 `docs/plans/canvas-session-handoff-2026-07-30.md`；
  详情页当前结构见 `docs/references/pages/canvas-node-detail.md`，
  其状态已升级为「已实现、待 owner 真机复核」。

## Validation

- 2026-08-23 图片工作台结果区：开发态 `/zh/dev/ui-states` + `scripts/ui-probe.js` 复测同一状态，
  交互遮挡 4→0、矩形相交 16→0、无切换控件计数 1→0，9:16 单格高度从 767px 降到 257px，
  2×2 结果首屏由 3/4 提升为 4/4；全量 TypeScript 通过，全量 ESLint 0 error（5 条既有 warning），
  全量 Vitest 537 files / 5196 tests 通过。未执行 production build：owner 的 3000 dev 实例正在运行。

- 2026-08-18 图层分解整条删除（owner：功能废弃）：`LayerDecomposePanel` / `use-layer-decompose` /
  `image-decompose.service` / `/api/image/decompose` 四个文件删除；画布 `decompose` 能力与工作区那整段
  （预览 / 全选 / 放置图层）删除，ready 能力 8 → 7；`'layers'` 交互、`'image-layers'` 输出、
  `'derive-layers'` 策略、`derivedBatchId`（全仓只写不读）一并清掉；三语各删 39 个叶子，**删完重新 parse
  比对前后叶子集合，新增 0 / 意外删除 0**（禁正则改 messages JSON）。跑的是 HF Space `xiuruisu/see-through`。
  TypeScript 0 错 · 全量 Vitest 485 files / 4409 tests 绿 · 目标 ESLint 0 warning。真机 `/zh/studio/image`
  确认「图像」弹层只剩 上传 / 最近素材 / 素材库。
- 2026-08-18 图片工作台重设计（D1 切片 0–3）：图片模态换横向外壳 `StudioWorkbenchLayout`（`lg:w-72`
  参数栏 + 结果区，断点 lg 与 `useIsMobile` 对齐），视频 / 音频维持 `StudioFlowLayout` 不动；
  `generateCompare(input, models, perModelCount)` 收敛成矩阵入口（模型集 × 张数），`VariantGrid` 退役、
  图墙统一到 `CompareGrid`；`BaseModelPickerPanel` 加 `layout="columns"` 三列居中 Dialog + 多选 + 品牌图，
  搜索框按 owner 删；规格三档合成 `StudioSpecPopover`；助手改右上角浮标 `StudioAssistantFab`。
  真机 1920 实测：浮标开 720px / 关 0px、参数栏坐标全程不动；生成按钮阻塞态文案 18.15:1（`color(srgb …)`
  分量是 0–1，按 0–255 读会算出 1.50 的假值）。TypeScript 0 错 · 全量 Vitest 绿 · 目标 ESLint 0 warning。
  ⛔ 切片 4（成本预览）/ 5（平台出资降档）未做，卡 owner 一句话；编辑线 E0–E5 一条未开工。
- 2026-08-17 Studio Image 参数栏弹层回归：`ResponsivePopover` 在窄视口 + fine pointer 时保留锚定 Popover，
  touch-primary 紧凑态仍走 Drawer；`StudioPromptArea` 的 document pointer handler 不再抢先关闭当前
  `图像` / `规格` 触发器。定向 Vitest 3 files / 25 tests、全量 Vitest 485 files / 4409 tests、
  TypeScript、目标 ESLint 与 `git diff --check` 通过；现有 3000 页面实测两个入口均可“打开 → 再点同一按钮关闭”，
  点击提示词区域关闭仍正常，控制台无新增 error。
- 2026-08-11 画布助手顶部避让：`CanvasWorkspaceLayout` Vitest 1/1、目标 ESLint 与 `git diff --check` 通过；现有 3000 页面在 1127px 视口实测“桌面”按钮右边缘为 1115px，助手为 `360×832`、顶部 64px、右/下各 16px。全量 TypeScript 被工作区另一项未完成的 `KreaAssetBrowser.tsx` 密度常量/类型缺失阻断，与本次几何改动无关。
- 2026-08-11 画布助手交互：定向 Vitest 4 files / 14 tests、TypeScript、目标 ESLint、目标源码
  Prettier 与 `git diff --check` 通过；现有 3000 页面实测标题栏方向键移动 `-24px`、模型按钮点击后
  位移仍为 `0px`，左栏展示 2 条真实历史会话；Script 展开态由约 `627px` 增至 `811px`，最后恢复
  `360×880` 默认右上位置。`StudioNodeWorkbench.tsx` 全文件 ESLint 仍只有本次前已有的 5 条 React
  Compiler 债务，本次触及文件的其余目标 ESLint 为 0 error。
- 2026-08-11 Seedance 2.5 三渠道：fal.ai、火山方舟国内与 BytePlus 国际均进入同一型号；fal
  text/image/reference 三端点与两条 Ark 带日期 model id 已写入目录，应用侧与 execution Worker
  请求构造器同步支持 4–30 秒、480p/720p、30/10/10/50 参考上限与 2.5 首尾帧。根目录定向
  Vitest 6 files / 139 tests、execution Worker 1 file / 12 tests 通过，`npm run typecheck` 与目标 ESLint 通过；
  真机确认 Seedance 2.5 型号显示 3 个渠道且第三层为 fal.ai / VolcEngine / BytePlus，验证后已恢复原选择；
  官方公开索引/OpenAPI 已核对，未执行新的付费生成。
- 2026-08-11 身份卡空态崩溃回归：修正 `naturalSize` 尚未建立时的空值解引用；复现测试先红后连续
  两次转绿，TypeScript 与目标 ESLint 通过；现有 3000 页面刷新后 React Flow 恢复为 12 个节点，
  空身份卡正常显示且 Next.js 运行时错误覆盖层消失。
- 2026-08-11 视频紧凑编排器补齐缺 Key 路由：未配置的 BytePlus 通道仍可点击，但只打开
  `QuickSetupDialog`，不会更改当前模型或发起生成。回归测试先红后连续两次转绿；`VideoComposer`
  53/53、TypeScript、目标 ESLint 通过；真机确认配置窗出现、关闭后原 VolcEngine 选择保持不变。
- 2026-08-10 画布反馈与 Seedance 2.0 国际通道定向验证：全量 TypeScript 通过；根目录相关
  Vitest 14 files / 108 tests、worker Vitest 1 file / 9 tests 通过；目标 ESLint 通过
  （`StudioNodeWorkbench.tsx` 仍保留本次变更前已有的 React Compiler lint 债务，未在本片扩修）。
- 2026-08-05 统一 AI 对话助手实现切片：Image / Video Studio、LoRA 与节点画布共用 `360px`
  overlay 浮卡头部、同一模型注册表、历史/分享/研究与最多 8 个图片/视频附件契约；助手默认
  OpenAI 路由升级为 `OpenAI GPT-5.6 Sol`，Gemini 接收真实视频输入，其他不兼容路由在发送前阻断。
  附件现按用户消息持久化、历史恢复与分享回显，后续轮次继续引用稳定 URL；素材库支持图片与视频，
  菜单明确标记视觉能力，Qwen 从共享助手路由源头排除。安装与本地命令统一使用 npm；
  `npm run typecheck`、目标 ESLint、相关 Vitest 10 files / 110 tests 通过，追加模型注册表回归命令
  3 files / 30 tests 通过；全量
  `npm run lint` 为 0 error / 5 条既有 warning，全量 Vitest 在 424 秒超时且未产出最终汇总。
  3000 端口仍由既有 Node dev 进程监听，但本轮浏览器显示“无法访问此站点”且 HTTP 冒烟请求超时；
  按规则未重启或另起第二实例。四域桌面、375px、弹层与附件交互仍待 owner 手动刷新或后续重启 dev
  后完成视觉验收；任务包继续保留为 active。
- 2026-08-05 发布闸门：`npm run preflight` 全绿（TypeScript、ESLint 0 error / 5 warning、
  Vitest 465 files / 4161 tests）；移动端 Playwright 单 worker 30/30 通过。现有 3000 dev
  实例运行中，按仓库规则未并行执行本地 production build，构建交由 Vercel Production 验证。
- 2026-08-05 模型选择器真机回归：Canvas 助手头部模型菜单按宿主显式向下展开，Image Studio
  通用图片模型源排除仅供 LoRA 工作台使用的 PixelVault Runner；LoRA 独立 Runner 路径不变。
  Studio 助手无已保存 Key 时仍展示默认助手模型与三条 Enhance 模型路由，并改为覆盖
  主工作区的固定右侧浮卡（桌面 top / right / bottom 均留 16px，四边圆角）。当前
  `npm run typecheck`、目标 ESLint、相关 Vitest 44/44 通过；浏览器
  实测 Canvas 菜单 `data-side=bottom` 且完整可见，Image Studio 的 Runner 条目为 0、其余 5 个厂商
  入口正常；Studio 助手开/关前后主工作区同为 1232px，Quick Setup 可进入。

- **上一轮全量闸门：2026-07-31（包 5 交付时）**——全量 `tsc` exit 0 零输出；
  全量 vitest **4046 passed**，仅 `LoraWorkbench` 满负载超时（已登记的假失败，
  单跑 27/27 绿）。
- **此后未再跑全量**：包 5 的四处真机修正（含 `d1cba07a` 提案静默消失）与本地
  未提交的模型接入改动**都在这次闸门之后**，声称绿之前必须重跑。
- 节点详情 Round 2 A 定向验证（2026-08-04）：`npm run typecheck` 通过；目标 ESLint 通过；
  相关 Vitest 88/88，最终素材/视频复跑 75/75；1309 / 1025 / 375 真机几何与无横向溢出通过，
  素材管理内联、不遮 prompt、焦点回返及共享视频模型选择器均实测成立。
- 画布后续反馈回归（2026-08-04）：`npm run typecheck` 与目标 ESLint 通过；相关 Vitest
  75/75。真机确认左栏展开/收起均为 `16px`，参考视频节点与 1280×720 媒体同为 16:9，
  声音详情存在“声音库”入口，助手头部显示 `OpenAI GPT-5.5`。旧音色节点缺少历史样本 URL
  不做猜测回填；重新从声音库选择或生成试听后进入可播放状态。
- 2026-08-05 UI 收口：`npm run typecheck`、目标 ESLint、相关 Vitest 32/32 通过；浏览器实测
  1294px 详情工作区为 `766px + 384px` 左右双栏，视频生成/视频合成空态为 `rgb(255,255,255)`；
  首页交互区是左侧文案的真实子节点且右侧媒体内无按钮/说明；添加菜单只有一个无展开态的「收集」。
- 2026-08-05 图片族来源精简：`npm run typecheck`、目标 ESLint、`ImageFamilyBody` Vitest 6/6 通过；
  浏览器实测详情无 Studio/LoRA，参考图单一添加入口仍含上传/素材库/粘贴，主图替换菜单含上传/素材库。
- 真机验收（包 5）：伪造四条 op → 2 ready / 2 rejected → 应用后节点 18→19、边 26→27；
  修复后复跑得 19 条 op，应用后 13 节点 / 6 边并落库。
- 真实扣费 provider smoke 仍未执行。

## Next

1. **包 6 审阅网格**：按 `ui-page` 走设计门（域定义 → 三方向 → 关键切片 → owner 确认）。
2. 包 7 剧本节点**设计轮**（owner 已定：形态仍模糊，不是写契约）；其前置除包 6 外，
   还包括**卡片总线契约必须回来补**——否则剧本节点铺出的角色槽全要手填。
3. 节点详情页 Round 2：owner 继续真机复核当前实现；首页案例、视频族浅色空态、侧栏圆角、
   参考视频比例、图片族单一参考入口与单一「收集」入口均已完成。
4. 链外登记 G1 参考图接不到素材库 / G3 政策归因 / G4 进度·取消·失败可见性 / G5 身份卡存废。
   G2 模型选择器已修（`df12cf19`）。
5. 可插包 I1 视频灰区 #2（很小，仍未做）· I2 LoRA 提示分层 · I3 壳级 A' 浅壳。
6. 交付前跑完整 lint、Vitest、Playwright mobile、production build；
   push `main` 前再过 `docs/checklists/release.md` P0。

## Blocked

- **包 6 / 包 7 仍需要 owner 对关键切片逐项确认**；节点详情 Round 2 已实现，不再构成实现授权阻塞。
- **卡片总线契约** owner 已后置，但**包 7 之前必须回来补**（G5 身份卡存废与之同源）。
- OpenAI key 无效（GPT Image 2 报 401）；VolcEngine 未绑 key ——
  后者挡着 G3 的归因对照实验。
- 真实视频 provider smoke 需要有效且经 owner 授权的 API key，会产生费用。
