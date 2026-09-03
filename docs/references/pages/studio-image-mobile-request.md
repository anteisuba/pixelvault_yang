# UI 需求卡 · Studio Image 移动端（2026-09-03 owner 拍板）

> 上游：[`studio-image-workbench.md`](studio-image-workbench.md) 「移动端（2026-09-03 owner 拍板）」节记录了本卡对应的方向结论；本卡是该结论的 `ui-request.md` 落卡版，供实现会话直接开工。默认值按 [`../ui-defaults.md`](../ui-defaults.md)（字体/颜色/动效/移动端配方/8 项完成定义）；对应 `domains/studio.md` 「移动端等级」表中 `/studio/image` 一行。

> 2026-09-03 起画布区为白卡、参数栏躺灰底，共用工作台脊柱 `.workbench-*`（见
> `../ui-defaults.md` §2.2）；<1024 时地台 padding 收到 10px，舞台仍是一张
> 带圆角描边投影的小卡，本卡下方的移动端结构不变。

## UI 需求卡

1. 页面 / 域： `/studio/image`（Studio Image，生成模式）· `<1024`（`useIsMobile`）。桌面 `≥1024` 不变（左参数栏 + 右结果区）。
2. 用户来这里完成的一件事： 说想要什么 → 出图 → 看图 → 继续（选模型/规格/参考图，输入提示词，点生成，看结果，改一改再生成）。
3. 改什么（范围）： 空态起手屏（示例卡 + 继续创作）、底部固定 composer（模型/规格/参考图 chip 行 + 提示词输入 + 生成按钮）、模型选择改为 `MainModelPicker layout="drill"` 抽屉、规格 sheet（含收纳的负面提示词字段）、生成后结果滚动与动作区。不改 `StudioOperatorDock`（移动端本轮维持 `return null`）、不改视频/音频模式的验收范围（同壳可复用，未验证）。
4. 状态矩阵： 空（未生成，起手屏 + 教程轮播）· 加载（生成中，composer 占位不变、结果区占位格）· 有内容（结果已出）· 错误（生成失败 / 缺 API key）· 禁用（生成按钮：空提示词或未选模型）· 选中（模型/规格/参考图 chip 的已选态、抽屉/sheet 打开态）。
5. 375px 结构（降级，配方见 `../ui-defaults.md §6` 与 `domains/studio.md` 移动端等级表）：

   | 区块             | 375px 呈现                                                                                                                                                                            |
   | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 空态起手屏       | 标题「想画什么？」+ 2×2 示例卡（3:4 封面 + 一行 prompt）+ 「继续创作」条；教程轮播照旧自动弹出但不得遮挡 composer                                                                     |
   | 舞台             | 占满除 composer 外全部高度；结果出现后舞台承载结果卡（图 ≤ `--studio-generation-media-max-height` 45vh）                                                                              |
   | composer 第 1 行 | 3 个 chip（32px，`touch-target-y`）：`模型 ▾` / `规格（1:1 · ×1）▾` / `＋参考图`（已挂载显示数量）                                                                                    |
   | composer 第 2 行 | 44px 单行自增高 prompt 输入 + 内嵌 ✨ 优化图标 + 44×44 黑色方形生成按钮（↑，出结果后变 ↻）                                                                                            |
   | composer 定位    | 固定于视口底部，`keyboard-aware-bottom-padding` / `--keyboard-safe-area-bottom` 之上，键盘弹出时随内容让位                                                                            |
   | 模型抽屉         | `MainModelPicker layout="drill"`，vaul 全屏抽屉（约 92svh）：系列 → 型号两级；型号行 56px 全宽，右侧等宽价格，KEY 状态 pill（已配 KEY / 需配置），已选行 check；footer `使用 <model>` |
   | 规格 sheet       | 底部 sheet：比例 / 张数 chip 组 + 可折叠「负面提示词」字段（桌面侧栏项收纳进来）                                                                                                      |
   | 参考图           | 沿用现有参考图入口收纳进 chip；数量在 chip 上显示，点开进入既有参考图选择面                                                                                                           |
   | 结果出现后       | 结果卡自动滚动到舞台顶部（每轮一次）；图下是既有移动端 peek 动作行 + 「更多」抽屉；再下是反馈行；composer 保留原提示词不清空                                                          |
   | 生成按钮禁用文案 | 与选择器占位文案不同：选择器空态显示「选择模型」，禁用按钮显示「先选模型」——不复用同一句话                                                                                            |

6. 交互动作表：

   | 触发                       | 即时反馈                                                   | 动效（按 ui-defaults §4）                                    | 结果                                                                      |
   | -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
   | 点示例卡                   | 卡片按压态 `active:scale-press`                            | `duration-fast` 颜色过渡                                     | 提示词回填进 prompt 输入，光标定位输入框末尾，不自动生成                  |
   | 点「模型 ▾」chip           | chip 按压态                                                | vaul 全屏抽屉滑入（内置）                                    | 打开 `layout="drill"` 抽屉，默认展开当前已选系列                          |
   | 抽屉内选型号               | 行按压态 + 选中 check 立即出现                             | `transition-colors duration-fast`                            | 写入选中模型，抽屉保留在型号列表（不自动关闭），footer 按钮更新为该模型名 |
   | 点 footer「使用 <model>」  | 按钮按压态                                                 | 抽屉关闭动画（内置）                                         | 关闭抽屉，chip 文案更新为新模型，生成按钮解除禁用（若 prompt 非空）       |
   | 点「规格」chip             | chip 按压态                                                | 底部 sheet 滑入（内置）                                      | 打开规格 sheet，比例/张数当前值高亮                                       |
   | 展开负面提示词折叠区       | 箭头旋转 + 区域展开                                        | `animated-collapse`                                          | 显示负面提示词输入框                                                      |
   | 点「＋参考图」chip         | chip 按压态                                                | 沿用既有参考图面板动效                                       | 打开参考图选择，选定后 chip 显示数量角标                                  |
   | 聚焦 prompt 输入           | 输入框获得焦点环                                           | 软键盘弹出，composer 随 `keyboard-aware-bottom-padding` 上移 | 输入区域不被遮挡，生成按钮保持可见                                        |
   | 点 ✨ 优化                 | 图标 `loading` 态（Spinner 替换，宽度不跳）                | `duration-fast`                                              | prompt 文本被优化结果替换                                                 |
   | 点生成（enabled）          | 按钮变 loading（Spinner 替换 ↑，宽度不跳）；舞台占位格出现 | 结果骨架 `animate-pulse`，到达时 `fade-in-0 duration-base`   | 提交生成请求；prompt 保留原文不清空                                       |
   | 点生成（disabled：无模型） | 无 hover/press 视觉，`aria-disabled`                       | 无                                                           | 不提交；点击改为跳转/打开 `QuickSetupDialog`（Hard Rule 8，缺 key 场景）  |
   | 生成结果到达               | 舞台自动滚动到结果卡顶部（每轮一次，`scrollIntoView`）     | `duration-base` 平滑滚动，`motion-reduce:` 降级为跳转        | 结果卡置顶可见，动作行随即出现                                            |
   | 点结果动作行「更多」       | 抽屉按压态                                                 | vaul 抽屉滑入（内置）                                        | 展开完整动作列表（下载/编辑/当参考图/定最佳等，同桌面唯一动作栏语义）     |
   | 生成失败                   | 该结果格显示失败原因 + 「重试」按钮                        | `error-alert.tsx` 既有样式                                   | 点「重试」重新提交同一请求，composer 状态不变                             |

7. 非目标： 不改 `StudioOperatorDock`（移动端继续 `return null`）；不做视频/音频/enhance/analyze 模式的移动端专项验收（同壳复用但本轮只验证图片）；不改 `LoraWorkbench`（已完成）；不改桌面 `≥1024` 布局；不新增默认模型的选型算法之外的持久化机制（localStorage key 待在 `src/constants` 定义，命名遵循现有 SCREAMING_SNAKE 常量风格）；不碰 service/API 契约。
8. 参考（可选）： 本卡的模型抽屉 `layout="drill"` 复用 `docs/references/pages/lora-library-mobile-request.md` 已验证的 vaul 抽屉与 sheet 分层方法（不借视觉皮肤，只借结构）。

## 默认模型选型规则（owner 2026-09-03 拍板，写入 constants 层）

1. 优先取 localStorage 记录的「上次使用模型」（key 待定义于 `src/constants`，命名遵循现有风格）。
2. 若无记录，取当前可用图片模型中价格最低、且其 provider 已配置 API key 的一个。
3. 若两者都不满足（无历史、且没有任何已配置 key 的图片模型），保持模型为空态，生成按钮点击时路由到 `QuickSetupDialog`（Hard Rule 8：缺 key 不禁用 UI，走内联配置）。
4. 禁用态按钮文案与选择器占位文案必须不同——今天两处都写「请先选择模型」是需要修的重复，落地时改成本卡表 5 最后一行给的两句话（或等义替代，只要不同）。

## 备注

- 本卡的模型/规格/参考图 chip 状态仍归 `studio-context.tsx` 与既有 hooks 所有；chip 与抽屉/sheet 只是移动端呈现层，不新增独立 state 源。
- composer 高度变化（prompt 单行自增高）需要保证舞台可用高度联动，不能靠桌面固定间距值。
- 教程轮播与 composer 的层级顺序：教程轮播不得覆盖 composer 的点击区域，二者 z-index 需要显式约定（落地时在组件里写明，不在本卡展开像素值）。
