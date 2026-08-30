# 配音间 —— 音频工作台改版落地规划

**建立** 2026-08-29 · **状态** 设计已定稿，代码未动 · **域** `/studio/audio`

把音频工作台从「表单式 TTS」换成「对话式配音间」：选角 → 选中谁 → 打字 → 生成，气泡出文字 + 语音。
不是改造现有工作台，是**替换页面内容**（路由不动）。

---

## 一、owner 拍板清单（2026-08-29 全部当场确认）

| #   | 拍板                         | 原话要点                                                           |
| --- | ---------------------------- | ------------------------------------------------------------------ |
| 1   | **产物是整场戏**             | 可以整场合成；**单条不需要多余动作**，生成后自动落库并进素材库     |
| 2   | **素材库语音卡三件套**       | 展现形式要包括**头像、语音、名字**                                 |
| 3   | **音效当聊天参与者**         | 不做独立切换档，音效师是房间里的一个说话人                         |
| 4   | **情感融进提示词**           | 「提示词说了一段台词，然后指名要什么样的情感」——不设独立情感选择器 |
| 5   | **情感角标可点换**           | 解析错了，点气泡上的角标弹档位，换情感重录这句                     |
| 6   | **剧组制先不做**             | AI 人格 / 自由接话 / 身份切换全部搁置，**从最简单做起**            |
| 7   | **剧本视图先不做**           | 毛片/精选的取舍机制搁置                                            |
| 8   | **参数收进输入框旁一个按钮** | 点击出现参数配置浮层                                               |
| 9   | **页面先不改名**             | 导航仍叫「声音生成 / 音频工作台」，页内标题用「配音间」            |
| 10  | **serif 复用首页**           | Noto Serif SC 两域共用，零新增字体成本                             |
| 11  | **第一期锁浅色**             | 纸墨就是这个设计的身份，暗色适配等设计成熟后单独做                 |
| 12  | **助手直接不挂**             | 助手能力将来以「房间内 AI 对话」形态回来，不做过渡期浮标           |

**北极星（不在本期范围）**：我打字 → AI 角色回话 → 回话文字变语音并带情感。
聊天流**全部靠左**就是为它留的位子——右半边空着，升级时不用改布局。

---

## 二、域定义与边界

### 这一页是什么

一个**房间**里，一群**有头像的嗓子**按顺序说话。你选中谁，打的字就是谁的台词。

- **房间** = 一场戏 = 一个会话（左列房间列表，各自带班底 / 底垫 / 素材）
- **班底** = 这个房间里的说话人（音色库选来的 + 克隆的 + 音效师 + 配乐）
- **台词** = 一条消息 = 一次生成 = 一条素材

### 边界（明确不做）

- ⛔ 不进 `StudioWorkspaceUI` 共享壳
- ⛔ 不做 AI 人格 / 自由接话 / 剧本视图 / 身份切换（v2 探索过，owner 砍掉）
- ⛔ 不做暗色皮（第一期）
- ⛔ 不改路由和导航名
- ⛔ 不动图片 / 视频工作台的任何东西

### 保留的全局件

侧边栏 icon rail、路由位置、登录态、i18n 三语框架。

---

## 三、已验证的事实（2026-08-29 实读代码）

> 下面每条都标了**从哪查**和**怎么证伪**。不要当"已定位、别重找"用——文件会漂。

### ✅ 现成的，不用重做

| 事实                               | 从这查                                                                                                                                                                          | 怎么证伪                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **音频生成完已自动落库**           | `src/services/generate-audio.service.ts` 三处 `createGeneration({outputType:'AUDIO'})`（~536 / ~704 / ~855 行）                                                                 | grep `createGeneration` 在该文件里的调用数；如果为 0 说明链路变了 |
| **素材库已能取音频封面**           | `AssetTile.tsx` 有 `audioCoverUrl` prop；`AssetPickerBrowser.tsx` 的 `getAudioCover()` 按 `thumbnailUrl ?? previewUrl ?? snapshot.voiceCoverImage` 取                           | grep `audioCoverUrl`；断了就是 AssetTile 改过签名                 |
| **落库时写 previewUrl 当封面**     | 同上 service：`previewUrl: request.coverImageUrl`（按引用，不复制 R2）                                                                                                          | 看该字段还在不在；⚠ 它依赖调用方传 `coverImageUrl`，是可选 prop   |
| **VoiceCard 模型够用**             | `prisma/schema.prisma` `model VoiceCard`：`name` / `coverImage` / `voiceId` / `gender` / `age` / `tone` / `pace` / `referenceAudioUrl` / `sampleAudioUrl`                       | 直接读 schema                                                     |
| **克隆卡判据是 referenceAudioUrl** | 同上，schema 注释写明：声音库两个 tab 靠它分流                                                                                                                                  | 读注释；⚠ 别往里写公开音色试听（会把收藏卡错分到克隆 tab）        |
| **情感 9 档 + 括号注入已实现**     | `src/constants/audio-options.ts`：`AUDIO_EMOTION`（9 值）+ `AUDIO_EMOTION_PROMPTS`（映射到 `calm`/`whispers`/`angry` 等），service 侧 `applyAudioStylePrompt` 逐句注入 `[word]` | grep `AUDIO_EMOTION_PROMPTS` 的消费者                             |
| **语速档已实现**                   | 同文件 `AUDIO_PACE` + `AUDIO_PACE_SPEED`（0.75 / 1 / 1.35）                                                                                                                     | 同上                                                              |
| **Fish 多说话人上限 8**            | `AUDIO_SPEAKER_VOICE_IDS_MAX = 8`；`src/constants/models/audio.ts` 注释：S2 全家族支持 `reference_id` 数组，只有 s1 不支持                                                      | 读常量 + 注释                                                     |
| **音色库 / 克隆 service 就绪**     | `fish-audio-voice.service.ts`（市场搜索/试听）、`voice-card.service.ts`（卡 CRUD）；`VOICE_TRAIN_MAX_FILES=8` / `10MB`                                                          | grep service 导出                                                 |
| **脱壳点极干净**                   | `src/app/[locale]/(main)/studio/(workspace)/layout.tsx` 是 image/video/audio 三者共用 `StudioProvider` + `StudioWorkspaceUI` 的**唯一**地方                                     | 读该 layout 的注释，它自己写明了服务哪三个页面                    |

### ⚠ 一条重要修正

我在讨论阶段说过「落库补说话人元数据」是新工程量——**说得不准**：落库本身已经有了，缺的只是 snapshot 里的字段（见下）。

### ⚠ 一个真实缺口（有消费者，没生产者）

**素材库读 `snapshot.voiceCoverImage`，但落库时不写它**：

- 消费者：`getAudioCover()` / `getAudioPreviewCandidates()` 都读 `snapshot.voiceCoverImage`
- 生产者：service 的 snapshot 只写 `{audioFormat, providerPrompt, voiceId, timestamps}`

后果：封面只能靠 `previewUrl`（依赖调用方传 `coverImageUrl`）这一条腿走路。
**而且 snapshot 里根本没有说话人名字**——只有 `voiceId`（一个 id，不是人类可读的名字）。

→ owner 要的「素材库语音卡带名字」**当前拿不到数据**。这是切片①必须补的一行。

---

## 四、真缺口清单（需要新造的东西）

| #   | 缺口                                   | 规模               | 备注                                                                      |
| --- | -------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| G1  | **房间 / 台词持久化**                  | 新 Prisma 模型 ×2  | ⚠ 迁移走生产库，见「风险」                                                |
| G2  | **snapshot 补说话人名字 + 封面**       | 一行改动           | 解掉 owner 拍板 #2 的数据缺口                                             |
| G3  | **`GenerationSourceSurface` 加音频档** | 枚举 +1            | 现有四值：`IMAGE_STUDIO` / `LORA_WORKBENCH` / `CANVAS` / `EDIT`，没有音频 |
| G4  | **情感解析**                           | 轻规则，不需要 LLM | 「（耳语）别回头」→ `emotion=whisper` + 净台词                            |
| G5  | **合成整场**                           | 需要一个技术 spike | 候选方案见下                                                              |
| G6  | **素材库语音卡波形**                   | assets 域独立切片  | 现在只有封面，没有波形                                                    |
| G7  | **域皮肤 `voiceroom.css`**             | 新文件             | 第六个域皮肤（现有 auth/canvas/home-v4/legal/lora 五件）                  |

### G5 合成整场——三个候选（**都是候选，未验证，开工前先 spike**）

| 方案                                     | 优点                             | 风险                                            |
| ---------------------------------------- | -------------------------------- | ----------------------------------------------- |
| **A. 客户端 Web Audio 离线渲染**（倾向） | 零新基建、零服务端成本、即时预览 | 导出格式（WAV 体积 / MP3 需编码器）；长音轨内存 |
| B. 服务端 ffmpeg                         | 格式自由、可靠                   | 要新的执行环境，Vercel 函数时长限制             |
| C. Worker 里拼                           | 复用现有 worker                  | worker 现在没有音频拼接能力，等于也是新造       |

⚠ **不要把 A 当结论**。切片④开工第一件事是写一个 20 行的 spike 验证：浏览器里能不能把 N 段远程音频解码 → 拼接 → 导出成一个可下载文件，以及导出格式选什么。

---

## 五、分期切片

> 每片独立可验收、独立可提交。每片结束过 `full-gate` + `verify-real`。

### 切片 ① 房间壳 + 选角 + 打字 + 生成 + 落库（最小闭环）

**这一片做完，配音间就能用了。**

1. **脱壳**：`(workspace)/audio/` → `studio/audio/`（移出路由组）
   - 自动生效：不再有共享参数栏、助手浮标、kind 切换器、共享 composer
   - ⚠ 验证 `StudioProvider` 移除后没有别的东西依赖它
2. 新建 `voiceroom.css` 域皮肤（纸墨 token，`color-scheme: light`）
   - ⚠ 所有色对**落地前过 `contrast-check`**，禁目测
3. 房间列表 + 房间壳（顶栏 / 聊天流 / 输入行）
4. 选角面板（复用 `fish-audio-voice.service` + `voice-card.service`）
5. 打字 → 生成 → 气泡出文字 + 语音（复用 `audio-player`）
6. **G2**：落库 snapshot 补 `voiceName` + `voiceCoverImage`
7. **G3**：`GenerationSourceSurface` 加音频档
8. **G1**：房间 / 台词模型 + 迁移

**验收**：新建房间 → 从音色库请一个嗓子进来 → 打字 → 点生成 → 气泡出声 → 素材库能看到这条（带头像和名字）。

### 切片 ② 情感解析 + 角标纠错 + 参数按钮 ✅ 已完成（2026-08-30）

1. **G4** 情感解析：括号语法 → `AUDIO_EMOTION` 的 9 档之一 —— 切片①已随手做掉
2. 气泡情感角标 + 9 档换档重录 —— 视觉重做：角标**并进语音条**，不再是并排的第二颗丸子（owner 看过旧样式判「不好看」）；弹层改行内 `0fr→1fr` 高度过渡，chip 16ms/个进场
3. 输入行「参数」按钮 + 浮层（语速 / 表现力）
   - 载体用 `ResponsivePopover`（`docs/references/frontend.md` 覆层矩阵指定的「快速配置面板」原语），触屏自动落成半屏抽屉 = 手机切片第四帧
   - 措辞复用 `audioParams` 命名空间，不在本域抄第二份

⛔ **「朗读风格」不做，且以后也别加。** 施工图上画过，但它和情感角标写的是**同一个 provider 字段**：`AUDIO_EMOTION` 就是 `AUDIO_STYLE` 的超集（`{...AUDIO_STYLE, ANGRY, SAD, SURPRISED}`），而 `GenerateAudioRequest` 只有一个 `emotion`。两处 UI 改同一个值必然打架。`audioParams.styleHint` 的原文也写着它「不是独立情感参数」。情感只有两条入口：写在句里的括号 · 气泡角标。

⛔ **「高级折叠」不做。** 样机上是个空壳（温度 / Top-P / 音量在管线里确实存在，但面板里没有内容）。不为一个没人点的三角形铺 UI。

**参数的语义**：会话级「接下来怎么念」，**不落库**、不是某一句的属性。重录沿用**当下**的设置——调慢语速再去纠一句的情感，语速理应一起生效，否则界面上没有第二条路让它追上。

**验收**（2026-08-30 真机 + 单测，`use-voiceroom.test.ts` 5 绿）：

- 打「（耳语）别回头」→ 角标显示「耳语」且括号不进台词 ✅（切片①已验）
- 参数选「慢 + 戏剧化」→ POST body 实测 `{"pace":"slow","expressiveness":"dramatic"}` ✅
- 参数选「快 + 克制」后点角标换「耳语」→ PATCH body 实测 `{"pace":"fast","expressiveness":"restrained","emotion":"whisper"}` ✅
- 出厂档 `normal` / `auto` 是服务端的**精确空操作**（`normal`→speed 1，`auto`→表现力从情感推导），所以一律带上、不分「改过没改过」两条路 ✅

**顺带修掉的三个（都是切片①带进来的）**：

1. ⭐ `VoiceRoomCasting` 的拉列表 effect 把 `t` 放进了依赖数组 —— `useTranslations()` 每次渲染返回新函数，effect 每渲染重跑、自己的 `setLoading(true)` 再触发下一轮：**音色库分栏一打开就是无休止的重复请求**。（同一个坑在 `use-voice-library` 里表现为列表永远停在加载态。）修法是 state 存文案键、翻译推迟到渲染——`use-voice-library` 也一并从 latest-ref 改成这套，`react-hooks/refs` 随之干净。
2. `VoiceRoomStage` 的「选中说话人」原本用 effect 跟班底同步，改成派生值，effect 整条消失。
3. `VoiceAvatar` 的 `eslint-disable-next-line` 因为理由换行，关掉的是注释自己而不是 `<img>`。

### 动效样机落地 ✅ 已完成（2026-08-30）

`prototypes/studio-audio-voiceroom-motion-2026-08-29.html`（mock v4.5）的 13 条节拍，此前真页面只有 3 条（波形 28ms/条 · 情感展开 · reduced-motion 全关）。这一轮把其余的补齐：

**聊天流** —— 气泡入场 240/10px · 切房间旧流 150 退场→新流 40ms/条 · 生成中→完成 180 交接 · 失败 shake 260 一次 + 红条滑入 · 说话人名字去 mono。
**选角面板（整体重做）** —— 面板 300 / 遮罩 200 · **三分栏 + 墨条滑动 240 + 内容交接 120** · 大头像画廊卡 · **点脸即试听（环形进度 + 脉冲 1.8s×2）** · 星标收藏（hover 显形 / 已收藏常驻）· 卡片 20ms/张 · **飞进班底托盘 420 弧线 → 落地弹 300 + 托盘 bump** · 触底扩载（骨架卡脉动 1.4s）· 班底托盘 + 完成。
**素材库抽屉** —— 就地 260 展开 + 卡片 20ms/张。
**模型入口** —— 顶栏 chip → 共享选择器（这也是配音间**第一个能配 API key 的地方**，Hard Rule 8）。

#### 三条值得记住的判据

1. ⭐ **入场动效在 React 里要用 `animation` 而不是 `transition`。** transition 需要「先画出起始态那一帧、再翻状态」，在 React 里只能靠 `requestAnimationFrame` 补那一帧——而**标签页不可见时 rAF 整个冻结**，面板会永远停在收起位（2026-08-30 实测：后台标签里 `data-open` 翻不过来）。animation 挂载即跑，不需要任何 JS。
2. ⭐ **`MainModelPicker` 当时绑死在 `StudioContext` 上**（`useAudioModelOptions` 里读 `useStudioForm()`）。配音间**故意**住在工作台路由组外面，直接用它等于把整个外壳搬回来。解法是把那个 hook 拆成无上下文内核 `useAudioModelOptionsFor(audioKind, selectedOptionId)` + 工作台绑定层，面板本身一行没动。页面只额外挂 `ApiKeysProvider`（独立小 provider，不是外壳）。
3. ⭐ **卡片的 `overflow: hidden` 会让网格行算矮。** 它使卡片变成滚动容器，对行高的固有贡献塌掉——行被算成 178px 而卡片要 238px，「请进房间」整颗按钮被裁掉。显式 `grid-auto-rows: max-content` 解决，卡片仍被拉伸到行高（同行齐平）。

#### 顺带修掉的三个真 bug

1. ⭐ **`toggleFavorite` 收藏成功但班底不动。** 调用方 await 完再读 `favoriteCardOf` 是**过期闭包**——它捕获的是发起操作那一刻的卡列表，刷新后的新卡永远看不见，于是静默 return。改成由 `toggleFavorite` **返回**那张卡（已加回归测试，故意不更新 mock 列表，只有返回值这条路能通）。
2. **飞行落地可能永远不发生。** 后台标签里 WAAPI 被暂停，`onfinish` 不来 → 用户点的「请进房间」凭空消失。改成三条路（播完 / 被打断 / 兜底定时器）都通向同一个只执行一次的 `settle`。
3. **`prefers-reduced-motion` 对 WAAPI 无效。** CSS 那条媒体查询管不到 `element.animate()`，明确要求减少动效的用户照样看到飞行。改成 JS 里也问一遍，命中就直接落地。

⚠ **未验证项**：动效的**逐帧时序**在自动化里没法测——claude-in-chrome 的标签页是 `hidden`，rAF / CSS 动画 / setInterval / React 调度器全被节流（`document.visibilityState === 'hidden'` 已确认）。落地证据是**声明值 + 状态机 + 截图**（例如切房间实测 `data-leaving` 在 t=33 置起、t=1003 落下），不是肉眼看过它动。owner 目检仍然必要。

#### owner 目检回来的三条（2026-08-30 当天修完）

1. **「点一下收藏，整个音色库刷新一遍」** —— 两个原因叠着：① 内核的 `isLoading` 是
   `publicIsLoading || voiceCards.isLoading` 合并值，收藏触发 `voiceCards.refresh()`
   就把整屏换成骨架卡；② `use-voice-cards` 的 `refresh` 依赖里有 `t`，引用每渲染都变，
   effect 跟着一遍遍重排拉取。修法：`isLoading` **按当前分栏取**（公开列表与我的卡片是
   两件独立的事），`use-voice-cards` 改成存失败标记、译文推迟到渲染。
2. **模型面板长得和别处不一样** —— `BaseModelPickerPanel` 的 `layout` 默认是 `'drill'`
   （单列下钻），工作台传的是 `layout="columns"`（系列 / 型号 / 已配置 API KEY 三栏居中）。
   补上这个 prop 即可，组件本身就是同一个。
3. **克隆分栏是空的** —— 它本该是「传几段音频，训练出一副能用的嗓子」。
   ⭐ **`VoiceTrainer` 早就写好了**（`createVoiceAPI` → Fish `train_mode: fast`，上限
   正是样机写的 8 段 / 每段 10MB），所以没有另写一套：把它从 StudioContext 解绑
   （原先成功后直接 `dispatch` 两条选中态 → 改成 `onCreated` 回调，工作台自己在回调里
   dispatch），配音间在克隆分栏放一张虚线入口卡挂同一个组件。
   ⚠ 顺带确认了**零样本那条路走不通**：`VoiceCard` 没有 `referenceText` 列，而
   `dispatchLine` 要求 `card.voiceId`——克隆卡若只有参考音频没有 voiceId，建出来也说不了话。
   走 Fish 建模拿到真 voiceId 才是对的，零改 schema。

#### 第二轮目检（同日）

1. **改房间名那个黑框** —— `:focus-visible` 的墨色 2px outline 打在 `autoFocus` 的输入框上。
   文本框自带边框与光标，焦点本来就看得见，再套一圈就是个粗黑方框糊在标题位置。
   改成**文本框例外**：`outline: none` + 边框转墨色，与选角面板搜索框同一套语言。
2. **左列缺删除** —— `removeRoom` 一直在 hook 里但没接 UI。补了悬停才露出的 ✕ + `ConfirmDialog`。
   ⚠ 两处不显然：① 删除键必须是房间按钮的**兄弟**（`<button>` 套 `<button>` 非法，浏览器会把内层
   拎出来，点删除变成点开房间）；② 删掉的若是**当前**房间，必须接上下一个——首屏那段自动开房的
   逻辑上过 `bootstrappedRef` 的闸不会再跑，只清空状态会让页面永远停在「加载中」。
3. **「点击僵硬」** —— 全域约 20 个可点元素里**只有 1 个**有按下反馈，房间行连 hover 都没有。
   补了统一的手感：丸状/紧凑控件 `:active` 缩 4%（样机 `.send:active` 的手感），宽行压下 1px
   （缩放会让整块字发糊），并给 12 处补上 `transform` 过渡。
4. **重命名那一下发硬** —— 读态与改态**盒模型完全不同**：标题 `border:0;padding:0`，输入框
   `1px` 边框 + `3px 8px` 内边距 + 浏览器默认 ~170px 宽。点一下文字往右下挪 9px、一个宽得多的
   框凭空弹出。改成**共用同一个盒子**（标题的边框透明），输入框只覆盖颜色与 `field-sizing: content`，
   一个尺寸属性都不改；再加 160ms 的边框/纸面淡入，以及标题的 hover 预览。

### 切片 ③ 音效参与者 + 配乐底垫

1. 音效师作为班底成员（选中它打描述 → 出音效条，虚线胶囊）
2. 配乐底垫条（房间级，不进聊天流，可开关）

**验收**：选中音效师打「门吱呀一声开了」→ 出音效条。

### 切片 ④ 合成整场

1. **先做 G5 spike**（不 spike 不开工）
2. 按聊天流顺序拼接 + 底垫垫底
3. 导出

### 切片 ⑤ 素材库语音卡（assets 域）

**G6** 波形。这片在 assets 域，可以和 ①-④ 并行或延后。

### 北极星（不排期）

房间内 AI 对话 —— 助手能力以这个形态回归。

---

## 六、数据模型草案（**候选，未评审**）

> ⚠ **这是草案不是结论**。开工前必须重新推敲，尤其是「台词 ↔ Generation」的关系。

```prisma
// 候选 A：房间
model VoiceRoom {
  id        String   @id @default(cuid())
  userId    String
  name      String?  // null = 未命名房间
  // 班底：voiceCardId 列表 + 音效师/配乐是否在场
  cast      Json     @default("[]")
  // 底垫：{generationId, enabled, gainDb}
  bed       Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  lines     VoiceLine[]
}

// 候选 B：台词
model VoiceLine {
  id           String  @id @default(cuid())
  roomId       String
  order        Int     // 聊天流顺序
  speakerRef   String  // voiceCardId | "sfx" | "bgm"
  text         String  @db.Text  // 净台词（括号已剥离）
  emotion      String? // AUDIO_EMOTION 之一，null = 自动
  generationId String? // 指向 Generation；null = 生成中/失败
}
```

**待推敲的问题**（开工前回答）：

1. 台词和 Generation 是 1:1 还是 1:N（重录产生新 Generation，旧的留不留）？
2. 「重录」是覆盖还是追加？owner 砍了剧本视图，取舍机制没定，可能默认覆盖最简单
3. `cast` 用 Json 还是关联表？Json 简单，但查不了「哪些房间用了这个音色」
4. 房间删除时台词和 Generation 怎么办（Generation 是用户资产，不该跟着删）

---

## 七、退役清单（切片①同期整删，**不留兼容层**）

grep 已确认的影响面（2026-08-29）：

| 组件                      | 唯一/主要引用方                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `StudioAudioKindSwitcher` | `StudioPromptArea.tsx`                                                                                              |
| `StudioAudioSpeechParams` | `StudioPromptArea.tsx`                                                                                              |
| `StudioAudioParams`       | `StudioAudioSpeechParams` / `StudioDockPanelArea` / `use-studio-assistant-panel-inputs` / `use-studio-audio-params` |
| `AudioVariantGrid`        | `StudioCanvas.tsx`                                                                                                  |
| `AudioTranscribeDialog`   | `StudioDockPanelArea.tsx`                                                                                           |
| `StudioAudioFeedback`     | `StudioCanvas.tsx`                                                                                                  |

⚠ **退役前逐个复核**：这些组件里有的可能被图片/视频模态共用（`StudioPromptArea` 是三模态共享的）。
判据：读 `StudioPromptArea` 里该组件的渲染条件——如果是 `outputType === 'AUDIO'` 才渲染，才是纯音频件可以删。

⚠ **音频转脚本（`AudioTranscribeDialog`）要问 owner**：它是个独立能力（音频 → 文本），退役等于砍功能，不是纯粹的 UI 替换。

---

## 八、风险与硬门

| 风险                            | 处置                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Prisma 迁移直打生产库**       | `.env.local` 就是生产库；`migrate dev` 在本机跑 = 直接改生产 schema。走 `prisma/migration-safety.test.ts` 那套闸 |
| **Fish 免费档 2026-08-31 到期** | `s2.1-pro-free` 是当前**唯一 available 的语音模型**，到期不延即语音生成整条断。切片①开工时先确认档期             |
| **i18n 三语**                   | en/ja/zh 必须同步；⛔ **禁正则改 messages JSON**，逐键对比                                                       |
| **对比度**                      | 所有色对过 `contrast-check`，禁目测、禁信 review agent 的算术                                                    |
| **闸门**                        | 全量 tsc + 全量 vitest 只在 commit 前跑一次；提交用 pathspec，⛔ 共享工作树里禁 `git add`                        |

---

## 九、设计资产索引

### 设计画布（定稿）

**https://claude.ai/code/artifact/264b2ce9-a684-4b89-a4c7-51e45d780520**

九块：桌面房间 / 空房间 / 选角 / 情感纠错 / 参数 + 手机四切片（房间 / 抽屉 / 选角 / 参数）。
源文件 `docs/plans/prototypes/voiceroom-canvas/`（`Main.dc.html` 等 9 个 + `canvas.json`）。

### HTML 原型

| 文件                                                          | 内容                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `prototypes/studio-audio-voiceroom-v3-2026-08-29.html`        | **主稿**：最小闭环，可交互（情感弹层 / 参数 / 选角 / 空态 / 素材库抽屉） |
| `prototypes/studio-audio-voiceroom-v3-mobile-2026-08-29.html` | 手机四态并排                                                             |
| `prototypes/studio-audio-voiceroom-v2-2026-08-29.html`        | 留档：剧组版（owner 已砍）                                               |
| `prototypes/studio-audio-voiceroom-2026-08-29.html`           | 留档：对话+剧本双 tab（owner 已砍）                                      |

### 视觉规格（从 mock 提取的实值）

```
--paper: #ffffff    --ink: #0a0a0a     --dim: #616167
--line: #e6e6e2     --line-2: #d3d3ce  --panel: #f4f4f1   --panel2: #ebebe7
serif: Noto Serif SC（复用首页 next/font 实例）→ 房间名 / 空态标题
mono:  Geist Mono，⚠ CJK 面必须排在 monospace 之前（首页踩过的坑）
说话人头像：135deg 双色渐变，一人一色
```

**动效分工**（⛔ app 内禁 GSAP，只用 motion）：

| 动效                     | 载体                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| 气泡入场                 | motion，reduced-motion 降级瞬现                                          |
| 波形逐条长出             | **纯 CSS**（`transition-delay: calc(var(--i)*28ms)`，首页已验证，零 JS） |
| 正在开口 dots            | 纯 CSS keyframes                                                         |
| 抽屉 / 选角 / 参数 sheet | motion + 全局 duration token                                             |
| 播放进度着色波形         | 后期，第一期静态                                                         |

---

## 十、下一步

切片① 开工前要先回答的三件事：

1. 数据模型草案（第六节）的四个待推敲问题
2. `AudioTranscribeDialog` 退役还是保留（要问 owner）
3. Fish 免费档档期确认
