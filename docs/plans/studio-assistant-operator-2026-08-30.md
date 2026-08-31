# 工作台助手 · 操作员化 — 实现任务包（2026-08-30）

> ## ✅ 进度快照（2026-08-30 深夜：P2 完成验收，全部在工作树未提交）
>
> - **P1 ✅ 在 main（`bf5eb1f8`，commit message 误标「画布助手」，内容无碍）**；
>   clamp off-by-one 已修带回归。⛔ 别再重修。
> - **P2 ✅ 完成**：面板全量 + 拍板 20（弹层复用 `AssetSelectorDialog`，单选点即挂、
>   不锁 mediaType）。闸门：tsc 0 错 · 全量 vitest 567 文件 5714 绿 · 三语各 5404 键
>   零漂移。编排会话独立复核：AttachMenu 无 `<Link>`、新测试 11/11 绿、
>   真机全链路（胶囊→📎→6格点即挂→弹层→选中即挂并关闭，URL 不动）截图在会话内；
>   附录 A 逐项结果与程序化读值见 scratchpad `p2-real-machine-verification-log.txt`。
> - P2 收尾顺手修掉两个真 bug：①草稿/附件随收放被卸载清空（state 提到 Dock 层）
>   ②跨轮 `step.id` 碰撞顶掉旧日志并继承划线（线程 key 改 `runKey:stepId`）。
> - **📎 交互收口 ✅**：附件面板使用全站 motion canon 的 200ms 轻量入场
>   （淡入 + 8px 上移 + 0.985→1，`prefers-reduced-motion` 下取消位移/缩放）；面板内部、
>   触发器与素材选择 Dialog 内点击保持打开，点击其余区域关闭；键盘打开后进入首个操作，
>   `Escape` 只关闭这一层并把焦点还给触发器。`/zh/studio/image` 真机确认内部点击保持、
>   参数区点击关闭，且参数区点击继续遵守既有注意力法则收起助手；定向 Vitest 10/10、
>   目标 ESLint、全量 TypeScript 通过。
> - **owner 08-30 深夜指令：修 set_specs 洞 → 直接进 P3；并点名「📎 上传区点击无反应」**
>   （P2 时上传标着「下一片接」，现在就是那一片）。三路已下派并行：
>   ① set_specs 空档位修复 ✅ **已落**（precondition 提到 schema 之前，按成因分岔
>   `noModelSelected`/`noSuchControl`，状态块改口 LOCKED；定向 38/38 绿含 money-gate，
>   编排会话独立复跑同绿；零 messages 改动——复用既有理由键）。⚠ 顺带查明同族限制：
>   **档位表冻结在请求快照里**，同一轮 `set_model`→`set_specs` 仍设不上（detail 已明说
>   「下一轮再设」）；真解=服务端从 provider-capabilities 自推档位，另立一件。
>   ② **P3-A ✅ 已落**：📎 上传三通道全通（点击/拖拽/粘贴；三类直传真机各 200；
>   失败红 chip 可重试；fetch 探针零 base64；chip 显示文件名）。⚠ 顺带实证既有缺陷：
>   `video-thumbnail.ts` 探针零超时→后台标签页永久挂住（本片自防 15s 预算，根治已挂
>   独立任务卡）。**合流后全量闸门 ✅**：tsc 0 错 · vitest 568 文件 5732 绿 · 三语 5414 对称差 0。
>   ③ 搜图源比价 ✅ → `web-search-import-source-eval-2026-08-30.md`；**owner 已拍
>   「预览优先，用户确定才落 R2」**；**P3-B ✅ 已落**：`search_web_images` 只读工具 +
>   `POST /api/studio/web-image-import` 独立导入路由两条腿分开；money-gate **收紧**
>   （`web-image-import`/`importWebImage`/`uploadToR2`/`uploadFromHttpToR2` 进禁字表）；
>   来源快照写 `Generation.snapshot` 零迁移；导入强制 `isPublic=false` 且 `requestCount:0`；
>   转存链有意改走 upload-image 先例（下载→sharp 验魔数→上传+缩略图，真机拦下过
>   假图片响应）而非 `uploadFromHttpToR2`（缺字节闸/验型/宽高）。候选行可换选、
>   换选失败态已修（selected/attached 拆开）。真机全链路+fetch 探针零 base64；
>   Serper 实耗 2/2500。定向 172 用例绿，编排复核 30/30+钱闸+三语 5424 零漂移。
>   ⚠ 未验：searchUnavailable 真机态 · 日/英文案目检 · 多日志条各记选中 · 20MB 上限（均有单测）。
>   **P3-C ✅ 已落**（看图闭环）：归属=**票据模型按 run item id 认**（⛔不按 run id——
>   视频档队列复用 run id，同类于共享 pollRef 前科），TTL 30s+一次性投递+全失败不投；
>   服务端结构性不打扰（`request.result` 缺席即拒，没有第二条路拿结果图）；
>   `critique_result` 走视觉路由（money-gate 白名单只加 vision-route.service 路由解析，
>   会落库的 vision-analyzer **有意不在**）；评价卡内嵌图共用灯箱+「还原这轮」一击全撤。
>   真机：服务端真流两轮帧序一致且评语与图逐条对上；客户端全链（评价卡/预填/ChangeRail/
>   primed/还原）全过。定向 207 例绿，编排复核 64/64+三语 5434 零漂移。
>   ⚠ **付费端到端（primed 态真点生成→自动评价）留 owner 一次点击**，步骤见会话汇报。
> - **owner 2026-08-31 真机试用反馈 → 体验修复轮（P3-D）✅ 已落**。诊断：①用户递的
>   URL 无工具能接→职责倒置（支使用户点图）②同一读工具连跑三次无卡死护栏③「看一眼」
>   与「要这张」同一手势→点一次下载一次、换选留残留④把内部规则背给用户听+计划条刷屏。
>   修法：拍板 21（看选分开挂载才下载）+ 拍板 22（import_user_url）+ 三条工程修
>   （重复步护栏 `repeatedStep`、话术禁令、一轮一计划）。**P4 音频域整个剔除**（owner
>   「声音那边不用管」，已写进 P4 节）。
>   **落地形态**：候选行改成「缩略图开灯箱（零网络）+ 每格一颗『选用』」，可多选
>   （上限读快照 `references.limit`），取消/换选走**既有** `DELETE /api/generations/[id]`
>   清素材（零残留）；新工具 `import_user_url` 是改动型 step，服务端只做**结构校验**
>   （URL 必须逐字出现在用户消息里，否则 `urlNotFromUser`），取图/落库那一跳仍在
>   客户端走既有导入路由 —— **money-gate 一条没松**（另加一条用例专门锁这件事）；
>   导入 service 支持「网页 → og:image/twitter:image 直链」（content-type 判型，
>   台账 BH；只跟一跳，提不出就 `noImageOnPage`）。
>   闸门：tsc 0 错 · 定向 vitest 323 绿 · 三语各 5443 键零漂移 · 目标 ESLint 干净。
>   真机（`/zh/studio/image`，fetch 探针 + 读库前后对比）：浏览 8 张候选 = 0 请求；
>   「选用」= 恰好 1 次导入 + 1 条新记录；取消 = `DELETE /api/generations/<id>` 且库里
>   真的没了；用户粘链接 → 助手第一步就 `import_user_url`、全程 0 次用户点击；
>   重复步护栏在真机自发触发（红卡「这一步刚才做过了，跳过」且零网络）。
>   Serper 实耗 1 次。日志见 scratchpad `p3d-real-machine-verification-log.txt`。
>   ⚠ 遗留：`revertAll`（清掉全部改动）对参考位只按**登记簿里最早那条** inverse 撤，
>   同一字段挂了多张时撤不干净 —— 与 `mount_reference` 同源的老限制，不是 P3-D 引入；
>   逐条「撤销」是准的（真机验过）。
>   ⚠ P3 仅剩「存配方/总账」一项：**无已批交互稿**（切片 v4 未含），按设计治理先出小样
>   再实现——等 owner 试完本轮再定形态。⚠ `StudioPromptArea.tsx` 现叠了 P2+P3-C+voiceroom
>   三方改动，提交拆分时注意。
> - **⚠ 其余遗留**：
>   1. 被拒的步留红字不折叠（重试成功后仍在）——要不要折叠待 owner 拍。
>   2. 未真机点验：⋯ 下拉、模型 chip 弹层、灯箱、挂载动效、primed 描边
>      （**会话下拉 P4-B 已点验通过**，Radix 在真机上正常挂载）
>      （多因隐藏标签页 Radix/动画限制或未选模型，代码已备）。
>   3. 6 格与 chip 对上传素材全显示 `user-upload`（prompt 空回落 model），零信息量。
>   4. `set_count` 日志详情与标题重复。
> - P3 状态收拢：**A/B/C/D 四片全落**，仅剩「存配方/总账」待 owner 定形态。
> - ## ✅ **P1–P4 收官全量闸门（2026-08-31 12:17，编排会话串行跑）**
>   `tsc --noEmit` **exit 0** · 全量 vitest **582 文件 / 5926 通过 / 1 skipped /
>   31 失败集中在唯一一个文件 `LoraWorkbench.test.tsx`**。
>   ⭐ **判定为台账已记的「满负载假超时」，非回归**：隔离复跑该文件 **32/32 全绿（56.8s）**，
>   而全量下它的 import 阶段要 616s。⚠ 但如实记一笔：P4-C 本轮**增大了这个文件**
>   （+LoRA 域用例），余量因此更薄，日后更容易触发。
>   ⚠ 教训复现：`{...} | tail -6` 让 `VITEST_EXIT` 变成 `tail` 的 0 —— **退出码不可信，
>   只能读汇总行**（台账「管道会把退出码换成 tail 的」当场又中一次）。
> - **P4 ▶ 开工（owner 2026-08-31「开始P4」）**，拆三片串行：**P4-A ▶ 已下派**
>   （视频域工具集+跨域切换：域 chip/切域插 dmark 不断线程/per-domain 快照分派；
>   视频工具=model含渠道(K-3 教训)/prompt/specs/参考/音频参考走台账 A 条通道
>   (generateAudio 三态别误发 false)/prime；⛔视频域无 set_count——恒单条）→
>   **P4-B ✅ 已落**（会话历史落库+会话菜单接真：**零迁移**——`AssistantConversation`
>   表已存在且 surface 枚举含 IMAGE_STUDIO/VIDEO_STUDIO/LORA/NODE_CANVAS，跨域线程
>   `surface` 记起始域、域切换以域标记存 messages JSON；⛔只存可读历史，
>   可操作态(撤销/primed/确认条/ChangeRail)不过刷新——画布「过期提案再点应用只会做错事」
>   同款教训）→ **P4-C 排队**（LoRA 线并入）。音频域整个剔除（owner 拍板）。
> - **P4-A ✅ 已落**：视频域工具集 + 跨域切换。域机制=`ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN`
>   两道闸（系统提示按域裁工具表省往返 + planTool 按域 `noSuchControl` 硬拒）；
>   快照按域两个纯函数（视频档无 specs/count，多 videoSpecs/audioReferences/sound）；
>   `switchOperatorDomain()` 一次写入同时插域标记+切域（避免中间态）；changes/confirm/primed
>   **按域分槽**。⭐ 顺手修掉真缺陷：`set_model` 在视频档此前用**图片模型池**→端上去查不到
>   optionId 静默不做；现按 optionId 精确匹配且目录每行印「型号·渠道·credits」（K-3 教训）。
>   三处刻意分家（都有实证）：视频规格用**新工具 `set_video_specs`** 而非扩 `set_specs`
>   （Kling V3 Pro/MiniMax H3 的 `parameters.resolution===false`，塞进两个必填会让这些型号
>   永远无解；载荷与 inverse 仍带齐三格）· 出声工具叫 **`set_sound`**（provider 那个字段名
>   逐字在 money-gate 禁字表里）· **视频域无 `critique_result`**（借来的视觉线吃静态图，
>   喂 mp4 会编造评价）。真机：切域面板不断线程+域标记+chip 变；视频域 primed 即停；
>   「一次出 4 条」助手直接答不支持且**一步没烧**（工具表裁掉它看不见）；fetch 探针
>   `domain:"video"`、无 specs/count、`sound`/`audioReferences` 整节缺席（⛔没把「没设过」
>   误发 false）。定向 258 例绿（编排复核 108/108），tsc 0 错，三语 5448 零漂移，钱闸零放宽。
>   ⚠ 遗留：`mount_audio_reference`/`set_sound` 只有单测（需 Seedance 2.5 线路+全能参考档
>   才能真机验）· 视频档模型标签印 id 非中文名（既有回落逻辑）· 切媒体大类会清空 prompt
>   导致 ✦ 标记与画面短暂不对位（要修等于让 store 追表单，有意不做）。
>   ⭐ 另挖出**两处既有 UI/schema 上限对不齐**（音频参考 UI 10 vs schema 3；参考图 30 vs 9
>   → 超限整请求 400），已挂独立任务由 owner 另起会话修。
> - **P4-B ✅ 已落**：会话历史落库 + 会话菜单接真（拍板 10）。
>   复用**既有**写入路径 `POST /api/assistant/conversation` → `assistant-conversation.service`
>   （与画布助手同一条），**零新路由、零迁移**；痕迹搭在消息的可选 `operator` 格上，
>   形态与 `promptDraft` / `loraPicks` 那几格一模一样。
>   ⭐ **「可操作态不复活」是结构性的，不是自觉**：落库走**另一个类型**
>   （`types/studio-operator-history.ts`），它装不下 `inverse` / `payload` / `runKey`；
>   历史条目由另一颗只读组件（`StudioOperatorHistoryItem`）渲染，撤销钮 / 还原这轮 /
>   联网候选「选用」在那里**写不出来**。URL 只收 http(s)（`z.url()` 单独用是放行 `data:` 的）。
>   **跨域 × 单值 surface**：`surface` 记**线程起始域**，域切换以 domainMark 条目存在
>   `messages` 里；会话菜单同时列 image+video 两个槽再按 `updatedAt` 合并。
>   写入 = **一条防抖**（1.2s）——「一轮结束 / 用户发言 / 切域」三个时机全都以
>   「entries 变了」的形式经过它，不必各写一条触发。
>   ⭐ 顺带查明并修掉一个真混淆：**音频工作台的旧助手也写 `IMAGE_STUDIO`**（它的域回落到
>   image），库里实证有两条 —— 菜单靠 summary 新增的 `operatorThread` 过滤（服务端从第一条
>   消息有没有 `operator` 格算，`messageCount` 本来就在读 messages，零额外查询）。
>   ⭐ 顺带修：`switchOperatorDomain` 原本只看 `entries` 判「线程空不空」，刷新之后
>   `entries` 是空的而对话就在眼前 → 切域标记不再插；已把载回来的历史一起算上。
>   真机（`/zh/studio/image` + `/video`）五项全过：刷新后可读历史回来而 **ChangeRail 整块
>   不渲染 / 0 颗撤销钮 / 胶囊是 idle 不是「已备好」**；会话菜单列出这条（带域标签+时间，
>   两条旧助手会话被过滤掉）；新对话后库里**新增一行**且上一行没被覆盖；切域后刷新域标记仍在；
>   读库 12 条消息 2469 字节，`base64/data:/blob:/inverse/payload/primed/runKey` **全为 false**。
>   闸门：tsc 0 错 · 定向 vitest 175+24 绿（含 money-gate 零放宽）· 三语各 5453 键零漂移 ·
>   目标 ESLint 干净。日志见 scratchpad `p4b-real-machine-verification-log.txt`。
>   ⚠ 未验：评价卡进历史那一支（要真点一次生成才有 critique step，单测已覆盖）·
>   日/英目检 · 附件 chip 进历史后的渲染 · 保存失败（网断 / 404）的降级路径。
> - **P4-C ✅ 已落 —— P1–P4 全片收官**：LoRA 线并入。
>   ⭐ **架构增量 `contexts/studio-operator-host.tsx`**：LoRA 是**独立页面**（`/studio/lora`
>   故意不挂 `<StudioProvider>`，reducer 里没有挂载栈/底模的概念），而 P1–P4B 的驱动 hook/
>   撤销链/Dock 都直接 `useStudioForm()`。抽出宿主契约（域/快照/落笔的手三样），
>   ⛔ 没给 LoRA 页硬挂 StudioProvider、⛔ 没用模块 registry。**「一个 panel N 个宿主」
>   因此变少不变多**：从「一份写死的宿主假设」变成**编译期强制的宿主契约**——漏接一只手
>   是 tsc 错误而不是三绿功能失效；Dock 从此页面无关，两页同一颗组件。
>   ⚠ 代价（唯一新边角）：**跨域撤销**——在图片档点 LoRA 那步的「撤销」会划线但不生效
>   （图片宿主没有 lora 那组手，按契约整步不记账）。
>   LoRA 域旋钮已 file:line 取证（提示词/负面/底模/**挂载栈**/比例/参考图+强度/seed/
>   runner 高级参数/触发词；⛔无清晰度⛔无张数）→ 接 9 通用 + 4 LoRA 件
>   （`search_loras`/`mount_lora`/`unmount_lora`/`set_lora_weight`）；
>   **故意不接** `set_specs`（缺清晰度→两个必填会成永远无解的工具，正是 08-30 三连红那形状）·
>   `set_count`（无控件）· `critique_result`（装配台走自己的 resultHistory 不是 activeRun）。
>   ⚠ 遗留：**比例这颗旋钮本片够不着**（要么给 LoRA 域单字段比例工具，要么等装配台补清晰度）。
>   复用既有服务零重造：检索 `searchLoraCandidates`（双源、单源失败不拖垮另一源）·
>   许可/兼容三道核用**与界面橙色警示行同一个谓词** + Civitai 下载闸提前说 ·
>   导入挂载走 `useLoraCandidateConfirm`（抽低一层入口 `confirmPayload`，判据一行没变）。
>   钱闸：白名单只加纯检索 service，新增用例锁住服务端够不着导入/下载/R2/训练；
>   真机 `generateCalls=0`，收藏调用全在客户端（与拍板 22 同构）。
>   旧线**并入不删**：`LoraAssistantDock` 改成只在小屏渲染，与 `isMobile` 时 return null 的
>   新 Dock **互斥永不同屏**（⚠ 曾整删过又自己退回——小屏删了等于装配台没助手，是功能回退）；
>   顺带修「问助手」只投旧 store 导致操作员读不到的洞。
>   `studio-context.tsx`（47 文件高危件）**纯新增 11 行 0 删改**（编排会话 `git diff` 核实）：
>   加 `useStudioGenOptional()`，照抄同文件既有 `useStudioFormOptional` 先例，
>   因为 critique hook 现在也跑在无 Provider 的 LoRA 页。
>   闸门：tsc 0 错 · 定向 344+32 绿 · 三语 5458 零漂移 · ESLint 干净；编排复核 148/148。
>   真机六项全过，顺手修掉载回历史的 React key 撞车（渲染 key 带位置，⛔没动落库格式）。
>   ⚠ 未验：小屏那一支（桌面窗口改不了宽度，互斥是按结构判定不是量出来的）·
>   LoRA 域的 import_user_url/search_web_images/mount_reference 真机 · unmount 与逐条撤销真机点击。
>   ⚠ **未 root-cause 的独立现象**：整页刷新后 LoRA 挂载栈没从 localStorage 恢复
>   （四个 `pv.active-lora-stack.v2.*` 槽全空），`use-active-lora-stack.tsx` 本片一行没动
>   → 已挂独立任务查（可能是长期存在的持久化缺陷，与本片无关）。
>   画布对齐方案已另立：`canvas-assistant-operator-proposal-2026-08-30.md`（四拍板已定）。
> - ⚠ 工作树仍压着别的会话在飞改动（音频直传 · assets 上传队列 · voiceroom ·
>   r2 / generation api-client / uploads / `types/index.ts` 音频段），提交时 pathspec 分开。

> 设计阶段已收口，owner 逐轮拍板（本文件是唯一事实源；交互规格的像素级参照 =
> `docs/plans/prototypes/studio-assistant-copilot-a-slice-2026-08-30.html`，v4 已批）。
> 三方向对比稿 `studio-assistant-copilot-2026-08-30.html` 保留作决策记录。
> ⚠ 规矩：owner 点头才提交；共享工作树禁 `git add -A`/stash，pathspec 提交；
> 全量闸门（tsc+vitest）每片收口时跑。

## 一、owner 拍板记录（全部已定，不再讨论）

| #   | 决策                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **工作台先行**（图片/视频/音频那套助手），画布后续对齐                                                                                                                                                                                                                                                                                                                                                |
| 2   | **钱是唯一硬闸**：免费动作直做；花积分的一律停在「预填好的生成键」，点的人永远是用户                                                                                                                                                                                                                                                                                                                  |
| 3   | **覆写用户手写内容要就地确认**（字段上的小条：追加在后/覆盖/保留，不弹窗）；空白字段随便填                                                                                                                                                                                                                                                                                                            |
| 4   | **自动只看它自己备的那次**：助手准备的生成，结果回来自动看图评价并预填下一轮；用户自己发的不打扰                                                                                                                                                                                                                                                                                                      |
| 5   | 动作集首版 = **表单全套 + 素材库检索挂载 + 联网搜图入库**（通用图搜 API + Civitai/HF 叠加）；上传外部图/预处理进 P3                                                                                                                                                                                                                                                                                   |
| 6   | **A 覆盖层++** 形态；评价卡**内嵌它评的那张图**                                                                                                                                                                                                                                                                                                                                                       |
| 7   | **注意力收放法则**（唯一收放规则，无定时器无流程钩子）：点工作台任意处→收成胶囊；点**提示词框**或**助手面板**→不收；点胶囊→展开。推论：点生成键=工作台点击，扣扳机自动让位                                                                                                                                                                                                                            |
| 8   | **统一底盘 + 连续线程**：一个助手跨域，域是头部一枚 chip；切域换工具不断会话，线程内插域标记                                                                                                                                                                                                                                                                                                          |
| 9   | 面板**默认 560px，左缘拖拽 420–860，宽度记忆**                                                                                                                                                                                                                                                                                                                                                        |
| 10  | 头部只剩「身份+域 chip · 会话 · ⋯ · 收起」；**会话 = 历史+新对话合一**（线程带域标签）；分享/反馈进「⋯」                                                                                                                                                                                                                                                                                              |
| 11  | **模型 chip 是高频件**：住输入框**上方**工具条明面；点开**复用现有「自动路由」组件**（系列→型号→API KEY 三列联动），不另行设计                                                                                                                                                                                                                                                                        |
| 12  | 输入区 = 上行工具条（📎 + 模型 chip + 工作态 ⏹）+ 下行（输入框 + 发送）                                                                                                                                                                                                                                                                                                                               |
| 13  | **插话即转向**：工作中发消息立即打断当前步骤、助手吸收后调整计划继续；⏹ 常驻工作态（彻底叫停）；输入框占位语工作态变「说，我在听 — 插话即转向」                                                                                                                                                                                                                                                       |
| 14  | **清空全部改动 = 二击确认**（第一击变红「确认清掉 N 处？」，3 秒不点复原）；无「反清掉」                                                                                                                                                                                                                                                                                                              |
| 15  | **建议药丸点即发送**（语境化，跟着域与幕走，替代旧灰 chips）                                                                                                                                                                                                                                                                                                                                          |
| 16  | 📎 附件面板：上传三类（图/音/视频）· **素材库就地预览 6 格点即挂**（台账 B 条教训：不做「按钮→弹窗」两跳）· 粘贴成附件；附件 chip 可预览可摘                                                                                                                                                                                                                                                          |
| 17  | 参考图动效：挂载弹入（stagger）· hover 浮起 · 点击灯箱放大；评价卡缩略图共用灯箱                                                                                                                                                                                                                                                                                                                      |
| 18  | 日志条：点开详情（查询词/命中数/候选与放弃理由）；**撤销划线并在线程插系统行通报助手**；联网候选可换选                                                                                                                                                                                                                                                                                                |
| 19  | 附加原则（我立、owner 未否）：**助手只动用户看得见的旋钮** —— 它拧的每个参数必须是界面上存在的控件。⚠ 台账 BJ：图片工作台没有参考强度控件 → 助手**不碰 referenceStrength**，除非先把控件补上                                                                                                                                                                                                          |
| 20  | **「打开完整素材库」不跳页**（owner 2026-08-30 真机点验拍板）：📎 面板这个入口就地打开**小框素材库弹层**（复用现有素材选择器组件，选中即挂载为参考/附件，与 6 格「点即挂」同一语义），⛔ 不 `Link` 去 `/assets`                                                                                                                                                                                       |
| 21  | **联网候选「看与选分开，挂载才下载」**（owner 2026-08-31 真机试用后拍板）：点缩略图＝灯箱看大图；每张候选带「选用」小钮＝选中；**落 R2 延迟到挂载那一刻且只下最终选中的**（可多张，受参考位上限）；浏览零下载、换选零残留（被换掉的本流程导入图走既有删除路径清掉）。「用户确定才落 R2」语义不变——确定＝点「选用」                                                                                    |
| 21b | （落地补记 2026-08-31）「选用」的上限按**候选行**计，满了再选 = 换掉**最早**那张并把它一并清掉；⛔ 不做「点了没反应」。取消选用 / 被换下来 / 在飞途中被取消（回来时才落库的那张）三条路都走同一次 `DELETE /api/generations/[id]`；清理失败**不静默**，候选行下方直接写出来                                                                                                                            |
| 22  | **用户亲手粘的 URL＝确认，助手可直接接手**（owner 2026-08-31 拍板「你递的就是确认」）：新工具 `import_user_url`——仅当 URL **逐字出现在用户自己的消息里**才放行（服务端结构校验，不靠模型自觉），助手取图（直链或网页提 og:image）导入并挂载，不再支使用户点任何东西；**助手自己搜到的候选仍要用户选**（拍板 21）。导入执行仍在客户端（经既有导入路由），操作员服务端照旧碰不到 R2——钱闸/R2 结构闸不松 |

## 二、核心架构（P1 定契约，后续片消费）

**沿用画布 ops 的思想：服务端流式吐「操作」，客户端应用到表单。** 免费 ops 自动应用
（对齐拍板 2/3），有一个例外通道走确认（prompt 覆写）。生成永不出现在 ops 里。

```
客户端 ──(当前表单快照 + 消息 + 附件)──▶ 助手路由（SSE）
服务端工具环（多步）：每步吐一个 step 事件
  plan            {steps: string[]}                 计划条
  step            {id, tool, title, reason, status: running|done|error, payload, inverse}
  confirm_request {field:'prompt', have:用户手写摘要}  → 客户端渲染就地确认，回传选择后继续
  message         {text}                             普通对白
  done | stopped | error
```

- `tool` 枚举（P1 版）：`read_state` · `search_assets` · `mount_reference` · `set_model` ·
  `set_prompt` · `set_negative` · `set_specs` · `set_count` · `prime_generate`
  （P3 追加：`web_search_import` · `critique_result`）
- **`inverse`**：每个改动型 step 自带逆操作载荷 —— 撤销的本钱。撤销在客户端执行
  （studio-context dispatch），并把「你撤销了：××」POST 回线程（拍板 18）
- **`prime_generate` 不是生成**：它只让客户端把生成键置为 primed 态并算价（复用现有
  cost preview 逻辑）。钱闸在结构上成立：**服务端没有任何工具能创建 generation**
- **插话/⏹**：SSE 无服务端会话态 → 打断 = abort 当前流 + 带新消息重新请求（上下文含
  已完成 steps）。「转向」语义由此免费获得
- **看图闭环（P3）**：客户端观察到「助手 primed 的那次生成」完成（现有轮询）→ 把结果 URL
  投回线程并请求 critique → 流回评价 + 新一轮预填 ops。服务端不需要 watcher

## 三、分片（顺序执行，避免文件冲突）

### P1 · 契约 + 后端工具环（本包随发）

新建 `src/constants/assistant-operator.ts`（事件与工具契约，上面第二节落成 Zod+类型）+
助手服务的工具环 + `search_assets` 服务端工具 + 单元测试。**不动任何 UI。**
锚点（**候选，从这查，别当结论**）：现有流机制看 `src/constants/assistant-stream.ts` 与其
消费者；域简报在 `src/constants/assistant-protocol.ts`（`ASSISTANT_DOMAIN_BRIEFS` 已分域）；
ops 先例在 `src/constants/node-assistant-ops.ts`（含 AUTO_APPLY 区分）。

### P2 · 面板重建（P1 合入后）

按切片 v4 逐像素落地（三态/注意力法则/拖拽记忆/头部三件套/双行输入区/日志流/归属标记/
预填生成键/二击清空/药丸/灯箱/动效）。模型 chip 挂**现有**自动路由组件（grep zh.json
「自动路由」定位组件名——候选，从这查）。替换现面板（不加 feature flag——本仓 flag 文化
已死，只有 comfyRunner 活着；达到聊天基本盘平价才合入）。
⚠ **冲突预警**：`StudioDockPanelArea.tsx` 等文件此刻是别的会话的在飞文件（voiceroom），
开工先 `git status` 对表，别清别人的活。

### P3 · 素材三通道 + 联网搜图 + 看图闭环

📎 面板（上传三类/素材库就地预览/粘贴）· `web_search_import`（搜索源：先接 Civitai/HF
【已集成】，通用图搜做成 provider 接口并**调研比价**（Google CSE/Bing/SerpAPI 的配额与
图片直链可用性），报告里给 owner 拍板后填 key）· `critique_result`（视觉模型走现有助手
模型路由）· 总账/存配方（接现有配方系统）。

### P4 · 统一底盘扩域

视频域工具集（⚠ 视频域的音频参考走台账 A 条修好的那套；**音频域整个不做——owner
2026-08-31 拍板「P4 的声音那边应该不用管」，配音间已是独立对话式界面，不进操作员**）·
LoRA 助手线并入（`lora-assistant.ts` 的能力降级为统一助手在 LoRA 域的工具）·
跨域线程标记 + 会话历史落库。

## 四、护栏（写给每个实现 agent）

- 台账 **BJ**：图片台无参考强度控件 → 助手不设 rs（拍板 19）
- 台账 **BH**：`/api/upload-image` 一律 `.png` 后缀（Content-Type 是对的）——别按扩展名判型
- 台账 **AH**：生成提交无幂等键 → prime 相关逻辑别做自动重试
- 台账 **AE/BG/BS**：`aspectRatio` 只有带 `advancedParams.resolution` 才是真比例 →
  `set_specs` 工具必须两个一起下
- 台账 **B 条**：素材库入口不做两跳
- 图片走参考先经 `/api/upload-image` 换 https URL（绕 base64→413，台账 BG 附记）
- i18n 三语同步、逐键改（禁正则/禁整文件重写——数组会被毁，本会话踩过）
- `src/contexts/studio-context.tsx` 是 47 文件的高危件：改前 grep 全量调用方

## 五、验收（每片）

P1：契约单测 + 工具环单测（含打断/错误/inverse 完备性——**每个改动型 step 无 inverse 即测试失败**）。
P2：真机过切片 v4 的十二项交互清单（本包附录 A）+ 注意力法则五断言 + 三语键数一致。
P3：真机走通「一句话→素材→预填→用户点→评价→二轮」全幕，联网搜图入库可在素材页看到。

### 附录 A · P2 真机交互清单（对照切片 v4 逐项）

收放五断言（舞台收/提示词不收/面板不收/胶囊开/扣扳机让位）· 域 chip · 会话菜单 ·
拖拽记忆 · 双行输入区 · 模型 chip=现有组件 · 日志详情/撤销+系统行/候选换选 ·
diff/还原这轮/生成键回灰 · 二击清空 · 药丸即发 · 工作态 ⏹+占位语 · 灯箱与挂载动效
