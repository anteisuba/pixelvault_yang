// 浓缩版画布（2026-09-23 起）：19 页 → 5 页，09-24 加第 6 页「在设计」。
// 这里是唯一的内容源：跑一次同时写出 digest/*.dc.html（画板）与 ../digest/*.md（仓库镜像）。
// 改内容只改这个文件，再按 README 排版、打包与发布；不要手改输出文件。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { boardHtml, boardMd, LINE, MUTED } from './digest-render.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BOARD_DIR = join(HERE, 'digest')
const MD_DIR = join(HERE, '..', 'digest')
const DATE = '2026-09-25'
const BASE = '代码基线 `7b2549aa`（= origin/main = 生产）；本地 main 另有 90 个提交待上线'
const PROGRESS_DATE = '2026-09-27'

const h = (text, sub) => ({ t: 'h', text, sub })
const p = (text) => ({ t: 'p', text })
const ul = (...items) => ({ t: 'ul', items })
const table = (cols, rows, opts = {}) => ({ t: 'table', cols, rows, ...opts })
const note = (text, tone) => ({ t: 'note', text, tone })

// ─────────────────────────── 1 · 总览 ───────────────────────────
const OVERVIEW = {
  file: 'DigestOverview.dc.html',
  title: '总览',
  eyebrow: `PixelVault · 1 总览 · ${DATE}`,
  heading: '做什么、分几块、谁挡着谁、现在到哪',
  sub: `本画布由原 19 页浓缩而来，只留结论。五页：总览 · 业务设计 · UI 总纲 · 进度表 · 厂商速查。${BASE}。仓库里有同内容的 Markdown 镜像：\`docs/design/roadmap-canvas/digest/\`。`,
  blocks: [
    h('产品是什么'),
    ul(
      '**个人 AI 创作工作台**：多模型生成图片 / 视频 / 语音 / 3D，所有产物永久归档进素材库。',
      '**北极星双核**：画布长视频导演台（剧本 → 资产 → 分镜 → 镜头 → 成片）+ LoRA 出对图。图片 / 视频工作台负责快轻的单次生成。',
      '**全部用你自己的 key**（BYOK）；没有平台额度档，只有 Gemini 文本路由走平台 key 自动配置。',
      '**执行 Worker-first**：Next 只做鉴权 · 校验 · 建任务 · 派发 · 回调；调 provider 在 Cloudflare Worker；自托管模型走 RunPod ComfyUI（Runner）。',
      '**一个库**：生产站与本地开发共用 Neon 的 `development` 分支（生产构建日志 `Datasource … ep-flat-violet-aifhen7l`）；名为 `production` 的分支已停用。',
    ),
    h('业务地图与依赖', '上一层不定，下一层展不开；同层可并行'),
    {
      t: 'layers',
      layers: [
        {
          tag: '层 0',
          name: '底座',
          items: [
            { name: '账号 · 设置 · key 门', status: '已落', note: '/settings 四分区 · 缺 key 灰显可点 → QuickSetupDialog · 侧栏底部账号菜单' },
            { name: '选择器 · 表单 · 规格', status: '已落', note: '一颗模型选择器 · 能力驱动表单 · 一颗规格 chip；剩 68 三段结构' },
            { name: '视觉语言', status: '已落', note: '材质四层 · 状态三档 · Phosphor 图标 · 空态 C；业务图标与品牌标待讨论' },
            { name: '去向菜单 · 任务条（D4）', status: '待设计', note: '挡编辑线、转白模 / 改这段、音频编辑的动作入口' },
            { name: '参考入口 · 列表页头（D5）', status: '待设计', note: '挡卡片参考槽、StyleCard、素材库文件夹条' },
          ],
        },
        {
          tag: '层 1',
          name: '可并行',
          why: '都只依赖底座',
          items: [
            { name: '助手', status: '部分', note: '公共层与四张脸已落；D12 图片助手 09-24 已上线（392fe80e）、两条验收（只换衣服 · 三渲二 → 赛璐璐）实跑通过；「拆分与反推」09-24 已上线' },
            { name: '卡片', status: '可开工', note: 'v2 字段已落；卡片总线 35 契约 09-24 定（只认角色卡 · 角色与背景共用 @ 名单 · 三次部署已授权），之后 D6 设计 —— **挡着画布**' },
            { name: '图片', status: '部分', note: '两台已落；NAI 角色图用 V5 Full；编辑线等 D4' },
            { name: '视频', status: '部分', note: '模型接入已落；视频助手 + 左栏 09-24 已上线，BytePlus 2.5 与 Wan 3.0 实跑出片；分镜 / 白模动作等 D4' },
            { name: 'LoRA / Runner', status: '部分', note: '工作台 + 训练向导已落；运行时下载 LoRA 待 spec' },
            { name: '素材与去处', status: '部分', note: '详情路由 / 文件夹已落；页头与统一参考入口等 D5' },
          ],
        },
        {
          tag: '层 2',
          name: '画布导演台',
          why: '要 助手 + 卡片 + 视频',
          items: [
            { name: '画布导演台', status: '部分', note: '四类节点 + 剧本节点已落；资产流水线等卡片；剧本投影的角色装填等卡片总线' },
          ],
        },
        {
          tag: '层 3',
          name: '收尾',
          why: '要画布 / 卡片音色 / 供应商拍板',
          items: [
            { name: '剪辑台成片', status: '部分', note: '导出链有代码；排片提案回传缺（助手无时间线工具）' },
            { name: '语音', status: '后置', note: '方案已写，供应商未定；音色情绪依赖卡片' },
            { name: '首页', status: '已落', note: '独立，不挡任何人；v4 翻页 + 画布自动演示' },
          ],
        },
      ],
    },
    note('**为什么卡片不排在助手前面**：助手公共层（问 / 做节奏、分析、界面）不读卡片；被卡片挡住的是画布资产流水线、剧本角色装填、视频角色一致、配音选角、卡片助手、上下文卡与反推、卡片选择器。所以卡片必须先于画布，但可以和助手同时推进。'),
    h('怎么推进'),
    ul(
      '**五步设计门**：① 反问（选项里永远带「Claude / GPT 怎么做」的最简档）→ ② 思维导图 → ③ 确认 → ④ UI 画板（三方向 · 三态 · 手机 · 动效表）→ ⑤ 代码（对稿验收，偏差清零才提交）。一次只开一项。',
      '**对标最简**：每多一个机制都要能回答「Claude 有吗」；设计中途就问，不攒到交付。',
      '**滚动 / 翻页类先出可滑原型**再全量施工（首页 B 方案画板通过、真机被推翻的教训）。',
      '**owner 一句纠正 = 症状不是规格**：找出背后原则，同类一起改。',
      '**demo / 原型不受设计文档约束**，闸门只管要合入 `src/` 的代码。',
      '**提交纪律**：owner 点头才提交；只精确 add；push main = 生产部署。',
    ),
  ],
}

// ─────────────────────────── 2 · 业务设计 ───────────────────────────
const biz = (n, layer, file, title, heading, sub, blocks) => ({
  file,
  title,
  eyebrow: `PixelVault · 2 业务设计 · ${n} / 10 · ${layer}`,
  heading,
  sub,
  blocks,
})

const BIZ_BASE = biz(
  0,
  '层 0 底座',
  'DigestBizBase.dc.html',
  '底座',
  '底座：账号 · key · 选择器 · 表单 · 规格',
  '所有业务都站在这层上。大部分已落；剩下的共享件（D4 / D5 / 手机统一）见末段，它们挡着具体业务的动作入口。',
  [
    h('已定的设计'),
    ul(
      '**模型选择器（D2）**：工作台 · 画布节点 · 配音间用同一颗 ModelPickerPopover；行只三件「模型 · 型号 · 价格」；渠道在弹层右侧独立面板（绿点有 key · 黄点缺 key，选中用底色）；**没有「自动」**，多渠道型号未选时生成键写「先选渠道」；按型号记住；按厂商分组 + 最近 3 + 搜索。',
      '**能力驱动表单（D2）**：通用区固定（模型 · 规格 · 张数 · 提示词 · 参考轨）；模型专属 chip 行从 capabilities 派生；切模型直接切，专属整组换、不提示不撤销。',
      '**规格 chip（D2）**：一颗合成 chip「比例 · 清晰度 · 时长」，弹层三段 + 更多折叠；时长是滚动条（整秒吸附、气泡跟拇指、无刻度）；首帧锁自适应沿用；画布提示词栏 chip ≤ 2。',
      '**key 门（D3）**：缺 key 一律灰显可点 → QuickSetupDialog（获取 → 粘贴 → 命名 → 验证并激活），底部「管理全部 key →」。',
      '**/settings（D3）**：整页四分区 key / 用量 / 偏好 / 助手；key 按 provider 一行，失效 → 已配 → 未配置，失效只在这里标红；用量只显数字并标「估算」。',
      '**账号入口（D11）**：侧栏最底一行 = 头像 + 名字 + ▾，向上弹菜单「语言 · 设置 · 退出」；个人主页进「去处」导航；**不做外观**；任何地方不挂红点。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['10 · 11 · 12 · 61', '选择器 · 表单 · 规格 chip · input_fidelity', '手机 Sheet、LoRA 底模弹窗、助手 LLM 路由、画布旧路由选择器四处还没并进同一颗', '已落'],
        ['13 · 14 · 70', '/settings · 入口 · 账号菜单', '侧栏与手机抽屉都接了 AccountMenu', '已落'],
        ['60', '删生成类免费档', 'FreeTierSlot 表无引用待 drop；image-edit 里 fal 平台 key 兜底要不要删', '待 owner'],
        ['68', '选择器 vendor / series / variant 三段结构', '现在按字符串前缀拆名，GPT Image / FLUX 组仍重复厂商名', '可开工'],
        ['—', 'icon 桶 `use client` vs `dist/ssr`', '整桶标 client 会把服务端组件拉下水', '待 owner'],
      ],
    ),
    h('还没做的共享件', '挡着各业务的动作入口'),
    table(
      ['设计步', '已定方向', '挡谁', '状态'],
      [
        ['D4 去向菜单 · 右键 · 任务条（16 · 17 · 18）', '一份动作注册表在三处出现（画布卡 ⋯ / 节点右键 · 工作台结果卡主动作 + ⋯ · 素材 / 画廊详情 ⋯）；⌘K 只留给键盘用户，入口改右键 / 双击，删 ShellCommandPalette；任务条 = 一个状态模型（排队 · 冷启动 · 生成 · 归档 · 失败 · 取消）多种皮。① 五题已出未答：主动作固定否 · 右键 = ⋯ 否 · 失败态给什么 · 空白右键还是双击 · 要不要跨页角标', '编辑线 42 · 转白模 / 改这段 28 · 38 · 音频编辑 50', '待设计'],
        ['D5 参考入口 · 列表页头 · 文件夹 · 空态（15 · 19 · 52）', '参考入口一个弹层（上传 · 素材库含最近使用 · 粘贴 / 链接 · 画布内）+ 一条参考轨（@N 编号 · 用途角标 · 按模型上限读数）；「还在库里」chip；列表页头 ListPageHeader + 文件夹条 / 树 / 拖动移动', '卡片参考槽 · StyleCard 43 · 素材库', '待设计'],
        ['55 手机统一', '一条底部输入条 + 一个参数抽屉 + 助手半屏 Sheet，各工具只换抽屉内容', '画布助手手机宿主', '待设计'],
      ],
    ),
  ],
)

const BIZ_ASSISTANT = biz(
  1,
  '层 1',
  'DigestBizAssistant.dc.html',
  '助手',
  '助手：一个引擎，四张脸',
  '把用户的意图变成配置好的生成。**LLM 只负责理解和配参数，出图永远是图片模型**。宿主三处：图片 / 视频工作台 · 画布 · LoRA；配音间不挂助手。',
  [
    h('已定的设计'),
    ul(
      '**壳（D7 · D7b · D7c）**：右侧 dock；收起 = 右上角人设头像 + 数字角标（待确认 + 未读结果）；头像即开关，打开时滑进面板头部（240ms，只动 transform）；头部只有「会话标题 ▾ · ⋯（历史 · 设置 · 隐身）」；规格摘要在输入框上方；空态头像 40 + 一句话 + 一排建议 chip；历史下拉对标 Claude（行高 44，改名 / 删除 hover 才出）。',
      '**四张脸只换三样**：起手药丸 · 头部域标记 · 空态一句话。图片 = 如何生成图片；视频 = 如何生成视频；LoRA = 用 LoRA 出对图（提示词写对 · 挂对 · 参数调对）；画布 = 全能导演（剧本 / 图 / 视频 / 自动连线）。',
      '**「改」**：每个宿主一张 op 表；免费可撤销的 op 自动落，被改字段 outline 闪 320ms，面板一行回执、可整组撤销；花钱 / 不可逆出确认卡；多条回执合并成「本轮记录 · N 项」。',
      '**反问（D56b）**：与输入框同框、一次一题；选项竖排（推荐第一）+「其他，自己写」；键盘 1–4 直选；答案以小标签留在对话里。',
      '**调查（D56b）**：Claude 式正文 + 句尾角标 + 来源卡；快搜默认，深入调查只是一行加载态；正文逐字流式；图片 / 视频分析直接喂多模态模型，回答就是正文。',
      '**记忆（D56a）**：AssistantMemory 表，每轮结账写入、同域去重、每域 200 静默淘汰；/settings/assistant 平铺列表（筛选 chip · 就地改 · 删 · 全部清空）；敏感类目静默跳过；隐身在 ⋯ 菜单。',
      '**协作原则（09-23）**：真冲突才停下问，回答只授权当前问题；建议不能自行变成必选；参考不可读最多重试一次，技术故障不伪装成需求冲突；参考图统一「画布名 + 缩略图」并绑定稳定图片标识。',
      '**09-23 新定**：生成键做成**开关**（开 = 助手配好就按，关 = 你先看一眼再按）；出图后**不自检**，由你指出问题、助手按你说的改。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['21 · 22 · 64 · 69', 'op 表 · 一张脸 · 四张脸 · 壳补 ④', '三宿主同一壳；旧壳组件还在（见 57）', '已落'],
        ['56a · 56b · 24 · 73', '记忆 · 调查 · 剧本投影 · 协作一轮', '剧本投影的 @角色 只开了空槽，等卡片总线', '已落'],
        ['—', 'Claude / DeepSeek 识图 · 查证结构化输出', 'dc1e7ec4 · 9a2b6290（09-23）', '已落'],
        ['D12', '图片助手施工（问 / 做 · 看懂 · 对话流 A · 生成开关 · 单一撤销）', '09-24 施工完；换衣与三渲二 → 赛璐璐两条验收实跑通过；手机账号入口与画布按项目分会话待真机目检', '已落'],
        ['—', '拆分与反推', '把用户的话拆成 NAI 标签；参考图反推成自然语言或标签，尽量复刻（09-24 owner 提出）；④ 画板在第 6 页，施工完实跑 X1–X8 通过（b8300847）；刷新后不再误问覆盖、灰字进历史（90b84b54 · eff047d0）', '已落'],
        ['—', '画布 <768 手机宿主', '手机图片工作台过了不等于画布过了', '待设计'],
        ['21 · 37', '排片提案回传', '`deliverTimelineProposal` 没有生产者：助手没有时间线工具', '待 spec'],
        ['57', '清理旧助手 + 隐身合一', 'CanvasAssistant* 三件 · StudioAssistantDock · PromptAssistantPanel 仍在；隐身时仍保存本轮记录（只不写长期记忆），口径要定', '待 spec'],
        ['—', '步数用完说清剩余再停', '最后一步强制收尾 + 「继续」', '已落'],
        ['—', '3D 图被说成 2D', '09-24 改成逐条核对、按多数判；三渲二参考图实测判成风格化 3D', '已落'],
        ['59', '/ skill 调用', '09-11 提出，未拍板', '远期'],
      ],
    ),
    h('D12 施工结果（09-24）', '第 6 页的画板是施工依据；下面几条是施工中 owner 追加的决定'),
    ul(
      '**看懂**：参考图尺寸进状态块，保构图时比例跟原图；2D / 3D 按逐条证据判，用户说出的画风（「三渲二」）直接作数。',
      '**问得少**：用户没指定的细节（校服款式）助手自己挑、在收尾那句说；助手自己写过的提示词不再问要不要覆盖；普通编辑不出计划卡；用户明说要改的画风不算冲突。',
      '**对话区更干净**：「计划 · N 步」（没开跑的）、答题回执、本轮记录都不再显示（数据照存）；在跑的计划是一张逐项打勾的清单。',
      '**撤回只留一个入口**：每轮过程行上的「撤销」，点一下退回这一轮；逐步撤销、恢复到这一步、✦ 字段、全部还原、连对话一起回都删了。',
      '**NAI 规则**：中文整句与夸张权重（`20::`）写入前拦下；未核实的角色先查 Danbooru；角色图用 V5 Full。',
      '**稳**：所有模型开口前等待统一 90s；分工说明请求失败走兜底分工不中断；整批没出图时说出原因（例如服务商审核）。',
    ),
    note('**依赖**：卡片助手、「以角色口吻回复」、剧本里的角色关系都要卡片 v3（persona.examples · relations）；画布导演流程要卡片总线。公共层本身不依赖卡片。'),
  ],
)

const BIZ_CARDS = biz(
  2,
  '层 1 · 挡着画布',
  'DigestBizCards.dc.html',
  '卡片',
  '卡片：串起四模态的钥匙',
  '角色卡四锚：文字（人设）· 图片（形象）· 声音（声线）· 风格（画风绑定）。卡片不定，画布的资产流水线、剧本角色装填、视频角色一致、配音选角都展不开。',
  [
    h('已定的设计'),
    ul(
      '**v2 字段已落（27）**：voiceCardId · voiceProfile · persona（行为 · 说话方式 · 口头禅 · 情境 · 开场白 · 范例）· referenceRoles · allowedStyleRange · provenance · version。',
      '**v3（09-19 拍板，随 D6 一起迁移）**：description 只放视觉，新增 summary 给人看、不进 prompt；handle（@名字 锚点，与展示名解耦）；relations[]（角色关系作事实层，注入时降解成 lore 条目，只在对方出场时花预算）；loreEntries 最小版（keys · slot · order · enabled，无正则 / 递归 / 概率）；persona.examples[]（按场景分块的示例对白，按轮次注入）；台词直接产出 `{line, emotion, delivery}`；extensions 逃生舱，不认识的键不许销毁。',
      '**卡片总线（35）**：参考图从平铺数组改成 referenceSlots `{role, url, cardId, isPrimary}`；角色卡拖进任何节点自动装填参考槽 + @名字 + 音色；多角色同框按槽分，不拼 characterPrompt。',
      '**风格与场景**：风格卡对角色卡是「改写」不是追加，角色的负面约束最后覆盖；背景卡升级成可 @ 的场景元素（带时间 / 天气变体）。',
      '**建卡向导**：主图（均匀光 · 中性表情）→ 自动补正 / 侧 / 背 → 精修 → stabilityScore ≥ 0.75 转 STABLE → 绑音色。',
      '**借酒馆（SillyTavern）的只有结构**：extensions 不销毁 · 字段按进不进 prompt 二分 · lorebook 最小版 · .charx 导出载体；对话导向字段不借。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['27', '角色卡 v2 字段', 'f8b094a4 · 4cef198b', '已落'],
        ['35', '卡片总线 + v3 迁移', '09-24 定契约；09-25 缩成「画面一致」一半、情绪拿掉、文字侧推后，按 9 片施工，①②③ 已上线、④ 回填已跑、⑤ 图片出口已写；契约见 cards.md', '进行中'],
        ['D6', '建卡向导 · 详情页 · 风格卡 · 场景卡（卡 1–4）', '① 要问：向导几步 · 一致性失败怎么呈现 · 详情页 tab 还是长页 · 关系怎么编 · 以角色口吻回复的入口', '待设计'],
        ['54', '卡片选择器统一', 'StudioCardPicker · 画布卡片面板 · card-recipe 编译合成一份', '等依赖'],
        ['43', 'StyleCard 资产化', '风格 + 样张 + 参数快照 + 反馈回流', '等依赖'],
      ],
    ),
    note('**被卡片挡住的**：65 画布资产流水线 · 24 剧本投影角色装填 · 视频角色一致（Vidu subjects / Kling 元素 + 音色）· 配音选角 · 卡片助手 · 40 上下文卡 / 反推 · 54 卡片选择器。'),
  ],
)

const BIZ_IMAGE = biz(
  3,
  '层 1',
  'DigestBizImage.dc.html',
  '图片',
  '图片：两台 + 编辑线',
  '按提示词方言分两台：**自然语言台**（GPT Image · Gemini · FLUX · Seedream · Qwen 2.1 私有评估）与 **NAI 标签台**；工作台做快轻单次，结果就地编辑。',
  [
    h('已定的设计'),
    ul(
      '**两台（D10）**：顶部分段切换；不跨方言多选；台内多选取交集，只对某家生效的项灰标「只对 X 生效」但仍可改，出图按各模型能力裁剪 payload。',
      '**同系列多选、跨系列替换整组**（09-22）：GPT Image 三型号可对比；切到 Seedream 等其他系列会替换整组并重置专属参数。',
      '**NAI 标签台两栏（09-21）**：左栏提示词 / 角色就地编辑 / 画师串 / 参数，右侧按需展开构图 · 资料 · 分块；Danbooru 查角色与画师 + NAI 官方标签补全；权重统一显示 ×1.2，落 payload 翻成 `{}`。',
      '**NAI 出角色图用 V5 Full**（09-23 同 seed 对照：Curated 不认识 Denia，Full 认识）；标签台默认型号要从 Curated 改掉。',
      '**编辑线重整（42）**：三区 ① 像素级（重绘 · 扩图 · 去背景 · 超分）② 指令级（整图修改 · 替换 · 风格迁移）③ 结构级（提取 · 图层拆分 · 多视角）；编辑器与画布共用。',
      '**新接顺序**：FLUX.2 [max] → Seedream 组图（图层拆分、透明底已落）。PixAI 09-20 暂时下架。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['66 · 26', '标签台 · NAI 控件', '两栏 · 官方补全 · V4.5 精确参考 · 采样器 · 质量标签 / UC / Text:', '已落'],
        ['61 · 62 · 63', 'input_fidelity · 图层拆分 · 透明底', '图层存 GenerationLayer 表', '已落'],
        ['71', 'Qwen Image 2.1 私有评估', '独立 RunPod 端点；多参考真实出图未验', '待验'],
        ['—', '标签台默认型号改 V5 Full · 助手出角色图选 Full', '09-23 对照结论', '可开工'],
        ['—', 'NAI 精确参考付费联调', '+5 Anlas / 张，只 V4.5', '待验'],
        ['25', 'FLUX.2 [max] → Seedream 组图', '纯增量', '可开工'],
        ['42 · 46', '编辑线三分区（含风格迁移）', '主动作要等 D4 去向菜单', '等依赖'],
      ],
    ),
  ],
)

const BIZ_VIDEO = biz(
  4,
  '层 1',
  'DigestBizVideo.dc.html',
  '视频',
  '视频：六族模型 + 分镜 / 白模解法',
  '工作台只做快轻短片；长视频、系列镜头、角色一致、声音绑定归画布。六族：Seedance · Kling · Wan · HappyHorse · Gemini Omni · MiniMax。',
  [
    h('已定的设计'),
    ul(
      '**分镜怎么排**：Kling multi_prompt（目录里唯一原生镜头列表）· Seedance 2.5 时间戳分镜（整数秒写画面 / 运镜 / 台词 / 转场）· 多关键帧按顺序严格对齐 · 逐镜 + 尾帧续接。',
      '**转白模 = 视频 → 白模视频**：Kling O3 v2v edit 一次调用（试验 $0.63 / 5s 通过，端点已接 28），产物喂 Seedance 2.5 白模参考档；prompt 要写「背景建筑保留为同材质灰色体块」「no eye color」。',
      '「转白模」「改这段」是去向菜单里的动作（等 D4），不新造画面。',
      '已修：Seedance 2.5 放开 1080p；删掉指向不存在端点的 Kling 延长（长视频延长暂无可用模型）。',
      '**视频助手按模型写它自己的格式**（框里写的就是发出去的）；左栏一条素材轨按「图片1 · 视频1 · 音频1」编号，发送方式由挂了什么推出来（与画布视频节点同一个判定）。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['01 · 28', '修错 · Kling O3 v2v edit 端点', 'videoKind=edit 只进编辑入口', '已落'],
        ['—', '视频助手 + 左栏', '④ 画板在第 6 页；94e058b5 施工，实跑 BytePlus 2.5 · Wan 3.0（fal）出片；遗留：从头写提示词偶发连写三遍', '已落'],
        ['28 · 38', '转白模 / 改这段 动作 UI', '挂进 D4 去向菜单', '等依赖'],
        ['—', 'Kling multi_prompt + shot_type', '加字段', '可开工'],
        ['—', '尾帧多通道对齐', '现在只有火山真发 last_frame，Kling / MiniMax / Omni 的尾帧被静默丢', '可开工'],
        ['—', 'Seedance 编辑 / 延长 · Omni 有状态编辑 · MiniMax 768P 试镜 → 2K', '中期', '可开工'],
        ['—', '跨镜角色一致（subjects + 音色）', '要卡片总线', '等依赖'],
      ],
    ),
  ],
)

const BIZ_CANVAS = biz(
  5,
  '层 2 · 要助手 + 卡片 + 视频',
  'DigestBizCanvas.dc.html',
  '画布导演台',
  '画布导演台：剧本 → 资产 → 分镜 → 镜头 → 成片',
  '旗舰。四类节点（文本 · 图片 · 音频 · 视频，视频节点即镜头），连线跑生成；剪辑台是画布的全屏模式。',
  [
    h('已定的设计'),
    ul(
      '**节点（S0–S12 定稿）**：文本节点参照即梦（高文本框 + 全屏文档）；图片节点一个兼上传 / 粘贴 / 生成；视频节点参考轨三组（图 · 视频 · 语音），模式由挂了什么推出；音频节点音色是属性、语气写进台词；连线单口 + 落卡即定 + 线上槽名胶囊；双击卡 = 展开。',
      '**外壳**：左上项目胶囊；左侧四面板（节点 · 卡片 · 素材 · 历史）；加节点 = 双击空白 / 右键 / ⌘K，没有常驻加号；右上「剪辑台」+ 助手头像；手机 = 镜头带 + 底部抽屉。',
      '**剧本节点（24）**：一张 kind=script 文本卡（大纲 + 分镜列表）→「确认 · 投影」出一排镜头并连线；重投影只标变化（新增追加 · 已变虚线 · 删掉标灰不删）。',
      '**资产流水线（65，09-20）**：资产图 = 画布上任何一张图，**不新造节点种类或 role 标签**；自动连线已有；分镜图 → 视频交给 LLM 判断；**卡片（D6）先设计完再接到画布**。',
      '**剪辑台**：V / A / M / T 四轨；一句话排片 = 幽灵段提案（采用 · 逐段看 · 撤销）；ffmpeg on CF Container 渲染；导出落回一张视频卡。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['—', '四类节点 · 外壳 · 手机镜头带', 'S0–S12 已上线', '已落'],
        ['24', '剧本节点 · 投影 · 重投影', '@角色 只开空槽', '已落'],
        ['37', '剪辑台', '时间线 + 导出链有代码；真实导出与排片回传待补', '部分'],
        ['65', '资产流水线', '等 D6 卡片设计', '等依赖'],
        ['36', '审阅网格（多镜并排 · 打分 · 选优回节点）', '', '待设计'],
        ['39', 'Enhance（Topaz / SeedVR2 超分修复）挂视频节点', '施工基准已定，代码零', '待 spec'],
        ['40', '反推接画布 · 项目级上下文卡', '要 op 表 + 卡片总线', '等依赖'],
        ['41', '3D 场景 / 机位作镜头控制', '', '远期'],
      ],
    ),
  ],
)

const BIZ_LORA = biz(
  6,
  '层 1',
  'DigestBizLora.dc.html',
  'LoRA / Runner',
  'LoRA / Runner：用 LoRA 出对图',
  '北极星双核之二。工作台四段平级：出图 · 社区库 · 我的 · 训练；Runner 底模只出现在这里。',
  [
    h('已定的设计'),
    ul(
      '训练拆成向导页（34，沿用 `?section=train`，不新造路由）；助手这张脸 = 提示词写对 · LoRA 挂对 · 参数调对。',
      'LoRA 底模弹窗不走通用模型选择器（要显示兼容性与 fal / Runner 通道）。',
      '**RunPod**：主端点 `dt0wyuid7lywic`（Active 0 · Max 2 · Idle 5s · 24 GB / 24 GB Pro）；Qwen Image 2.1 独立端点 `ok6riemrmpdiic`（Max 1，私有白名单）。',
      '**底模顺序**：Anima 新档 → Krea 2（版本门已开）→（扩 Volume 后）Z-Image Turbo。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['34', '画廊卡减负 · Train 向导页', 'LoraWorkbench 仍 4625 行：GenerateBranch 约 3300 行没拆，不在当时授权内', '已落'],
        ['45', '运行时下载 LoRA + 底模插槽 + 护栏', '白名单只有 1 条；fork 里按 Civitai URL 运行时下载 + SHA + LRU，收益最大', '待 spec'],
        ['—', 'LoRA 设置补齐', 'strength_model / clip 分离 · clip skip 可覆盖 · 采样器选择器 · 负面 embedding · hires fix · ADetailer', '可开工'],
        ['—', 'GenerateBranch 拆分', '', '待 owner'],
      ],
    ),
  ],
)

const BIZ_ASSETS = biz(
  7,
  '层 1',
  'DigestBizAssets.dc.html',
  '素材与去处',
  '素材与去处：素材库 · 画廊 · 提示词 · 故事板 · 主页',
  '去处页是浏览面（纯白），工具页是工作面（灰底白卡）。',
  [
    h('已定的设计'),
    ul(
      '**素材库**：`/assets/[id]` 详情整页（与抽屉同一组件，非本人 404）；文件夹进 URL `?projectId=`；历史并入素材库，接文件夹树 / 搜索 / 收藏 / 媒体筛选（09-23 画布侧）。',
      '**画廊卡减负**：静态只留媒体 + 时长，作者与操作 hover / 键盘聚焦才出，触屏点进详情。',
      '**发布后**「去画廊看」toast；登录后仍落图片工作台（不做工作台首页）。',
      '**列表页头 ListPageHeader**（标题 · 计数 · 分面 · 排序 · 密度）+ 素材库文件夹条 / 树 / 拖动移动 —— 随 D5 设计。',
      '**Prompts 收敛**：公共配方并入画廊（随 57）。故事板是真实页面，在「去处」组。',
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['20 · 31 · 53', '详情路由 · 画廊卡减负 · 发布回链', '', '已落'],
        ['19', '列表页头 + 文件夹条', '随 D5', '待设计'],
        ['57', 'Prompts 收敛', '随旧助手清理', '待 spec'],
      ],
    ),
  ],
)

const BIZ_VOICE = biz(
  8,
  '层 3 · 后置',
  'DigestBizVoice.dc.html',
  '语音',
  '语音：方案已写，供应商未定',
  '角色声音库（音色卡）是主线，配音间是入口；配音间不挂助手。整体后置到 owner 定供应商。',
  [
    h('方案（未拍板）'),
    table(
      ['档', '模型', '为什么', '状态'],
      [
        ['云端主档', 'Fish Audio S2.1-Pro', '自由词表行内标记 · 多说话人 · $15 / M 字节；free 档当 A/B 实验台', '已落'],
        ['情绪特档', 'ElevenLabs v3 Dialogue', '多人对白出彩；stability 三档', '已落'],
        ['中文方言档', '豆包语音合成 2.0 + 复刻 2.0（火山 BYOK）', '¥3 / 万字符 · 8 种方言 · 情绪走 context_texts / `<cot>`', '后置'],
        ['自托管', 'Qwen3-TTS 1.7B', '独立 RunPod endpoint；3090 实测 3.9GB · RTF 0.97 · Apache-2.0 · VoiceDesign 造音色', '后置'],
        ['观望', 'Seed-Audio 1.0（「字节 sudo」）· IndexTTS-2', '邀测无定价 / 商用需授权', '远期'],
      ],
    ),
    ul(
      '**情绪编译层**：L1 表现力三档 · L2 行内标记 · L3 情绪导演（LLM 只加标记不改词）· 参考音频借情绪；每家一份编译表。',
      '**人声提取**：ElevenLabs isolation（只要人声，≈$0.22 / 分钟）· fal demucs（人声 + 背景四轨，≈$0.02 / 4 分钟）；adapter 都已有。',
      '**接入顺序**：V1 Fish A/B 四变体 + 情绪导演 → V2 豆包 → V3 音色情绪元数据（依赖卡片）→ V4 Qwen3-TTS → V4b 人声提取 → V5 多人对白编排。',
    ),
  ],
)

const BIZ_HOME = biz(
  9,
  '独立',
  'DigestBizHome.dc.html',
  '首页',
  '首页：v4 翻页 + 自动演示',
  '营销域，不挡任何业务。GSAP 只许在这里用（目前零引用）。',
  [
    ul(
      'v4 横向 deck（开场作品墙 → 功能页 → 模型站 → 终页）；B 方案（连续滚动 + 钉住 scrub）画板通过、**09-20 真机被推翻**，整体回 v4。',
      '09-22：去掉连续 scrub 与前后景错速；模型区逐个浏览到分类首尾；画布演示自动播放（对话 → 分镜 → 节点 → 连线 → 成片）。',
      '功能卡整卡可点直达工具，不加按钮（31）；首页顶栏只留一颗入口按钮。',
      '待：真机目检；hero 固定 6 张 + LQIP；Cookie 横幅改右下小卡。',
    ),
  ],
)

// ─────────────────────────── 3 · UI 总纲 ───────────────────────────
const UI_VISUAL = {
  file: 'DigestUiVisual.dc.html',
  title: '视觉语言',
  eyebrow: `PixelVault · 3 UI 总纲 · 1 / 3`,
  heading: '视觉语言：一张表定全站',
  sub: 'D1 已通过。数值都在 `globals.css` 的 token 里，这里只写规则；细则见仓库 `docs/references/ui-defaults.md`。Apple HIG 通则作底色（材质 · 动效），颜色走脊柱。',
  blocks: [
    table(
      ['项', '规则'],
      [
        ['字体三槽', '正文 Geist + Noto Sans SC · 等宽 Geist Mono 只给数值 / 型号 id / 快捷键 / 计数 · 展示 Fraunces 只给应用内空态大标题'],
        ['字号', '标题 16 / 600 · 正文 14 / 400（行高 1.5）· 次级 13 · 说明 12 · 等宽 11；不许 arbitrary 字号'],
        ['颜色', '中性黑白脊柱，`--primary` 纯黑；**模态不靠颜色区分**（`--modality-*` 只留给画布端口连线）；状态三档 applied / warning / risk 各带 `-surface` 淡版；文字对比 ≥ 4.5'],
        ['材质四层', '底（`--surface-sunken` / `--surface-workbench`）· 卡（白 + border + shadow-card）· 浮层（磨砂 + shadow-float）· 弹层（实底 + shadow-overlay，不磨砂）；阴影收成 card / float / overlay / pressed 四个；同屏最多两层带影'],
        ['两种面', '去处页（画廊 · 素材 · 卡片 · 提示词）纯白浏览面；工具页灰底白卡工作面'],
        ['圆角', '`--radius` 0.625rem 派生七档 6 · 8 · 10 · 14 · 18 · 22 · 26；节点卡 18；chip 999'],
        ['图标', 'Phosphor（bold 档），统一走桶 `@/components/icons`，lucide 已全删；业务对象图标抽象几何（E1-c 待讨论）；品牌标 ANTI 另开 chat 设计，留 favicon · 胶囊 · 助手头像三个插槽'],
        ['空态 C', '图标位 → 展示槽标题 → 一句话 → 一枚主动作 → 可选次动作；不放插画；EmptyState 原语已收 11 处'],
        ['动效', '时长 token 120 · 200 · 320 · 500；只动 transform / opacity；全部 motion-reduce；app 只用 `motion/react`（framer-motion 被 lint 拦）；GSAP 只许首页；每张画板配一张动效表'],
      ],
    ),
  ],
}

const UI_SHARED = {
  file: 'DigestUiShared.dc.html',
  title: '交互原则与共享组件',
  eyebrow: `PixelVault · 3 UI 总纲 · 2 / 3`,
  heading: '交互原则与共享组件',
  sub: '同一件事在全站只长一种样子。',
  blocks: [
    h('交互原则'),
    ul(
      '**缺 key 不禁用**：灰显可点 → QuickSetupDialog 就地配置。',
      '**切模型直接切**：不提示、不撤销，不兼容的值静默回默认。',
      '**不挂红点、不挂额度**：失效只在 /settings/keys 标红；助手角标只数「等你的事」。',
      '**改动落在看得见的对象上**：字段闪一次 + 一行回执 + 可撤销；花钱才确认。',
      '**反问对标 Claude Code 提问框**：一次一题、竖排选项、推荐排第一、「其他，自己写」。',
      '**右键 = ⋯ 同一份动作注册表**（D4 定细节）；⌘K 只给键盘用户。',
      '**少文字**：只放用户此刻需要的（选择器一行只三件）。',
      '**工程底线**：浮层一律 portal 到 body；弹层不用磨砂；手机命中区 44px，同一弹层 inline 进底部 Sheet。',
    ),
    h('共享组件'),
    table(
      ['组件', '契约', '还没并进来的', '状态'],
      [
        ['模型选择器', 'ModelPickerPopover：三件一行 · 右侧渠道面板 · 按型号记住', '手机 StudioMobileModelSheet · LoRA 底模弹窗 · 助手 LLM 路由 · 画布旧 CanvasAssistantRouteSelector', '已落'],
        ['能力驱动表单 · 规格 chip', 'capabilities 派生；一颗合成 chip', '音乐 / 音效两份 Spec 弹层', '已落'],
        ['key 门 · /settings · 账号菜单', 'QuickSetupDialog · 四分区 · AccountMenu', '', '已落'],
        ['助手壳', 'StudioOperatorDock + Panel', '旧 StudioAssistantDock / LoraAssistantDock（随 57）', '已落'],
        ['空态', 'EmptyState 原语', '起手屏 / 搜索无结果有意不收', '已落'],
        ['参考素材入口', '一个 ReferencePicker 弹层 + 一条 ReferenceRail', '现有 6 份：AssetSelectorDialog · AssetPickerBrowser · ImagePickerPopoverBody · AssistantReferencePicker · CanvasAssistantReferencePicker · ReferenceLandingTabs', '待设计'],
        ['任务条', '一个 useGenerationTask 状态模型，卡上裱框显影 / 列表任务条两种皮', '现在是五种散落表现', '待设计'],
        ['去向菜单 · 右键 · 命令', '一份动作注册表按媒体 × 表面裁剪', 'StudioCommandPalette · ShellCommandPalette 两份', '待设计'],
        ['列表页头', 'ListPageHeader + 文件夹条', '画廊仍有两套筛选头', '待设计'],
        ['卡片选择器', '带 role 与 @名字 进参考槽', '', '等依赖'],
        ['手机 composer', '一条输入条 + 一个参数抽屉', '三套抽屉', '待设计'],
      ],
    ),
  ],
}

const UI_PAGES = {
  file: 'DigestUiPages.dc.html',
  title: '页面与一致性',
  eyebrow: `PixelVault · 3 UI 总纲 · 3 / 3`,
  heading: '页面清单与仍存在的不一致',
  sub: '页面规范的全文在仓库 `docs/references/pages/` 与 `domains/`；这里是索引。不一致项 09-23 按代码复核过，已解决的不再列。',
  blocks: [
    h('页面'),
    table(
      ['路由', '是什么', '规范'],
      [
        ['/', '营销首页 v4', 'pages/home.md'],
        ['/studio/image', '自然语言台（图片工作台）', 'pages/studio-image-workbench.md'],
        ['/studio/image/tags', 'NAI 标签台', 'pages/studio-image-workbench.md'],
        ['/studio/video', '视频工作台（快轻短片）', 'pages/studio-video-mobile-request.md'],
        ['/studio/node', '画布导演台；`?mode=edit` = 剪辑台', 'pages/node-canvas-v2.md'],
        ['/studio/lora', 'LoRA 工作台（出图 · 社区库 · 我的 · 训练）', 'pages/lora-workbench.md'],
        ['/studio/audio', '配音间（不挂助手）', 'domains/audio.md'],
        ['/studio/3d', '3D 生成台', 'pages/studio-3d.md'],
        ['/assets · /assets/[id]', '素材库 · 详情', 'pages/assets.md'],
        ['/gallery · /gallery/[id]', '公开画廊', 'domains/gallery.md'],
        ['/prompts · /cards · /storyboard', '提示词 · 卡片 · 故事板', 'pages/prompts.md · domains/cards.md'],
        ['/settings/*', 'key · 用量 · 偏好 · 助手', 'pages/settings.md'],
        ['/u/[username]', '个人主页', '—'],
        ['助手（非页面）', '三宿主同一壳', 'pages/assistant-shell-v2.md · assistant-op-table.md'],
      ],
    ),
    h('仍存在的不一致', '09-23 复核'),
    ul(
      '灯箱 5 套：StudioLightbox · StudioOperatorLightbox · QuickLook · MediaDetailViewer · LoraCoverPreviewDialog。',
      '视频播放器 3 份（其中两个都叫 VideoPlayer）。',
      '拖拽 4 套机制：dnd-kit（1 处）· pragmatic-drag-and-drop · 原生 HTML5 · xyflow。',
      '卡片瓦片 7 套；弹层原语两套并行（ResponsiveDialog vs 裸 Dialog）；移动判据三套（useIsMobile · isTouchPrimary · 断点）。',
      '素材 / 参考选择器 6 份 → D5；命令面板 2 份 → D4；模型选择器剩 4 处 → 见上页。',
      '`ui/` 里 5 个原语零引用（animated-collapse · aspect-ratio-selector · hyper-text · image-compare · particles）。',
      '超大文件：LoraWorkbench 4625 行 · StudioOperatorPanel 2758 行 · assistant-operator.service 9927 行。',
    ),
  ],
}

// ─────────────────────────── 4 · 进度表 ───────────────────────────
const P = (id, what, dep, status) => [id, what, dep, status]
const ptable = (rows) => table(['#', '改什么', '依赖', '状态'], rows, { widths: ['110px', null, '120px', '150px'] })
const PROGRESS = {
  file: 'DigestProgress.dc.html',
  title: '进度表',
  eyebrow: `PixelVault · 4 进度表 · ${PROGRESS_DATE}`,
  heading: '进度表：按业务分组，业务按依赖排序',
  sub: `只列没做完的；已完成的压在最后一段。# 沿用原编号，方便对 commit。${BASE}。09-26–27 三条线并行：角色（角色页改版 + 卡片助手 C1–C3 · S14）· 图片 / 标签 / 视频工作台改舞台 + 底部输入框与加载态 · 助手（记忆 M-A · 对话框 B-C · 设置 B），全部在本地 main「待上线」。下一件：画布怎么用角色卡（在设计）。`,
  blocks: [
    { t: 'legend' },
    h('层 0 · 底座'),
    ptable([
      P('68', '模型选择器 vendor / series / variant 三段结构，行只渲染分组头没写的部分', '—', '可开工'),
      P('D4', '去向菜单 + 右键 / 双击 + 任务条（16 · 17 · 18）；① 五题已出未答', '—', '待设计 · 暂停中'),
      P('D5', '参考素材入口 + 列表页头 + 文件夹 + 空态引导（15 · 19 · 52）', 'D4', '待设计'),
      P('55', '手机统一：底部输入条 + 参数抽屉 + 助手半屏 Sheet', '—', '待设计'),
      P('60b', 'FreeTierSlot 表 drop · image-edit 的 fal 平台 key 兜底去留', '—', '待 owner'),
      P('E1-c · E1-d', '业务对象图标（先讨论怎么设计）· 品牌标 ANTI（owner 另开 chat）', '—', '待 owner'),
      P('—', 'icon 桶 `use client` 与 `dist/ssr` 服务端出口取舍', '—', '待 owner'),
      P('—', '动效命名时长类：修了不出 CSS 的问题（62b7cef8）· 全站改写（5d42c49c · 6ccf3e29）', '—', '待上线'),
    ]),
    h('层 1 · 助手'),
    ptable([
      P('—', '记忆收成一份（M-A 一列）：长期记忆 · 项目规则 · 上下文卡合成一个账户一份的清单，助手自动记、你能看能删；1a5a4f12。规矩搬迁的数据迁移随下次上线执行；上下文卡去掉仍未做', '—', '待上线'),
      P('—', '助手外观与行为这两天落的：一轮一框的对话框 B-C（534a2301）· 头像两拍展开（ed959981）· 设置面板 B 含角色人设（a489dff7）· 历史会话行对齐画板（9f93225b · d2f881f1 · 7e3d70f8）· 参考证据分区（0b55e2f2）· 读写长提示词（5ddf46e6）· 刷新后没决定的问题 / 卡留着（37a92016）', '—', '待上线'),
      P('—', '画布 <768 手机宿主', '55', '待设计'),
      P('21 · 37', '排片提案回传：给助手一个时间线工具，接 `deliverTimelineProposal`', '—', '待 spec'),
      P('57', '清理旧助手（CanvasAssistant* · StudioAssistantDock · PromptAssistantPanel）+ 隐身口径合一 + 拆 operator service', '—', '待 spec'),
      P('59', '/ skill 调用', '—', '远期'),
    ]),
    h('层 1 · 角色（原卡片）', '09-26 起「卡片」改叫「角色」；一个角色三处用：出图 · 画布剧本分镜 · 助手人设'),
    ptable([
      P('—', '角色页改版：总览（作品 chip · 用得最多 · 作品书架）· 详情图片在上、点哪改哪 · 「用她 ▾」（去图片工作台 / 设为助手人设）· 布局 A 与图片台同一套、助手并排让位 · 全站改名「角色」；133f51a1 · 91e73c20 · 965fe179 · dcae31cb · 765c460c · 8a39c473 · e34a9482 · a1198391 · 7d6c5e92', '—', '待上线'),
      P('—', '卡片助手（第五张脸）：C1 壳与脸 018c1c96 · C2 写设定（带来源的提议卡，勾了才写）4429e75c · C3 查图（候选卡 · 网图挂上时才入库 · 交给图片助手）66c4726e · 搜完先看一眼 521064d7 · S14 对一下设定和外观（用户说了才对，衣服不算）c86b8f9e；迁移 7b2549aa 已上线', '—', '待上线'),
      P('35', '卡片总线「画面一致」一半：①②③ 已上线（bf0b4330），④ 回填已跑，⑤ 编译总线 + 图片出口（12a9eecc）· ⑥ Gemini 参考交错（96d9bc13）· 同图去重（732c1db1）· 保持同一人指令（47255873）；剩 ⑦ 视频出口 · ⑧ 画布 attach · ⑨ 等画布设计', '27 ✓', '进行中'),
      P('—', '画布怎么用角色卡：@ 角色进节点 · 剧本投影自动装填（24b）· 卡片总线画布出口（35 ⑧）一起设计', '35', '进行中'),
      P('—', '给角色设计新衣服（同一个角色可以有多套衣服；旧的「变体」父子卡是旧设计，去留一起定）', '—', '待设计'),
      P('—', '卡片收敛到只剩角色卡：角色页上画风卡 · 背景卡页签与精修 / AI 渲染卡牌已下线（133f51a1 · 91e73c20）；数据与其余入口（工作台卡片模式、配方、「允许搭配的风格卡」）还在', '35', '部分'),
      P('—', '卡片文字侧：示例对白分块 · 设定条目 lore · 角色关系 relations（09-25 从 35 推后）', '35', '后置'),
      P('54', '卡片选择器统一', '35', '等依赖'),
      P('43', 'StyleCard 资产化（风格 + 样张 + 参数快照 + 反馈回流）', '35 · D5', '等依赖'),
    ]),
    h('层 1 · 图片'),
    ptable([
      P('—', '图片工作台改大舞台 + 底部输入框（参数收进 chip，弹层从 chip 放大）：bdb09837 · c3c5f15a … 38710b9b；模板面板上舞台、点一张直接套用可撤销（37aa5df0 · c2baea10 · 6856b09d · 35ee8efc）', '—', '待上线'),
      P('—', '加载态 A：边即进度（884c4ded）· 失败说在舞台上（41c1c711）· 单格重试（93a44b6a）· 结果原地出现不弹成功提示（885fb1b5）', '—', '待上线'),
      P('—', '长提示词：只按模型声明的上限拦、不再静默截断，超限用用户的语言说明（5b316525 · 0caaad58 · 19199d98 · eee06b28 · 7c06214a）', '—', '待上线'),
      P('—', '标签台：上舞台 + 底部输入框（fc3714ba · 954c1725 · 5f937729 · 8995309f）· 起手标签组 + 带过来的句子翻成标签（fe204b90）· 单选模型（db8671f7）· 查资料 B（9ee3e2a7 · 96a64c95）· 画风串改回纯标签（def1b37d）', '—', '待上线'),
      P('—', 'OpenAI 参考图改传字节 · 画布出图失败说具体（e5ba6833）；execution worker 需单独部署', '—', '待上线'),
      P('—', '标签台默认型号改 V5 Full', '—', '可开工'),
      P('25', 'FLUX.2 [max] → Seedream 组图', '—', '可开工'),
      P('—', 'NAI 精确参考付费联调 · Qwen 2.1 多参考真实出图', '—', '待验'),
      P('42 · 46', '编辑线三分区（含风格迁移）', 'D4', '等依赖'),
    ]),
    h('层 1 · 视频'),
    ptable([
      P('—', '视频台 A：桌面改舞台 + 底部输入框 · 首帧当舞台封面 · 发出去的就是台上写的（e00989b6 · 6ff9efc3 · 075ecd78）', '—', '待上线'),
      P('—', '助手从头写视频提示词偶发连写三遍撞上限：已改成回显全文，改台词一步到位，但从头写仍复现一次；开发日志已带模型原话，下次复现看原因', '—', '待验'),
      P('—', '账号侧：Seedance 2.0 那行 fal key 是旧 key（ff10…6456）· 火山未开通 Seedance 2.0 · MiniMax 国际站余额不足', '—', '待 owner'),
      P('—', 'Kling multi_prompt + shot_type', '—', '可开工'),
      P('—', '尾帧多通道对齐（Kling / MiniMax / Omni）', '—', '可开工'),
      P('—', 'Seedance 编辑 / 延长 · Omni 有状态编辑 · MiniMax 768P 试镜 → 2K', '—', '可开工'),
      P('28 · 38', '「转白模」「改这段」动作 UI', 'D4', '等依赖'),
    ]),
    h('层 1 · LoRA / Runner'),
    ptable([
      P('45', '运行时下载 LoRA（Civitai URL + SHA + LRU）+ 底模插槽 Anima 新档 → Krea 2 → Z-Image + 护栏', '—', '待 spec'),
      P('—', 'LoRA 设置补齐：strength 分离 · clip skip · 采样器 · 负面 embedding · hires fix · ADetailer', '—', '可开工'),
      P('34b', 'LoraWorkbench GenerateBranch（约 3300 行）拆分', '—', '待 owner'),
    ]),
    h('层 1 · 素材与去处'),
    ptable([
      P('19', '列表页头 + 文件夹条 / 树 / 拖动移动', 'D5', '待设计'),
      P('57b', 'Prompts 收敛（公共配方并入画廊）', '57', '待 spec'),
    ]),
    h('层 2 · 画布导演台'),
    ptable([
      P('—', '节点卡：出完的收尾节拍与原地失败（9f4e9541）· 左侧面板从图标两拍展开（9a007210）', '—', '待上线'),
      P('65', '资产流水线：参考图 → 角色 / 场景资产 → 分镜 → 视频，自动连线', '画布用角色卡', '等依赖'),
      P('24b', '剧本投影时角色 @ 自动装填参考槽 + 音色（并入「画布怎么用角色卡」一起设计）', '35', '进行中'),
      P('37', '剪辑台真实导出验收 + 排片回传', '21', '部分'),
      P('36', '审阅网格（多镜并排 · 打分 · 选优回节点）', '—', '待设计'),
      P('39', 'Enhance（Topaz / SeedVR2）挂视频节点', '—', '待 spec'),
      P('40', '反推接画布 · 项目级上下文卡', '21 · 35', '等依赖'),
      P('41', '3D 场景 / 机位作镜头控制', '—', '远期'),
    ]),
    h('层 3 · 语音 · 首页'),
    ptable([
      P('29 · 48–51', '语音 V1–V5（Fish A/B · 豆包 · 音色情绪 · Qwen3-TTS · 人声提取 · 多人对白）', '供应商拍板 · 卡片', '后置'),
      P('—', '真机目检：首页 30b · 皮肤 32 · 空态 33 · 画廊卡 34 · 头像开关 64 · 标签台 66 · 账号菜单 70', '—', '待验'),
    ]),
    h('已完成', '全部已上生产'),
    table(['#', '做了什么', 'commit'], [
      ['01 · 02 · 02b', 'Seedream Pro 参考上限 14 → 10 · Seedance 2.5 放开 1080p · 删 Kling 延长 · 删虚标字段', '49d623f9 · 9fe7a2e7 · fc0c3cf5'],
      ['03 · 04 · 05', '删占位页 · 删死常量 · Qwen 文字线整删 · DeepSeek vision 换 deepseek-flash', '633ada4a · 4c73bf4d · c49e21b6 · 151ba91b'],
      ['06–09', 'RunPod 实看与改配置 · 语音调查 · 白模试验', 'b6b7dfc1'],
      ['E1', '阴影四档 · 状态淡版 · EmptyState 原语 · lucide → Phosphor 全站', 'b4956381 · 1f5ce7e2 · 3b9c6932 · 661f0f1f…8fe51845'],
      ['10 · 11 · 12 · 61', '模型选择器 · 能力驱动表单 · 规格 chip · input_fidelity', 'c280c909…8e142b53 · 7ba58156…85408e9e · 9ec70bf5…0d489c30 · 61b3f646'],
      ['13 · 14 · 70', '/settings · 入口收口 · 账号菜单', '7588179b…312594a4 · 52116d3c…1c0d134a · 4a698785'],
      ['20 · 31 · 34 · 53', '素材详情路由 · 画廊卡减负 · Train 向导 · 发布回链', 'add04286 · 2028e8c4 · 822c6497 · aa222c84'],
      ['21 · 22 · 23 · 24', 'op 表 · 一张脸 · 反问替代报错 · 剧本节点', '9693c1ee · f8e45989…acd1cbff · e307f8ed · 365bb21a…be2bcb61'],
      ['56a · 56b · 64 · 67 · 69', '记忆 · 调查 · 四张脸 · 真机四修 · 壳补 ④', '928f9214…0237c640 · 21cb12df…425bcb8d · 60d45067…4699404a · b0280a7c…0070a5e2 · 20b6c47f…'],
      ['26 · 66', 'NAI 控件 · 标签台两栏 · 官方补全 · 精确参考', '8978f62d…f3e79237 · 6cd58d85 · e8818179 · b9a4c623 · bbfcdc2f'],
      ['27 · 28 · 47', '角色卡 v2 · Kling O3 v2v 端点 · Arena 删除', 'f8b094a4 · 4cef198b · e924f611 · e8d4d551 · 922f1bac'],
      ['30b · 32 · 33', '首页回 v4 · 皮肤脊柱 · 空态与动效门', 'd06f41d5…71a42574 · 4b93a7d9 · 6d65d899…4806268e · 11150f31…bbf9ee94'],
      ['58 · 60 · 62 · 63', '付费 smoke · 删免费档 · 图层拆分 · 透明底', 'owner · c368126a · ad83d05f · 59ced39c…da5e437e · 1d27bc9b'],
      ['71 · 72', 'Qwen Image 2.1 私有评估 · 文本路由升级 GPT-6 / Opus 5.5 / Grok 4.7', 'cbbe1a9d · 37ec1e06 · 639e45e1'],
      ['73 · 74 · 75', '助手协作一轮 · 同系列多选与手机修复 · 09-23 上线', '958e6461…5e422f97 · ef827144 · 22f47e25 · 4b93a7d9'],
      ['76', 'Claude / DeepSeek 识图 · 查证结构化输出 · 提示词清理', 'dc1e7ec4 · 9a2b6290'],
      ['D12', '图片助手（问 / 做 · 看懂 · 对话流 A · 生成开关 · 单一撤销 · NAI 规则）', '90bc5214…928b747a'],
      ['—', '拆分与反推：话拆成 NAI 标签 · 参考图反推成自然语言或标签', '9f6f8a22 · b8300847 · 90b84b54 · eff047d0'],
      ['—', '视频助手 + 左栏（按模型写原生格式 · 素材轨 · 发送方式按挂载推）', '94e058b5…14f65dca · 392fe80e'],
      ['35 ①–③ · —', '卡片总线数据形状 · 卡片助手迁移（AssistantSurface CARDS · 人设指向角色）', 'bf0b4330 · 7b2549aa'],
    ], { firstStrong: true }),
  ],
}

// ─────────────────────────── 5 · 厂商速查 ───────────────────────────
const VENDOR_IMAGE = {
  file: 'DigestVendorImage.dc.html',
  title: '图片厂商',
  eyebrow: 'PixelVault · 5 厂商速查 · 1 / 5 · 2026-09-17 一手核对',
  heading: '图片：四家自然语言 + NAI + Runner',
  sub: '只列影响决策的事实；全文与来源链接在仓库 `docs/design/roadmap-canvas/research/image-nl.md` · `novelai-pixai.md`。价格为当时官方标价。',
  blocks: [
    table(['家族', '在用型号', '官方要点', '接了', '没接的高价值'], [
      ['GPT Image', '2.5 Sunburst · 2.5 Flare · 2', '三款同价（文入 $5 / 图入 $8 / 图出 $30 每 M）；edits 多图 + 蒙版；六档画质；透明底；Responses 多轮编辑工具', '六档画质 · 透明底 · 预览 · input_fidelity', 'Responses 多轮工具 · moderation:low · output_format · n > 1'],
      ['Gemini 图像', '3 Pro Image · 3.1 Flash · 3.1 Flash-Lite', '多图 ≤ 14（Pro 6 物体 / 5 角色；Flash 10 / 4 / 3）；对话式多轮编辑；搜索接地；无免费档', '单轮生成', '多轮会话编辑 · 按角色分槽 · 分辨率按型号收敛'],
      ['FLUX 2', 'Pro · Pro Edit · Flash · Kontext Max', '≤ 8 图且输入 + 输出 ≤ 9MP；不支持负面词；JSON prompt + @image 是写法不是字段', '主体', 'FLUX.2 [max]（10 参考）· safety tolerance'],
      ['Seedream 5.0', 'Pro · Lite（fal / 火山 / BytePlus）', 'Pro ≤ 10 图（Lite 14）；图层拆分（Pro）；组图 / 联网（仅 Lite）；Pro 1K / 1.5K 同价', '图层拆分 · 透明底', '组图 · Pro 1.5K 档'],
      ['NovelAI', 'V5 Full · V5 Curated · V4.5 Full · V4.5 Curated', 'BYOK；V5 不在 Opus 无限档；**角色图用 Full（Curated 不认识新角色）**；多角色 V5 ≤ 22 / V4.5 ≤ 6；质量标签与 UC 预设是标签串不是字段；精确参考仅 V4.5，+5 Anlas；Vibe 官方 API 暂无', 'inpaint · 质量标签 · UC · Text: · 采样器 · 官方补全 · 精确参考', 'Director Tools · 透明底'],
      ['PixAI', 'Tsubaki.2 · Haruka v2 · Hoshino v2', '有官方 REST API（beta，t2i only）', '09-20 暂时下架', '—'],
      ['Qwen Image 2.1', 'qwen2.1（Runner）', '独立 RunPod 端点；CFG / 步数 / 负面 / seed / ≤ 10 参考', '私有白名单评估', '公开与否待定'],
    ]),
  ],
}

const VENDOR_VIDEO = {
  file: 'DigestVendorVideo.dc.html',
  title: '视频厂商',
  eyebrow: 'PixelVault · 5 厂商速查 · 2 / 5 · 2026-09-17 一手核对',
  heading: '视频：六族',
  sub: '全文在 `research/video.md`。',
  blocks: [
    table(['家族', '官方能力', '我们的状态'], [
      ['Seedance 2.5 / 2.0', '480p–1080p · 4–30s 或 -1 智能 · 编辑 / 延长任务 · 21:9 · **白模参考 / 渲染三档** · 时间戳分镜；2.0 图 1–9 / 视频 3 / 音频 3，只认「镜头 N」', '1080p 已放开；编辑 / 延长 · -1 · 21:9 未接'],
      ['Kling O3 / V3 Pro', '**multi_prompt 镜头列表** + shot_type · 首尾帧 · elements + create-voice · video-to-video · motion-control；无延长端点', 'O3 v2v edit 已接（转白模）；multi_prompt · 首尾帧 · elements 未接'],
      ['Wan 3.0', 't2v / i2v 首尾帧 / r2v（图 10 · 视频 5 · 音频 5）· Prime 上位档', '主体已接；Prime 未接'],
      ['HappyHorse 1.1', 'reference-to-video · video-edit', '只接 t2v + i2v'],
      ['Gemini Omni 1.1 Flash', '五种任务含 edit / extend · 首尾帧 · 有状态多轮编辑 · 360p–4K', '只当文生 / 图生'],
      ['MiniMax H3', 'i2v 首尾帧 · 768P / 2K · 768P → 2K Regeneration（约砍 40% 试错成本）· H3-Max', '只发 2K；首尾帧未接'],
    ]),
    ul(
      '**尾帧**：keyframeSlots 全是 1，只有火山通道真发 last_frame；Kling / MiniMax / Omni 的尾帧被静默丢。',
      '**白模试验（09-17）**：Kling O3 standard v2v edit，5s 720p 推镜一次调用 247s · $0.126 / s ≈ $0.63；运动 / 姿态 / 构图逐帧对齐，材质统一哑光陶土；prompt 要保留背景体块、写 no eye color。',
    ),
  ],
}

const VENDOR_VOICE = {
  file: 'DigestVendorVoice.dc.html',
  title: '语音厂商',
  eyebrow: 'PixelVault · 5 厂商速查 · 3 / 5 · 2026-09-17 一手核对',
  heading: '语音：云端 · 自托管 · 人声提取',
  sub: '全文在 `research/tts.md` · `tts-doubao.md` · `tts-selfhost.md` · `vocal-separation.md`。',
  blocks: [
    table(['模型', '情绪控制', '多说话人', '价格 / 许可'], [
      ['Fish S2.1-Pro（在用）', '自由词表 [tag] + temperature', '原生', '$15 / M 字节；free 档 $0'],
      ['ElevenLabs v3', 'audio tags + stability 三档', 'Text-to-Dialogue', '$0.10 / 1K 字符'],
      ['豆包语音合成 2.0', '指令式，走 context_texts / `<cot>`', '逐句编排', '后付费 ¥3 / 万字符'],
      ['Seed-Audio 1.0', '一条 prompt 出对白 + BGM + 音效', '原生', '邀测，无定价'],
      ['Gemini TTS', 'Director’s Notes + 行内标记', '原生', '按 token'],
      ['Qwen3-TTS 1.7B（自托管）', '自然语言指令 + VoiceDesign 造音色', '逐句', 'Apache-2.0；3090 实测 3.9GB · RTF 0.97'],
      ['CosyVoice3 0.5B（自托管）', 'instruct：方言 / 情绪 / 语速', '逐句', 'Apache-2.0'],
      ['IndexTTS-2（自托管）', '最强：情绪参考音频 / 8 维向量', '逐句', 'bilibili 许可，商用需申请'],
    ]),
    ul(
      '避开商用问题：Fish-Speech 权重（研究许可）· Higgs v3（非商用）· F5-TTS（CC-BY-NC）。',
      '人声提取：ElevenLabs isolation ≈ $0.22 / 分钟（吃视频，只出人声）；fal demucs ≈ $0.02 / 4 分钟（四轨）；自托管 htdemucs_ft（MIT）。',
    ),
  ],
}

const VENDOR_TEXT = {
  file: 'DigestVendorText.dc.html',
  title: '文字厂商',
  eyebrow: 'PixelVault · 5 厂商速查 · 4 / 5 · 2026-09-23 型号已更新',
  heading: '文字：五家 LLM + 搜索',
  sub: '三条路由（增强 · 规划 · 助手）服务四模态。全文在 `research/llm-agent.md`。',
  blocks: [
    table(['家族', '在用型号', '独有能力'], [
      ['OpenAI', 'GPT-6 Sol（助手 / 剧本默认）· GPT-6 Luna（增强 / 自动问答）· GPT-6 Astra · gpt-5-search-api', 'file_search · tool_search · Conversations 永久会话 · web_search 域名白黑名单'],
      ['Gemini', '3.8 Flash · 3.5 Flash Lite（平台 key）', 'Google 搜索接地 · URL context ≤ 20 URL / 34MB 含 PDF · 视频 / 音频原生输入 · thinking 摘要'],
      ['Grok', '4.7', 'X Search · Collections；推理关不掉'],
      ['DeepSeek', 'V4 Pro · deepseek-flash（vision）', '峰谷两价 · cache 命中价低两量级 · 384K 输出；无官方联网；未指定型号且带图时自动走 flash'],
      ['Claude', 'Opus 5.5（默认）· Fable 5.1', '识图（09-23 接入）· 原生结构化输出 · 提示词缓存 · web_search + cited_text · memory 工具（未接，记忆走自家表）'],
    ]),
    ul(
      '**公共契约**：工具调用 + JSON Schema · 图像输入 · 推理档位 · caching · SSE。独有能力一律「探测 + 降级」。',
      '**搜索改进待做**：正文预算分档 · 白黑名单下沉到 provider 原生过滤 · 引用改区间锚（cited_text）· 同源家族去重 · 深研档一次澄清 + 有上限多轮。',
      '**检索源**：Serper 搜索 / 搜图 · Jina Reader · 萌百 · 中文维基 · Danbooru · B 站。',
    ),
  ],
}

const VENDOR_RUNNER = {
  file: 'DigestVendorRunner.dc.html',
  title: 'Runner / RunPod',
  eyebrow: 'PixelVault · 5 厂商速查 · 5 / 5 · 2026-09-17 控制台实看',
  heading: 'Runner：RunPod · ComfyUI · 底模',
  sub: '全文在 `research/runner-lora.md` 与仓库 `docs/references/domains/runner.md`。',
  blocks: [
    table(['项', '事实'], [
      ['主端点', '`dt0wyuid7lywic`：Active 0 · Max 2 · Idle 5s · GPU 24 GB + 24 GB Pro；「standby = $803 / 月」不成立'],
      ['Qwen 端点', '`ok6riemrmpdiic`：Min 0 · Max 1 · Idle 5s；ComfyUI 0.37 评估镜像'],
      ['幻影 idle', 'health 报 idle 而队列卡死，遇到再抓 health 快照'],
      ['ComfyUI', 'fork 基于 worker-comfyui 5.8.6（= ComfyUI 0.25）；5.10 = 0.34 已满足 Krea 2 ≥ 0.27，升级后必须重测 VAEDecode → Upscale 空结果坑'],
      ['Volume', '80G 已用 47.4G；换 checkpoint 要重载 6.9G，产品侧默认底模收到 1–2 个最管用'],
      ['底模候选', 'Anima 新档（非商用，最低成本最高回报）· Krea 2 Turbo（最该加）· Z-Image Turbo（Apache-2.0，唯一真商用，扩容后）'],
      ['LoRA 缺的设置', '白名单只 1 条（运行时下载收益超其余之和）· strength 分离 · clip skip · 采样器 · 负面 embedding · hires fix · CFG rescale · ADetailer · IP-Adapter（r4a 施工完未切生产）'],
    ]),
  ],
}

// ─────────────────────────── 6 · 在设计 ───────────────────────────
// 设计门进行中的画板；通过后结论并进第 2 / 3 页，这一页清掉。
const n = (tag, text, kids) => ({ tag, text, ...(kids ? { kids } : {}) })
const g = (text, kids) => ({ text, kids })
const D12_MAP = {
  file: 'DesignD12Map.dc.html',
  title: 'D12 助手 · ② 思维导图',
  eyebrow: 'PixelVault · 6 在设计 · D12 助手 · ② 思维导图 · 2026-09-24',
  heading: '助手：怎么做出用户想要的结果',
  sub: '① 09-23 已答：范围全选（问 / 做 · 界面 · 各页分工 · 画布导演）+ 主线「分析能力与做出想要的结果」；生成键做成开关；出图后不自检。③ 09-24 已答 Q1–Q4（全部取最简）；④ 09-24 已定生成开关摆法 A、只管当前会话（下一张画板）。owner 定施工前先盘点助手 UI 现状与优化点；施工验证用 owner 给的图做「只换衣服」与「三渲二 → 2D 赛璐璐」。绿 = 已定 / 已落，紫 = 我的建议（无异议即按此施工），灰虚线 = 依赖别的条目，红虚线 = 缺。',
  blocks: [
    {
      t: 'treeLegend',
      items: [
        ['已定', 'owner 拍过'],
        ['已落', '代码已有'],
        ['建议', '我的建议，等你点头'],
        ['依赖', '等别的条目'],
        ['缺', '还没有'],
      ],
    },
    {
      t: 'tree',
      root: 'D12 · 助手：做出用户想要的结果',
      branches: [
        {
          no: '1',
          title: '目标',
          sub: '「想要的结果」指什么',
          kids: [
            n('已定', '说一次、改一两次就拿到想要的图 / 视频；用户不用背提示词技巧'),
            n('已定', 'LLM 只负责理解与配参数，出图永远是图片 / 视频模型'),
            n('建议', '只看两个数：同一目标生成了几次（返工轮数）· 用户说「不是这样」几次（纠正次数）；先记进每轮结账，不做看板'),
          ],
        },
        {
          no: '2',
          title: '一条链',
          sub: '听懂 → 看懂 → 选对 → 生成 → 你判断 → 按你说的改',
          kids: [
            g('听懂', [
              n('已落', '系统提示要求跨轮维护「这件事的简报」：要改什么 · 必须保留 · 参考分工 · 未决事项 —— 只在提示词里，没有存下来'),
              n('建议', '简报结构化进每轮结账（目标 · 必须保留 · 可以改 · 参考分工 · 未决），下一轮注入；你纠正一句就改这份简报，不再每轮从零理解'),
              n('已定', '简报不单独显示；你的纠正改动了它时，回复里说一句（例「记下了：保留构图」）'),
            ]),
            g('看懂', [
              n('已落', '图片 / 视频直接喂多模态模型（56b）；视频取关键帧 + 字幕'),
              n('建议', '关键判断先说一句：画风 · 媒介（2D / 3D / 写实）· 角色是谁 —— 说错了你一句话就能改，「3D 说成 2D」这类错不会悄悄进提示词'),
            ]),
            g('选对', [
              n('已落', '模型规则表 model-strengths：71 个模型逐条写法 · 负面提示档位 · 方言'),
              n('已定', 'NAI：拦中文整句与夸张权重，未核实的角色先查 Danbooru'),
              n('建议', '加一张可维护的「选型知识」表（常量）：例 出角色图 → NAI V5 Full（Curated 不认识新角色）；助手换了你没点名的型号时，回复里说一句理由'),
            ]),
            g('生成', [
              n('已定', '生成键做成开关：开 = 配好就按 · 关 = 你按；默认关，开关放在确认卡的生成键旁'),
              n('已落', '钱闸：服务端没有任何工具能建 generation；助手只出确认卡，由客户端按下 —— 开关开也只是客户端替你按'),
            ]),
            g('你来判断', [n('已定', '出图后不自检，由你指出问题')]),
            g('按你说的改', [
              n('建议', '只改你指出的那部分；其余参数与参考原样保留（写进简报的「必须保留」）'),
              n('已落', '每轮一行「本轮记录 · N 项」，可展开、可撤销'),
            ]),
          ],
        },
        {
          no: '3',
          title: '什么时候问 · 什么时候做',
          kids: [
            n('已定', '意图清楚、没有冲突 → 直接配；免费可撤销的自动落（字段闪一次 + 一行回执）'),
            n('已定', '真冲突才问：两个要求互斥 · 参考与文字矛盾 · 缺关键信息且猜错代价大；反问框一次一题，回答只授权当前这一问'),
            n('已定', '建议写在回复里，不变成问题，也不变成必选'),
            n('已定', '技术故障（参考不可读）重试一次后如实说，不装成需求冲突'),
            n('建议', '步数用完不静默：最后一步必须说「做到哪 · 还剩什么 · 你说哪句我就接着做」（工作台一轮 8 步，画布 16 步）'),
            n('已定', '花钱的那一步：开关关（默认）→ 配好停在确认卡；开 → 确认卡自动按下，仍留在时间线上可见'),
          ],
        },
        {
          no: '4',
          title: '界面',
          sub: '壳已定，这一轮只加必要的东西',
          kids: [
            n('已落', '右上头像开关 · 四张脸 · 反问框与输入框同框 · 本轮记录一行 · 规格摘要在输入框上方'),
            n('建议', '关键判断、选型理由都只是回复里的一句话，不新增卡片（对标 Claude：没有额外卡片）'),
            n('已定', '生成开关：确认卡按钮行右端一颗开关（④ 摆法 A），默认关，只管当前这段会话 —— 这一轮唯一新增的界面元素'),
            n('已定', '简报不占界面'),
          ],
        },
        {
          no: '5',
          title: '各页分工',
          kids: [
            n('已落', '图片（自然语言台）：写提示词 · 挑型号 · 配参考 · 出对比'),
            n('已定', 'NAI 标签台：沿用图片那张脸，界面不变；只加 NAI 规则（中文 → 标签 · 核角色 · 角色图选 V5 Full）'),
            n('已落', '视频：让图动起来 · 首尾帧 · 时长节奏 · 运镜写法'),
            n('已落', 'LoRA：提示词写对 · 挂对 · 参数调对'),
            n('已落', '画布：全能导演（见第 6 支）'),
            n('已定', '配音间不挂助手'),
          ],
        },
        {
          no: '6',
          title: '画布导演流程',
          sub: '剧本 → 资产 → 分镜 → 镜头 → 成片',
          kids: [
            n('已落', '剧本 → 分镜：剧本节点 · 投影 · 重投影只标变化'),
            n('依赖 卡片 35 / D6', '资产：参考图 → 角色 / 场景资产图，投影时 @角色 自动装填参考槽 + 音色'),
            n('已落', '分镜 → 视频：镜头节点 + 自动连线'),
            n('缺', '排片：助手没有时间线工具，剪辑台的提案接口没有生产者'),
            n('已定', '这一轮保持现有：剧本 → 分镜 → 镜头；资产等卡片 35，排片后置'),
          ],
        },
        {
          no: '7',
          title: '例外',
          kids: [
            n('已定', '参考不可读 → 重试一次 → 如实说是哪一张、什么原因'),
            n('建议', '上游模型超时 / 503 → 说清是哪家、建议换哪条路由，不重复烧步数'),
            n('缺', '画布 <768 手机宿主 → 随 55 手机统一一起设计'),
          ],
        },
        {
          no: '8',
          title: '这一轮不做',
          kids: [
            n('已定', '出图后自检 · 自动多轮试错生成'),
            n('已定', '新的卡片种类或新面板 · 配音间助手'),
            n('已定', '/ skill 调用（远期）'),
          ],
        },
      ],
    },
  ],
}

// ④ 画板：确认卡上的生成开关。皮肤取自助手 v2 画板 BCards「确认」那一节（实现已按它对过稿）。
const UI = {
  card: 'width:358px;box-sizing:border-box;border-radius:14px;background:#fff;border:1px solid #d4d4d4;box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 26px -18px rgba(0,0,0,.35);padding:14px 16px;display:flex;flex-direction:column;gap:12px',
  row: 'width:358px;box-sizing:border-box;border-radius:14px;background:#fff;border:1px solid #e5e5e5;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px',
  eyebrow: 'font-size:11px;letter-spacing:.14em;color:#696969',
  chip: 'height:28px;padding:0 10px;border-radius:8px;display:flex;align-items:center;gap:6px;background:#f5f5f5;border:1px solid #e5e5e5;font-size:12px;color:#0a0a0a',
  primary: 'height:32px;padding:0 16px;border-radius:8px;display:flex;align-items:center;background:#0a0a0a;color:#fff;font-size:13px;font-weight:500',
  secondary: 'height:32px;padding:0 16px;border-radius:8px;display:flex;align-items:center;background:#fff;border:1px solid #e5e5e5;font-size:13px;color:#525252',
  ghost: 'height:32px;padding:0 8px;border-radius:8px;display:flex;align-items:center;font-size:13px;color:#525252',
  overlay: 'width:208px;border-radius:12px;background:rgba(255,255,255,.92);border:1px solid #d4d4d4;box-shadow:0 1px 2px rgba(0,0,0,.06),0 18px 44px -18px rgba(0,0,0,.38);padding:6px;display:flex;flex-direction:column;gap:2px',
}
const CHEVRON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#696969" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>'
const TICK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>'
const knobs = () =>
  `<div style="display:flex;gap:6px;flex-wrap:wrap">${['FLUX 2 Flash', '3:2', '3 张', '1536'].map((v) => `<div style="${UI.chip}">${v}${CHEVRON}</div>`).join('')}</div>`
const toggle = (on) =>
  `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:#525252">自动生成</span><div style="width:28px;height:16px;border-radius:999px;background:${on ? '#0a0a0a' : '#e5e5e5'};position:relative"><div style="position:absolute;top:2px;left:${on ? 14 : 2}px;width:12px;height:12px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)"></div></div></div>`
const pending = (actions) =>
  `<div style="${UI.card}"><div style="font-size:14px;font-weight:600">确认生成 3 张？</div>${knobs()}${actions}</div>`
const decidedRow = (state, right) =>
  `<div style="${UI.row}"><div style="display:flex;flex-direction:column;gap:3px;min-width:0"><div style="${UI.eyebrow}">${state}</div><div style="font-size:13px;color:#525252;white-space:nowrap">3 张 · FLUX 2 Flash · 已转交生成</div></div>${right}</div>`
const step = (label, body, caption) =>
  `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;color:${MUTED}">${label}</div>${body}${caption ? `<div style="font-size:12px;line-height:1.55;color:#525252;max-width:358px">${caption}</div>` : ''}</div>`
const column = (no, name, line, steps) =>
  `<div style="display:flex;flex-direction:column;gap:18px;padding:18px;border:1px solid ${LINE};border-radius:14px;background:#f4f4f1"><div><div style="display:flex;align-items:baseline;gap:8px"><span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${MUTED}">${no}</span><span style="font-size:16px;font-weight:600">${name}</span></div><div style="margin-top:4px;font-size:12.5px;line-height:1.6;color:#525252">${line}</div></div>${steps.join('')}</div>`
const buttons = (...extra) => `<div style="display:flex;align-items:center;gap:8px"><div style="${UI.primary}">确认生成</div><div style="${UI.secondary}">先不要</div>${extra.join('')}</div>`

const TOGGLE_DIRECTIONS = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${[
  column('A', '行尾一颗开关', '开关一直长在卡上：待决时在按钮行右端，收起后在那一行右端。开 / 关都在同一个位置。', [
    step('① 默认 · 开关关', pending(`<div style="display:flex;align-items:center;justify-content:space-between">${buttons()}${toggle(false)}</div>`), '拨开 = 这一张不动，下一张起自动按。'),
    step('② 开着 · 下一张', decidedRow('已自动生成 · 11:26', toggle(true)), '卡直接以收起的一行出现，扳机照旧由客户端按（同一条确认路径）。'),
    step('③ 关掉', decidedRow('已自动生成 · 11:26', toggle(false)), '在任意一行上拨回；已经发出去的这一张不受影响。'),
  ]),
  column('B', '第三颗文字钮', '与 Claude Code 权限框的「Yes, and don’t ask again」同形：打开开关这件事本身就是一次确认。', [
    step('① 默认 · 开关关', pending(buttons(`<div style="${UI.ghost}">以后直接生成</div>`)), '点「以后直接生成」= 这一张立刻生成 + 打开自动。'),
    step('② 开着 · 下一张', decidedRow('已自动生成 · 11:26', `<div style="${UI.ghost};white-space:nowrap">改回每次确认</div>`), '收起的一行只多一颗文字钮。'),
    step('③ 关掉', decidedRow('已自动生成 · 11:26', `<div style="${UI.ghost};color:#a3a3a3;white-space:nowrap">已改回</div>`), '点完就地换成「已改回」，下一张起回到完整的确认卡。'),
  ]),
  column('C', '主键带下拉', '按钮行不变宽，自动藏在主键右侧的下拉箭头里。', [
    step(
      '① 默认 · 下拉展开',
      pending(
        `<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:8px"><div style="display:flex"><div style="${UI.primary};border-radius:8px 0 0 8px">确认生成</div><div style="${UI.primary};padding:0 8px;border-radius:0 8px 8px 0;border-left:1px solid #404040"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg></div></div><div style="${UI.secondary}">先不要</div></div><div style="${UI.overlay}"><div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:8px;background:#f5f5f5;font-size:13px;font-weight:500">只这一次${TICK}</div><div style="padding:7px 10px;border-radius:8px;font-size:13px;color:#525252">以后都直接生成</div></div></div>`,
      ),
      '主键照旧是「只这一次」；自动要进下拉里选。',
    ),
    step('② 开着 · 下一张', decidedRow('已自动生成 · 11:26', `<div style="${UI.chip};background:#fff">自动${CHEVRON}</div>`), '收起的一行右端一颗「自动」下拉。'),
    step('③ 关掉', `<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;width:358px">${decidedRow('已自动生成 · 11:26', `<div style="${UI.chip};background:#fff">自动${CHEVRON}</div>`)}<div style="${UI.overlay}"><div style="padding:7px 10px;border-radius:8px;font-size:13px;color:#525252">改回每次确认</div></div></div>`, '从那颗「自动」下拉里改回。'),
  ]),
].join('')}</div>`

const D12_GEN_TOGGLE = {
  file: 'DesignD12Toggle.dc.html',
  title: 'D12 助手 · ④ 生成开关',
  eyebrow: 'PixelVault · 6 在设计 · D12 助手 · ④ 画板 · 生成开关 · 2026-09-24',
  heading: '确认卡上的生成开关',
  sub: '③ 已定：默认关，放在确认卡的生成键旁；这是这一轮唯一新增的界面元素。三种摆法并排，每种画 ① 默认 → ② 开着时下一张 → ③ 关掉。卡的皮肤原样取自助手 v2 画板 BCards「确认」那一节。**09-24 owner 定：A 行尾一颗开关；只管当前这段会话**（新会话回到默认关）。',
  blocks: [
    { t: 'mock', html: TOGGLE_DIRECTIONS, md: '三种摆法（画板上是界面稿）：\n\n- **A 行尾一颗开关**：待决时在按钮行右端，收起后在那一行右端；开 / 关同一个位置。\n- **B 第三颗文字钮**：「确认生成 · 先不要 · 以后直接生成」，与 Claude Code 权限框的「Yes, and don’t ask again」同形；开着时收起的一行右端是「改回每次确认」。\n- **C 主键带下拉**：主键右侧的下拉里选「只这一次 / 以后都直接生成」；开着时收起的一行右端是「自动」下拉。' },
    { t: 'note', text: '**已定（09-24）**：摆法 A；开关状态只管当前这段会话 —— 新开一段会话回到默认关（与 Claude Code 的自动接受模式同口径），⛔ 不写进助手设置、⛔ 不存本机。' },
    h('三种摆法共用的规则'),
    ul(
      '开着时卡**照样出现**，直接是收起的一行「已自动生成 · 时间」—— 时间线上留下这一次决定；⛔ 不先展开四颗旋钮再自己收起（那是假装在等你）',
      '扳机不变：仍由客户端走确认那一条路径（`onConfirm` → 宿主生成键），钱闸结构不动 —— 服务端照旧建不了 generation',
      '只管**生成**那一支；多步计划与「记一张卡」两支不受开关影响',
      '开着时要改参数：在工作台上改（工作台是真值），或者对助手说一句',
      '信号色用近黑实底，⛔ 不用 `--primary`（那一支被工作台的生成键占着，v2 §12.2）—— 所以不能直接套 `ui/switch` 的默认配色',
    ),
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['拨开关（A）', '`--duration-fast` 120ms · `ease-standard`', '拨子横移 12px，轨道底色 浅灰 ↔ 近黑 同步', '不弹 toast、不震动'],
        ['点「以后直接生成」（B）/ 选「以后都直接生成」（C）', '同「确认生成」', '按钮字换「确认中…」→ 卡就地收成一行（现有换态）', '不另起动画'],
        ['自动态的卡出现', '无（时间线各行现在都没有入场动效）', '直接以收起的一行出现', '不先展开旋钮再收起'],
        ['改回（B 就地换字 / C 下拉关闭）', '`--duration-fast` 120ms · `ease-standard`', '文字淡入淡出；下拉走现有浮层开合', '不整行重排'],
        ['`prefers-reduced-motion`', '—', '以上全部直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// 助手 UI 盘点：09-24 在 owner 的 Chrome 里真机看（1440 桌面 + 520 手机布局），两段历史会话 + 空态 + 各菜单。
const D12_UI_AUDIT = {
  file: 'DesignD12UiAudit.dc.html',
  title: 'D12 助手 · UI 盘点',
  eyebrow: 'PixelVault · 6 在设计 · D12 助手 · UI 盘点 · 2026-09-24',
  heading: '助手 UI 盘点：现状与要改的地方',
  sub: 'owner 定：⑤ 施工前先盘点助手 UI、过一轮 UI 设计。本页是 09-24 在 Chrome 里的真机结果（桌面 1440 · 手机布局 520 宽）：收起态、空态、两段历史会话（含 102 条历史）、一轮实跑（反问两题 → 写提示词 → 确认卡 → 先不要）、各菜单。**没看到**：结果卡实况（要真出一张图，随施工验证一起看）、助手设置弹层。',
  blocks: [
    h('已定（owner 09-24）'),
    table(
      ['#', '改什么', '为什么', '状态'],
      [
        ['U1', '对话区改**实底**，玻璃只留头部与浮层', '半透明面板把工作台后面的缩略图透过来，时间线与空态背后糊成一片色块；要读的内容放实底（苹果与 Claude 同做法）', '已落'],
        ['U2', '输入行去掉 **+** 按钮，只剩 上传 · 素材库 · 模型 · 发送；`@` 照旧在输入框里直接打', '+ 里三项：「提及素材」与打 `@` 重复、「上下文卡」没人用、「指定来源」见 U3；上传与素材库用得多，保留独立按钮', '已落'],
        ['U3', '「指定来源」选择器删掉，改成**在话里说**（「只在 danbooru 查」→ 助手按同一个来源过滤器限定）；长期来源规则仍在助手设置', '代码是通的，但只在助手决定去搜的那一轮起作用，藏在 + 第二层、选了也看不出效果', '已落'],
        ['U4', '上下文卡：只去掉 + 入口，功能先留（助手提议记卡 · 设置里管理）', '等卡片 35 / D6 落地后再看它剩多少用处', '已落'],
        ['U5', '手机：账号头像收进导航菜单，右上角只留助手头像', '手机布局里两个圆头像上下叠着（账号在上、助手在下），分不清谁是谁', '已落 · 待真机目检'],
        ['U6', '两个「模型」（助手用的 LLM chip · 出图规格那一行）不动', '一个是文字模型、一个是出图模型，owner 认为不混', '—'],
        ['U7', '会话按工作台分开：**画布单独、按画布项目分**；图片 / 视频 / LoRA 仍共用一个列表（每行标来源）', '画布挂的是同一个助手面板、同一份线程：在图片开着会话再去画布，画布的对话就写进这段标着「图片工作台」的会话', '已落 · 待真机目检'],
      ],
      { widths: ['60px', null, null, '90px'] },
    ),
    h('要修的：bug，或已定决策还没落地'),
    table(
      ['#', '真机看到的', '改成', '状态'],
      [
        ['B1', '**一轮没有收尾的话**：「校服三视图」那轮，助手把 `set_prompt` 换着措辞连调 8 次、步数用完就停，时间线上只有「执行记录 · 8 步」+「本轮记录」；「只讨论方案」那轮干脆零回复', '每轮必以一句话收尾：做到哪 · 卡在哪 · 你说哪句我接着做（导图「步数用完不静默」那条）；同一工具连续重试同一件事要先停下来说', '已落'],
        ['B2', '「本轮记录」串轮：只讨论方案那轮的「事实」写的是上一轮画布节点的事；两处「本轮记录」缩进不一（一个缩在执行记录下，一个顶到左边）', '本轮记录只记本轮；缩进统一', '已取代 · 本轮记录不再显示'],
        ['B3', '日期分隔线「2026/9/23 的记录」排在它标注的那几轮**下面**', '分隔线放在那一天的第一条之前', '已落'],
        ['B4', '出图后还有「它备的那一张回来了 —— 助手正在看」+「自动检查」卡 + 「已预填下一轮」', '按 09-23 决定删掉（出图后不自检，由你指出问题）', '已落'],
        ['B5', '自动检查卡里缩略图是裂图；模型名写原始 id `nai-diffusion-4-5-curated`', '随 B4 删除；其余处出现模型名一律用显示名', '已落'],
        ['B6', '点输入框上方的规格摘要，比例 / 张数浮层弹到最左边的参数栏', '就地从那一行弹出', '已落'],
        ['B7', '⋯ 菜单的「以前的会话」与标题下拉是同一份历史', '删 ⋯ 里那一项，历史只走标题下拉', '已落'],
        ['B8', '助手说「点击右侧已就绪的生成按钮」，生成键在左边', '提示词里不写方位词', '已落'],
        ['B9', 'studio 目录 CLAUDE.md 写「头部右上常驻齿轮、⋯ 里没有设置入口」，真机没有齿轮、设置在 ⋯ 里', '以真机为准改文档', '已落'],
      ],
      { widths: ['60px', null, null, '90px'] },
    ),
    h('对话中（09-24 实跑一轮 + 翻 102 条历史）'),
    table(
      ['#', '真机看到的', '改成', '状态'],
      [
        ['C1', '同一轮助手连出三行，每行都带头像和名字（「正在分析两张参考图」→「计划 · 3 步」→ 又一句「正在分析两张参考图」），同一句话重复两遍', '一轮只出一次头像与名字，本轮内容都挂在它下面；同一句不重复', '已落'],
        ['C2', '自动续跑每跑一次新起一组「达妮娅 / 计划 · 5 步 / 执行记录 · 1 步」，一次请求堆出 4–5 组，同一份计划重复显示，没有一句话', '续跑合进同一组：计划只出现一次、逐项打勾，跑完一句话收尾', '已落'],
        ['C3', '执行记录展开后每步一张带边框的卡 + 图标圆圈 + 标题（15px 中粗，比回答正文 15px 常规还重）+ 常驻「恢复到这一步」+ 露出工具名 `set_prompt`', '步骤降成一行一步的小字、无卡无圈；「恢复到这一步」悬停才出现；不露工具名', '已落'],
        ['C4', '「记录」有四种皮：你选了（灰字）· 执行记录（灰字折叠）· 已改 N 项（绿色左边条）· 本轮记录（带框、默认展开占半屏）', '统一成一种低调样式、默认收起；「待办：等待确认生成」与确认卡重复的那种不再写', '已落'],
        ['C5', '回答正文里露出内部代号 `@Image1` / `@Image2`，用户那侧同一张图显示成缩略图 chip', '两侧同一种缩略图 chip', '已落'],
        ['C6', '正文写完后末尾光标块一直挂着（等问题回答时也在）', '写完即收', '已落'],
        ['C7', '回执「已改 3 项」而左栏「还原（1 处）」；点「先不要」后工作台模型从 FLUX 2 Flash 变成 GPT Image 2.5 Sunburst、规格变 1:1 · auto，改动标记写「你在确认卡上改的」—— 实跑时没碰卡上旋钮', '取消确认卡不改任何字段；回执与改动标记同一计数（先查根因）', '已落'],
        ['C8', '画布的对话出现在图片工作台的会话里', '见 U7', '已落'],
        ['C9', '助手称呼「JIAN」，界面上的用户名是「YINIG」', '称呼与账号显示名同源（先查名字从哪来）', '不是 bug · 称呼来自助手设置'],
        ['C10', '历史里用户消息的参考图缩略图是裂图', '查过期 URL；裂了显示占位而不是破图标', '已落'],
        ['C11', '阻塞条把工具失败原文给用户（「这个工作台上没有这个控件」「需要先分析当前参考图」），紧接着的回答又说「已确定」', '失败说人话且与回答一致；技术细节留在展开里', '已落'],
      ],
      { widths: ['60px', null, null, '90px'] },
    ),
    h('反问'),
    table(
      ['#', '真机看到的', '改成', '状态'],
      [
        ['Q1', '要用户拍板的事在**正文里**问（「请确认是否完全保持 @Image1 的画风……」），用户只能自己打字', '要拍板的都走问题块', '已落'],
        ['Q2', '正文问一遍「你想优先保留哪一种？」，问题块再问一遍「优先采用哪种画风？」', '正文只说一句原因，问题只在块里问', '已落'],
        ['Q3', '「这张橘猫图用在哪里？」不是冲突也问了', '真冲突才问；能给默认值就用默认、回复里说一句', '已落'],
        ['Q4', '两道题分两轮、各自「1 / 1」', '同一轮攒成一组（≤ 4 题）一次一题；只有一题不显示进度', '已落'],
        ['Q5', '第一项默认就是选中态（实心圆 +「推荐」），又没有确定键，分不清选没选', '不预选，点一下即提交；推荐只用标签', '已落'],
        ['Q6', '点「其他」后两颗圆点同时选中；就地输入框 + 主输入框「或者直接打字…」两个输入框并存', '「其他」就是主输入框：问题开着时打字即回答', '已落'],
        ['Q7', '问题块浮在规格行上方，透底，与输入框不在一个框里', '与输入框同框（v2 §3.4 原定）', '已落'],
        ['Q8', '答完只剩「你选了：纯 2D 赛璐璐」，问题本身消失，回看不知道在选什么', '留问答对：「画风 · 纯 2D 赛璐璐」', '已取代 · owner 09-24 去掉问答对'],
      ],
      { widths: ['60px', null, null, '90px'] },
    ),
    note('**「乱」的原因（owner 09-24 问是不是字体）**：不是字体 —— 面板只有一套字体栈（Geist + Noto Sans SC）。乱在层级与结构：① 一个面板 10 种字号 / 字重 / 颜色组合，执行记录的步骤标题比回答正文还重；② 线和框层层套：时间线竖线 + 节点符号 + 记录组竖线 + 每步卡片边框 + 图标圆圈；③ 什么都常驻：每行头像名字、每步「恢复到这一步」、四种记录皮；④ 透底色块。改法见下一张「对话与反问 · 三方向」。'),
    note('施工验证（owner 给图）：① 给图里的角色**只换一身衣服**，其余一律不变；② 画风从游戏的**三渲二**改成 **2D 赛璐璐**。两条都走助手：看懂 → 选对模型 → 确认卡（带生成开关）→ 结果。测试图 = 三渲二角色三视图（正面 · 背面 · 脸部特写）。**验收**：① 换衣 —— 黑发红挑染、背后红丝带、红瞳、左眼下的痣、脸、身材比例、三视图排版、三渲二质感、灰底全部不变，只有服装变；② 改画风 —— 角色设计全部不变（发型、瞳色、痣、纱袖、红衬里百褶裙、白边长靴、链饰），排版不变，渲染从三渲二变成 2D 赛璐璐（平涂 + 硬阴影 + 线稿）。'),
  ],
}

// ④ 画板：U1 实底 · U2/U3 输入行 · U5 手机顶栏。皮肤沿用助手 v2（BCards）与 M2 手机壳，只画变化的部分。
const MOCK = {
  frame: `border:1px solid ${LINE};border-radius:14px;background:#f4f4f1;padding:16px;display:flex;flex-direction:column;gap:10px`,
  label: `font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;color:${MUTED}`,
  cap: 'font-size:12px;line-height:1.55;color:#525252',
  bubble: 'align-self:flex-end;max-width:78%;background:#f0f0ee;border-radius:12px;padding:7px 10px;font-size:12px;line-height:1.5',
  iconBtn: 'width:30px;height:30px;border-radius:8px;border:1px solid #e5e5e5;background:#fff;display:grid;place-items:center;font-size:13px;color:#525252',
  chip: 'height:30px;padding:0 10px;border-radius:8px;border:1px solid #e5e5e5;background:#fff;display:flex;align-items:center;gap:6px;font-size:12px',
  send: 'margin-left:auto;width:30px;height:30px;border-radius:8px;background:#0a0a0a;color:#fff;display:grid;place-items:center;font-size:13px',
}
const blobs = `<div style="position:absolute;inset:44px 0 0 0;filter:blur(14px);opacity:.55">${[['18%', '30%', '#e9b7c9'], ['46%', '26%', '#c9c2e6'], ['72%', '34%', '#9aa0a8'], ['30%', '68%', '#d8c9b6'], ['62%', '70%', '#7d8591']].map(([x, y, c]) => `<div style="position:absolute;left:${x};top:${y};width:70px;height:54px;border-radius:12px;background:${c}"></div>`).join('')}</div>`
const panelMock = (solid) =>
  `<div style="position:relative;height:230px;border-radius:14px;overflow:hidden;border:1px solid #d4d4d4;background:${solid ? '#fff' : 'rgba(255,255,255,.55)'}">${solid ? '' : blobs}<div style="position:relative;height:44px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid #ececec;background:rgba(255,255,255,.72);backdrop-filter:blur(12px)"><div style="width:22px;height:22px;border-radius:999px;background:linear-gradient(135deg,#cdb4d8,#8f83b8)"></div><span style="font-size:13px;font-weight:600">新对话</span><span style="margin-left:auto;font-size:13px;color:#737373">⋯</span></div><div style="position:relative;padding:14px 12px;display:flex;flex-direction:column;gap:10px"><div style="${MOCK.bubble}">给这张图的角色换一身校服，其余不变</div><div style="font-size:12px;line-height:1.6;color:#0a0a0a;max-width:88%">看了：3D 渲染的二次元角色（三渲二），正面半身。换装用能保人脸的编辑模型，服装只改上衣与裙子。</div><div style="font-size:11px;color:#737373">本轮记录 · 3 项</div></div></div>`
const inputMock = (withPlus) =>
  `<div style="border:1px solid #d4d4d4;border-radius:14px;background:#fff;padding:10px;display:flex;flex-direction:column;gap:8px"><div style="height:34px;border-radius:9px;background:#fafafa;border:1px solid #ececec;display:flex;align-items:center;padding:0 10px;font-size:12px;color:#a3a3a3">描述画面，或把参考图挂进来…</div><div style="display:flex;align-items:center;gap:6px">${withPlus ? `<div style="${MOCK.iconBtn}">＋</div>` : ''}<div style="${MOCK.iconBtn}">📎</div><div style="${MOCK.iconBtn}">▣</div><div style="${MOCK.chip}">OpenAI GPT-6 Luna ▾</div><div style="${MOCK.send}">↑</div></div></div>`
const sourceMock = `<div style="border:1px solid #d4d4d4;border-radius:14px;background:#fff;padding:12px;display:flex;flex-direction:column;gap:8px"><div style="${MOCK.bubble}">只在 danbooru 查一下这个角色的标签</div><div style="height:28px;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;gap:6px;padding:0 10px;font-size:11.5px;color:#525252"><span style="color:#0a0a0a;font-weight:500">调查</span> · 只在 danbooru 里找 · 读了 3 页</div><div style="font-size:12px;line-height:1.6">只在 danbooru 查了：<b>denia_(wuthering_waves)</b> 是现行标签，已写进提示词。</div></div>`
const avatar = (grad, ring) =>
  `<div style="width:28px;height:28px;border-radius:999px;background:${grad};${ring ? 'box-shadow:0 0 0 2px #fff,0 0 0 3px #0a0a0a' : ''}"></div>`
const ME = 'linear-gradient(135deg,#b9c3d9,#6f7fa6)'
const HER = 'linear-gradient(135deg,#cdb4d8,#8f83b8)'
const topBar = (right) =>
  `<div style="height:40px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;align-items:center;padding:0 6px"><span style="width:32px"></span><span style="flex:1;text-align:center;font-size:13px;font-weight:600">▣ 图像 ▾</span><span style="width:32px;display:grid;place-items:center">${right}</span></div>`
const phoneMock = (after) =>
  `<div style="width:300px;border-radius:22px;border:1px solid #d4d4d4;background:#f4f4f1;padding:8px;display:flex;flex-direction:column;gap:8px">${topBar(after ? avatar(HER, false) : avatar(ME, false))}<div style="position:relative;height:120px;border-radius:14px;background:#fff;border:1px solid #ececec;display:grid;place-items:center;font-size:14px;font-weight:600">想画什么？${after ? '' : `<div style="position:absolute;top:8px;right:8px">${avatar(HER, false)}</div>`}</div></div>`
const sheetMock = `<div style="width:300px;border-radius:0 0 18px 18px;border:1px solid #d4d4d4;background:#fafaf8;padding:10px;display:flex;flex-direction:column;gap:8px"><div style="${MOCK.label}">工具</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${['图像', '视频', '音频', '3D', 'LoRA', '画布'].map((x) => `<div style="height:44px;border-radius:10px;background:#fff;border:1px solid #ececec;display:grid;place-items:center;font-size:11px">${x}</div>`).join('')}</div><div style="${MOCK.label}">去处</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${['画廊', '提示词', '素材', '卡片管理', '故事', '我的主页'].map((x) => `<div style="height:44px;border-radius:10px;background:#fff;border:1px solid #ececec;display:grid;place-items:center;font-size:11px">${x}</div>`).join('')}</div><div style="margin-top:4px;border-top:1px solid #ececec;padding-top:8px;display:flex;align-items:center;gap:8px">${avatar(ME, false)}<span style="font-size:12.5px;font-weight:500">YINIG</span><span style="margin-left:auto;font-size:13px;color:#737373">⋯</span></div><div style="${MOCK.cap}">点这一行 = 账号菜单（语言 · 设置 · 退出），与桌面侧栏底行同一颗菜单</div></div>`
const pair = (title, before, after, cap) =>
  `<div style="${MOCK.frame}"><div style="font-size:15px;font-weight:600">${title}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start"><div style="display:flex;flex-direction:column;gap:6px"><div style="${MOCK.label}">现在</div>${before}</div><div style="display:flex;flex-direction:column;gap:6px"><div style="${MOCK.label}">改后</div>${after}</div></div>${cap ? `<div style="${MOCK.cap}">${cap}</div>` : ''}</div>`

const UI_CHANGE_MOCKS = `<div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start">${[
  pair('U1 · 对话区实底', panelMock(false), panelMock(true), '头部保留玻璃（它盖在滚动内容上方，透一点是层级提示）；对话区与空态改实底，工作台的缩略图不再透进来。浮层（历史下拉 · ⋯ · 模型选择）照旧是玻璃。'),
  pair('U2 · 输入行去掉 ＋', inputMock(true), inputMock(false), '＋ 里三项全部退场：提及 = 直接在输入框里打 @；上下文卡 = 助手提议 + 设置里管；指定来源 = 在话里说（右侧）。上传与素材库照旧各一颗。'),
  `<div style="${MOCK.frame}"><div style="font-size:15px;font-weight:600">U3 · 来源在话里说</div>${sourceMock}<div style="${MOCK.cap}">用户说了「只在 X 查」，助手把它当本轮来源名单（与原选择器同一个过滤器）。<b>生效要看得见</b>：调查那一行写明「只在 X 里找」，回答里再说一次。长期规则仍在助手设置的来源规则里。</div></div>`,
  `<div style="${MOCK.frame}"><div style="font-size:15px;font-weight:600">U5 · 手机右上只留助手</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start"><div style="display:flex;flex-direction:column;gap:6px"><div style="${MOCK.label}">现在</div>${phoneMock(false)}</div><div style="display:flex;flex-direction:column;gap:6px"><div style="${MOCK.label}">改后</div>${phoneMock(true)}</div></div><div style="${MOCK.label}">改后 · 点「图像 ▾」落下的导航面板</div>${sheetMock}<div style="${MOCK.cap}">顶栏右端那一格让给助手头像（36px，与桌面同一个人设头像）；没有助手的页面这一格留空。账号入口挪到导航面板最底一行。</div></div>`,
].join('')}</div>`

const D12_UI_DESIGN = {
  file: 'DesignD12UiDesign.dc.html',
  title: 'D12 助手 · ④ UI 改动',
  eyebrow: 'PixelVault · 6 在设计 · D12 助手 · ④ 画板 · UI 改动 · 2026-09-24',
  heading: '助手 UI 改动：改后的样子',
  sub: '对应盘点里已定的 U1 · U2 · U3 · U5（U4 只是去入口、U6 不动，不另画）。皮肤沿用助手 v2 与手机 M2 壳，只画变化的部分；B1–B9 是 bug 与已定未落地，不需要新画面。',
  blocks: [
    { t: 'mock', html: UI_CHANGE_MOCKS, md: '界面稿（画板上）：\n\n- **U1 对话区实底**：头部保留玻璃，对话区与空态实底，浮层照旧玻璃。\n- **U2 输入行去掉 ＋**：只剩 上传 · 素材库 · 模型 · 发送；提及 = 打 `@`。\n- **U3 来源在话里说**：「只在 danbooru 查」→ 调查那一行写明「只在 danbooru 里找」，回答里再说一次。\n- **U5 手机**：顶栏右端 = 助手头像；账号挪到导航面板最底一行（账号菜单：语言 · 设置 · 退出）。' },
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['U1 材质', '—', '静态改底色，无动画', '不给对话区加模糊过渡'],
        ['U2 输入行', '—', '少一颗按钮，其余按钮原样左移', '不做按钮收起动画'],
        ['U3 调查行出现「只在 X 里找」', '沿用调查行现有三态（微光 → 展开 → 收成灰底一行）', '只是多一段文字', '不新增动效'],
        ['U5 点顶栏助手头像', '沿用手机现有 Sheet（vaul）打开', '面板从底部升起', '手机不做头像 morph（桌面才有两锚点过渡）'],
        ['U5 点导航面板的账号行', 'Radix 菜单自带 fade + zoom', '账号菜单从这一行弹出', '不另写位移'],
        ['`prefers-reduced-motion`', '—', '以上全部直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// ④ 画板：对话中 + 反问的三个方向。同一个场景（橘猫：画风冲突 → 反问 → 写提示词 → 确认卡），每个方向两态。
const CV = {
  panel: 'width:100%;box-sizing:border-box;border:1px solid #d4d4d4;border-radius:14px;background:#fff;overflow:hidden;display:flex;flex-direction:column',
  head: 'height:40px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid #ececec;font-size:13px;font-weight:600',
  body: 'padding:14px 14px 12px;display:flex;flex-direction:column;gap:10px',
  user: 'align-self:flex-end;max-width:82%;background:#f0f0ee;border-radius:12px;padding:8px 11px;font-size:13.5px;line-height:1.55',
  name: 'display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600',
  msg: 'font-size:14px;line-height:1.65;color:#0a0a0a',
  meta: 'font-size:12px;line-height:1.5;color:#737373',
  foot: 'border-top:1px solid #ececec;padding:10px 12px;display:flex;flex-direction:column;gap:8px',
  box: 'border:1px solid #d4d4d4;border-radius:12px;background:#fff',
  opt: 'display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:9px',
  num: "flex:none;width:18px;height:18px;border-radius:5px;border:1px solid #d4d4d4;font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;display:grid;place-items:center;color:#525252",
  tag: 'font-size:10.5px;padding:0 6px;border-radius:999px;border:1px solid #d4d4d4;color:#525252;margin-left:6px',
  tools: 'display:flex;align-items:center;gap:6px',
  ib: 'width:26px;height:26px;border-radius:7px;border:1px solid #e5e5e5;display:grid;place-items:center;font-size:11px;color:#525252',
  send: 'margin-left:auto;width:26px;height:26px;border-radius:7px;background:#0a0a0a;color:#fff;display:grid;place-items:center;font-size:11px',
}
const cvAvatar = (size = 22) => `<span style="flex:none;width:${size}px;height:${size}px;border-radius:999px;background:linear-gradient(135deg,#cdb4d8,#8f83b8)"></span>`
const cvUser = `<div style="${CV.user}">帮我出一张橘猫的图：必须完全写实，同时纯 2D 赛璐璐，两条都要 100%。</div>`
const cvName = `<div style="${CV.name}">${cvAvatar()}达妮娅</div>`
const cvToolbar = `<div style="${CV.tools}"><span style="${CV.ib}">📎</span><span style="${CV.ib}">▣</span><span style="font-size:11.5px;color:#525252;border:1px solid #e5e5e5;border-radius:7px;padding:4px 8px">Luna ▾</span><span style="${CV.send}">↑</span></div>`
const cvOptions = (withNum) =>
  [
    ['纯 2D 赛璐璐', '动画线稿 + 平涂色块，不追求照片质感', true],
    ['完全写实照片', '真实猫咪摄影质感，不用赛璐璐', false],
  ]
    .map(([t, d, rec], i) => `<div style="${CV.opt}">${withNum ? `<span style="${CV.num}">${i + 1}</span>` : `<span style="flex:none;width:14px;height:14px;margin-top:2px;border-radius:999px;border:1.5px solid #a3a3a3"></span>`}<div><div style="font-size:13px;font-weight:500">${t}${rec ? `<span style="${CV.tag}">推荐</span>` : ''}</div><div style="${CV.meta}">${d}</div></div></div>`)
    .join('')
const cvConfirm = `<div style="${CV.box};padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">确认生成 1 张？</div><div style="display:flex;gap:5px">${['FLUX 2 Flash ▾', '1:1 ▾', '1 张 ▾'].map((x) => `<span style="font-size:11px;border:1px solid #e5e5e5;background:#f5f5f5;border-radius:7px;padding:3px 7px">${x}</span>`).join('')}</div><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;background:#0a0a0a;color:#fff;border-radius:7px;padding:5px 11px">确认生成</span><span style="font-size:12px;border:1px solid #e5e5e5;border-radius:7px;padding:5px 11px;color:#525252">先不要</span><span style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:#525252">自动生成<span style="width:24px;height:14px;border-radius:999px;background:#e5e5e5;position:relative"><span style="position:absolute;left:2px;top:2px;width:10px;height:10px;border-radius:999px;background:#fff"></span></span></span></div></div>`
const cvAnswer = `<div style="${CV.meta}">画风 · <span style="color:#0a0a0a">纯 2D 赛璐璐</span></div>`
const cvDone = `<div style="${CV.msg}">提示词写好了：橘猫、纯 2D 赛璐璐（线稿 + 平涂 + 硬阴影）、浅色背景、居中全身。用途没说，按通用构图。确认就出 1 张。</div>`
const cvFold = (label) => `<div style="${CV.meta};display:flex;align-items:center;gap:6px">${label} <span style="color:#a3a3a3">▸</span><span style="margin-left:auto;color:#525252">撤销</span></div>`
const cvPanel = (title, body, footer) => `<div style="${CV.panel}"><div style="${CV.head}">${cvAvatar(18)}${title}</div><div style="${CV.body};min-height:250px">${body}</div>${footer}</div>`
const cvInput = (inner) => `<div style="${CV.foot}">${inner}</div>`
const cvTextbox = (ph) => `<div style="height:30px;border-radius:8px;background:#fafafa;border:1px solid #ececec;display:flex;align-items:center;padding:0 10px;font-size:12px;color:#a3a3a3">${ph}</div>`
const rail = (inner) => `<div style="display:grid;grid-template-columns:16px 1fr;gap:8px"><div style="position:relative"><div style="position:absolute;left:7px;top:4px;bottom:0;width:1px;background:#e5e5e5"></div><div style="position:absolute;left:3px;top:4px;width:9px;height:9px;border-radius:999px;background:#0a0a0a"></div></div><div style="display:flex;flex-direction:column;gap:10px">${inner}</div></div>`
const roundCard = (inner) => `<div style="border:1px solid #e5e5e5;border-radius:12px;background:#fafaf8;padding:12px;display:flex;flex-direction:column;gap:10px">${inner}</div>`

const CONV_DIRECTIONS = [
  {
    no: 'A',
    name: '对话流',
    line: '去掉时间线竖线与节点；一轮只出一次头像名字；过程与记录收成一行灰字；问题**替换**输入框（选项编号，打字 = 其他）。与 Claude 的对话 + 提问框同形。',
    ask: cvPanel('新对话', `${cvUser}${cvName}<div style="${CV.msg}">写实照片和 2D 赛璐璐是互斥的两种画风，只能保留一种。</div>`, cvInput(`<div style="${CV.box};padding:8px"><div style="font-size:12.5px;font-weight:600;padding:2px 4px 6px">这张图要哪种画风？</div>${cvOptions(true)}<div style="margin-top:6px">${cvTextbox('或者直接写你的想法…')}</div></div>${cvToolbar}`)),
    done: cvPanel('橘猫 · 2D 赛璐璐', `${cvUser}${cvName}${cvAnswer}${cvDone}${cvFold('做了 3 步 · 改了提示词')}${cvConfirm}`, cvInput(`${cvTextbox('描述画面，或把参考图挂进来…')}${cvToolbar}`)),
  },
  {
    no: 'B',
    name: '时间线降噪',
    line: '保留左侧时间线（现有识别点），但一轮一个节点；四种记录统一成节点下同一种灰字行；问题块放在输入框**同一个框**里、文本框之上。',
    ask: cvPanel('新对话', `${cvUser}${rail(`${cvName}<div style="${CV.msg}">写实照片和 2D 赛璐璐是互斥的两种画风，只能保留一种。</div>`)}`, cvInput(`<div style="${CV.box};padding:8px;display:flex;flex-direction:column;gap:6px"><div style="font-size:12.5px;font-weight:600;padding:2px 4px">这张图要哪种画风？</div>${cvOptions(false)}<div style="border-top:1px solid #ececec;padding-top:8px">${cvTextbox('或者直接打字…')}</div>${cvToolbar}</div>`)),
    done: cvPanel('橘猫 · 2D 赛璐璐', `${cvUser}${rail(`${cvName}${cvAnswer}${cvDone}${cvFold('改了提示词 · 3 步')}${cvConfirm}`)}`, cvInput(`${cvTextbox('描述画面，或把参考图挂进来…')}${cvToolbar}`)),
  },
  {
    no: 'C',
    name: '回合卡',
    line: '每一轮包成一张浅底卡（你的话 → 助手 → 记录一行），卡与卡之间留白；问题与确认卡都嵌在**当前这张回合卡的底部**，输入框不变。',
    ask: cvPanel('新对话', `${roundCard(`${cvUser}${cvName}<div style="${CV.msg}">写实照片和 2D 赛璐璐是互斥的两种画风，只能保留一种。</div><div style="${CV.box};padding:8px"><div style="font-size:12.5px;font-weight:600;padding:2px 4px 6px">这张图要哪种画风？</div>${cvOptions(false)}</div>`)}`, cvInput(`${cvTextbox('或者直接打字…')}${cvToolbar}`)),
    done: cvPanel('橘猫 · 2D 赛璐璐', `${roundCard(`${cvUser}${cvName}${cvAnswer}${cvDone}${cvFold('改了提示词 · 3 步')}${cvConfirm}`)}`, cvInput(`${cvTextbox('描述画面，或把参考图挂进来…')}${cvToolbar}`)),
  },
]
const CONV_MOCKS = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${CONV_DIRECTIONS.map(
  (d) =>
    `<div style="display:flex;flex-direction:column;gap:14px;padding:18px;border:1px solid ${LINE};border-radius:14px;background:#f4f4f1"><div><div style="display:flex;align-items:baseline;gap:8px"><span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${MUTED}">${d.no}</span><span style="font-size:16px;font-weight:600">${d.name}</span></div><div style="margin-top:4px;font-size:12.5px;line-height:1.6;color:#525252">${d.line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div></div><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;color:${MUTED}">① 反问开着</div>${d.ask}<div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;color:${MUTED}">② 答完 → 写好提示词 → 确认卡</div>${d.done}</div>`,
).join('')}</div>`

const D12_CONV_DESIGN = {
  file: 'DesignD12ConvDirections.dc.html',
  title: 'D12 助手 · ④ 对话与反问 · 三方向',
  eyebrow: 'PixelVault · 6 在设计 · D12 助手 · ④ 画板 · 对话与反问 · 2026-09-24',
  heading: '对话与反问：三个方向',
  sub: '**09-24 owner 定：A 对话流。**全状态见下一张「A 对话流：全状态」。同一个场景（画风冲突 → 反问 → 写提示词 → 确认卡），每个方向画两态。三个方向共用的底线：字号只剩三档（正文 14 · 名字 13 中粗 · 辅助 12 灰）、不再有卡中卡与图标圆圈、一轮只出一次头像名字、执行步骤与撤销默认收起、问题不预选且点一下即提交、答完留「问题 · 答案」一行（对应盘点 C1–C4 · Q5–Q8）。',
  blocks: [
    { t: 'mock', html: CONV_MOCKS, md: '界面稿（画板上），三个方向：\n\n- **A 对话流**：去掉时间线竖线与节点；一轮只出一次头像名字；过程与记录收成一行灰字；问题替换输入框（选项编号，打字 = 其他）。与 Claude 的对话 + 提问框同形。\n- **B 时间线降噪**：保留左侧时间线但一轮一个节点；四种记录统一成同一种灰字行；问题块与输入框同一个框、在文本框之上。\n- **C 回合卡**：每轮包成一张浅底卡；问题与确认卡嵌在当前回合卡底部，输入框不变。\n\n共用底线：字号三档（正文 14 · 名字 13 中粗 · 辅助 12 灰）、无卡中卡与图标圆圈、一轮一次头像名字、步骤与撤销默认收起、问题不预选点一下即提交、答完留「问题 · 答案」一行。' },
    h('动效表（三个方向共用）'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['问题出现', '`--duration-base` 200ms · `ease-standard`', 'opacity 0→1 + 上移 4px；A 方向是输入框内容交叉淡换', '不弹窗、不遮住对话'],
        ['点一个选项', '`--duration-fast` 120ms', '该行底色变深一拍 → 问题收成「问题 · 答案」一行（opacity + 位移）', '不要确定键、不要二次确认'],
        ['展开「做了 N 步」', '沿用现有折叠', '行下展开步骤小字', '不自动展开'],
        ['「恢复到这一步」', '`--duration-fast` 120ms', '悬停该步时 opacity 0→1', '不常驻'],
        ['回答写完', '—', '光标立即消失', '不在等回答时还挂着光标'],
        ['`prefers-reduced-motion`', '—', '以上全部直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// 共用的输入区小件（工具行 / 开关 / 规格行），A 全状态与三处细节都用。
const G = {
  glyph: (svg, dim) => `<span style="display:inline-grid;place-items:center;width:20px;height:20px;color:${dim ? '#8a8a8a' : '#404040'}">${svg}</span>`,
  clip: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.6 1.6 0 0 1-2.3-2.3L16 7.3"/></svg>',
  img: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>',
  up: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  sendRound: `<span style="margin-left:auto;display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:#0a0a0a;color:#fff">${'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'}</span>`,
  caret: '<span style="font-size:9px;color:#8a8a8a;margin-left:3px">▾</span>',
  toggle: (on) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#525252">自动生成<span style="width:24px;height:14px;border-radius:999px;background:${on ? '#0a0a0a' : '#dcdcdc'};position:relative"><span style="position:absolute;left:${on ? 12 : 2}px;top:2px;width:10px;height:10px;border-radius:999px;background:#fff"></span></span></span>`,
  frame: (inner) => `<div style="border:1px solid #d4d4d4;border-radius:14px;background:#fff;padding:10px 12px;display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box">${inner}</div>`,
  text: (ph) => `<div style="font-size:13px;color:#a3a3a3;padding:2px 0">${ph}</div>`,
  spec: (extra) => `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#737373;padding:0 4px"><span>出图 · Nano Banana Pro · 1:1 · 1 张</span><span style="font-size:9px">▾</span>${extra ?? ''}</div>`,
}
const dirCard = (no, name, line, mock) =>
  `<div style="display:flex;flex-direction:column;gap:10px;padding:16px;border:1px solid ${LINE};border-radius:14px;background:#f4f4f1"><div style="display:flex;align-items:baseline;gap:8px"><span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${MUTED}">${no}</span><span style="font-size:15px;font-weight:600">${name}</span></div>${mock}<div style="font-size:12px;line-height:1.6;color:#525252">${line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div></div>`
const grid3 = (items) => `<div style="margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${items.join('')}</div>`

const knobs3 = `<div style="display:flex;gap:5px">${['Nano Banana Pro ▾', '1:1 ▾', '1 张 ▾'].map((x) => `<span style="font-size:11px;border:1px solid #e5e5e5;background:#f5f5f5;border-radius:7px;padding:3px 7px">${x}</span>`).join('')}</div>`
const btns = `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;background:#0a0a0a;color:#fff;border-radius:7px;padding:5px 11px">确认生成</span><span style="font-size:12px;border:1px solid #e5e5e5;border-radius:7px;padding:5px 11px;color:#525252">先不要</span></div>`
// ④ 画板：A 对话流全状态（09-24 定稿：T-A 裸图标 · R-C 三点 + 正在思考 + 流式 · S-C 开关在发送键旁 · P1–P8 已并入）。
const A = {
  gen: (w, h) => `<span style="display:block;width:${typeof w === 'number' ? `${w}px` : w};height:${h}px;border-radius:8px;background:linear-gradient(160deg,#dfe3ea 0%,#9aa6b8 45%,#32394a 100%)"></span>`,
  ph: (w, h) => `<span style="display:block;width:${typeof w === 'number' ? `${w}px` : w};height:${h}px;border-radius:8px;background:#efefed"></span>`,
  dots: '<span style="display:inline-flex;gap:3px;align-items:flex-end;height:10px"><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a;margin-bottom:3px"></span><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a"></span><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a;margin-bottom:2px"></span></span>',
  thinking: () => `<div style="display:flex;align-items:center;gap:8px;padding-left:30px">${'<span style="display:inline-flex;gap:3px;align-items:flex-end;height:10px"><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a;margin-bottom:3px"></span><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a"></span><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a;margin-bottom:2px"></span></span>'}<span style="${CV.meta}">正在思考…</span></div>`,
  chip: (t) => `<span style="font-size:11.5px;border:1px solid #e5e5e5;border-radius:999px;padding:3px 9px;color:#404040;background:#fff">${t}</span>`,
  ghost: (t) => `<span style="font-size:11.5px;border:1px solid #e5e5e5;border-radius:7px;padding:4px 9px;color:#404040;background:#fff">${t}</span>`,
  userWithRef: (t) => `<div style="${CV.user};display:flex;flex-direction:column;gap:6px"><span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#525252;align-self:flex-start"><span style="flex:none;display:inline-block;width:28px;height:28px;border-radius:6px;background:linear-gradient(160deg,#3a3d45,#6b2c33)"></span>测试图</span>${t}</div>`,
  // T-A 工具行：裸图标 · 模型灰字 · （S-C）开关 · 圆形发送键；running 时发送键换成停止
  toolbar: (o = {}) => `<div style="display:flex;align-items:center;gap:10px">${G.glyph(G.clip)}${G.glyph(G.img)}<span style="font-size:12px;color:#737373">Luna${G.caret}</span><span style="margin-left:auto">${G.toggle(!!o.auto)}</span>${o.running ? '<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:999px;border:1px solid #d4d4d4;font-size:9px;color:#404040">■</span>' : G.sendRound.replace('margin-left:auto;', '')}</div>`,
  // 输入区 = 规格行 + 单框（文字 + 工具行）；问题开着时用 question 替换框内文字
  input: (o = {}) => `<div style="${CV.foot}">${o.noSpec ? '' : G.spec()}<div style="border:1px solid #d4d4d4;border-radius:14px;background:#fff;padding:10px 12px;display:flex;flex-direction:column;gap:8px">${o.question ?? G.text(o.placeholder ?? '描述画面，或把参考图挂进来…')}${A.toolbar(o)}</div></div>`,
}
const aAsk = '给她换一身校服，其他都不变。'
const aSeen = `<div style="${CV.msg}">看了：三渲二的角色三视图（正面 · 背面 · 特写）。只换服装，发型、红瞳、痣、脸和身材比例都锁住；用能保人脸的编辑模型。</div>`
const aQuestion = (title, opts, extra) => `<div style="display:flex;flex-direction:column;gap:2px"><div style="font-size:12.5px;font-weight:600;padding:2px 4px 6px">${title}</div>${extra ?? ''}${opts.map(([t, d, r], i) => `<div style="${CV.opt}"><span style="${CV.num}">${i + 1}</span><div><div style="font-size:13px;font-weight:500">${t}${r ? `<span style="${CV.tag}">推荐</span>` : ''}</div>${d ? `<div style="${CV.meta}">${d}</div>` : ''}</div></div>`).join('')}<div style="margin-top:6px;padding-top:8px;border-top:1px solid #ececec">${G.text('或者直接写你的想法…')}</div></div>`
const aCard = (title, body, footer) => cvPanel(title, body, footer ?? A.input())
const aState = (no, name, mock, rule) =>
  `<div style="display:flex;flex-direction:column;gap:10px;padding:16px;border:1px solid ${LINE};border-radius:14px;background:#f4f4f1"><div style="display:flex;align-items:baseline;gap:8px"><span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${MUTED}">${no}</span><span style="font-size:15px;font-weight:600">${name}</span></div>${mock}<div style="font-size:12px;line-height:1.6;color:#525252">${rule.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div></div>`
const aConfirmed = (auto) => `<div style="${CV.meta}">${auto ? '已自动生成' : '已确认'} · 11:24 <span style="color:#a3a3a3">· 1 张 · Nano Banana Pro</span></div>`
const aFold = (label) => `<div style="${CV.meta}">${label} <span style="color:#a3a3a3">▸</span> · <span style="color:#525252">撤销</span></div>`
const aResult = `<div style="${CV.box};padding:10px;display:flex;flex-direction:column;gap:8px">${A.gen('100%', 190)}<div style="${CV.meta}">已入库 · 1 张 · 11:25 · 校服版，三视图</div><div style="display:flex;gap:6px">${A.ghost('再来一组')}${A.ghost('用它当参考')}</div></div>`
const aStepsList = (hoverIdx) =>
  [
    ['看图', '三渲二 · 三视图 · 角色特征已记下'],
    ['写提示词', '只改服装：藏青校服、白衬衫、红领结'],
    ['换模型', 'FLUX 2 Flash → Nano Banana Pro（能保人脸）'],
  ]
    .map(([k, v], i) => `<div style="display:flex;gap:8px;font-size:12px;line-height:1.5;color:#525252"><span style="flex:none;width:52px;color:#737373">${k}</span><span style="flex:1">${v}</span>${i === hoverIdx ? '<span style="flex:none;color:#0a0a0a;text-decoration:underline">恢复到这一步</span>' : ''}</div>`)
    .join('')
const aStream = `<div style="${CV.msg}">看了：三渲二的角色三视图（正面 · 背面 · 特写）。只换服<span style="display:inline-block;width:2px;height:14px;background:#0a0a0a;vertical-align:-2px;margin-left:1px"></span></div>`

const A_STATES = [
  aState('S1', '空态', aCard('新对话', `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:190px">${cvAvatar(36)}<div style="${CV.meta}">说你想要的画面，我来写提示词、挑模型、配参考。</div></div><div style="display:flex;flex-wrap:wrap;gap:6px">${A.chip('把这句写成好提示词')}${A.chip('换个模型看差别')}${A.chip('照这张参考图来')}</div>`, A.input({ noSpec: true })), '头像 + 一句话 + 起手 chip（chip 只在空态出现，占规格行的位置；规格行在空态不显示）。对话区实底。'),
  aState('S2', '运行中 → 流式输出', `${aCard('给她换一身校服', `${A.userWithRef(aAsk)}${cvName}${A.thinking()}`, A.input({ running: true, placeholder: '说，我在听 —— 你打的这句会排队' }))}<div style="${CV.meta};text-align:center">↓ 开始回答后</div>${aCard('给她换一身校服', `${A.userWithRef(aAsk)}${cvName}${aStream}`, A.input({ running: true, placeholder: '说，我在听 —— 你打的这句会排队' }))}`, '等待时：名字下面三颗小点起伏 +「正在思考…」（**不按动作换词**）；发送键换成停止。开始回答后：**正文一个字一个字流式出现**（跟 Claude 一样，不是想完一次性全出），末尾一根不闪的光标，写完即收。'),
  aState('S3', '反问 · 单题', aCard('给她换一身校服', `${A.userWithRef(aAsk)}${cvName}<div style="${CV.msg}">「校服」有好几种，差别在整套气质上。</div>`, A.input({ question: aQuestion('要哪种校服？', [['日式水手服', '藏青领、红领结、百褶裙', true], ['英式西装校服', '深色西装外套、衬衫领带', false], ['运动校服', '拉链外套、运动长裤', false]]) })), '问题**直接占用输入框内部**，不套第二层框：选项编号（键盘 1–3 直接选）、不预选、点一下即提交；下面那行打字 = 「其他」。正文只说一句原因，不重复问题。'),
  aState('S4', '反问 · 多题', aCard('给她换一身校服', `${A.userWithRef(aAsk)}${cvName}<div style="${CV.msg}">还差两件事要你定。</div>`, A.input({ question: aQuestion(`裙子长度？<span style="float:right;font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;font-weight:400;color:#737373">2 / 2</span>`, [['及膝', '保持原图的腿部比例', false], ['短裙', '与原图裙长一致', false]], `<div style="${CV.meta};padding:0 4px 6px">校服 · <span style="color:#0a0a0a">日式水手服</span> <span style="color:#a3a3a3">改</span></div>`) })), '同一轮的题攒成一组（≤ 4）一次一题；只有多题才显示「2 / 2」；已答的题在框里留一行「问题 · 答案」，可点「改」回去。'),
  aState('S5', '写好 → 确认卡', aCard('给她换一身校服', `${A.userWithRef(aAsk)}${cvName}<div style="${CV.meta}">校服 · <span style="color:#0a0a0a">日式水手服</span> · 裙长 · <span style="color:#0a0a0a">短裙</span></div>${aSeen}${aFold('做了 3 步 · 改了提示词和模型')}<div style="${CV.box};padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">确认生成 1 张？</div>${knobs3}${btns}</div>`), '一轮只出一次头像名字；问答对一行；**回答必有收尾那句**；过程一行灰字，「撤销」紧跟其后；确认卡上**没有开关**（开关在工具行）；卡上的参数 = 工作台此刻的参数（C7）。'),
  aState('S6', '生成中', aCard('给她换一身校服', `${cvName}${aSeen}${aConfirmed(false)}<div style="${CV.box};padding:10px;display:flex;flex-direction:column;gap:8px"><div style="${CV.meta}">正在出图 · 1 / 2</div><div style="display:flex;gap:6px">${A.ph('50%', 110)}${A.ph('50%', 110)}</div></div>`), '确认卡就地收成两段的一行「已确认 · 时间」+ 淡一档的「1 张 · 模型」；占位格数 = 张数、尺寸与结果一致、`animate-pulse`（图片占位允许骨架）；只写「正在出图 · 1 / 2」。'),
  aState('S7', '结果', aCard('给她换一身校服', `${cvName}${aSeen}${aConfirmed(false)}${aResult}<div style="${CV.msg}">出好了。服装换成水手服，其余按原图锁住；哪里不对直接说，我只改你指出的那部分。</div>`), '单张按输入区宽度出（约 3:2），多张两列，点开进灯箱；「已入库 · 张数 · 时间 · 一句摘要」+ 两个轻操作；缩略图从顶部裁；⛔ 不自检。'),
  aState('S8', '开关开着 · 自动生成', aCard('给她换一身校服', `${cvName}${aSeen}${aConfirmed(true)}<div style="${CV.box};padding:10px;display:flex;flex-direction:column;gap:8px"><div style="${CV.meta}">正在出图 · 1 / 1</div>${A.ph('100%', 150)}</div>`, A.input({ auto: true })), '开关在**工具行、发送键左边**（S-C），只管当前这段会话；开着时确认卡直接以收起的一行「已自动生成 · 时间」出现。'),
  aState('S9', '多步计划', aCard('做成四套换装', `${cvName}<div style="${CV.msg}">分四步做，每步出一张。</div><div style="display:flex;flex-direction:column;gap:5px;font-size:12.5px"><div style="color:#525252">✓ 水手服 · 已入库</div><div style="color:#525252">✓ 西装校服 · 已入库</div><div style="color:#0a0a0a;font-weight:500">› 运动校服 · 正在出图</div><div style="color:#a3a3a3">○ 冬季大衣</div></div>`), '续跑合进同一组：计划只出现一次、逐项打勾，⛔ 不再每跑一步新起一组「计划 / 执行记录」；跑完一句话收尾。'),
  aState('S10', '一步失败', aCard('给她换一身校服', `${A.userWithRef(aAsk)}${cvName}<div style="display:flex;flex-direction:column;gap:4px;border-left:2px solid #c4a0a6;padding-left:10px"><div style="font-size:13px;color:#8d2b3a">没能挂上参考图：这张图在素材库里已被删除。</div><div style="${CV.meta};display:flex;gap:10px"><span>重新上传后再试</span><span style="color:#0a0a0a;text-decoration:underline">再试一次</span><span>详情 ▸</span></div></div><div style="${CV.msg}">提示词已经写好，只差参考图；你传一张，我接着做。</div>`), '失败说人话（哪一步、为什么、怎么办），技术原文进「详情」；⛔ 不把工具报错原文给用户，失败行与紧跟的回答必须一致（C11）。'),
  aState('S11', '整轮出错', aCard('给她换一身校服', `${A.userWithRef(aAsk)}${cvName}<div style="border:1px solid #e8cfd3;background:#fbf4f5;border-radius:10px;padding:9px 11px;display:flex;flex-direction:column;gap:5px"><div style="font-size:13px;color:#8d2b3a">这次请求在我们这边出了问题。</div><div style="display:flex;align-items:center;gap:10px;font-size:11.5px;color:#737373"><span style="font-family:'Geist Mono',ui-monospace,monospace">trace 7f3a91c2</span><span style="color:#0a0a0a;text-decoration:underline">复制详情</span></div></div>`), '沿用 v2 §3.7 三段：一句人话 · traceId · 复制详情；⛔ 不写「请稍后重试」。'),
  aState('S12', '步数用完', aCard('做成四套换装', `${cvName}<div style="${CV.msg}">做到第 8 步停下了：水手服、西装两套已出图，运动校服的提示词写好了还没出图。</div>${aFold('做了 8 步 · 出了 2 张')}<div style="display:flex;gap:6px">${A.chip('继续')}${A.chip('先到这里')}</div>`), '步数用完**必须说**：做到哪 · 还剩什么；给「继续」一个 chip。⛔ 不许只剩「执行记录 · 8 步」（B1）。'),
  aState('S13', '展开记录 · 撤销', aCard('给她换一身校服', `${cvName}${aSeen}<div style="${CV.meta}">做了 3 步 · 改了提示词和模型 <span style="color:#a3a3a3">▾</span> · <span style="color:#525252">撤销</span></div><div style="display:flex;flex-direction:column;gap:6px;padding-left:2px">${aStepsList(1)}</div>`), '展开后一行一步的小字：动作 · 改成了什么；「恢复到这一步」只在悬停那一行出现；⛔ 无卡片、无图标圆圈、不露工具名。'),
  aState('S14', '回看历史', aCard('给她换一身校服', `<div style="${CV.meta};text-align:center">更早的 3 轮 ▸</div><div style="display:flex;align-items:center;gap:8px;${CV.meta}"><span style="flex:1;height:1px;background:#ececec"></span>9 月 24 日<span style="flex:1;height:1px;background:#ececec"></span></div>${A.userWithRef(aAsk)}${cvName}<div style="${CV.meta}">校服 · <span style="color:#0a0a0a">日式水手服</span></div>${aSeen}${aConfirmed(false)}`), '日期分隔线在那一天的第一条**之前**；答过的题留「问题 · 答案」；画布的对话只在画布里（U7）。'),
]

const A_PHONE = `<div style="display:flex;gap:18px;align-items:flex-start"><div style="width:300px;flex:none;border-radius:22px;border:1px solid #d4d4d4;background:#e9e9e6;padding:8px 8px 0;display:flex;flex-direction:column;gap:6px"><div style="height:34px;border-radius:999px;background:#fff;display:flex;align-items:center;padding:0 6px;font-size:12px;font-weight:600"><span style="width:26px"></span><span style="flex:1;text-align:center">▣ 图像 ▾</span>${cvAvatar(24)}</div><div style="border-radius:16px 16px 0 0;background:#fff;border:1px solid #d4d4d4;border-bottom:0;display:flex;flex-direction:column"><div style="display:grid;place-items:center;padding-top:6px"><span style="width:36px;height:4px;border-radius:999px;background:#d4d4d4"></span></div><div style="${CV.head};border-bottom:1px solid #ececec">${cvAvatar(18)}给她换一身校服</div><div style="${CV.body}">${A.userWithRef(aAsk)}${cvName}<div style="${CV.msg}">「校服」有好几种，差别在整套气质上。</div></div>${A.input({ question: aQuestion('要哪种校服？', [['日式水手服', '', true], ['英式西装校服', '', false], ['运动校服', '', false]]) })}</div></div><div style="flex:1;font-size:12.5px;line-height:1.7;color:#404040">手机：同一个面板装进接近满屏的 Sheet（沿用现状），顶栏右端就是助手头像（U5）。问题同样占用输入框内部；每个选项行高 ≥ 44 的触控区；软键盘弹起时输入区上移，对话区让位。工具行与桌面同一套（裸图标 · 模型 · 开关 · 圆形发送键）。</div></div>`

const A_SPEC_TABLE = table(
  ['元素', '字号 · 字重', '颜色', '规则'],
  [
    ['回答正文', '14 · 常规', '近黑', '面板里最重的字只有它和用户消息；流式一字一字出现，末尾光标写完即收'],
    ['用户消息', '13.5 · 常规', '近黑，浅灰底气泡', '靠右；挂的参考图是 28px 圆角缩略图 + 名字，不带边框'],
    ['名字', '13 · 中粗', '近黑', '一轮一次，配 22 头像；等待时名字下三颗小点 +「正在思考…」'],
    ['辅助行（问答对 · 过程行 · 已确认）', '12 · 常规', '灰', '四种记录统一成这一种；「撤销」紧跟过程行'],
    ['输入区', '—', '一个边框', '规格行在框上方；框内 = 文字 + 工具行（裸图标 · 模型灰字 · 自动生成开关 · 圆形发送键）；问题开着时占用框内'],
    ['卡片', '—', '白底细边', '只剩两种：确认卡 · 结果卡；⛔ 卡中卡、图标圆圈'],
    ['失败', '13 · 常规', '风险色文字 + 细左边条', '整轮出错才用浅风险底的三段条'],
    ['间距', '—', '—', '轮与轮之间 20，轮内 10；⛔ 左侧时间线竖线与节点符号'],
  ],
  { firstStrong: false },
)

const D12_A_STATES = {
  file: 'DesignD12AStates.dc.html',
  title: 'D12 助手 · ④ A 对话流 · 全状态',
  eyebrow: 'PixelVault · 6 在设计 · D12 助手 · ④ 画板 · A 对话流全状态 · 2026-09-24',
  heading: 'A 对话流：全状态（定稿）',
  sub: 'owner 09-24 定 A；三处细节定 T-A 裸图标 · R-C 三点 + 正在思考 + 流式 · S-C 开关在发送键旁，二过清单 P1–P8 已并入本版。场景用测试图做「只换衣服」，14 态 + 手机。**这张是施工依据**；对应盘点 C1–C11 · Q1–Q8 · B1 · B3 · B4。 ⚠ 施工后 owner 09-24 追加改动（以代码为准）：S4 / S5 里的问答对、每轮的「本轮记录」与没开跑的「计划 · N 步」不再显示；S13 的「恢复到这一步」与逐步撤销删除，撤回只剩每轮过程行上的「撤销」（点一下即撤）；S9 的清单已落。',
  blocks: [
    { t: 'mock', html: `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${A_STATES.join('')}</div>`, md: '界面稿（画板上），14 态：S1 空态 · S2 运行中（三点 + 正在思考 → 正文一字一字流式，发送键变停止）· S3 反问单题（问题占用输入框内部、编号、不预选、打字即其他）· S4 反问多题（2 / 2，已答留问答对可改）· S5 写好 → 确认卡（问答对一行 + 收尾那句 + 过程一行含撤销 + 确认卡，卡上无开关）· S6 生成中（已确认两段一行 + 正在出图 1 / 2 + 骨架占位格）· S7 结果（整宽缩略图 + 已入库 + 两个轻操作 + 收尾一句，不自检）· S8 开关开着（开关在工具行发送键旁；确认卡直接收起）· S9 多步计划（同一组逐项打勾）· S10 一步失败（人话 + 再试一次 + 详情）· S11 整轮出错（v2 §3.7 三段）· S12 步数用完（说做到哪 + 继续 chip）· S13 展开记录（一行一步，悬停才出恢复）· S14 回看历史（日期分隔在前，问答对）。工具行 = 裸图标 · 模型灰字 · 自动生成开关 · 圆形发送键；规格行在输入框上方。' },
    h('手机'),
    { t: 'mock', html: `<div style="margin-top:12px">${A_PHONE}</div>`, md: '手机：同一个面板装进接近满屏的 Sheet，顶栏右端是助手头像；问题占用输入框内部，选项行高 ≥ 44；软键盘弹起时输入区上移；工具行与桌面同一套。' },
    h('规格'),
    A_SPEC_TABLE,
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['等待（三点）', '循环 1.2s · 三点错峰起伏 3px', '只动 transform', '不转圈、不上骨架、不换状态词'],
        ['流式正文', '按帧追加', '字一个一个出现，末尾光标不闪；写完光标立即消失', '不整段一次性出现；等回答时不挂光标'],
        ['问题出现 / 答完收起', '`--duration-base` 200ms · `ease-standard`', '输入框内容交叉淡换；答完那一题收成「问题 · 答案」一行', '不弹窗、不遮对话'],
        ['确认卡 → 已确认一行', '`--duration-base` 200ms', '卡片高度收拢 + 淡出，行字淡入', '不离开时间线'],
        ['占位格 → 结果图', '`--duration-base` 200ms', '占位 `animate-pulse`；图 opacity 0→1，尺寸与占位格一致', '不跳动'],
        ['计划打勾', '`--duration-fast` 120ms', '○ → ✓ 交叉淡换，当前项加粗', '不整组重排'],
        ['悬停出现「恢复到这一步」', '`--duration-fast` 120ms', 'opacity 0→1', '不常驻'],
        ['自动生成开关', '`--duration-fast` 120ms', '拨子横移，轨道浅灰 ↔ 近黑', '不弹 toast'],
        ['失败行出现', '`--duration-base` 200ms', 'opacity 0→1', '不抖动、不闪红'],
        ['`prefers-reduced-motion`', '—', '以上全部直接到位（流式仍逐字，光标静止）', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// ④ 画板：owner 09-24 指出三处（输入区工具行 · 运行中那一行 · 生成开关位置）各出三个方向 + 二过清单。
// ① 工具行
const TOOLBAR_DIRS = grid3([
  dirCard('T-A', '裸图标 · 同一个框', '图标不带框，模型是一行灰字，只有发送键有实底（圆形）。整块只有一个边框：输入框本身。跟 Claude 的输入区同形。', `${G.spec()}${G.frame(`${G.text('描述画面，或把参考图挂进来…')}<div style="display:flex;align-items:center;gap:10px">${G.glyph(G.clip)}${G.glyph(G.img)}<span style="font-size:12px;color:#737373">Luna${G.caret}</span>${G.sendRound}</div>`)}`),
  dirCard('T-B', '工具行在上，字段干净', '上传 · 素材库 · 助手模型和出图规格并成输入框**上方**一行灰字；字段里只剩文字和右端的发送键。', `<div style="display:flex;align-items:center;gap:14px;font-size:11.5px;color:#737373;padding:0 4px"><span style="display:inline-flex;align-items:center;gap:4px">${G.glyph(G.clip, true)}上传</span><span style="display:inline-flex;align-items:center;gap:4px">${G.glyph(G.img, true)}素材库</span><span>Luna${G.caret}</span><span style="margin-left:auto">Nano Banana Pro · 1:1 · 1 张${G.caret}</span></div>${G.frame(`<div style="display:flex;align-items:center;gap:8px">${G.text('描述画面，或把参考图挂进来…')}${G.sendRound}</div>`)}`),
  dirCard('T-C', '图标进字段', '两颗图标贴在字段**左内侧**、发送键在右内侧，一行搞定；助手模型挪去规格行，跟出图模型并排。', `${G.spec(`<span style="margin-left:auto">助手 Luna${G.caret}</span>`)}${G.frame(`<div style="display:flex;align-items:center;gap:8px">${G.glyph(G.clip)}${G.glyph(G.img)}${G.text('描述画面，或把参考图挂进来…')}${G.sendRound}</div>`)}`),
])

// ② 运行中
const runName = (extra) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600">${cvAvatar()}达妮娅${extra ?? ''}</div>`
const shimmerText = (t) => `<span style="font-size:12.5px;font-weight:400;background:linear-gradient(90deg,#9a9a9a 0%,#2a2a2a 45%,#9a9a9a 90%);-webkit-background-clip:text;background-clip:text;color:transparent">${t}</span>`
const RUNNING_DIRS = grid3([
  dirCard('R-A', '状态词跟在名字后', '不另起一行、不要圆点：名字后面同一行接状态词，文字上一道从左到右的微光扫过（`--duration-reveal`），说明它活着。写完后状态词被正文替换。', `<div style="${CV.body};background:#fff;border:1px solid #d4d4d4;border-radius:14px">${A.userWithRef(aAsk)}${runName(`<span style="font-weight:400;color:#8a8a8a;margin:0 4px">·</span>${shimmerText('正在看图…')}`)}</div>`),
  dirCard('R-B', '头像呼吸', '状态词还是名字下面一行灰字但去掉圆点；动的是头像：外面一圈柔光慢慢呼吸（1.6s 一个来回，只动 opacity）。视线落在头像上就知道在忙。', `<div style="${CV.body};background:#fff;border:1px solid #d4d4d4;border-radius:14px">${A.userWithRef(aAsk)}<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600"><span style="position:relative;width:22px;height:22px"><span style="position:absolute;inset:-4px;border-radius:999px;background:rgba(143,131,184,.22)"></span>${cvAvatar()}</span>达妮娅</div><div style="${CV.meta};padding-left:30px">正在看图…</div></div>`),
  dirCard('R-C', '三点 + 状态词', '名字下面一行：三颗小点依次起伏（iMessage 式）+ 状态词。最直白的「在打字」信号。', `<div style="${CV.body};background:#fff;border:1px solid #d4d4d4;border-radius:14px">${A.userWithRef(aAsk)}${runName()}<div style="display:flex;align-items:center;gap:8px;padding-left:30px"><span style="display:inline-flex;gap:3px;align-items:flex-end;height:10px"><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a;margin-bottom:3px"></span><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a"></span><span style="width:5px;height:5px;border-radius:999px;background:#8a8a8a;margin-bottom:2px"></span></span><span style="${CV.meta}">正在看图…</span></div></div>`),
])

// ③ 生成开关位置
const TOGGLE_DIRS = grid3([
  dirCard('S-A', '卡头右上', '开关放在确认卡标题那一行的右端，按钮行只剩两颗键。它管的是「这张卡要不要自动按」，放在卡头最贴题。', `<div style="${CV.box};padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center"><span style="font-size:13px;font-weight:600">确认生成 1 张？</span><span style="margin-left:auto">${G.toggle(false)}</span></div>${knobs3}${btns}</div>`),
  dirCard('S-B', '规格行常驻', '开关是「这段会话」的设置，不是这张卡的：放到输入框上方的规格行右端，一直看得见；确认卡上不再出现，开着时卡直接收成一行。跟 Claude Code 把「自动接受」放在输入区旁一个道理。', `<div style="${CV.box};padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">确认生成 1 张？</div>${knobs3}${btns}</div><div style="margin-top:8px">${G.spec(`<span style="margin-left:auto">${G.toggle(false)}</span>`)}</div>${G.frame(`<div style="display:flex;align-items:center;gap:8px">${G.text('描述画面，或把参考图挂进来…')}${G.sendRound}</div>`)}`),
  dirCard('S-C', '工具行 · 发送键旁', '放在输入区工具行、发送键左边，跟「发出去」这个动作挨着；同样是会话级、常驻可见。', `<div style="${CV.box};padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">确认生成 1 张？</div>${knobs3}${btns}</div><div style="margin-top:8px">${G.spec()}</div>${G.frame(`${G.text('描述画面，或把参考图挂进来…')}<div style="display:flex;align-items:center;gap:10px">${G.glyph(G.clip)}${G.glyph(G.img)}<span style="font-size:12px;color:#737373">Luna${G.caret}</span><span style="margin-left:auto">${G.toggle(false)}</span>${G.sendRound.replace('margin-left:auto;', '')}</div>`)}`),
])

const D12_DETAIL_DIRS = {
  file: 'DesignD12DetailDirs.dc.html',
  title: 'D12 助手 · ④ 三处细节 · 方向',
  eyebrow: 'PixelVault · 6 在设计 · D12 助手 · ④ 画板 · 三处细节 · 2026-09-24',
  heading: '三处细节：各三个方向',
  sub: 'owner 看过「A 对话流：全状态」后指出三处：输入区工具行不好看、运行中那一行不好看、生成开关位置不对。每处三个方向并排；下面是我二过整张画板挑出的其它可改点。**09-24 owner 定：T-A · R-C（状态词改成「正在思考」，正文一字一字流式出现）· S-C；P1–P8 全部采纳**，已并回「A 对话流：全状态」定稿。',
  blocks: [
    h('① 输入区工具行', '现在：三颗带框的方图标 + 一颗带框的模型 chip + 一颗黑色方块发送键，形状混着、像表单'),
    { t: 'mock', html: TOOLBAR_DIRS, md: '① 工具行三方向：T-A 裸图标同一个框（Claude 同形）· T-B 工具行挪到输入框上方一行灰字、字段只剩文字和发送键 · T-C 两颗图标贴字段左内侧、发送在右内侧、助手模型挪去规格行。' },
    h('② 运行中', '现在：名字下面一颗灰圆点 + 灰字「正在看图…」，像一条死掉的列表项'),
    { t: 'mock', html: RUNNING_DIRS, md: '② 运行中三方向：R-A 状态词跟在名字后同一行、文字上一道微光 · R-B 头像外圈柔光呼吸、状态词去圆点 · R-C 三颗小点起伏 + 状态词。' },
    h('③ 生成开关位置', '现在：确认卡按钮行远端 / 收起行末尾 —— owner 定「位置不对」'),
    { t: 'mock', html: TOGGLE_DIRS, md: '③ 开关三方向：S-A 确认卡标题行右端 · S-B 输入框上方规格行右端常驻（卡上不再出现）· S-C 输入区工具行、发送键旁常驻。' },
    h('二过全状态画板：其它可改点'),
    table(
      ['#', '哪里', '现在', '改成'],
      [
        ['P1', '规格行', '全状态画板的输入区**漏画了**规格行（真机有「FLUX 2 Flash · 1:1 · 1 张 ▾」）', '补上，并作为 ③ S-B 的落点；点它就地弹出模型 / 比例 / 张数（B6）'],
        ['P2', '问题框', '问题框自己一圈边框，外面输入框又一圈，两层框', '问题直接占用输入框内部，不再套第二层边框'],
        ['P3', '结果卡缩略图', '150 × 96 太小，看不清换装效果', '单张按输入区宽度出（约 3:2），多张两列；点开进灯箱'],
        ['P4', '生成中占位格', '死灰色块', '占位格用骨架 `animate-pulse`（图片占位允许，助手文字态才禁骨架），尺寸与结果一致'],
        ['P5', '「撤销」', '在过程行最右端，与「▸」离得远', '紧跟在过程行文字后：「做了 3 步 · 改了提示词 ▸ · 撤销」'],
        ['P6', '已确认那一行', '「已确认 · 11:24 · 1 张 · Nano Banana Pro」信息挤成一串', '两段：「已确认 · 11:24」+ 灰一档的「1 张 · Nano Banana Pro」'],
        ['P7', '空态起手 chip', '三颗 chip 挤在输入框正上方', '留在输入框上方但与规格行合并成一行，规格行在空态不显示'],
        ['P8', '用户消息里的参考图 chip', '缩略图 18px，认不出是哪张', '缩略图 28px、带圆角，chip 不带边框直接贴在气泡里'],
      ],
      { widths: ['56px', '120px', null, null], firstStrong: false },
    ),
  ],
}

// ④ 画板：拆分与反推（09-24 ① 七问 + NAI 换场景追问已定）。沿用 A 对话流的面板 / 输入区 / 确认卡。
const SR = {
  ref: (name, text) => `<div style="${CV.user};display:flex;flex-direction:column;gap:6px"><span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#525252;align-self:flex-start"><span style="flex:none;display:inline-block;width:28px;height:28px;border-radius:6px;background:linear-gradient(160deg,#3a3d45,#6b2c33)"></span>${name}</span>${text}</div>`,
  user: (text) => `<div style="${CV.user}">${text}</div>`,
  confirm: (knobs) => `<div style="${CV.box};padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">确认生成 1 张？</div><div style="display:flex;gap:5px;flex-wrap:wrap">${knobs.map((x) => `<span style="font-size:11px;border:1px solid #e5e5e5;background:#f5f5f5;border-radius:7px;padding:3px 7px">${x} ▾</span>`).join('')}</div>${btns}</div>`,
  copyIcon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  code: (text, copied) => `<div style="position:relative;border:1px solid #ececec;border-radius:10px;background:#fafaf8;padding:10px 38px 10px 12px;font-family:'Geist Mono',ui-monospace,monospace;font-size:11.5px;line-height:1.65;color:#262626;word-break:break-word">${text}<span style="position:absolute;top:6px;right:6px;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 6px;border-radius:6px;font-family:Geist,'Noto Sans SC',sans-serif;font-size:11px;color:${copied ? '#0a0a0a' : '#737373'};${copied ? 'background:#fff;border:1px solid #e5e5e5' : ''}">${copied ? '✓ 已复制' : SR.copyIcon}</span></div>`,
  chip: (t) => `<span style="height:22px;display:inline-flex;align-items:center;border:1px solid #e5e5e5;border-radius:6px;padding:0 8px;font-size:11px;background:#fff">${t}</span>`,
  desk: (chips) => `<div style="border:1px dashed #cfcfcf;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:#fbfbfa"><div style="display:flex;justify-content:space-between;font-size:11px"><span style="font-weight:500">左侧标签台 · 正向标签</span><span style="color:#737373">${chips.length} 个</span></div><div style="border:1px solid #d4d4d4;border-radius:8px;background:#fff;padding:8px;display:flex;flex-wrap:wrap;gap:6px">${chips.map((c) => SR.chip(c)).join('')}</div></div>`,
  fixed: (t) => `<div style="${CV.meta}">${t}</div>`,
  // 规格行跟着这一态的出图模型走（G.spec 写死的是 Nano Banana Pro）
  input: (spec, o = {}) => A.input({ ...o, noSpec: true }).replace(`<div style="${CV.foot}">`, `<div style="${CV.foot}">${G.spec().replace('Nano Banana Pro · 1:1 · 1 张', spec)}`),
}
const srTags = '1girl, solo, multiple_views, reference_sheet, black_hair, streaked_hair, red_hair, red_eyes, mole_under_eye, black_shirt, see-through_sleeves, pleated_skirt, thigh_boots, white_background'
const srProse = 'A character reference sheet of one girl shown front, back and close-up: black hair with red streaks, red eyes, a small mole under her left eye, black shirt with sheer sleeves, pleated skirt with red lining, white-trimmed long boots; cel-shaded 3D look, plain white background.'
const SR_STATES = [
  aState('X1', '一句话 → 标签（NAI）', `${aCard('樱花树下的女孩', `${SR.user('画一个黑长直、穿水手服的女孩站在樱花树下，傍晚。')}${cvName}<div style="${CV.msg}">写好了，按标签写进了标签台：人物、发型、服装、场景、时间各一组。</div>${SR.fixed('有 2 个按 Danbooru 换了写法：sakura_tree → cherry_blossoms，black_long_hair → black_hair + long_hair。')}${aFold('做了 2 步 · 写了标签')}${SR.confirm(['NovelAI V5 Full', '3:4', '1 张'])}`, SR.input('NovelAI V5 Full · 3:4 · 1 张'))}${SR.desk(['1girl', 'solo', 'black_hair', 'long_hair', 'straight_hair', 'serafuku', 'standing', 'cherry_blossoms', 'outdoors', 'evening', 'sunset'])}`, '拆分结果**不单独列对照**，直接落成标签台里的标签块，在标签台增删。写入前逐个核对，换过写法才出那一句灰字；全部查得到就不出。'),
  aState('X2', '反推 · 只要标签', aCard('反推这张', `${SR.ref('测试图', '反推一下这张，给我标签。')}${cvName}<div style="${CV.msg}">按 Danbooru 标签反推，已核对：</div>${SR.code(srTags, false)}<div style="${CV.msg}">没写进标签台；要照它画就说一声。</div>`, SR.input('NovelAI V5 Full · 3:4 · 1 张')), '「反推 / 给我标签 / 描述一下」= **只给文字**：代码块 + 右上角复制键，⛔ 不写入、不出确认卡、不挂原图。'),
  aState('X3', '反推 · 自然语言 · 已复制', aCard('反推这张', `${SR.ref('测试图', '反推成一段自然语言描述。')}${cvName}${SR.code(srProse, true)}`, SR.input('GPT Image 2.5 Flare · 16:9 · 1 张')), '点名要自然语言就给自然语言，没点名跟当前模型走（NAI 出标签，其余出英文描述）。复制后键上换成「✓ 已复制」1.5 秒。'),
  aState('X4', '照这张画 · 其他模型', aCard('照这张画', `${SR.ref('测试图', '照这张画一张。')}${cvName}<div style="${CV.msg}">看了：三渲二的角色三视图。构图、姿势、配色、画风都照搬，原图挂成参考，比例跟原图 16:9。</div>${aFold('做了 3 步 · 写了提示词、挂了原图')}${SR.confirm(['GPT Image 2.5 Flare', '16:9', '1 张'])}`, SR.input('GPT Image 2.5 Flare · 16:9 · 1 张')), '「照这张画 / 复刻 / 一模一样」= **照搬**：文字 + 原图一起用、比例跟原图。⛔ 不设「复刻模式」开关。'),
  aState('X5', '照这张画 · NAI V5', aCard('照这张画', `${SR.ref('测试图', '照这张画一张。')}${cvName}<div style="${CV.msg}">看了：三渲二的角色三视图。标签照着原图写，原图按图生图挂上，还原度 0.8（越高越像原图）。</div>${aFold('做了 4 步 · 写了标签、挂了原图、调了还原度')}${SR.confirm(['NovelAI V5 Full', '16:9', '1 张'])}`, SR.input('NovelAI V5 Full · 16:9 · 1 张')), 'NAI 照搬 = 标签 + 图生图，还原度拉到 0.8，回复里说清数字的意思；想更像 / 更自由就在话里说「再像一点」。'),
  aState('X6', '同角色换场景 · 其他模型', aCard('她在海边', `${SR.ref('测试图', '同一个角色，换到海边日落。')}${cvName}<div style="${CV.msg}">只留她的人设和画风（黑发红挑染、红瞳、痣、三渲二质感），场景换成海边日落；原图只作角色参考，构图不跟。</div>${aFold('做了 3 步 · 写了提示词、挂了原图')}${SR.confirm(['GPT Image 2.5 Flare', '16:9', '1 张'])}`, SR.input('GPT Image 2.5 Flare · 16:9 · 1 张')), '「同一个角色 / 这个人 + 新内容」= **换场景**：提示词只保人设与画风，新内容按话写。'),
  aState('X7', '同角色换场景 · NAI V5 → 问', aCard('她在海边', `${SR.ref('测试图', '同一个角色，换到海边日落。')}${cvName}<div style="${CV.msg}">V5 没有角色参考，挂原图就是图生图，会连构图一起带过来。</div>`, SR.input('NovelAI V5 Full · 16:9 · 1 张', { question: aQuestion('这张怎么出？', [['留在 V5，只用标签', '画风是新一代；原创角色的还原度低一些', false], ['换 V4.5 Full，挂角色参考', '角色更像；画风是上一代', false]]) })), '只在 **NAI V5 + 换场景** 这一种情况问（owner 09-24 定「当场问一次」）；其他模型、其他说法都不问。'),
  aState('X8', '选了 V4.5 之后', aCard('她在海边', `${SR.ref('测试图', '同一个角色，换到海边日落。')}${cvName}<div style="${CV.msg}">换到 V4.5 Full，原图挂成角色参考；标签只写人设与海边日落，构图不跟原图。</div>${aFold('做了 4 步 · 换了模型、写了标签、挂了角色参考')}${SR.confirm(['NovelAI V4.5 Full', '16:9', '1 张'])}`, SR.input('NovelAI V4.5 Full · 16:9 · 1 张')), '答完不留问答回执（09-24 已定），换模型这件事在正文里说一句；「撤销」退回整轮，包括换回 V5。'),
]
const SR_PHONE = `<div style="display:flex;gap:18px;align-items:flex-start"><div style="width:300px;flex:none;border-radius:22px;border:1px solid #d4d4d4;background:#e9e9e6;padding:8px 8px 0;display:flex;flex-direction:column;gap:6px"><div style="height:34px;border-radius:999px;background:#fff;display:flex;align-items:center;padding:0 6px;font-size:12px;font-weight:600"><span style="width:26px"></span><span style="flex:1;text-align:center">▣ 图像 ▾</span>${cvAvatar(24)}</div><div style="border-radius:16px 16px 0 0;background:#fff;border:1px solid #d4d4d4;border-bottom:0;display:flex;flex-direction:column"><div style="display:grid;place-items:center;padding-top:6px"><span style="width:36px;height:4px;border-radius:999px;background:#d4d4d4"></span></div><div style="${CV.head};border-bottom:1px solid #ececec">${cvAvatar(18)}反推这张</div><div style="${CV.body}">${SR.ref('测试图', '反推一下这张，给我标签。')}${cvName}${SR.code(srTags, false)}</div>${SR.input('NovelAI V5 Full · 3:4 · 1 张')}</div></div><div style="flex:1;font-size:12.5px;line-height:1.7;color:#404040">手机：同一个面板。代码块在窄屏里自动换行（⛔ 横向滚动），复制键的点击区扩到 44 × 44，但画出来的大小不变；复制后同样显示「✓ 已复制」。标签台在手机的参数页里，写入后不自动跳页，正文那句「写进了标签台」就是提示。</div></div>`

const SPLIT_REVERSE = {
  file: 'DesignSplitReverse.dc.html',
  title: '拆分与反推 · ④ 全状态',
  eyebrow: 'PixelVault · 6 在设计 · 拆分与反推 · ④ 画板 · 2026-09-24',
  heading: '拆分与反推：全状态',
  sub: '⚠ 09-24 已施工（9f6f8a22 · b8300847），实跑 X1–X8 通过；实跑后补：查不到的先退回改写一次、「相近」只认形态差异、NAI 拦 @ImageN 与整句、换台型号跟着换台、NAI 能改比例；助手写下的提示词按域落盘，刷新后不再问「追加 / 覆盖 / 保留」（90b84b54）；换写法那句灰字进历史，刷新后照画（eff047d0）。owner 09-24 ① 七问全选最简：不设模式、不加入口、不列对照、自动核对、只要文字给复制块、孤立反推面板删掉；追问定「NAI V5 + 换场景」当场问一次。新画面只有两样：**代码块的复制键**和 **X7 那一题**，其余全部沿用「A 对话流：全状态」。场景用同一张测试图。',
  blocks: [
    { t: 'mock', html: `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${SR_STATES.join('')}</div>`, md: '界面稿（画板上），8 态：X1 一句话拆成 NAI 标签（直接落标签台，换过写法才出一句灰字）· X2 反推只要标签（代码块 + 复制键，不写入）· X3 反推成自然语言、已复制态 · X4 照这张画（其他模型：文字 + 原图、比例跟原图）· X5 照这张画（NAI V5：标签 + 图生图还原度 0.8）· X6 同角色换场景（其他模型：只保人设画风）· X7 NAI V5 换场景当场问（留 V5 只用标签 / 换 V4.5 挂角色参考）· X8 选了 V4.5 后的确认卡。' },
    h('手机'),
    { t: 'mock', html: `<div style="margin-top:12px">${SR_PHONE}</div>`, md: '手机：同一个面板；代码块自动换行不横滚，复制键点击区 44 × 44；标签台写入后不跳页。' },
    h('行为规则'),
    table(
      ['#', '规则', '细节'],
      [
        ['B1', '听话分三类', '「照这张画 / 复刻 / 一模一样」→ 照搬；「同一个角色 / 这个人 + 新内容」→ 换场景；「反推 / 给我标签 / 描述一下这张」→ 只要文字。只发图说「画」按照搬；⛔ 不为分类单独提问'],
        ['B2', '输出方言', '点名就按点名（标签 / 自然语言）；没点名跟当前模型：NAI 出 Danbooru 标签，其余出英文描述'],
        ['B3', '标签核对', '写入前逐个过「本地 Danbooru 词表 + NAI 官方联想」：别名 → 正名，写错 → 最接近的真实标签；都查不到 → 原样保留并在同一句里说「没查到」。角色名照旧先查 Danbooru（NAI 规则）'],
        ['B4', '挂不挂原图', '照搬 → 挂原图、比例跟原图（NAI V5 = 图生图，还原度 0.8）；换场景 → 其他模型挂作角色参考；NAI V5 → X7 问一次'],
        ['B5', '只要文字', '代码块 + 复制键；⛔ 不写入、不出确认卡、不挂原图'],
        ['B6', '撤销', '沿用每轮过程行那一颗「撤销」，照搬 / 换模型 / 挂原图一起退回'],
      ],
      { widths: ['44px', '110px', null], firstStrong: false },
    ),
    h('施工范围'),
    table(
      ['层', '改什么'],
      [
        ['服务端', '标签核对器（新）接在 NAI 规则之后、写入之前；「换过写法」那一句由系统追加，⛔ 不靠模型自己说'],
        ['助手提示', 'B1 / B2 / B4 三条进 operator 规则；X7 那题走现有问题块'],
        ['界面', '共享 `CodeBlock` 右上角加复制键（全站代码块都受益）；其余零新组件'],
        ['删除', '`ReverseEngineerPanel` · `VariationGrid` · `use-reverse-image` 与三语 `ReverseEngineer` 文案；`/api/image/analyze` 施工时查调用方，没人用就一起删'],
      ],
      { widths: ['90px', null], firstStrong: true },
    ),
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['复制键 → 已复制', '`--duration-fast` 120ms · `ease-standard`；1.5s 后回原样', '图标与「✓ 已复制」交叉淡换', '不弹 toast、不改代码块底色'],
        ['标签台写入', '—', '一次整体替换', '不逐个飞入、不闪高亮'],
        ['「换了写法」那句', '`--duration-base` 200ms', '正文写完后 opacity 0→1', '不跟着流式逐字'],
        ['X7 问题出现 / 答完', '沿用 A 对话流 S3', '输入框内容交叉淡换', '不弹窗'],
        ['`prefers-reduced-motion`', '—', '以上直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// ④ 画板：视频助手 + 视频左栏（09-24 ① 八问已定）。助手面板沿用 A 对话流；左栏是新画面。
const VD = {
  label: (t) => `<div style="font-size:10.5px;font-weight:500;color:#8a8a8a">${t}</div>`,
  col: (inner) => `<div style="width:100%;box-sizing:border-box;border:1px solid #d4d4d4;border-radius:14px;background:#fff;padding:12px;display:flex;flex-direction:column;gap:10px">${inner}</div>`,
  seg: (items, on) => `<div style="display:flex;gap:2px;border:1px solid #e5e5e5;border-radius:8px;padding:2px">${items.map((t, i) => `<span style="flex:1;text-align:center;font-size:11.5px;padding:5px 0;border-radius:6px;${i === on ? 'background:#eef0ff;color:#3b3fb8;font-weight:500' : 'color:#737373'}">${t}</span>`).join('')}</div>`,
  slot: (t) => `<span style="flex:1;height:52px;border:1px dashed #cfcfcf;border-radius:8px;display:grid;place-items:center;font-size:11px;color:#8a8a8a">＋ ${t}</span>`,
  box: (inner, h = 70) => `<div style="border:1px solid #e5e5e5;border-radius:10px;padding:8px 10px;min-height:${h}px;font-size:11.5px;line-height:1.6;color:#262626">${inner}</div>`,
  row: (t, extra) => `<div style="display:flex;align-items:center;gap:6px;border:1px solid #e5e5e5;border-radius:8px;padding:6px 9px;font-size:11.5px;color:#525252">${t}<span style="margin-left:auto;color:#a3a3a3">${extra ?? '▾'}</span></div>`,
  pills: (a, b) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${[a, b].map((t) => `<span style="border:1px solid #e5e5e5;border-radius:8px;padding:6px 9px;font-size:11.5px;color:#404040">${t}</span>`).join('')}</div>`,
  gen: '<div style="height:34px;border-radius:9px;background:#0a0a0a;color:#fff;display:grid;place-items:center;font-size:12.5px;font-weight:500">生成</div>',
  bad: (n) => `<span style="flex:none;display:inline-grid;place-items:center;width:16px;height:16px;border-radius:999px;background:#dc2626;color:#fff;font-size:10px;font-weight:600">${n}</span>`,
  mark: (n, inner) => `<div style="display:flex;gap:6px;align-items:flex-start">${VD.bad(n)}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px">${inner}</div></div>`,
  // 素材轨：一格 = 缩略图 + 下方编号；首 / 尾帧是左上角标
  tile: (label, grad, badge) => `<span style="flex:none;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="position:relative;width:46px;height:46px;border-radius:8px;background:${grad}">${badge ? `<span style="position:absolute;left:3px;top:3px;font-size:9.5px;line-height:1;padding:2px 4px;border-radius:4px;background:rgba(10,10,10,.72);color:#fff">${badge}</span>` : ''}</span><span style="font-size:10.5px;color:#525252">${label}</span></span>`,
  add: '<span style="flex:none;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:46px;height:46px;border-radius:8px;border:1px dashed #cfcfcf;display:grid;place-items:center;color:#8a8a8a;font-size:14px">＋</span><span style="font-size:10.5px;color:transparent">·</span></span>',
  vid: 'linear-gradient(160deg,#20242c,#4a5566)',
  aud: 'repeating-linear-gradient(90deg,#d9d9d6 0 2px,#f3f3f1 2px 5px)',
  img1: 'linear-gradient(160deg,#3a3d45,#6b2c33)',
  img2: 'linear-gradient(160deg,#9fb3c8,#e3d6b8)',
  rail: (tiles, mode) => `${VD.label('素材 · 拖进来或 ⌘V')}<div style="display:flex;gap:8px;flex-wrap:wrap">${tiles.join('')}${VD.add}</div><div style="font-size:11px;color:#737373">这次按 <span style="color:#262626">${mode[0]}</span> 发 · ${mode[1]}</div>`,
  spec: (t) => `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#737373;padding:0 4px"><span>${t}</span><span style="font-size:9px">▾</span></div>`,
}
const vdInput = (spec, o = {}) => A.input({ ...o, noSpec: true, placeholder: o.placeholder ?? '说说这段视频想拍什么…' }).replace(`<div style="${CV.foot}">`, `<div style="${CV.foot}">${o.chips ? `<div style="display:flex;gap:6px">${o.chips.map((c) => A.chip(c)).join('')}</div>` : VD.spec(spec)}`)
const vdConfirm = (knobs) => SR.confirm(knobs)
const vdFixed = (t) => `<div style="${CV.meta}">${t}</div>`
const vdPrompt = (lines) => `<div style="border:1px dashed #cfcfcf;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:#fbfbfa"><div style="font-size:11px;font-weight:500">左栏 · 提示词框</div><div style="border:1px solid #d4d4d4;border-radius:8px;background:#fff;padding:8px 10px;font-size:11.5px;line-height:1.65;color:#262626">${lines.join('<br>')}</div></div>`

const VD_BEFORE = VD.col(
  [
    VD.mark(1, `${VD.label('图片用途')}${VD.seg(['关键帧', '多图参考', '全能参考'], 2)}`),
    VD.mark(2, `${VD.label('具名参考槽')}<div style="display:flex;gap:6px">${VD.slot('首帧')}${VD.slot('尾帧')}${VD.slot('参考视频')}</div>`),
    `${VD.label('镜头提示词')}${VD.box('<span style="color:#a3a3a3">描述这个镜头……</span>')}`,
    VD.mark(3, VD.row('负面提示词 <span style="color:#a3a3a3">不想出现的内容…</span>')),
    VD.mark(4, `${VD.pills('▤ 模板', '▣ 参考图')}${VD.pills('▭ 剧本', '♪ 音频参考')}`),
    VD.mark(5, VD.row('<span style="color:#a3a3a3">请先选择模型</span>')),
    VD.row('16:9 · 5 秒 · 720p'),
    VD.gen,
  ].join(''),
)
const VD_AFTER = VD.col(
  [
    VD.rail([VD.tile('图片1', VD.img1, '首帧'), VD.tile('图片2', VD.img2), VD.tile('视频1', VD.vid), VD.tile('音频1', VD.aud)], ['全能参考', '挂了参考素材']),
    `${VD.label('提示词')}${VD.box('全局设定：写实电影感，冷蓝夜色……<br>镜头1（0-2秒）中景，固定机位：……<br>镜头2（2-5秒）近景，缓慢推近：……', 84)}`,
    VD.pills('▤ 模板', '▭ 剧本'),
    VD.row('Seedance 2.0 · fal'),
    VD.row('16:9 · 5 秒 · 720p'),
    VD.gen,
  ].join(''),
)
const VD_PANEL_COMPARE = `<div style="margin-top:14px;display:grid;grid-template-columns:320px 320px 1fr;gap:22px;align-items:start"><div style="display:flex;flex-direction:column;gap:8px"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;color:${MUTED}">现在</div>${VD_BEFORE}</div><div style="display:flex;flex-direction:column;gap:8px"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;color:${MUTED}">改后</div>${VD_AFTER}</div><div style="font-size:12.5px;line-height:1.75;color:#404040;display:flex;flex-direction:column;gap:8px">${[
  ['1', '三个模式 → 去掉', '发送方式由挂了什么推出来：有参考素材 → 全能参考；首 + 尾 → 首尾帧；只有首帧 → 图生视频；什么都没挂 → 文生视频。结果写成素材下面一行灰字，只读。和画布视频节点用同一个判定函数。选模型不再清空。'],
  ['2', '三个槽 + 参考图 + 音频参考 → 一条素材轨', '图、视频、音频都拖进同一条轨，按类型各自编号「图片1 · 视频1 · 音频1」，和提示词里写的编号一致。首帧 / 尾帧是图片左上角的角标：点图片 → 设为首帧 / 设为尾帧 / 作为参考 / 移除。'],
  ['3', '负面提示词 → 按模型决定显不显示', '目前 Seedance、Kling 等大多数视频模型没有这一栏，写了会被悄悄丢掉。改成只在支持它的模型下显示这一行。'],
  ['4', '四颗按钮 → 两颗', '参考图和音频参考都并进素材轨的「＋」，只剩「模板 · 剧本」。'],
  ['5', '模型 → 一行一个（型号 · 渠道）', '模式没了，选择器里就不再有同名重复行（这就是当初加模式的原因）。发送时按上面那行灰字选端点，用户不用管。'],
].map(([n, t, d]) => `<div style="display:flex;gap:8px">${VD.bad(n)}<div><b>${t}</b><br>${d}</div></div>`).join('')}</div></div>`

const VD_FACE = grid3([
  aState('F1', '空态', aCard('新对话', `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:40px 0">${cvAvatar(40)}<div style="${CV.meta}">说说这段视频想拍什么。</div></div>`, vdInput('', { chips: ['写一段分镜', '让这张图动起来'] })), '头像 + 一句话；起手 chip **最多 2 颗**，写在输入框正上方，只在空态出现（沿用 D7c 的位置）。'),
  aState('F2', '规格行 · 收起', aCard('雨夜车站', `${SR.user('一个女孩在雨夜的车站等人，5 秒。')}${cvName}<div style="${CV.msg}">写好了，两个镜头……</div>`, vdInput('Seedance 2.0 · 5 秒 · 16:9')), '只写 **型号 · 时长 · 比例**。渠道、价格、清晰度都收进点开后的浮层。现在的「Seedance 2.0 参考（BytePlus）· BytePlus · 6 credits · 1:1 · 5s」里渠道写了两遍，这次去掉。'),
  aState('F3', '规格行 · 点开', aCard('雨夜车站', `${SR.user('一个女孩在雨夜的车站等人，5 秒。')}<div style="${CV.box};padding:10px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 24px rgba(0,0,0,.08)">${[['模型', 'Seedance 2.0 ▾'], ['渠道', 'fal ▾ <span style="color:#a3a3a3">· 6 credits</span>'], ['时长', '5 秒 ▾'], ['比例', '16:9 ▾'], ['清晰度', '720p ▾']].map(([k, v]) => `<div style="display:flex;font-size:12px"><span style="width:52px;color:#737373">${k}</span><span>${v}</span></div>`).join('')}</div>`, vdInput('Seedance 2.0 · 5 秒 · 16:9')), '就地浮层（同图片档 B6），和确认卡、左栏读写**同一份**规格。价格只在这里和确认卡上出现。'),
])

const VD_STATES = [
  aState('V1', '一句话 → 第一档', `${aCard('雨夜车站', `${SR.user('一个女孩在雨夜的车站等人，5 秒。')}${cvName}<div style="${CV.msg}">写好了：全局设定 + 情绪 + 两个镜头，写进了左栏提示词。</div>${aFold('做了 2 步 · 写了提示词')}${vdConfirm(['Seedance 2.0', '5 秒', '16:9'])}`, vdInput('Seedance 2.0 · 5 秒 · 16:9'))}${vdPrompt(['全局设定：写实电影感，冷蓝夜色，雨丝逆光；女孩黑色短发、米色风衣、透明雨伞；纯净画面，无字幕无文字。', '情绪：等待里带一点不安。', '镜头1（0-2秒）中景，固定机位：女孩站在站台檐下，伞尖滴水，她抬头望向镜头左后方的来车方向。', '镜头2（2-5秒）近景，缓慢推近：她呼出一口白气，手指收紧伞柄；车灯从画面深处照亮她的脸，停在她眯眼的一瞬。'])}`, '只有一句话或一个画面 → **第一档**：全局设定 + 情绪 + 逐镜。⛔ 不先反问，先交完整稿。原话写得很全就照写，不加设定；只给了主体就补场景和光线，并在回复里说一句补了什么。'),
  aState('V2', '剧本 → 第二档', `${aCard('末班车', `${SR.user('把这段拍成 15 秒：她等末班车，来的不是她等的人；手机亮了，她笑了。')}${cvName}<div style="${CV.msg}">按剧本分四拍：等 → 失望 → 手机亮起 → 笑。每拍一个镜头，转场都写清了，写进了左栏提示词。</div>${aFold('做了 2 步 · 写了提示词')}${vdConfirm(['Seedance 2.0', '15 秒', '16:9'])}`, vdInput('Seedance 2.0 · 15 秒 · 16:9'))}${vdPrompt(['叙事：起 等待 → 承 失望 → 转 手机亮起 → 合 释然。', '全局设定：……', '镜头1（0-4秒）……', '硬切 · 镜头2（4-8秒）……', '溶解 · 镜头3（8-11秒）……', '镜头4（11-15秒）……'])}`, '故事、剧本、多场 → **第二档**：先写一行叙事（起承转合 + 情绪走向），再逐镜。转场写名字（硬切 / 溶解 / 匹配剪辑）。'),
  aState('V3', '挂了参考图', aCard('她在天台跳舞', `${SR.ref('图片1 · 图片2', '图片1 是女主，图片2 是场景，让她在这里跳舞。')}${cvName}<div style="${CV.msg}">看了：图片1 是红发女孩（白衬衫、黑短裙），图片2 是黄昏天台。提示词里这样绑定：「将图片1中的红发女孩定义为林夏，图片2作为场景」，后面只用「林夏」称呼她。</div>${aFold('做了 3 步 · 看了参考、写了提示词')}${vdConfirm(['Seedance 2.0', '10 秒', '16:9'])}`, vdInput('Seedance 2.0 · 10 秒 · 16:9')), '视频档也先**看参考图**再写（现在只有图片档会看）。编号跟左栏素材轨一致，写法**按当前模型**：Seedance「将图片1中的…定义为…」、Wan「图1」、MiniMax「Image 1」、Gemini「&lt;IMAGE_REF_0&gt;」；换模型时助手按新格式重写一遍，框里写的就是实际发出去的。多人：外观拉开、各写一段、按外貌指认。'),
  aState('V4', '说了「不要…」', aCard('雨夜车站', `${SR.user('不要字幕，不要背景音乐，人别变形。')}${cvName}<div style="${CV.msg}">改好了：「纯净画面，无字幕无文字；只有环境雨声」写进全局设定；动作放慢、每个动作写清停在哪里，这样人物更不容易变形。</div>${vdFixed('Seedance 没有负面提示词这一栏，所以写进了正文。')}${aFold('做了 1 步 · 改了提示词')}`, vdInput('Seedance 2.0 · 5 秒 · 16:9')), '模型**没有负面栏**：约束写进全局设定，写要什么（「只有环境雨声」），不在镜头里写「不要××」。模型**有负面栏**：照旧写负面栏。这句灰字由系统追加，⛔ 不靠模型自己说。'),
  aState('V5', '让这张图动起来', `${aCard('让她动起来', `${SR.ref('图片1', '让她动起来。')}${cvName}<div style="${CV.msg}">图片1 设成了首帧，从这个画面开始：她转头看向镜头，发丝被风带起，镜头缓慢推近。</div>${aFold('做了 3 步 · 挂了首帧、写了提示词')}${vdConfirm(['Seedance 2.0', '5 秒', '跟随首帧'])}`, vdInput('Seedance 2.0 · 5 秒 · 跟随首帧'))}<div style="border:1px dashed #cfcfcf;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:#fbfbfa">${VD.rail([VD.tile('图片1', VD.img1, '首帧')], ['图生视频', '只有首帧'])}</div>`, '「动起来 / 从这张开始」→ 挂成首帧，素材轨上出角标，灰字变成「图生视频」。比例跟随首帧。'),
  aState('V6', '素材超出建议数', aCard('多人对戏', `${SR.ref('图片1–6', '这六个人在会议室吵架。')}${cvName}<div style="${CV.msg}">都挂上了。官方建议一次 4–5 个素材以内，六个人同框时脸容易串。要不要先拍其中两三个人？</div>`, vdInput('Seedance 2.0 · 10 秒 · 16:9', { question: aQuestion('这段怎么拍？', [['先拍 3 个人', '其余三人下一段再拍，脸更稳', false], ['六个人都上', '照原样写，可能有人脸串', false]]) })), '只在超出官方建议数时问**一次**；硬上限（2.0：图 9 · 视频 3 · 音频 3）直接挡住并说明，不问。'),
]

const VD_PHONE = `<div style="display:flex;gap:18px;align-items:flex-start"><div style="width:300px;flex:none;border-radius:22px;border:1px solid #d4d4d4;background:#e9e9e6;padding:8px;display:flex;flex-direction:column;gap:6px"><div style="height:34px;border-radius:999px;background:#fff;display:flex;align-items:center;padding:0 6px;font-size:12px;font-weight:600"><span style="width:26px"></span><span style="flex:1;text-align:center">▶ 视频 ▾</span>${cvAvatar(24)}</div>${VD.col([VD.rail([VD.tile('图片1', VD.img1, '首帧'), VD.tile('视频1', VD.vid)], ['全能参考', '挂了参考素材']), `${VD.label('提示词')}${VD.box('全局设定：……<br>镜头1（0-2秒）……', 60)}`, VD.pills('▤ 模板', '▭ 剧本'), VD.row('Seedance 2.0 · fal'), VD.gen].join(''))}</div><div style="flex:1;font-size:12.5px;line-height:1.7;color:#404040">手机：左栏按同一顺序竖排。素材轨横向滚动，格子点击区至少 44 × 44；点一格弹出底部菜单（设为首帧 / 设为尾帧 / 作为参考 / 移除），⛔ 不用长按。助手面板和图片档是同一个。</div></div>`

// ② 思维导图：卡片（35 卡片总线）为什么长这样、每块从哪来（owner 09-25：不知道为什么有情绪，是不是照酒馆设计的）。
const CARDS_MAP = {
  file: 'DesignCardsMap.dc.html',
  title: '卡片 · ② 思维导图',
  eyebrow: 'PixelVault · 6 在设计 · 卡片（35 卡片总线）· ② 思维导图 · 2026-09-25',
  heading: '卡片：每块从哪来、为什么有',
  sub: '回答两个问题：**卡片不是照酒馆设计的**——卡的主体（参考图、用途、音色、变体）是我们自己为「生成一致的画面 / 视频 / 配音」做的；酒馆只在 09-19 你点名参考后，借了文字那一侧的三件。**情绪**来自 09-19 你提的「AI 按角色的语气 / 情感回复」，加上配音间本来就有的 9 档；它只服务台词稿和配音，而语音 09-17 已定后置，所以我建议把它从 35 拿掉。绿 = 已定 / 已落，紫 = 我的建议，黄虚线 = 等你定，灰虚线 = 依赖别的条目。',
  blocks: [
    {
      t: 'treeLegend',
      items: [
        ['已定', 'owner 拍过'],
        ['已落', '代码已有'],
        ['建议', '我的建议，等你点头'],
        ['待定', '等你定'],
        ['依赖', '等别的条目'],
      ],
    },
    {
      t: 'tree',
      root: '卡片：同一个角色在哪都长一个样、说一个声音',
      branches: [
        {
          no: '1',
          title: '卡片是干嘛的',
          kids: [
            n('已定', '可复用的命名实体：同一个角色在图片 / 视频 / 画布 / 配音里保持一致（v2，09-17）'),
            n('已定', '和酒馆不是一类东西：酒馆的卡给「陪聊」用，是一张可交换的 PNG；我们的卡给「生成」用，活在自己的库里，有 id、变体、生成记录'),
          ],
        },
        {
          no: '2',
          title: '每块从哪来',
          kids: [
            g('我们自己的（主体，v2 已落）', [
              n('已落', '参考图 + 11 类用途（身份 / 姿势 / 画风 / 构图 / 背景 / 脸部特写 / 服装 / 道具 / 首帧 / 尾帧 / 自定义）'),
              n('已落', '音色绑定（voiceCard）· 变体树 · 版本号 · 来源记录'),
            ]),
            g('你 09-19 提的两条需求（驱动了文字那一侧）', [
              n('已定', '卡片给 LLM：AI 按角色的语气 / 情感回复'),
              n('已定', '卡片给助手：写剧本时看得到角色详情和角色之间的关系'),
              n('已定', '参考酒馆补齐这一侧（你点名 sillytaverncn / launcher）'),
            ]),
            g('从酒馆借的（只有文字侧三件）', [
              n('已定', '示例对白 examples：酒馆全套字段里唯一真正传达「说话口吻」的一项'),
              n('已定', '设定条目 lore 最小版：提到关键词才注入，不提就不占提示词'),
              n('已定', '多角色按参考槽分开，不把文字拼在一起（酒馆「串味」的教训）'),
            ]),
            g('明确不借', [
              n('已定', 'PNG 自包含与导入导出 · 28 类情绪事后分类 · 设定条目的正则 / 递归 / 概率 · 酒馆的用户人设 Persona'),
            ]),
          ],
        },
        {
          no: '3',
          title: '情绪为什么会出现',
          kids: [
            n('已定', '起点：你 09-19 的「按角色的语气 / 情感回复」；配音间本来就有 9 档（平静 · 兴奋 · 耳语 · 旁白 · 对话 · 愤怒 · 悲伤 · 惊讶 · 无）'),
            n('已定', '契约写了「14 值表演情绪」，用在三处：台词稿的情绪标 · 配音情绪 · 表情参考图的槽名'),
            n('建议', '这三处都属于写台词 / 配音，而语音 09-17 已定整体后置 → 从 35 拿掉情绪，等做台词 / 配音那一片再定，到时直接用配音现有 9 档起步'),
          ],
        },
        {
          no: '4',
          title: '35 卡片总线本来要做什么',
          sub: '只做数据、编译和画布 op；界面归 D6',
          kids: [
            n('已定', '只认角色卡一张表；画布侧栏、@ 名单改读它'),
            n('已定', 'handle：@名字 的稳定锚点；角色和背景共用一个 @ 命名空间'),
            n('已定', '一条参考槽列表合并现在的四份图列表，每张图带用途'),
            n('已定', 'summary 给人看、不进提示词；description 只写外观，开始进编译'),
            n('已定', '编译只有一个入口，图片 / 视频 / 画布各自压平；画布加 attach_card / detach_card'),
            n('已定', '迁移三次部署：先加列双写 → 切读 → 删旧列（删之前建 Neon 快照）'),
            n('已定', '文字侧：示例对白按场景分块 · 设定条目 · 关系结构化存、对方出场才注入'),
            n('依赖', '装填按钮、关系编辑、简介 / 设定条目编辑的界面 → D6 设计门'),
          ],
        },
        {
          no: '5',
          title: '已定（09-25）',
          kids: [
            n('已定', '09-25：情绪从 35 拿掉，推到台词 / 配音那一片'),
            n('已定', '09-25：文字侧三件（示例对白 · 设定条目 · 关系）也推后；35 只做「画面一致」那一半，按 9 片施工'),
          ],
        },
      ],
    },
  ],
}

// ② 思维导图：助手的「记住」收成一份（owner 09-25 ① 四问全选最简）。
const MEMORY_MAP = {
  file: 'DesignMemoryMap.dc.html',
  title: '记忆 · ② 思维导图',
  eyebrow: 'PixelVault · 6 在设计 · 记忆 · ② 思维导图 · 2026-09-25',
  heading: '记忆：一个账户一份，助手自动记，你能看能删',
  sub: 'owner 09-25 ① 四问全选最简：一个账户一份 · 助手自动记、你能看能删 · 规矩和偏好合成一份清单 · 上下文卡整体去掉。起因：同一个账户下有三套互相独立的「记住」（长期记忆 · 项目规则 · 上下文卡），现在三套都几乎是空的（0 · 0 · 4 张测试卡），用户分不清。绿 = 已定 / 已落，紫 = 我的建议，黄虚线 = 等你定。',
  blocks: [
    {
      t: 'treeLegend',
      items: [
        ['已定', 'owner 拍过'],
        ['已落', '代码已有'],
        ['建议', '我的建议，等你点头'],
        ['待定', '等你定'],
      ],
    },
    {
      t: 'tree',
      root: '记忆：助手记住的东西只有一处',
      branches: [
        {
          no: '1',
          title: '现在为什么乱',
          kids: [
            n('已落', '长期记忆：助手每轮结束自己提炼；按 图片 / 视频 / 画布 / LoRA / 全局 五格分，每格上限 200；设置页能看能删 —— 现有 0 条'),
            n('已落', '项目规则：你写或助手记的规矩，含搜图来源白 / 黑名单；名叫「项目」其实按账户 —— 现有 0 条'),
            n('已落', '上下文卡：有名字的一整份设定（角色 / 画风 / 品牌），@ 点名或常挂到工作台；助手提议、你点头 —— 现有 4 张测试「男主角」'),
            n('已定', '全部按账户分；不同账户之间不共享'),
          ],
        },
        {
          no: '2',
          title: '收成一份',
          sub: '对标 Claude / ChatGPT 的记忆',
          kids: [
            n('已定', '一个账户一份清单，所有工作台共用'),
            n('已定', '助手自动记，你能看、能改、能删；规矩和偏好在同一份清单里'),
            n('建议', '单条可以标范围（全局 / 只在图片 / 视频 / 画布 / LoRA），默认全局；不再按工作台分五格'),
            n('建议', '你亲手写的条目优先于助手记的；冲突时以你的为准'),
            n('建议', '总上限 200 条，超了先淘汰最久没用到的助手条目，⛔ 不淘汰你写的'),
            n('建议', '设置里一个开关「让助手记住」，关了就只读不写；「隐身 · 这一轮不记」照旧'),
          ],
        },
        {
          no: '3',
          title: '在对话里怎么看得到',
          kids: [
            n('建议', '记了什么就在回复末尾一行小字「已记住：……」，点开能撤销；⛔ 不弹「要记住吗」卡'),
            n('建议', '用到了哪条记忆不单独提示（对标 Claude：默默用）；你问「你记得我什么」时列给你看'),
          ],
        },
        {
          no: '4',
          title: '去掉的',
          kids: [
            n('已定', '上下文卡整体去掉：角色走角色卡；画风 / 品牌就是记忆里的一条文字；4 张测试卡删掉'),
            n('建议', '连带去掉：@ 面板里的上下文卡、「常挂」、「记住这张卡？」提议卡、设置里的上下文卡管理；画布侧栏的角色名单改读角色卡（35 第 ⑨ 片）'),
            n('建议', '项目规则并进记忆（它就是「你写的条目」）；设置里「项目规则」页签并进「记忆」'),
          ],
        },
        {
          no: '5',
          title: '已定（09-25）',
          kids: [
            n('已定', '09-25：搜图来源白 / 黑名单保留结构化（程序强制筛），挪到设置 › 助手；其余建议全过，④ 画板在下一张'),
          ],
        },
      ],
    },
  ],
}

// ④ 画板：记忆收成一份（09-25 ① 四问 + ② 建议全过；来源名单保留结构化）。
const MM = {
  card: `border:1px solid #e5e5e5;border-radius:14px;background:#fff;padding:14px;display:flex;flex-direction:column;gap:10px`,
  label: `font-size:11px;color:${MUTED}`,
  h: 'font-size:13px;font-weight:600',
  row: 'display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-top:1px solid #f0f0f0;font-size:12.5px;line-height:1.55',
  meta: `margin-left:auto;flex:none;font-size:11px;color:${MUTED};white-space:nowrap`,
  tag: 'flex:none;font-size:10.5px;line-height:1;padding:3px 6px;border-radius:6px;background:#f2f2f0;color:#525252',
  chip: (on) => `height:26px;padding:0 10px;border-radius:999px;border:1px solid ${on ? '#0a0a0a' : '#e5e5e5'};background:${on ? '#0a0a0a' : '#fff'};color:${on ? '#fff' : '#404040'};display:inline-flex;align-items:center;font-size:11.5px`,
  input: (ph) => `<div style="height:32px;border-radius:9px;border:1px solid #e5e5e5;background:#fafafa;display:flex;align-items:center;padding:0 10px;font-size:12px;color:#a3a3a3">${ph}</div>`,
  sw: (on) => `<span style="flex:none;width:30px;height:18px;border-radius:999px;background:${on ? '#0a0a0a' : '#d4d4d4'};position:relative;display:inline-block"><span style="position:absolute;top:2px;${on ? 'right:2px' : 'left:2px'};width:14px;height:14px;border-radius:999px;background:#fff"></span></span>`,
  cap: 'font-size:11.5px;line-height:1.6;color:#525252',
}
const mmHead = (on = true, compact = false) =>
  `<div style="display:flex;align-items:center;gap:8px"><span style="${MM.h};white-space:nowrap">记忆</span>${compact ? '' : `<span style="${MM.label}">一个账户一份 · 所有工作台共用</span>`}<span style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11.5px;color:#404040;white-space:nowrap">让助手记住 ${MM.sw(on)}</span></div>`
const mmRow = (text, who, scope, time) =>
  `<div style="${MM.row}"><span style="flex:1">${text}</span>${scope ? `<span style="${MM.tag}">${scope}</span>` : ''}<span style="${MM.meta}">${who ? `${who} · ` : ''}${time}</span></div>`
const MM_ROWS = [
  ['搜图时优先 danbooru 的现行标签', '你写的', '', '09-25'],
  ['角色图默认用 NAI V5 Full', '你写的', '只在图片', '09-24'],
  ['喜欢日系赛璐璐、线条干净', '助手记', '', '09-23'],
  ['视频默认 9:16、5 秒', '助手记', '只在视频', '09-22'],
]
const mmSources = `<div style="${MM.card}"><div style="display:flex;align-items:center;gap:8px"><span style="${MM.h}">搜图来源</span><span style="${MM.label}">程序强制执行，不靠助手自觉</span></div><div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="width:84px;${MM.label}">只从这些站找</span><span style="${MM.chip(false)}">danbooru.donmai.us ×</span><span style="${MM.chip(false)};color:${MUTED}">＋ 添加</span></div><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="width:84px;${MM.label}">不从这些站找</span><span style="${MM.chip(false)};color:${MUTED}">＋ 添加</span></div></div></div>`
const mmPage = (memory) =>
  `<div style="display:flex;flex-direction:column;gap:10px"><div style="${MM.label}">设置 › 助手</div><div style="display:flex;align-items:center;gap:6px"><span style="${MM.label}">人设</span><span style="${MM.chip(false)}">简洁</span><span style="${MM.chip(true)}">标准</span><span style="${MM.chip(false)}">详尽</span></div>${memory}${mmSources}</div>`
const MM_DIR_A = mmPage(`<div style="${MM.card}">${mmHead()}${MM.input('写一条，例：以后都用中文回复')}<div style="display:flex;gap:6px"><span style="${MM.chip(true)}">全部</span><span style="${MM.chip(false)}">你写的</span><span style="${MM.chip(false)}">助手记的</span><span style="margin-left:auto;font-size:11.5px;color:${MUTED}">全部清空</span></div><div>${MM_ROWS.map((r) => mmRow(...r)).join('')}</div></div>`)
const MM_DIR_B = mmPage(`<div style="${MM.card}">${mmHead()}<div style="${MM.label}">你写的 · 2 条（优先）</div>${MM.input('写一条，例：以后都用中文回复')}<div>${MM_ROWS.slice(0, 2).map((r) => mmRow(r[0], '', r[2], r[3])).join('')}</div><div style="display:flex;align-items:center;margin-top:4px"><span style="${MM.label}">助手记的 · 2 条</span><span style="margin-left:auto;font-size:11.5px;color:${MUTED}">全部清空</span></div><div>${MM_ROWS.slice(2).map((r) => mmRow(r[0], '', r[2], r[3])).join('')}</div></div>`)
const MM_DIR_C = mmPage(`<div style="${MM.card}">${mmHead()}<div style="${MM.label}">你写的（每行一条，优先）</div><div style="border-radius:9px;border:1px solid #e5e5e5;background:#fafafa;padding:8px 10px;font-size:12px;line-height:1.7;color:#0a0a0a">搜图时优先 danbooru 的现行标签<br>[图片] 角色图默认用 NAI V5 Full<br><span style="color:#a3a3a3">…</span></div><div style="display:flex;align-items:center;margin-top:4px"><span style="${MM.label}">助手记的 · 2 条</span><span style="margin-left:auto;font-size:11.5px;color:${MUTED}">全部清空</span></div><div>${MM_ROWS.slice(2).map((r) => mmRow(r[0], '', r[2], r[3])).join('')}</div></div>`)
const mmDir = (no, name, body, rule) =>
  `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">${no} ${name}</div><div style="${MOCK.frame}">${body}</div><div style="${MOCK.cap}">${rule}</div></div>`
const MM_DIRECTIONS = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${[
  mmDir('M-A', '平铺一列', MM_DIR_A, '现在那张列表原样长大：顶部一个输入框写新条目，筛选 chip 换成「全部 · 你写的 · 助手记的」，行尾写来源和时间，范围不是全局时才出一个小标。点文字就地改，悬停出「删」。'),
  mmDir('M-B', '分两组', MM_DIR_B, '「你写的」在上、带输入框；「助手记的」在下、带数量和全部清空。优先级靠位置表达，行上不再写来源。'),
  mmDir('M-C', '你写的是一段话', MM_DIR_C, '「你写的」是一个多行文本框，每行一条，范围写成行首 [图片]（同 ChatGPT 自定义指令）；「助手记的」仍是列表。'),
].join('')}</div>`
const mmChat = (no, name, body, rule) =>
  `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">${no} ${name}</div><div style="${MOCK.frame};background:#fff">${body}</div><div style="${MOCK.cap}">${rule}</div></div>`
const mmReply = (text) => `<div style="font-size:12px;line-height:1.6">${text}</div>`
const mmNote = (text) => `<div style="font-size:11px;color:${MUTED}">${text}</div>`
const MM_CHAT = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${[
  mmChat('C1', '助手记了一条', `<div style="${MOCK.bubble}">我一直都喜欢赛璐璐那种干净的线条</div>${mmReply('收到。这张按赛璐璐来：平涂两级阴影、线条干净，已写进提示词。')}${mmNote('已记住：喜欢日系赛璐璐、线条干净 · <u>撤销</u>')}`, '回复末尾一行小字，点「撤销」就删掉这一条。⛔ 不弹「要记住吗」卡。'),
  mmChat('C2', '撤销之后', `${mmReply('收到。这张按赛璐璐来……')}${mmNote('已撤销，不记这一条')}`, '原位换成一句灰字，⛔ 不弹 toast。'),
  mmChat('C3', '你说「记住」', `<div style="${MOCK.bubble}">记住：视频默认 9:16、5 秒</div>${mmReply('好，以后视频默认 9:16、5 秒。')}${mmNote('已记住（你写的，只在视频）：视频默认 9:16、5 秒 · <u>撤销</u>')}`, '你亲口说的记成「你写的」，优先级高于助手自己记的；助手判断出范围时标上「只在视频」。'),
  mmChat('C4', '开关关着', `<div style="${MOCK.bubble}">我一直都喜欢赛璐璐那种干净的线条</div>${mmReply('收到。这张按赛璐璐来……')}`, '不记，也不出那一行；已有的记忆照样用。'),
  mmChat('C5', '隐身 · 这一轮不记', `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:${MUTED}">◌ 隐身</div><div style="${MOCK.bubble}">我一直都喜欢赛璐璐那种干净的线条</div>${mmReply('收到。这张按赛璐璐来……')}`, '沿用现在 ⋯ 菜单里的隐身；这一轮什么都不记。'),
  mmChat('C6', '你问「你记得我什么」', `<div style="${MOCK.bubble}">你记得我什么？</div>${mmReply('我记着 4 条：搜图优先 danbooru 现行标签 · 角色图默认 NAI V5 Full（图片）· 喜欢日系赛璐璐 · 视频默认 9:16、5 秒（视频）。')}${mmNote('<u>去设置里管理</u>')}`, '平时用到哪条不提示（对标 Claude：默默用）；问了就列出来，给一个去设置的链接。'),
].join('')}</div>`
const mmState = (no, name, body, rule) =>
  `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">${no} ${name}</div>${body}<div style="${MOCK.cap}">${rule}</div></div>`
const MM_STATES = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${[
  mmState('S1', '空态', `<div style="${MM.card}">${mmHead()}<div style="border:1px dashed #d4d4d4;border-radius:12px;background:#f7f7f5;padding:18px;display:flex;flex-direction:column;align-items:center;gap:6px"><div style="font-size:14px;font-weight:600">还没有记忆</div><div style="${MM.cap}">助手会在对话里记下你的偏好；你也可以自己写一条。</div><span style="${MM.chip(true)}">写一条</span></div></div>`, '沿用全站空态原语（一句话 + 黑丸主动作）；主动作从「这一轮不记」改成「写一条」。'),
  mmState('S2', '就地改', `<div style="${MM.card}">${mmHead()}<div style="${MM.row}"><span style="flex:1;border:1px solid #0a0a0a;border-radius:6px;padding:2px 6px">角色图默认用 NAI V5 Full</span><span style="${MM.tag}">只在图片 ▾</span></div><div style="${MM.cap}">回车保存 · Esc 取消 · 范围在行尾下拉里改</div></div>`, '点文字变输入框；范围标是个下拉（全局 / 图片 / 视频 / 画布 / LoRA）。助手记的条目被你改过，就变成「你写的」。'),
  mmState('S3', '开关关着', `<div style="${MM.card}">${mmHead(false)}<div style="${MM.cap}">已暂停记录 —— 助手不再新记，已有的 4 条照样用。</div><div style="opacity:.55">${MM_ROWS.slice(0, 2).map((r) => mmRow(...r)).join('')}</div></div>`, '列表还在、仍可改删；只是不再新增。'),
  mmState('S4', '全部清空', `<div style="${MM.card};box-shadow:0 12px 30px rgba(0,0,0,.12)"><div style="${MM.h}">清空助手记的 2 条？</div><div style="${MM.cap}">你写的 2 条会留下。清空后不能恢复。</div><div style="display:flex;gap:6px;justify-content:flex-end"><span style="${MM.chip(false)}">取消</span><span style="${MM.chip(false)};border-color:#b3261e;color:#b3261e">清空</span></div></div>`, '沿用现在的二次确认；⭐ 只清助手记的，你写的留下。'),
  mmState('S5', '满了', `<div style="${MM.card}">${mmHead()}<div style="${MM.cap}">已有 200 条。之后助手每记一条新的，会替掉最久没用到的一条助手记忆；你写的不会被替掉。</div></div>`, '一行说明，只在满了时出现；⛔ 不做容量条。'),
  mmState('S6', '助手设置弹窗', `<div style="${MM.card}"><div style="${MM.h}">助手设置</div><div style="display:flex;gap:6px"><span style="${MM.chip(true)}">人设</span><span style="${MM.chip(false)};text-decoration:line-through;color:${MUTED}">项目规则</span><span style="${MM.chip(false)};text-decoration:line-through;color:${MUTED}">上下文卡</span></div><div style="${MM.cap}">只剩人设；底部一行「记忆与来源在 设置 › 助手」。</div></div>`, '项目规则并进记忆、来源名单挪去设置页、上下文卡去掉，弹窗只剩人设一页、不再有页签。'),
].join('')}</div>`
const MM_PHONE = `<div style="display:flex;gap:18px;align-items:flex-start"><div style="width:300px;flex:none;border-radius:22px;border:1px solid #d4d4d4;background:#f4f4f1;padding:10px;display:flex;flex-direction:column;gap:8px"><div style="${MM.card}">${mmHead(true, true)}${MM.input('写一条…')}<div>${MM_ROWS.slice(0, 3).map((r) => `<div style="${MM.row};min-height:44px"><span style="flex:1">${r[0]}</span><span style="flex:none;font-size:13px;color:${MUTED}">⋯</span></div>`).join('')}</div></div>${mmSources}</div><div style="flex:1;font-size:12.5px;line-height:1.7;color:#404040">手机：同一页竖排。每行最小 44 高，行尾一颗 ⋯（改 · 改范围 · 删），⛔ 不靠悬停；来源和时间收进 ⋯ 里。来源名单的 chip 点击区 ≥ 44；「＋ 添加」弹底部抽屉输入域名。对话里那一行「已记住 · 撤销」与桌面相同，「撤销」点击区 ≥ 44。</div></div>`
const MEMORY_UI = {
  file: 'DesignMemoryUi.dc.html',
  title: '记忆 · ④ 全状态',
  eyebrow: 'PixelVault · 6 在设计 · 记忆 · ④ 画板 · 2026-09-25',
  heading: '记忆：一份清单，你写的优先',
  sub: '✅ owner 09-25 选 **M-A 平铺一列**。owner 09-25：① 四问全选最简 + ② 建议全过；搜图来源白 / 黑名单**保留结构化**（程序强制执行）。新画面只有两处：**设置 › 助手的记忆区块**与**对话里「已记住」那一行**；助手设置弹窗减到只剩人设。三个方向只差在记忆区块怎么排，其余状态、手机、动效三个方向共用。',
  blocks: [
    h('① 记忆区块：三个方向'),
    { t: 'mock', html: MM_DIRECTIONS, md: '三个方向（画板上是界面稿）：\n\n- **M-A 平铺一列**：现有列表长大；顶部输入框写新条目；筛选「全部 · 你写的 · 助手记的」；行尾写来源 + 时间，范围不是全局才出小标；点文字就地改，悬停出删。\n- **M-B 分两组**：「你写的」在上带输入框，「助手记的」在下带数量和全部清空；行上不写来源。\n- **M-C 你写的是一段话**：「你写的」是多行文本框，每行一条，范围写成行首 [图片]；「助手记的」仍是列表。\n\n三个方向共用：顶部「让助手记住」开关；下面一块「搜图来源」（只从这些站找 / 不从这些站找，chip + 添加），程序强制执行。' },
    h('② 对话里'),
    { t: 'mock', html: MM_CHAT, md: '6 态：C1 助手记了一条（回复末尾一行「已记住：… · 撤销」）· C2 撤销后原位一句灰字 · C3 你说「记住」→ 记成「你写的」并标范围 · C4 开关关着 → 不记也不出那一行 · C5 隐身这一轮 → 什么都不记 · C6 你问「你记得我什么」→ 列出来 + 去设置管理。平时用到哪条不提示。' },
    h('③ 设置页状态'),
    { t: 'mock', html: MM_STATES, md: '6 态：S1 空态（空态原语，主动作「写一条」）· S2 就地改（范围在行尾下拉；助手记的被你改过就算你写的）· S3 开关关着（暂停新增，已有照用）· S4 全部清空（只清助手记的）· S5 满 200 一行说明（只替掉最久没用的助手条目）· S6 助手设置弹窗只剩人设。' },
    h('手机'),
    { t: 'mock', html: `<div style="margin-top:12px">${MM_PHONE}</div>`, md: '手机：同一页竖排；行最小 44 高、行尾 ⋯ 菜单（改 · 改范围 · 删），不靠悬停；来源 chip ≥ 44，添加走底部抽屉。' },
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['「已记住」那一行出现', '`--duration-base` 200ms · `ease-standard`', '正文写完后 opacity 0→1', '不跟着流式逐字、不闪高亮'],
        ['撤销 → 已撤销', '`--duration-fast` 120ms', '文字交叉淡换', '不弹 toast'],
        ['写一条 → 进列表', '列表项进入：opacity 0→1 + y 8→0', '新行出现在所属位置', '不整表重排动画'],
        ['删一条', '`AnimatePresence` exit：opacity→0 + scale .98，`--duration-fast`', '只动被删那一行', '下面的行不做位移动画'],
        ['就地改', '—', '文字与输入框直接切换', '不做展开动画'],
        ['开关', 'switch 自带', '圆点平移', '列表不做淡出，只降到 55% 不透明'],
        ['`prefers-reduced-motion`', '—', '以上直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// ④ 画板：助手对话框（owner 09-25：助手回复用对话框框住，直到我发言；我的发言也用对话框）。
const BB = {
  panel: 'box-sizing:border-box;width:100%;border:1px solid #d4d4d4;border-radius:14px;background:#fff;padding:12px;display:flex;flex-direction:column;gap:10px',
  av: 'flex:none;width:20px;height:20px;border-radius:999px;background:linear-gradient(135deg,#e9b7c9,#9aa0a8)',
  name: 'font-size:12px;font-weight:600',
  text: 'font-size:12px;line-height:1.6;color:#0a0a0a',
  sub: `font-size:11px;line-height:1.5;color:${MUTED}`,
  step: `font-size:11px;color:${MUTED}`,
  inner: 'border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px',
  btn: 'height:26px;padding:0 12px;border-radius:8px;background:#0a0a0a;color:#fff;display:inline-flex;align-items:center;font-size:11.5px',
  ghost: 'height:26px;padding:0 12px;border-radius:8px;border:1px solid #e5e5e5;background:#fff;display:inline-flex;align-items:center;font-size:11.5px',
  thumb: 'width:52px;height:52px;border-radius:8px;background:linear-gradient(160deg,#d8c9b6,#7d8591)',
}
// 三个方向只差三样：助手那一框的材质、头像放哪、你的那一句什么色。
const BB_DIRS = {
  A: {
    turn: 'border:1px solid #e5e5e5;border-radius:16px;background:#fff;padding:10px 12px',
    user: 'align-self:flex-end;max-width:80%;background:#f0f0ee;border-radius:14px;padding:7px 11px;font-size:12px;line-height:1.5',
    inner: 'background:#f7f7f5',
    avatarOutside: false,
  },
  B: {
    turn: 'border-radius:16px;background:#f4f4f1;padding:10px 12px',
    user: 'align-self:flex-end;max-width:80%;background:#0a0a0a;color:#fff;border-radius:14px;padding:7px 11px;font-size:12px;line-height:1.5',
    inner: 'background:#fff',
    avatarOutside: false,
  },
  C: {
    turn: 'border-radius:4px 16px 16px 16px;background:#f4f4f1;padding:9px 11px',
    user: 'align-self:flex-end;max-width:80%;background:#f3f1ea;border-radius:16px 4px 16px 16px;padding:7px 11px;font-size:12px;line-height:1.5',
    inner: 'background:#fff',
    avatarOutside: true,
  },
}
const bbUser = (d, text) => `<div style="${BB_DIRS[d].user}">${text}</div>`
const bbTurn = (d, body) => {
  const dir = BB_DIRS[d]
  if (dir.avatarOutside) {
    return `<div style="display:flex;flex-direction:column;gap:4px;max-width:92%"><div style="display:flex;align-items:center;gap:6px"><span style="${BB.av}"></span><span style="${BB.name}">达妮娅</span></div><div style="${dir.turn};display:flex;flex-direction:column;gap:7px">${body}</div></div>`
  }
  return `<div style="${dir.turn};display:flex;flex-direction:column;gap:7px"><div style="display:flex;align-items:center;gap:6px"><span style="${BB.av}"></span><span style="${BB.name}">达妮娅</span></div>${body}</div>`
}
const bbInner = (d, body) => `<div style="${BB.inner};${BB_DIRS[d].inner}">${body}</div>`
const bbConfirm = (d) =>
  bbInner(d, `<div style="font-size:11.5px;font-weight:600">生成 1 张 · FLUX 2 Flash · 4:3</div><div style="display:flex;gap:6px"><span style="${BB.btn}">生成</span><span style="${BB.ghost}">改一下</span></div>`)
const bbConversation = (d) =>
  `<div style="${BB.panel}">${bbUser(d, '用图片1这个角色做一张正面半身')}${bbTurn(
    d,
    `<div style="${BB.sub}">有 1 个按 Danbooru 换了写法：character sheet → reference sheet</div><div style="${BB.step}">做了 1 步 ›</div><div style="${BB.text}">正面图与近景保持一致的红眼、深蓝黑长发和眼下两颗小痣；参考与三视图版式不变。</div>${bbConfirm(d)}`,
  )}${bbUser(d, '继续')}${bbTurn(d, `<div style="${BB.text}">好，按这张生成。</div>`)}</div>`
const bbDir = (no, name, d, rule) =>
  `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">${no} ${name}</div><div style="${MOCK.frame}">${bbConversation(d)}</div><div style="${MOCK.cap}">${rule}</div></div>`
const BB_DIRECTIONS = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${[
  bbDir('B-A', '描边整卡', 'A', '助手一轮 = 一张细描边白卡，头像名字是卡里第一行；你的话是现在的浅灰气泡。卡里的确认卡、结果卡去掉自己的边框，改成浅灰底块。'),
  bbDir('B-B', '填色整卡', 'B', '助手一轮 = 一块浅灰底卡，无边框；你的话换成黑底白字气泡。两方靠底色一深一浅区分，卡里的确认卡、结果卡是白底块。'),
  bbDir('B-C', '聊天软件式', 'C', '头像名字在框外左上，框的左上角收成小圆角，像聊天软件的「尖」；你的话是右侧象牙气泡（输入条同一种料），右上角收成小圆角。框宽最多占面板 92%。'),
].join('')}</div>`
const bbState = (no, name, body, rule) =>
  `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:600">${no} ${name}</div><div style="${MOCK.frame}"><div style="${BB.panel}">${body}</div></div><div style="${MOCK.cap}">${rule}</div></div>`
const BB_STATES = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${[
  bbState('T1', '刚发出去', `${bbUser('A', '换成雨夜街头')}${bbTurn('A', `<div style="font-size:14px;letter-spacing:2px;color:${MUTED}">• • •</div>`)}`, '发送即出框：头像 + 三点占位，框高就是一行正文高，第一个字到时不跳。'),
  bbState('T2', '一轮里做了很多事', `${bbUser('A', '查一下这个角色的标签再出图')}${bbTurn('A', `<div style="${BB.step}">查了 3 个来源 ›</div><div style="${BB.text}">按 danbooru 现行标签写好了。</div>${bbConfirm('A')}<div style="display:flex;gap:6px"><span style="${BB.thumb}"></span><span style="${BB.thumb}"></span></div><div style="${BB.text}">出好了，正面脸对上了吗？</div>`)}`, '查、说、确认、出图、再说——只要你没开口，全在同一个框里往下长；自动续跑的几轮也不另起框。'),
  bbState('T3', '助手问你', `${bbTurn('A', `<div style="${BB.text}">背景要哪种？</div>`)}<div style="border:1px solid #e5e5e5;border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:6px"><div style="font-size:11.5px;font-weight:600">背景</div><div style="display:flex;gap:6px"><span style="${BB.ghost}">雨夜街头</span><span style="${BB.ghost}">纯色</span></div></div>`, '问题仍钉在输入框上方、不进框。你点了选项 = 你发言：它落成你的一个气泡「雨夜街头」，助手接着开新框。'),
  bbState('T4', '出错', `${bbUser('A', '出图')}${bbTurn('A', `<div style="${BB.text}">这次没出成：服务商超时。</div><div style="display:flex;gap:6px"><span style="${BB.ghost}">重试</span></div>`)}`, '错误说在框里、用正文色，⛔ 不整框变红；重试按钮跟在后面。'),
  bbState('T5', '历史', `<div style="${BB.sub};text-align:center">9月24日 · 更早的 37 条</div>${bbUser('A', '好的')}${bbTurn('A', `<div style="${BB.text}">已写入提示词。</div>`)}`, '载回来的历史用同一套框，⛔ 不换形状。'),
  bbState('T6', '空态', `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 0"><span style="${BB.av};width:28px;height:28px"></span><div style="${BB.text}">描述画面，或把参考图挂进来</div></div>`, '空态没有框，沿用现在的头像 + 一句话。'),
].join('')}</div>`
const BB_PHONE = `<div style="display:flex;gap:18px;align-items:flex-start"><div style="width:300px;flex:none;border-radius:22px;border:1px solid #d4d4d4;background:#f4f4f1;padding:10px">${bbConversation('A')}</div><div style="flex:1;font-size:12.5px;line-height:1.7;color:#404040">手机：面板两侧留 16 边距，助手的框占满剩余宽度，你的气泡最多 85%。框里的按钮点击区 ≥ 44。三个方向在手机上只差材质，排布相同。</div></div>`
const BUBBLE_UI = {
  file: 'DesignAssistantBubbles.dc.html',
  title: '助手对话框 · ④ 全状态',
  eyebrow: 'PixelVault · 6 在设计 · 助手对话框 · ④ 画板 · 2026-09-25',
  heading: '助手对话框：一轮一个框，直到你开口',
  sub: '✅ owner 09-25 选 **B-C**；你的气泡原画浅蓝，违背颜色脊柱（强调色只有 --primary），owner 从四种合规配色里选了**输入条象牙**。已施工（534a2301）：`StudioOperatorTurns` 把连续助手条目收进一框，确认卡 / 结果卡 / LoRA 推荐卡去掉描边与投影。owner 09-25：助手回复用对话框框住，直到我发言；我的发言也用对话框。现在的样子：助手一轮是头像 + 名字 + 一串裸文字和卡片，你的话是右侧浅灰气泡，两轮之间只靠留白分。⭐ 规则：**你每开口一次，助手就另起一个框**，框里装本轮所有东西（查、说、确认卡、结果、续跑）。⚠ 09-24 定过「线和框层层套是乱的原因之一」，所以框里的卡片都去掉自己的边框。三个方向只差材质、头像位置和你的气泡颜色，状态、手机、动效共用。',
  blocks: [
    h('① 三个方向'),
    { t: 'mock', html: BB_DIRECTIONS, md: '三个方向：\n\n- **B-A 描边整卡**：助手一轮是一张细描边白卡，头像名字在卡内第一行；你的话保持浅灰气泡；卡内的确认卡、结果卡改成浅灰底块、不带边框。\n- **B-B 填色整卡**：助手一轮是浅灰底卡、无边框；你的话换成黑底白字气泡；卡内的卡片是白底块。\n- **B-C 聊天软件式**：头像名字在框外左上，框的左上角是小圆角；你的话是右侧象牙气泡、右上角是小圆角；框最宽占 92%。' },
    h('② 状态'),
    { t: 'mock', html: BB_STATES, md: '6 态（以 B-A 为例）：T1 刚发出去就出框、三点占位 · T2 一轮做很多事都在同一个框里、续跑不另起框 · T3 问题卡仍钉在输入框上方，点选项算你发言 · T4 出错写在框里、不整框变红 · T5 历史用同一套框 · T6 空态没有框。' },
    h('手机'),
    { t: 'mock', html: `<div style="margin-top:12px">${BB_PHONE}</div>`, md: '手机：两侧 16 边距，助手的框占满，你的气泡最多 85%，框里按钮 ≥ 44。' },
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['你发出一句', '`--duration-base` 200ms · `ease-standard`', '气泡 opacity 0→1 + y 6→0', '不从输入框飞过去'],
        ['助手的框出现', '同上，紧跟你的气泡', '框 opacity 0→1 + y 6→0，里面是三点占位', '不做缩放弹出'],
        ['框里长出新内容', '—', '框高随内容自然变高，新内容 opacity 0→1', '不给框高做动画（流式会一直抖）'],
        ['续跑的下一轮', '—', '在同一个框里接着长', '不收起再展开'],
        ['`prefers-reduced-motion`', '—', '以上直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// ── 第 7 页：卡片重设计（owner 09-26：Denia 实跑走样 → 卡片工作流本身要重想；卡片助手查图、给可生成的图）──
const GR = {
  已定: { c: '#16794c', bg: '#eef7f1', dash: false },
  已落: { c: '#16794c', bg: '#eef7f1', dash: false },
  建议: { c: '#6d28d9', bg: '#f4f0fd', dash: false },
  待定: { c: '#a04f00', bg: '#fff8ec', dash: true },
  依赖: { c: '#737373', bg: '#f5f5f5', dash: true },
}
// 关系图：节点绝对定位，SVG 连线自动从合适的边出入。
const graph = (W, H, nodes, edges) => {
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]))
  const anchor = (a, b) => {
    if (b.x >= a.x + a.w) return [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2], 'h']
    if (b.x + b.w <= a.x) return [[a.x, a.y + a.h / 2], [b.x + b.w, b.y + b.h / 2], 'h']
    if (b.y >= a.y + a.h) return [[a.x + a.w / 2, a.y + a.h], [b.x + b.w / 2, b.y], 'v']
    return [[a.x + a.w / 2, a.y], [b.x + b.w / 2, b.y + b.h], 'v']
  }
  const paths = edges
    .map((e) => {
      const [[x1, y1], [x2, y2], dir] = anchor(byId[e.from], byId[e.to])
      const d =
        dir === 'h'
          ? `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`
          : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
      const color = e.tone ?? '#a3a3a3'
      const label = e.label
        ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}" text-anchor="middle" font-size="11" fill="#525252" paint-order="stroke" stroke="#fff" stroke-width="4">${e.label}</text>`
        : ''
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" ${e.dash ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arr)"/>${label}`
    })
    .join('')
  const boxes = nodes
    .map((node) => {
      const s = GR[node.tag]
      return `<div style="position:absolute;left:${node.x}px;top:${node.y}px;width:${node.w}px;min-height:${node.h}px;box-sizing:border-box;border:1.5px ${s.dash ? 'dashed' : 'solid'} ${s.c};border-radius:12px;background:${s.bg};padding:8px 10px;display:flex;flex-direction:column;gap:3px"><div style="display:flex;align-items:center;gap:6px"><span style="font-size:10.5px;font-weight:600;color:${s.c}">${node.tag}</span><span style="font-size:12.5px;font-weight:600;color:#0a0a0a">${node.title}</span></div>${node.text ? `<div style="font-size:11.5px;line-height:1.5;color:#404040">${node.text}</div>` : ''}</div>`
    })
    .join('')
  return `<div style="position:relative;width:${W}px;height:${H}px;margin-top:12px"><svg width="${W}" height="${H}" style="position:absolute;inset:0;overflow:visible"><defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3a3a3"/></marker></defs>${paths}</svg>${boxes}</div>`
}
const graphLegend = `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px">${Object.entries({ 已定: 'owner 拍过', 已落: '代码已有', 建议: '我的建议，等你点头', 待定: '等你定', 依赖: '等别的条目' })
  .map(([tag, d]) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#404040"><span style="width:14px;height:10px;border-radius:3px;border:1.5px ${GR[tag].dash ? 'dashed' : 'solid'} ${GR[tag].c};background:${GR[tag].bg}"></span>${tag} · ${d}</span>`)
  .join('')}</div>`

const CF_NODES = [
  { id: 'purpose', tag: '已定', title: '卡片的初衷：一个角色，三处用', text: '出图 · 画布剧本 · 助手人设', x: 520, y: 0, w: 260, h: 60 },
  { id: 'lib', tag: '已定', title: '素材库挑图', text: '可跨多个文件夹挑；出图照旧进素材库', x: 0, y: 100, w: 210, h: 90 },
  { id: 'agent', tag: '已定', title: '卡片助手（第五张脸）', text: '查图存进素材库；查设定、起草设定；⛔ 自己不出图', x: 0, y: 290, w: 210, h: 100 },
  { id: 'write', tag: '已定', title: '原创：你的想法', text: '助手先给 2–3 个方向你挑，再展开；经历由你写、助手扩充补细节', x: 0, y: 460, w: 210, h: 90 },
  { id: 'distill', tag: '已定', title: '提炼', text: '自动裁出本人、去背景（编辑能力已有）；只删不加，不编细节', x: 260, y: 100, w: 210, h: 90 },
  { id: 'draft', tag: '已定', title: '起草设定', text: '原作角色查 wiki 起草（经历照资料的写法），附来源，你确认；原作与改编不区分', x: 260, y: 400, w: 210, h: 90 },
  { id: 'looks', tag: '已定', title: '外观', text: '核心 3 张：脸 · 全身 · 背面（可选）+ 一句外观；⛔ 不写画风、性格', x: 520, y: 100, w: 260, h: 110 },
  { id: 'tags', tag: '已定', title: '标签（给 NAI / LoRA）', text: '角色标签（例 denia_(wuthering_waves)）+ 外观标签 + LoRA 触发词；看不到图的模型靠它认人', x: 520, y: 238, w: 260, h: 110 },
  { id: 'setting', tag: '已定', title: '设定', text: '身份 · 性格（写行为不写形容词）· 说话方式 · 经历 · 关系 · 示例对白', x: 520, y: 400, w: 260, h: 120 },
  { id: 'audition', tag: '已定', title: '试镜', text: '用推荐模型出一张 + 自动打分（脸 · 头发 · 服装，打分服务已有）', x: 830, y: 100, w: 180, h: 100 },
  { id: 'reading', tag: '已定', title: '试读', text: '让助手用她的口吻写两句，你判断像不像', x: 830, y: 400, w: 180, h: 90 },
  { id: 'img', tag: '已落', title: '出图', text: '看得到图的模型：参考图 + 一句外观；NAI / LoRA：送标签；选卡后标明哪种；⛔ 不读设定', x: 1060, y: 60, w: 240, h: 110 },
  { id: 'persona', tag: '已定', title: '助手人设（你的初衷）', text: '头像 = 外观里裁出的脸；语气、口头禅 = 设定。建议 ⛔ 只改措辞，不进出图提示词，不改事实和价格', x: 1060, y: 240, w: 240, h: 130 },
  { id: 'script', tag: '依赖', title: '画布剧本 / 分镜', text: '只取在场角色的设定；关系只在双方都出场时带', x: 1060, y: 440, w: 240, h: 100 },
]
const CF_EDGES = [
  { from: 'purpose', to: 'looks', dash: true },
  { from: 'lib', to: 'distill' },
  { from: 'distill', to: 'looks' },
  { from: 'agent', to: 'lib', dash: true, label: '查图存进' },
  { from: 'agent', to: 'draft' },
  { from: 'agent', to: 'tags', label: '查 Danbooru 现行标签' },
  { from: 'tags', to: 'img', label: 'NAI / LoRA' },
  { from: 'write', to: 'setting' },
  { from: 'draft', to: 'setting' },
  { from: 'looks', to: 'audition' },
  { from: 'audition', to: 'img' },
  { from: 'setting', to: 'reading' },
  { from: 'reading', to: 'script' },
  { from: 'looks', to: 'persona', label: '脸 → 头像' },
  { from: 'setting', to: 'persona', label: '口吻 → 语气' },
]

const CF_LIMITS = table(
  ['模型', '一次最多收几张参考图', '卡图怎么送'],
  [
    ['GPT Image 2 / 2.5', '16', '脸 → 全身 → 背面 → 用途图'],
    ['Gemini（Nano Banana）', '14', '同上，且每张图前贴说明（⑥）'],
    ['Seedream 5.0（火山 / BytePlus 14 · fal 10）', '10–14', '同上'],
    ['Qwen Image（自有算力）', '10', '同上'],
    ['FLUX.2 Pro · Kontext Max', '8 · 4', '多角色时每人先分一张脸'],
    ['FLUX.2 Flash', '4', '同上'],
    ['FLUX LoRA 等单图模型', '1', '只送焦点角色的脸，其余进文字'],
    ['NovelAI', '1（图生图底图）', '⛔ 不送卡图，走原生多角色文字'],
    ['PixAI · Ideogram · Recraft', '0', '只进文字'],
  ],
)

const CARD_FLOW_ANSWERS = {
  file: 'DesignCardFlowAnswers.dc.html',
  title: '卡片 · ① 三个问题',
  eyebrow: 'PixelVault · 7 卡片重设计 · ① · 2026-09-26',
  heading: '什么图能用于生成、给什么图最好、一张卡放几张',
  sub: '起因：09-26 用 Denia 卡实跑 GPT Image 2，出图看不出是同一个人。编译本身是对的（身份句、图例、卡图都进了请求），问题出在卡上：身份图是整张官方宣传立绘，她本人只占中间一小块，**脸约 30 像素宽**，两侧的大脸还是她的另一形态；自动提取的描述把两种形态和「3D 渲染立绘」画风混在一起；出口也没有明确要求「照这张图保持」。所以卡片要有一个帮你**查图、挑图、整理图**的流程，而不是随手传一张。',
  blocks: [
    h('① 什么图能用于生成（硬门槛，助手自动判）'),
    { t: 'ul', items: [
      '**画面里只有这一个角色**：合照、宣传海报里有别人或别的形态，模型分不清谁是谁',
      '**主体至少占画面高度一半**，脸看得清：Denia 那张脸只有 30 像素，任何模型都只能猜',
      '**没有文字、logo、水印、游戏 UI**：会被当成角色的一部分画进去',
      '**只有一种形态、一套衣服**：另一形态 / 换装做成变体或用途图',
      '**分辨率够**：原图长边至少 1024',
    ] },
    h('② 给什么图最好（从好到能用）'),
    table(
      ['档', '图', '为什么'],
      [
        ['最好', '官方设定图 / 三视图（纯色背景，正 · 侧 · 背全身）+ 一张正面胸像', '脸、发型、服装、配色一次说全，背景不干扰'],
        ['好', '官方立绘里裁出本人（背景简单、脸够大）', '画风与官方一致'],
        ['能用', '清楚的单人游戏截图 / 同人图', '可能带同人画风，文字里不写画风来中和'],
        ['不能用', '宣传海报 · 合照 · 缩略图 · 另一形态混在一起', '就是这次 Denia 走样的原因'],
        ['没有好图时', '用强模型把现有图整理成一张定妆三视图，你确认后当主图', '花一次出图；原图太糊时也可能走样，先问你'],
      ],
    ),
    h('③ 一张卡能不能放多张图'),
    { t: 'p', text: '**能，已经支持**：15 个参考槽、每张标 11 类用途之一（身份 · 姿势 · 服装 · 武器……）。但每次出图真正送几张由模型决定（下表来自 `provider-capabilities.ts`）。所以建议卡的**核心就是 3 张**：正面胸像（脸）· 全身正面（服装）· 背面或侧面（可选）；其余当用途图按需带上。编译时先保证每个角色都有脸，再轮流补全身、背面。' },
    CF_LIMITS,
  ],
}

const CARD_FLOW_MAP = {
  file: 'DesignCardFlowMap.dc.html',
  title: '卡片 · ② 关系图',
  eyebrow: 'PixelVault · 7 卡片重设计 · ② 思维导图（连线）v3 · 2026-09-26',
  heading: '卡片：一个角色，三处用',
  sub: 'owner 09-26 v3：卡片的初衷是**一个角色，三处用**——出图、画布写剧本分镜、让助手变成她（头像 + 语气）。所以一张卡分两半：**外观**（参考图 + 一句外观 + **标签**，给出图和头像；标签给 NAI / LoRA 这类看不到图的模型）与**设定**（性格 · 说话方式 · 背景 · 关系 · 示例对白，给剧本和助手语气）。两半各有来源、各有验证（试镜 / 试读），⛔ 互不串用：设定不进出图提示词，外观之外的文字不影响画面。v2.1 的决定都保留：出图只在工作台，图都在素材库、卡可跨文件夹挑图，卡片页的精修 / AI 渲染下线。',
  blocks: [
    { t: 'mock', html: `${graphLegend}${graph(1300, 560, CF_NODES, CF_EDGES)}`, md: '关系图（画板上是连线图）：你 → 卡片助手（建议：助手第五张脸；待定：放在助手里还是卡片页向导）→ 查图（Danbooru 已接 · 官方 wiki · 你的图库 · 上传）→ 候选网格（已落）→ 质检（单人 · 主体够大 · 无文字 · 单一形态）→ 不够好则整理（自动裁出本人；没有好图时生成定妆三视图，先问你）→ 你确认用途 → 角色卡（核心 3 张：脸 · 全身 · 背面；文字只写一句图里看不出的，不写画风）→ 变体（另一形态单独一张）→ 卡片总线编译（已落 ⑤⑥，建议加保持指令）→ 图片（已落）· 视频 ⑦ · 画布 ⑨ → 好图回流进卡。待定：卡片界面 D6 在本图确认后出 ④。' },
    h('09-26 已定'),
    { t: 'ul', items: [
      '卡片 = 一个角色，三处用：出图 · 画布剧本 · 助手人设（头像 + 语气，你的初衷）',
      '卡片助手是**助手的第五张脸**，自己不出图；找不到好图时**先问再**交给图片助手出定妆三视图',
      '出图只在图片工作台 / 图片助手；图都在素材库，卡可以跨多个文件夹挑图',
      '卡片页的「精修」「AI 渲染成卡牌样式」**下线**',
      '卡有**标签**（角色标签 · 外观标签 · LoRA 触发词），给 NAI / LoRA 出图用；LoRA 只存触发词，不记对应的 LoRA',
      '③ 整图确认（09-26），进入 ④ 界面设计',
      '卡片助手写设定：原作查资料起草；原创先给 2–3 个方向再展开；经历照资料写法 / 你写助手扩充；原作与改编不区分',
      '出图加「照 Image N 保持」这句 —— 已落（本地提交）',
    ] },
  ],
}

// 画布怎么用角色（09-27 ② 思维导图）：owner 定「角色 = 画布上一张节点，点开分图片 / 文字两部分」· 左栏换成角色库。
const CC_NODES = [
  { id: 'lib', tag: '已定', title: '左栏「角色」', text: '换成角色库（与角色页同一份）；拖进来或点一下 = 用她。风格卡那半下线', x: 0, y: 0, w: 230, h: 96 },
  { id: 'at', tag: '已定', title: '节点里 @她', text: '认画布上她那张角色节点；画布上还没有就从角色库拉一张进来', x: 0, y: 122, w: 230, h: 96 },
  { id: 'script', tag: '已定', title: '剧本 @名字（24b）', text: '投影成镜头时在角色库里认；只认出一个就挂上，多个或没有由助手问一句', x: 0, y: 244, w: 230, h: 110 },
  { id: 'use', tag: '已定', title: '角色页「用她 ▾ → 放进画布」', text: '选一个项目，放一张她的角色节点进去', x: 0, y: 380, w: 230, h: 80 },
  { id: 'asst', tag: '建议', title: '画布助手放角色', text: 'attach_card：模型只写名字，服务端认成角色；认不出就问', x: 0, y: 486, w: 230, h: 90 },
  { id: 'node', tag: '已定', title: '角色节点（一个角色一张）', text: '主图 + 名字 + 作品。画布只记「是她」，出图时现读角色页最新的图和设定（已出的图不变）；建议沿用现有 image.character 节点，多一个角色 id', x: 290, y: 190, w: 250, h: 170 },
  { id: 'images', tag: '已定', title: '点开 · 图片', text: '从她的图（卡上 · 用她出的）挑一张放到画布上，成一张图片节点', x: 600, y: 60, w: 240, h: 100 },
  { id: 'text', tag: '已定', title: '点开 · 文字', text: '身份 · 性格 · 说话方式 · 经历，交给画布助手写剧本、分镜、台词；这里只读，改去角色页', x: 600, y: 330, w: 240, h: 120 },
  { id: 'gen', tag: '建议', title: '出图 / 出视频', text: '连着角色节点的镜头：服务端编卡（主图 + 标签 + 保持同一人，卡片总线画布出口 35 ⑧⑨）；挑出来的图节点当普通参考图', x: 900, y: 40, w: 250, h: 140 },
  { id: 'shots', tag: '建议', title: '剧本 · 分镜 · 台词', text: '助手只取在场角色的设定；台词照她的说话方式写；关系等双方都出场才带', x: 900, y: 330, w: 250, h: 110 },
  { id: 'video', tag: '依赖', title: '视频出口', text: '卡片总线 35 ⑦', x: 1210, y: 70, w: 150, h: 70 },
  { id: 'voice', tag: '依赖', title: '声音', text: '角色的声音接配音节点（语音整体后置）', x: 1210, y: 350, w: 150, h: 90 },
  { id: 'no', tag: '已定', title: '不做', text: '变体（旧设计，等「新衣服」一起定）· 风格卡 · 旧上下文卡里的角色（变回助手读的文字）', x: 600, y: 500, w: 340, h: 80 },
]
const CC_EDGES = [
  { from: 'lib', to: 'node' },
  { from: 'at', to: 'node' },
  { from: 'script', to: 'node' },
  { from: 'use', to: 'node' },
  { from: 'asst', to: 'node' },
  { from: 'node', to: 'images', label: '点开' },
  { from: 'node', to: 'text', label: '点开' },
  { from: 'images', to: 'gen', label: '当参考' },
  { from: 'node', to: 'gen', label: '连线' },
  { from: 'text', to: 'shots' },
  { from: 'gen', to: 'video', dash: true },
  { from: 'shots', to: 'voice', dash: true },
]
const CANVAS_CHAR_MAP = {
  file: 'DesignCanvasCharacterMap.dc.html',
  title: '画布 · ② 用角色',
  eyebrow: 'PixelVault · 7 卡片重设计 · 画布用角色 · ② 思维导图（连线）· ③ 已确认 · 2026-09-27',
  heading: '画布怎么用角色',
  sub: '现状（09-27 读码）：画布**一处都没有用到角色库**——左栏「角色·风格卡」读的是旧上下文卡，拖进来只拷一张图的地址；节点里 @ 只认画布上的节点名；剧本投影只留空位或新建一张不连角色库的角色节点；卡片总线只接了图片工作台。owner 09-27 定：**角色在画布上是一张节点，点开分两部分**——图片（挑一张她的图放到画布上）与文字（她的设定给助手写剧本、分镜、台词）；左栏换成角色库。同步与剧本投影 owner 没有偏好，按最省事的给建议。',
  blocks: [
    { t: 'mock', html: `${graphLegend}${graph(1360, 590, CC_NODES, CC_EDGES)}`, md: '关系图（画板上是连线图）：入口五个——左栏「角色」（已定，换成角色库）· 节点里 @她 · 剧本 @名字投影（24b）· 角色页「用她 ▾ → 放进画布」· 画布助手放角色（后四个是建议）→ 角色节点（已定：一个角色一张，主图 + 名字 + 作品；建议：只记「是她」、出图现读最新）→ 点开 · 图片（已定：挑一张放到画布成图片节点）→ 出图 / 出视频（建议：连着角色节点的镜头由服务端编卡，35 ⑧⑨）→ 视频出口（依赖 35 ⑦）；点开 · 文字（已定：设定给助手写剧本、分镜、台词，只读）→ 剧本 · 分镜 · 台词（建议：只取在场角色，台词照说话方式）→ 声音（依赖，语音后置）。不做：变体 · 风格卡 · 旧上下文卡里的角色。' },
    h('09-27 已定'),
    { t: 'ul', items: [
      '角色在画布上是**一张节点**，一个角色一张',
      '点开分两部分：**图片**——从她的图里挑一张放到画布上；**文字**——她的设定交给助手写剧本、分镜、台词',
      '画布左栏「角色·风格卡」**换成角色库**（与角色页同一份）',
      '不做：变体（等「给角色设计新衣服」一起定）· 风格卡',
      '节点里 @她：认画布上她那张角色节点，还没有就从角色库拉一张进来',
      '剧本 @名字投影（24b）：只认出一个就挂上，多个或没有由助手问一句',
      '角色页「用她 ▾」多一项「放进画布」',
      '画布只记「是她」：角色页改了图或设定，下次出图用最新的；已出的图不变',
      '③ 整图确认（09-27），进入 ④ 界面设计：角色节点 · 点开后的图片 / 文字两部分 · 左栏角色库',
    ] },
  ],
}

// ④ 画板：画布里的角色（owner 09-27 选原型 A「原地展开」+ 液态分段 + 收起也有动效）。
// 皮肤照真实画布：点阵底 · 卡就是图 · 名字在卡外上方一行小字 · 选中环 2px 黑 · 工具条是浮在卡上方的白色胶囊。
const CU = {
  canvas: `position:relative;border:1px solid #d4d4d4;border-radius:14px;overflow:hidden;background-color:#f1f1f1;background-image:radial-gradient(#d6d6d4 1px,transparent 1px);background-size:22px 22px`,
  name: `position:absolute;font-size:11px;color:${MUTED};white-space:nowrap`,
  card: 'position:absolute;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05),0 6px 18px rgba(0,0,0,.06)',
  sel: 'box-shadow:0 0 0 2px #0a0a0a,0 6px 18px rgba(0,0,0,.08)',
  bar: 'position:absolute;display:flex;align-items:center;gap:2px;padding:4px;border-radius:12px;background:rgba(255,255,255,.9);border:1px solid #ececec;box-shadow:0 6px 18px rgba(0,0,0,.08);font-size:12px;white-space:nowrap',
  barBtn: 'height:28px;padding:0 9px;border-radius:8px;display:flex;align-items:center;gap:5px;color:#262626',
  small: `font-size:11px;line-height:1.55;color:${MUTED}`,
  solid: 'display:inline-flex;align-items:center;height:28px;padding:0 11px;border-radius:8px;background:#0a0a0a;color:#fff;font-size:12px;white-space:nowrap',
  line: 'display:inline-flex;align-items:center;height:28px;padding:0 11px;border-radius:8px;border:1px solid #e5e5e5;background:#fff;font-size:12px;white-space:nowrap',
  panel: 'box-sizing:border-box;border:1px solid #e5e5e5;border-radius:16px;background:rgba(255,255,255,.94);box-shadow:0 10px 30px rgba(0,0,0,.08)',
  slot: 'position:absolute;font-size:10.5px;padding:1px 7px;border-radius:999px;background:#fff;border:1px solid #d4d4d4;color:#262626',
  toast: 'position:absolute;left:50%;transform:translateX(-50%);background:#0a0a0a;color:#fff;font-size:11.5px;padding:5px 12px;border-radius:999px;white-space:nowrap',
}
const TONES = ['linear-gradient(160deg,#ead7dd,#b9bcc6)', 'linear-gradient(160deg,#dcd3e8,#9aa0a8)', 'linear-gradient(160deg,#e4ddd2,#8f949c)', 'linear-gradient(160deg,#dfe3ea,#bfc6d2)']
const cuImg = (w, h, tone = 0, extra = '') => `<div style="width:${w}px;height:${h}px;background:${TONES[tone % 4]};flex:none;${extra}"></div>`
const cuCanvas = (w, h, inner) => `<div style="${CU.canvas};width:${w}px;height:${h}px;flex:none">${inner}</div>`
/** 画布上一张卡：名字在卡外上方，卡就是图。 */
const cuCard = (x, y, w, h, name, { tone = 0, sel = false, body = '' } = {}) =>
  `<span style="${CU.name};left:${x}px;top:${y - 17}px;${sel ? 'color:#0a0a0a' : ''}">${name}</span><div style="${CU.card};left:${x}px;top:${y}px;width:${w}px;${sel ? CU.sel : ''}">${body || cuImg(w, h, tone)}</div>`
const cuBar = (x, y, items) => `<div style="${CU.bar};left:${x}px;top:${y}px">${items.map((t) => `<span style="${CU.barBtn}">${t}</span>`).join('<span style="width:1px;height:16px;background:#ececec"></span>')}</div>`
/** 液态分段（与工作台写法切换同一颗 LiquidSegmented）：近黑实底 + 反色字。 */
const cuSeg = (active) => `<div style="display:flex;border:1px solid #e5e5e5;background:#f4f4f4;border-radius:999px;padding:2px">${['图片', '文字'].map((t, i) => `<span style="flex:1;text-align:center;font-size:12px;font-weight:500;padding:4px 0;border-radius:999px;${(active === 'img') === (i === 0) ? 'background:#0a0a0a;color:#fff' : 'color:#525252'}">${t}</span>`).join('')}</div>`
const cuGrid = (hover = -1) => `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${[0, 1, 2, 3, 1, 0].map((t, i) => `<div style="position:relative;aspect-ratio:4/5;border-radius:8px;overflow:hidden;background:${TONES[t]}">${i === 0 ? `<span style="position:absolute;left:4px;top:4px;font-size:9.5px;padding:0 5px;border-radius:999px;background:rgba(255,255,255,.92)">主图</span>` : ''}${i === hover ? `<span style="position:absolute;left:4px;right:4px;bottom:4px;text-align:center;font-size:10px;padding:1px 0;border-radius:999px;background:rgba(255,255,255,.94)">放到画布</span>` : ''}</div>`).join('')}</div>`
const cuFields = `<div style="display:flex;flex-direction:column;gap:8px">${[['身份', '舞台魔术师，黑海岸的旅人'], ['性格', '温柔、爱照顾人，偶尔露出一点狡黠'], ['说话方式', '句尾爱加「呢」，叫对方「指挥官」']].map(([k, v]) => `<div><div style="font-size:10.5px;color:${MUTED}">${k}</div><div style="font-size:12px;line-height:1.6">${v}</div></div>`).join('')}</div><div style="display:flex;gap:6px"><span style="${CU.solid}">让助手写剧本</span><span style="${CU.line}">写台词</span></div><div style="${CU.small}">只读 · 要改去角色页 ›</div>`
/** 选中后原地展开的角色卡（宽 300）：主图在上，分段 + 这一页的内容在下。 */
const cuOpen = (tab, hover = -1) => `${cuImg(300, 190, 0)}<div style="padding:10px 12px 12px;display:flex;flex-direction:column;gap:10px">${cuSeg(tab)}${tab === 'img' ? `${cuGrid(hover)}<div style="${CU.small}">卡上 3 张 · 用她出的 3 张 · 点一张 = 放到画布上</div>` : cuFields}</div>`
const cuCap = (no, title, body, rule) => `<div style="display:flex;flex-direction:column;gap:10px;flex:none"><div style="font-size:14px;font-weight:600">${no} ${title}</div>${body}<div style="${MOCK.cap};max-width:${Math.max(300, 0)}px">${rule}</div></div>`
const cuRow = (items) => `<div style="margin-top:14px;display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap">${items.join('')}</div>`
const cuBarRole = (x, y) => cuBar(x, y, ['↗ 在角色页打开', '⋯'])
/** 画布卡的「来源没了」：灰底一句话 + 从画布移除（角色库删了她 / 素材库删了这张图同一种长相）。 */
const cuGone = (w, h, line, sub = '') => `<div style="width:${w}px;height:${h}px;background:#f4f4f4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:0 14px;box-sizing:border-box"><div style="font-size:12px">${line}</div>${sub ? `<div style="${CU.small}">${sub}</div>` : ''}<span style="${CU.line}">从画布移除</span></div>`
/** 镜头提示词栏里的 @她：头像 + 名字 + 带几张。 */
const cuMention = (n) => `<span style="display:inline-flex;align-items:center;gap:4px;background:#f3f1ea;border-radius:999px;padding:1px 8px 1px 2px;white-space:nowrap"><span style="width:16px;height:16px;border-radius:999px;background:${TONES[0]}"></span>Denia<span style="color:${MUTED}">· ${n} 张</span></span>`
const cuPromptBar = (inner) => `<div style="position:absolute;left:24px;right:24px;bottom:18px;height:44px;border-radius:14px;background:rgba(255,255,255,.92);border:1px solid #ececec;box-shadow:0 6px 18px rgba(0,0,0,.08);display:flex;align-items:center;gap:6px;padding:0 10px;font-size:12px"><span style="color:${MUTED}">＋</span>${inner}<span style="margin-left:auto;width:26px;height:26px;border-radius:8px;background:#0a0a0a;color:#fff;display:grid;place-items:center">↑</span></div>`
/** 点 chip 弹出的勾图面板（与工作台「角色」弹层同一套：默认主图 · 按模型上限卡住）。 */
const cuPickPop = (x, y) => `<div style="${CU.panel};position:absolute;left:${x}px;bottom:${y}px;width:270px;padding:12px;display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:6px"><span style="width:18px;height:18px;border-radius:999px;background:${TONES[0]}"></span><b style="font-size:12.5px">Denia</b><span style="margin-left:auto;${CU.small}">这一镜带 2 张</span></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">${[0, 1, 2, 3, 1, 0, 2, 3].map((t, i) => `<div style="position:relative;aspect-ratio:4/5;border-radius:7px;overflow:hidden;background:${TONES[t]};${i === 0 || i === 2 ? 'box-shadow:0 0 0 2px #0a0a0a' : ''}">${i === 0 ? `<span style="position:absolute;left:3px;top:3px;font-size:9px;padding:0 4px;border-radius:999px;background:rgba(255,255,255,.92)">主图</span>` : ''}${i === 0 || i === 2 ? `<span style="position:absolute;right:3px;top:3px;width:13px;height:13px;border-radius:999px;background:#0a0a0a;color:#fff;font-size:8px;display:grid;place-items:center">✓</span>` : ''}</div>`).join('')}</div><div style="${CU.small}">这个模型一次最多收 4 张参考图 · 已用 3 张（含这一镜挂的别的图）</div></div>`

const CU_NODE = cuRow([
  cuCap('N1', '收起（平时）', cuCanvas(430, 360, `${cuCard(125, 70, 180, 225, 'Denia')}`), '卡就是她的主图，名字在卡外上方——与别的图片卡同一种长相，⛔ 没有卡头、没有作品小字（身份不上卡面）。⛔ 没有进出口、不连线：镜头要用她，在镜头的提示词里 @她（U2）。'),
  cuCap('N2', '选中 · 图片页', cuCanvas(430, 660, `${cuBarRole(128, 40)}${cuCard(64, 100, 300, 0, 'Denia', { sel: true, body: cuOpen('img', 2) })}`), '选中 = 原地变宽展开（180 → 300），⛔ 没有底部提示词面板——她不在画布上出图。工具条两键：在角色页打开 · ⋯（从画布移除）。图是卡上的在前、用她出的在后，悬停一格出「放到画布」。'),
  cuCap('N3', '选中 · 文字页', cuCanvas(430, 660, `${cuBarRole(128, 40)}${cuCard(64, 100, 300, 0, 'Denia', { sel: true, body: cuOpen('text') })}`), '她的设定只读：身份 · 性格 · 说话方式（经历长时折起）。两颗键把她的设定交给画布助手：写剧本 / 写台词。要改设定去角色页。'),
])

const CU_USE = cuRow([
  cuCap('U1', '放到画布', cuCanvas(430, 330, `${cuCard(30, 50, 180, 225, 'Denia')}${cuCard(250, 60, 150, 188, 'Denia · 图 3', { tone: 2, sel: true })}<span style="${CU.toast};bottom:14px">已放到画布 · Denia · 图 3</span>`), '点「图片」页的一张 → 她收回原尺寸，右边落一张普通图片卡「Denia · 图 3」并选中它。⛔ 不连线。这张图之后就是一张普通图片卡。'),
  cuCap('U2', '镜头里 @她', cuCanvas(430, 330, `${cuCard(40, 50, 350, 196, '镜头 3', { tone: 3, sel: true })}${cuPromptBar(`${cuMention(2)}<span>在雨里回头笑，镜头慢推</span>`)}`), '@ 列表多一组「角色」，列的是整个角色库，⛔ 不要求她在画布上、⛔ 不自动拉卡、⛔ 不连线。chip = 头像 + 名字 + 这一镜带几张；刚 @ 上时带主图 1 张。'),
  cuCap('U3', '点 chip · 勾这一镜带哪几张', cuCanvas(430, 420, `${cuCard(40, 30, 350, 150, '镜头 3', { tone: 3, sel: true })}${cuPickPop(40, 74)}${cuPromptBar(`${cuMention(2)}<span>在雨里回头笑，镜头慢推</span>`)}`), '点 chip 从 chip 放大出她的全部图（卡上的在前、用她出的在后），勾一张或几张 = 这一镜带这几张；每个镜头各记各的。到模型上限时没勾的格子勾不上并写原因——与图片工作台「角色」弹层同一套。'),
])

const cuLibRow = (name, work, n, tone, onCanvas = false, tail = '') => `<div style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:10px;${onCanvas ? 'background:#f4f4f4' : ''}">${cuImg(34, 42, tone, 'border-radius:7px')}<div style="min-width:0"><div style="font-size:12.5px;font-weight:500">${name}</div><div style="${CU.small}">${work} · ${n} 张</div></div><span style="margin-left:auto;${CU.small}">${onCanvas ? '在画布上' : tail}</span></div>`
const cuLeft = (inner) => `<div style="${CU.panel};width:296px;height:420px;display:flex;overflow:hidden;flex:none"><div style="width:56px;border-right:1px solid #f0f0f0;display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:14px">${['▦', '◉', '▢'].map((t, i) => `<span style="width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-size:13px;${i === 1 ? 'background:#0a0a0a;color:#fff' : 'color:#525252'}">${t}</span>`).join('')}</div><div style="flex:1;padding:14px 10px;display:flex;flex-direction:column;gap:8px">${inner}</div></div>`
const CU_LEFT = cuRow([
  cuCap('L1', '角色库', cuLeft(`<div style="font-size:13px;font-weight:600;padding:0 4px">角色</div><div style="height:30px;border-radius:8px;border:1px solid #e5e5e5;display:flex;align-items:center;padding:0 10px;${CU.small}">搜角色或作品</div>${cuLibRow('Denia', '鸣潮', 6, 0, true)}${cuLibRow('里希', '鸣潮', 4, 1)}${cuLibRow('爱弥斯', '鸣潮', 3, 2)}${cuLibRow('小满', '原创', 2, 3)}<div style="${CU.small};padding:4px">点一位 = 放到画布上</div>`), '「角色 / 风格卡」换成角色库，与角色页同一份、同一种排序。点一行 = 她落在视口中间并选中；已在画布上的那一行写「在画布上」，点了定位到她。⛔ 不拖。⛔ 旧上下文卡（如「男主角」）不再显示，数据不删。'),
  cuCap('L2', '空', cuLeft(`<div style="font-size:13px;font-weight:600;padding:0 4px">角色</div><div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center"><div style="font-size:12.5px">还没有角色</div><div style="${CU.small};max-width:180px">在角色页建一个，这里就会出现。</div><span style="${CU.line}">去角色页 ↗</span></div>`), '全站空态原语：一句话 + 一个去处。'),
  cuCap('L3', '点一位 → 落在视口中间', cuCanvas(430, 420, `${cuCard(125, 100, 180, 225, 'Denia', { sel: true })}`), '她落在当前视口正中并选中（收起态），视口不动。同一个画布一个角色只有一张：已经在的，点了 = 平移到她（S3）。'),
])

const CU_STATES = cuRow([
  cuCap('S1', '角色库里删了她', cuCanvas(300, 290, `${cuCard(60, 40, 180, 225, 'Denia', { body: cuGone(180, 225, '这位已从角色库删除') })}`), '画布只记「是她」，删了就读不到。@ 过她的镜头，chip 变灰写「已删除」，发之前说一句。'),
  cuCap('S2', '她还没有图', cuCanvas(300, 290, `${cuCard(60, 40, 180, 225, 'Denia', { body: `<div style="width:180px;height:225px;background:#f4f4f4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:0 16px;box-sizing:border-box"><div style="font-size:12px">还没有图</div><div style="${CU.small}">@ 她只带名字和外观描述</div><span style="${CU.line}">去角色页加图 ↗</span></div>` })}`), '卡面是灰底一句话，⛔ 不画空虚线框（那是「空卡等你上传」的意思）。'),
  cuCap('S3', '已经在画布上', cuCanvas(300, 290, `${cuCard(60, 40, 180, 225, 'Denia', { sel: true })}<span style="${CU.toast};bottom:14px">画布上已经有她了</span>`), '左栏再点 / 角色页再「放进画布」：不新建，平移到她并选中，一句 toast。'),
  cuCap('S4', '剧本投影认人', `<div style="${CU.panel};width:300px;padding:14px;display:flex;flex-direction:column;gap:10px"><div style="font-size:12px;line-height:1.6">剧本里的「Denia」在角色库里对上了 1 位，镜头说明里已写成 ${cuMention(1)}</div><div style="height:1px;background:#f0f0f0"></div><div style="font-size:12px;line-height:1.6">剧本里的「里希」对上了 2 位，用哪一位？</div><div style="display:flex;flex-direction:column;gap:6px">${cuLibRow('里希', '鸣潮', 4, 1)}${cuLibRow('里希', '原创', 2, 2)}</div><span style="${CU.line};align-self:flex-start">都不是，先不认</span></div>`, '投影时名字对上一位 = 镜头说明里直接写成 @她（带主图 1 张）；对上多位或一位都没有，由画布助手在对话里问一句（问题块，一次一题）。⛔ 不拉卡、不连线。'),
  cuCap('S5', '角色页「放进画布」', `<div style="${CU.panel};width:260px;padding:6px">${[['在图片工作台用她', ''], ['设为助手人设', ''], ['放进画布 ›', '']].map(([t], i) => `<div style="padding:8px 10px;border-radius:8px;font-size:12.5px;${i === 2 ? 'background:#f4f4f4' : ''}">${t}</div>`).join('')}<div style="height:1px;background:#f0f0f0;margin:4px 0"></div>${[['eva', '12 个节点 · 刚刚'], ['雨夜', '8 个节点 · 昨天'], ['＋ 新画布', '']].map(([t, m]) => `<div style="display:flex;padding:7px 10px;font-size:12px"><span>${t}</span><span style="margin-left:auto;${CU.small}">${m}</span></div>`).join('')}</div>`, '「用她 ▾」多一项「放进画布 ›」，二级列最近的画布；选一个 = 打开那张画布，她落在视口中间并选中。'),
  cuCap('S6', '素材库里删了这张图', cuCanvas(300, 290, `${cuCard(60, 40, 180, 225, '生成图 2', { body: cuGone(180, 225, '这张图已从素材库删除') })}`), '不只是角色：任何来自素材库的图片 / 视频 / 音频卡，源文件被删后都是这一种长相，⛔ 不显示裂图。连着它的镜头出图前说一句缺了哪张。（owner 09-27：现在是裂图，要一起修。）'),
])

const CU_PHONE = `<div style="margin-top:14px;display:flex;gap:28px;align-items:flex-start"><div style="width:300px;flex:none;border-radius:24px;border:1px solid #d4d4d4;background:#fff;padding:14px;display:flex;flex-direction:column;gap:10px"><div style="width:36px;height:4px;border-radius:999px;background:#d4d4d4;align-self:center"></div><div style="font-size:13px;font-weight:600">镜头 3</div><div style="border:1px solid #e5e5e5;border-radius:12px;padding:10px;font-size:13px;line-height:1.7">${cuMention(2)} 在雨里回头笑，镜头慢推</div></div><div style="width:300px;flex:none;border-radius:24px;border:1px solid #d4d4d4;background:#fff;padding:14px;display:flex;flex-direction:column;gap:10px"><div style="width:36px;height:4px;border-radius:999px;background:#d4d4d4;align-self:center"></div><div style="display:flex;align-items:center;gap:6px"><b style="font-size:13px">Denia</b><span style="margin-left:auto;${CU.small}">这一镜带 2 张</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${[0, 1, 2, 3, 1, 0].map((t, i) => `<div style="aspect-ratio:4/5;border-radius:8px;background:${TONES[t]};${i === 0 || i === 2 ? 'box-shadow:0 0 0 2px #0a0a0a' : ''}"></div>`).join('')}</div></div><div style="flex:1;font-size:13px;line-height:1.75;color:#404040">手机画布是降级档（镜头带视图）：镜头抽屉的提示词里一样 @她；点 chip 从底部升起勾图抽屉（格子 ≥ 44），默认主图、按模型上限卡住。⛔ 手机上没有角色卡的展开，看图和设定去角色页。</div></div>`

const CANVAS_CHAR_UI = {
  file: 'DesignCanvasCharacterUi.dc.html',
  title: '画布 · 角色 ④',
  eyebrow: 'PixelVault · 7 卡片重设计 · 画布用角色 · ④ 画板 · 2026-09-27 v2',
  heading: '画布里的角色：原地展开，用 @ 不用线',
  sub: '✅ owner 09-27 选原型 **A 原地展开**；「图片 / 文字」用液态分段；收起也要有动效。三问全选最简：选中只原地展开 · 挑出来的图不连线 · 旧上下文卡不再显示。**v2（owner 看画板后）**：角色**不连线**——去掉「连到镜头」和进出口，镜头用她只走 **@她**；@她 带哪几张 = **每次 @ 时自己勾**（chip 写张数）；左栏**不拖**，点一位放到画布；来源被删的卡要有设计好的样子，⛔ 不是裂图。',
  blocks: [
    h('① 角色卡：收起 · 选中展开'),
    { t: 'mock', html: CU_NODE, md: 'N1 收起：卡就是她的主图，名字在卡外上方；没有进出口、不连线，镜头用她走 @。N2 选中 · 图片页：原地变宽 180 → 300，没有底部提示词面板；工具条「在角色页打开 · ⋯」；图卡上的在前、用她出的在后，悬停出「放到画布」。N3 选中 · 文字页：设定只读，「让助手写剧本 / 写台词」交给画布助手，要改去角色页。' },
    h('② 用起来'),
    { t: 'mock', html: CU_USE, md: 'U1 放到画布：点一张 → 她收回，右边落一张普通图片卡「Denia · 图 3」并选中，不连线。U2 镜头里 @她：@ 列表多一组「角色」（整个角色库），不要求她在画布上、不拉卡、不连线；chip = 头像 + 名字 + 带几张，刚 @ 上带主图 1 张。U3 点 chip 勾图：从 chip 放大出她的全部图，勾一张或几张，每个镜头各记各的，到模型上限勾不上并写原因（同工作台「角色」弹层）。' },
    h('③ 左栏：角色库'),
    { t: 'mock', html: CU_LEFT, md: 'L1 角色库：替掉「角色 / 风格卡」，同角色页一份一种排序；点一行 = 落在视口中间并选中，已在画布上的写「在画布上」、点了定位；不拖；旧上下文卡不再显示（数据不删）。L2 空：一句话 + 去角色页。L3 点一位：落在视口正中并选中，视口不动。' },
    h('④ 状态'),
    { t: 'mock', html: CU_STATES, md: 'S1 角色库里删了她：卡面灰底「这位已从角色库删除 · 从画布移除」；@ 过她的镜头 chip 变灰写「已删除」。S2 她还没有图：灰底「还没有图 · 去角色页加图」，@ 她只带名字和外观描述。S3 已经在画布上：不新建，定位并选中 + toast。S4 剧本投影认人：对上一位 = 镜头说明里写成 @她；多位或没有由画布助手问一句；不拉卡不连线。S5 角色页「用她 ▾ → 放进画布 ›」列最近画布。S6 素材库里删了这张图：任何来自素材库的图片 / 视频 / 音频卡同 S1 的长相，⛔ 不显示裂图（现在是裂图，要一起修）。' },
    h('数据怎么落'),
    ul(
      '她在画布上 = 一张 `image.character` 节点 + `characterId`（绑角色库）；⛔ 不新增第五类节点。⛔ 没有进出口、不参与连线；没绑角色库的旧 `image.character` 卡照旧',
      '卡面、图片页、文字页都**现读**角色库；画布只存「是她」这个 id',
      '镜头里 @她 = 镜头提示词里的一个提及 `{characterId, picks}`；`picks` 与图片工作台的 `characterImagePicks` 同一种形状，出图时由卡片总线按本人校验、保序编进参考图。⛔ 设定不进出图提示词',
      '挑出来的图 = 一张普通 `image.reference` 卡，不连线',
      '来源被删：卡面读不到源时显示「已删除」灰底（S1 / S6 同一个组件），⛔ 不渲染裂图',
    ),
    h('手机'),
    { t: 'mock', html: CU_PHONE, md: '手机（镜头带视图，降级档）：镜头抽屉的提示词里一样 @她；点 chip 从底部升起勾图抽屉，默认主图、按模型上限卡住；手机上没有角色卡展开。' },
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['选中 → 原地展开', '340ms 弹簧（`LIQUID_SPRING.unfold`）· 内容淡入 200ms', '卡宽 180 → 300、高度跟着内容长；工具条随选中淡入', '画布上别的卡不让位；视口不自动平移'],
        ['点空白 / 再点她 → 收回', '260ms（`LIQUID_SPRING.retract`）', '内容先淡出、高度再收、宽度回 180', '⛔ 不直接跳回（owner 09-27「从扩大到缩小没有动效」）'],
        ['切「图片 / 文字」', '液态分段：前沿 k520 · 后沿 k260；内容短模糊淡入 120ms', '选中块两条边各一根弹簧，途中拉长再收拢，字被扫过时反色', '与工作台写法切换同一颗 `LiquidSegmented`，⛔ 不另画滑块'],
        ['点一张图 → 放到画布', '收回 260ms 后，新卡 300ms 弹簧从 0.9 放大淡入', '她先收回，新卡在右侧落下并选中', '不连线、不飞行动画'],
        ['左栏点一位 → 落在视口中间', '300ms 弹簧从 0.9 放大淡入', '她在视口正中出现并选中', '⛔ 不拖；视口不动'],
        ['点 @她 chip → 勾图面板', '②「从 chip 放大」：`spring-slot` 进场，`--duration-base` + `ease-in` 缩回', '面板从 chip 中心放大、由糊变清；关上缩回 chip', '与工具行 chip 弹层同一实现（`useStudioChipPopoverMotion`）'],
        ['已在画布上（S3）', '视口平移 300ms `ease-standard`', '平移到她 + 选中环', '不闪烁、不抖'],
        ['来源被删（S1 / S6）', '—', '卡面直接换成灰底', '⛔ 裂图；不做抖动 / 红框'],
        ['`prefers-reduced-motion`', '—', '以上直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// ④ 画板：卡片界面（owner 09-26 选 K3 网格 + 侧栏）。原则：一页一个主角 · 不框里套框 · 次要收起、有问题才冒出 · 三个去处合成「用她 ▾」。
// 颜色只用脊柱：白 · 次级面 #f7f7f7 · 边 #e5e5e5 · 黑主色 · 三个状态色；你的气泡是输入条象牙。
const KQ = {
  page: 'box-sizing:border-box;width:100%;border:1px solid #d4d4d4;border-radius:16px;background:#fff;padding:36px 40px;display:flex;flex-direction:column;gap:24px',
  drawer: 'box-sizing:border-box;width:380px;border:1px solid #d4d4d4;border-radius:16px;background:#fff;padding:28px 28px;display:flex;flex-direction:column;gap:18px',
  eyebrow: `font-size:12px;color:${MUTED}`,
  name: 'font-size:22px;font-weight:600;color:#0a0a0a',
  sub: `font-size:13px;color:${MUTED}`,
  body: 'font-size:14px;line-height:1.75;color:#262626',
  small: `font-size:12px;line-height:1.6;color:${MUTED}`,
  row: 'display:flex;align-items:center;justify-content:space-between;font-size:15px;padding:14px 0;border-top:1px solid #f0f0f0;color:#0a0a0a',
  primary: 'display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;border-radius:10px;background:#0a0a0a;color:#fff;font-size:14px;white-space:nowrap',
  secondary: 'display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:10px;border:1px solid #e5e5e5;background:#fff;font-size:14px;color:#0a0a0a;white-space:nowrap',
  quiet: `display:inline-flex;align-items:center;height:36px;padding:0 4px;font-size:14px;color:${MUTED};white-space:nowrap`,
  warn: 'border-radius:12px;background:#fdf1e3;color:#7a3c00;padding:12px 14px;font-size:13px;line-height:1.6',
  badge: 'position:absolute;left:8px;bottom:8px;font-size:11px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.92);color:#a04f00',
}
const kqImg = (w, h, tone = 0, label = '', badge = '') =>
  `<div style="position:relative;width:${w}px;height:${h}px;border-radius:12px;flex:none;background:${['linear-gradient(160deg,#ead7dd,#b9bcc6)', 'linear-gradient(160deg,#dcd3e8,#9aa0a8)', 'linear-gradient(160deg,#e4ddd2,#8f949c)'][tone % 3]};display:flex;align-items:flex-end;padding:8px;box-sizing:border-box">${label ? `<span style="font-size:12px;color:#fff">${label}</span>` : ''}${badge ? `<span style="${KQ.badge}">${badge}</span>` : ''}</div>`
const kqAvatar = (size) => `<span style="flex:none;width:${size}px;height:${size}px;border-radius:999px;background:linear-gradient(135deg,#ead7dd,#9aa0a8)"></span>`
const kqUse = `<div style="display:flex;align-items:center;gap:14px"><span style="${KQ.primary}">用她 ▾</span><span style="${KQ.quiet}">编辑</span></div>`
const kqDrawerHead = `<div style="display:flex;align-items:center;gap:14px">${kqAvatar(56)}<div><div style="${KQ.name}">Denia</div><div style="${KQ.sub}">@Denia · 鸣潮</div></div></div>${kqUse}`
const kqRow = (t, open = false) => `<div style="${KQ.row}"><span>${t}</span><span style="color:${MUTED}">${open ? '⌄' : '›'}</span></div>`
const kqGrid = (cols, names) => `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px 20px;align-content:start">${names.map((n, i) => `<div style="display:flex;flex-direction:column;gap:8px">${kqImg(150, 186, i)}<div style="font-size:14px;font-weight:600">${n}</div></div>`).join('')}</div>`

const KQ_C = `<div style="${KQ.page};flex-direction:row;gap:0;padding:0;overflow:hidden"><div style="flex:1;padding:32px 36px;display:flex;flex-direction:column;gap:20px"><div style="display:flex;align-items:center"><span style="font-size:20px;font-weight:600">角色</span><span style="margin-left:auto;${KQ.secondary}">＋ 新角色</span></div>${kqGrid(3, ['Denia', '里希', '爱弥斯', '星街', '绯雪', '小满'])}</div><div style="width:380px;flex:none;border-left:1px solid #e5e5e5;padding:32px 28px;display:flex;flex-direction:column;gap:18px">${kqDrawerHead}${kqRow('外观 · 3 张图')}${kqRow('设定')}${kqRow('用在哪 · 12 张图 · 2 个镜头')}</div></div>`

const kqCap = (no, name, body, rule, width = '100%') =>
  `<div style="display:flex;flex-direction:column;gap:10px;width:${width}"><div style="font-size:14px;font-weight:600">${no} ${name}</div><div style="${MOCK.frame};align-items:flex-start">${body}</div><div style="${MOCK.cap}">${rule}</div></div>`
const kqRowOf = (items) => `<div style="margin-top:18px;display:flex;gap:24px;align-items:flex-start">${items.join('')}</div>`

const KQ_STATES = [
  `<div style="margin-top:18px">${kqCap('S1', '空态', `<div style="${KQ.page};align-items:center;padding:72px 40px;gap:14px"><div style="font-size:20px;font-weight:600">还没有角色</div><div style="${KQ.small}">说一个名字，卡片助手去找图和设定；或者直接从素材库挑几张图。</div><div style="display:flex;gap:10px;margin-top:6px"><span style="${KQ.primary}">说个名字</span><span style="${KQ.secondary}">从素材库挑图</span></div></div>`, '整页只有一句话和两个入口，沿用全站空态原语。')}</div>`,
  `<div style="margin-top:18px">${kqCap('S2', '从素材库挑图', `<div style="${KQ.page};gap:18px"><div style="display:flex;align-items:center;gap:8px;font-size:14px"><span style="color:${MUTED}">素材</span><span style="color:${MUTED}">›</span><span style="color:${MUTED}">无限大</span><span style="color:${MUTED}">›</span><b>里希</b><span style="margin-left:auto;${KQ.small}">可以跨文件夹挑</span></div><div style="display:flex;gap:14px;flex-wrap:wrap">${kqImg(150, 186, 0)}${kqImg(150, 186, 1, '', '脸太小')}${kqImg(150, 186, 2, '', '有别人')}${kqImg(150, 186, 0)}${kqImg(150, 186, 1, '', '可裁出本人')}${kqImg(150, 186, 2, '', '有游戏界面')}</div><div style="display:flex;align-items:center;gap:14px;border-top:1px solid #f0f0f0;padding-top:16px">${kqImg(52, 64, 0, '脸')}<div style="width:52px;height:64px;border-radius:10px;border:1px dashed #d4d4d4;display:flex;align-items:center;justify-content:center;font-size:11px;color:${MUTED}">全身</div><div style="width:52px;height:64px;border-radius:10px;border:1px dashed #d4d4d4;display:flex;align-items:center;justify-content:center;font-size:11px;color:${MUTED}">背面</div><span style="margin-left:auto;${KQ.primary}">完成</span></div></div>`, '合格的图不打标，只有有问题的图左下角一个小标（脸太小 · 有别人 · 有游戏界面 · 可裁出本人）。底部三个槽，点图放进当前空槽。')}</div>`,
  kqRowOf([
    kqCap('S3', '侧栏 · 外观展开', `<div style="${KQ.drawer}">${kqDrawerHead}<div style="${KQ.row}"><span>外观</span><span style="color:${MUTED}">⌄</span></div><div style="display:flex;gap:10px">${kqImg(98, 122, 0, '脸')}${kqImg(98, 122, 1, '全身')}${kqImg(98, 122, 2, '背面')}</div><div style="${KQ.body}">粉色长卷发、发梢浅蓝；黑色发箍；红手套。</div><div style="${KQ.small}">标签 · denia_(wuthering_waves) 等 3 个 ›</div>${kqRow('设定')}${kqRow('用在哪')}</div>`, '三张图 + 一句外观；标签收成一行。试镜没问题就不出现。', '414px'),
    kqCap('S4', '侧栏 · 外观有问题', `<div style="${KQ.drawer}">${kqDrawerHead}<div style="${KQ.row}"><span>外观</span><span style="color:${MUTED}">⌄</span></div><div style="display:flex;gap:10px">${kqImg(98, 122, 0, '脸')}${kqImg(98, 122, 1, '全身')}${kqImg(98, 122, 2, '背面')}</div><div style="${KQ.warn}">试镜里服装不太像：全身图被裁掉了一半。<div style="display:flex;gap:14px;margin-top:8px"><span style="${KQ.secondary};height:32px">换一张</span><span style="${KQ.quiet};height:32px;color:#7a3c00">先这样</span></div></div></div>`, '只有试镜发现问题时才出现这一块，说清楚是哪张图、怎么改。', '414px'),
    kqCap('S5', '侧栏 · 设定展开', `<div style="${KQ.drawer}">${kqDrawerHead}${kqRow('外观 · 3 张图')}<div style="${KQ.row}"><span>设定</span><span style="color:${MUTED}">⌄</span></div><div style="${KQ.body}">温柔、爱照顾人，偶尔露出一点狡黠。舞台上的魔术师，说话句尾爱加「呢」，叫你「指挥官」。</div><div style="${KQ.small}">和 @里希 是搭档 · 来源 2 条 ›</div><div style="${KQ.small}">试读一下 ›</div>${kqRow('用在哪')}</div>`, '设定是一段读得下去的话；关系、来源、试读各一行小字，点开才看。', '414px'),
  ]),
  kqRowOf([
    kqCap('S6', '原作 · 设定起草', `<div style="${KQ.drawer}"><div style="${KQ.eyebrow}">卡片助手查资料起草 · 逐条确认</div>${[['身份：舞台魔术师', '官方角色 PV'], ['性格：先替别人撑好伞，再顾自己', '鸣潮 wiki'], ['说话：称对方「指挥官」', '鸣潮 wiki'], ['经历：（照 wiki 的写法）', '鸣潮 wiki']].map(([t, src]) => `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-top:1px solid #f0f0f0"><span style="width:20px;height:20px;border-radius:6px;border:1.5px solid #0a0a0a;flex:none;margin-top:2px"></span><div><div style="font-size:14px">${t}</div><div style="${KQ.small}">${src}</div></div></div>`).join('')}<span style="${KQ.primary};align-self:flex-start">收下勾选的</span></div>`, '每条一个勾、下面一行来源；经历照资料原本的写法。原作与改编不区分。', '414px'),
    kqCap('S7', '裁出本人', `<div style="${KQ.drawer}"><div style="display:flex;align-items:center;gap:14px">${kqImg(140, 176, 1, '原图')}<span style="color:${MUTED}">→</span>${kqImg(140, 176, 0, '裁好')}</div><div style="${KQ.small}">只裁掉背景和别人，不重画、不补细节。</div><div style="display:flex;gap:14px"><span style="${KQ.primary}">用裁好的</span><span style="${KQ.quiet}">用原图</span></div></div>`, '点了「可裁出本人」的图才出现。', '414px'),
    kqCap('S8', '试读', `<div style="${KQ.drawer}"><div style="${KQ.eyebrow}">用 Denia 的口吻说两句</div><div style="border-radius:4px 16px 16px 16px;background:#f7f7f7;padding:12px 14px;font-size:14px;line-height:1.7">「指挥官，今天的舞台也请好好看着我呢。」<br>「嘘——魔术的秘密，可不能告诉你。」</div><div style="display:flex;gap:14px"><span style="${KQ.primary}">像她</span><span style="${KQ.quiet}">不像，改说话方式</span></div></div>`, '不花出图的钱，一眼判断设定像不像。', '414px'),
  ]),
  kqRowOf([
    kqCap('S12', '原创 · 先给方向', `<div style="${KQ.drawer};gap:12px"><div style="align-self:flex-end;background:#f3f1ea;border-radius:16px 4px 16px 16px;padding:8px 12px;font-size:14px">一个退休的赏金猎人，现在开咖啡馆</div><div style="${KQ.eyebrow}">三个方向，挑一个再展开</div>${[['嘴硬心软', '客人赖账也只是叹气，默默记在小本子上'], ['过度认真', '拉花都要量角度，把咖啡当委托来做'], ['还没放下', '店里挂着旧通缉令，有人提起就沉默']].map(([t, d]) => `<div style="padding:10px 12px;border-radius:12px;border:1px solid #e5e5e5"><div style="font-size:14px;font-weight:600">${t}</div><div style="${KQ.small}">${d}</div></div>`).join('')}</div>`, '原创角色：先给 2–3 个一句话方向，你挑一个，助手再展开成完整设定。', '414px'),
    kqCap('S13', '原创 · 经历扩写', `<div style="${KQ.drawer};gap:12px"><div style="${KQ.eyebrow}">经历 · 你写的 + 助手补的</div><div style="${KQ.body}">十年前在北境做赏金猎人。<span style="background:#f7f7f7;border-radius:4px;padding:0 3px">最后一单失手，搭档替她挡了一刀。</span>之后回到小镇开了咖啡馆。<span style="background:#f7f7f7;border-radius:4px;padding:0 3px">每年那天会关店一天。</span></div><div style="display:flex;gap:14px"><span style="${KQ.primary}">收下补充</span><span style="${KQ.quiet}">只留我写的</span></div></div>`, '你写骨架，助手补细节；补的部分浅底标出，可以整段收下或只留你写的。', '414px'),
    kqCap('S14', '设定和外观对不上', `<div style="${KQ.drawer};gap:12px"><div style="${KQ.warn}">设定里说她总穿制服，但三张参考图都是洛丽塔裙。<div style="display:flex;gap:12px;margin-top:8px"><span style="${KQ.secondary};height:32px">改设定</span><span style="${KQ.quiet};height:32px;color:#7a3c00">这是另一套衣服</span></div></div></div>`, '写完设定自动对一遍外观；对不上才冒出来，「另一套衣服」可以顺手建成变体。', '414px'),
  ]),
  kqRowOf([
    kqCap('S9', '工作台选卡', `<div style="${KQ.drawer};width:340px;gap:12px"><div style="display:flex;align-items:center;gap:10px">${kqAvatar(28)}<span style="font-size:14px;font-weight:600">@Denia</span></div>${[['GPT Image 2', ''], ['Gemini 3 Flash', ''], ['NovelAI V5 Full', ''], ['NovelAI V5 Curated', '不认识这个角色，可能不像'], ['FLUX LoRA', '只看文字，可能不像']].map(([m, w]) => `<div style="display:flex;flex-direction:column;gap:2px;padding:8px 0;border-top:1px solid #f0f0f0"><span style="font-size:14px">${m}</span>${w ? `<span style="font-size:12px;color:#a04f00">${w}</span>` : ''}</div>`).join('')}</div>`, '选了卡后，模型列表里只有「会不像」的模型带一行提醒；能认人的不标。', '374px'),
    kqCap('S10', '助手人设用卡', `<div style="${KQ.drawer};gap:14px"><div style="font-size:15px;font-weight:600">助手人设</div><div style="display:flex;gap:8px"><span style="${KQ.secondary};height:32px">简洁</span><span style="${KQ.secondary};height:32px">标准</span><span style="${KQ.primary};height:32px">角色卡 · Denia</span></div><div style="display:flex;align-items:center;gap:12px">${kqAvatar(40)}<div style="${KQ.small}">头像用她的脸，语气用她的说话方式。<br>提示词、价格、报错照常说清楚。</div></div></div>`, '人设三档旁多一档「角色卡」；右上角收起态头像同步换成她。', '414px'),
    kqCap('S11', '卡片助手', `<div style="${KQ.drawer};gap:12px"><div style="display:flex;align-items:center;gap:8px">${kqAvatar(22)}<span style="font-size:14px;font-weight:600">卡片助手</span></div><div style="align-self:flex-end;background:#f3f1ea;border-radius:16px 4px 16px 16px;padding:8px 12px;font-size:14px">里希缺一张背面图</div><div style="border-radius:4px 16px 16px 16px;background:#f7f7f7;padding:12px 14px;font-size:14px;line-height:1.65">素材库里没有合格的背面。交给图片助手出一张定妆三视图，约 $0.04？<div style="display:flex;gap:14px;margin-top:10px"><span style="${KQ.primary};height:32px">交给图片助手</span><span style="${KQ.quiet};height:32px">先不要</span></div></div></div>`, '同一个助手壳、同一套对话框；自己不出图，要出图就报价后交给图片助手。', '414px'),
  ]),
].join('')

const KQ_PHONE = `<div style="display:flex;gap:24px;align-items:flex-start"><div style="width:300px;flex:none;border-radius:24px;border:1px solid #d4d4d4;background:#fff;padding:20px 16px;display:flex;flex-direction:column;gap:14px"><div style="font-size:18px;font-weight:600">角色</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${['Denia', '里希', '爱弥斯', '星街'].map((n, i) => `<div style="display:flex;flex-direction:column;gap:6px">${kqImg(126, 156, i)}<div style="font-size:13px;font-weight:600">${n}</div></div>`).join('')}</div></div><div style="width:300px;flex:none;border-radius:24px;border:1px solid #d4d4d4;background:#fff;padding:20px 16px;display:flex;flex-direction:column;gap:14px"><div style="width:36px;height:4px;border-radius:999px;background:#d4d4d4;align-self:center"></div>${kqDrawerHead}${kqRow('外观 · 3 张图')}${kqRow('设定')}${kqRow('用在哪')}</div><div style="flex:1;font-size:13px;line-height:1.75;color:#404040">手机：网格两列；点一个角色，侧栏变成从底部升起的整页抽屉（顶部有拖拽条，下拉关闭）。三行展开同桌面；行高 ≥ 44。挑图面板也是底部抽屉，三个槽固定在抽屉底。</div></div>`

const CARD_UI = {
  file: 'DesignCardUi.dc.html',
  title: '卡片 · ④ 全状态',
  eyebrow: 'PixelVault · 7 卡片重设计 · ④ 画板 · 2026-09-26',
  heading: '卡片界面：网格 + 侧栏',
  sub: 'owner 09-26 选 **K3 网格 + 侧栏**（v1 太挤后重画）。卡片页是一排角色大图；点一个，右侧滑出一栏：头像名字、「用她 ▾」（设为助手人设 · 在工作台用 · 放进画布），下面三行「外观 · 设定 · 用在哪」，一次只展开一行。原则：一页一个主角 · 不框里套框 · 次要收起、有问题才冒出。侧栏里的状态按真实宽度 380 画。',
  blocks: [
    h('① 主画面'),
    { t: 'mock', html: `<div style="margin-top:14px">${KQ_C}</div>`, md: '主画面：左边角色大图网格（右上「＋ 新角色」），右边 380 宽侧栏：头像 · 名字 · @ · 用她 ▾ · 编辑，下面外观 / 设定 / 用在哪三行可展开。' },
    h('② 状态'),
    { t: 'mock', html: KQ_STATES, md: '11 态：S1 空态（说个名字 / 从素材库挑图）· S2 挑图（合格不打标，问题图左下小标；底部三槽）· S3 外观展开（三图 + 一句 + 标签收一行）· S4 外观有问题（试镜发现才出现，说清哪张图）· S5 设定展开（一段话；关系 / 来源 / 试读各一行小字）· S6 新建设定起草（逐条勾 + 来源）· S7 裁出本人（只删不加）· S8 试读 · S9 工作台选卡（只有会不像的模型带提醒）· S10 助手人设多一档角色卡 · S11 卡片助手报价后交给图片助手。' },
    h('手机'),
    { t: 'mock', html: `<div style="margin-top:14px">${KQ_PHONE}</div>`, md: '手机：网格两列；侧栏变底部整页抽屉（拖拽条、下拉关闭）；行高 ≥ 44；挑图也是底部抽屉。' },
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['点角色 → 侧栏滑出', '`--duration-base` 200ms · `ease-standard`', '侧栏 x 24→0 + opacity 0→1；网格不动', '不挤压网格重排'],
        ['换一个角色', '`--duration-fast` 120ms', '侧栏内容交叉淡换，侧栏本身不动', '不关再开'],
        ['展开一行', '`--duration-base`', '高度展开 + 内容 opacity 0→1；另一行同时收起', '不弹簧回弹'],
        ['图放进槽', '`--duration-base`', '缩略图 opacity 0→1 + scale .96→1', '不从网格飞到槽里'],
        ['问题提示出现', '`--duration-fast`', 'opacity 0→1', '不闪、不抖'],
        ['手机抽屉', '系统底部抽屉', '上滑出现，下拉关闭', '—'],
        ['`prefers-reduced-motion`', '—', '以上直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

const VIDEO_ASSISTANT = {
  file: 'DesignVideoAssistant.dc.html',
  title: '视频助手 + 左栏 · ④ 全状态',
  eyebrow: 'PixelVault · 6 在设计 · 视频助手 · ④ 画板 · 2026-09-24',
  heading: '视频助手 + 左栏：全状态',
  sub: '⚠ 09-24 已施工（94e058b5 … 14f65dca），实跑 BytePlus 2.5 与 Wan 3.0（fal）出片；实跑后补：失败原因说具体、结果卡说视频且占位封顶、视频尺寸按清晰度记、音频胶囊带图标、助手看得到自己写的全文。owner 09-24 ① 八问：时间轴「镜头N（a-b秒）」两种都写（09-24 追加：**按模型写它自己的格式**，见④）· 写作分两档（简单需求 / 剧本）· UI 范围 = 左栏参数区 + 助手视频脸 · 去掉三个模式、按挂了什么判断 · 素材按图片1 / 视频1 / 音频1 编号 · 分镜是纯文本逐行 · 规格行只写一行短规格。anima-tagger 的 Anima 格式规则放 LoRA 侧，里面的 Danbooru 校验规则留给 NAI 标签检查。助手面板沿用「A 对话流：全状态」，新画面只有**左栏**和**规格浮层**。',
  blocks: [
    h('① 左栏：现在 → 改后'),
    { t: 'mock', html: VD_PANEL_COMPARE, md: '左栏现在 → 改后：①去掉「关键帧 / 多图参考 / 全能参考」，发送方式由挂了什么推出来，写成素材下一行只读灰字（与画布视频节点同一个判定函数），选模型不再被清空 · ②三个具名槽 + 参考图 + 音频参考并成一条素材轨，按类型编号「图片1 · 视频1 · 音频1」，首 / 尾帧是图片角标 · ③负面提示词只在支持它的模型下出现 · ④四颗按钮剩「模板 · 剧本」 · ⑤模型一行一个（型号 · 渠道）。' },
    h('② 助手的视频脸'),
    { t: 'mock', html: VD_FACE, md: '视频脸三态：F1 空态（头像 + 一句话 + 最多 2 颗起手 chip）· F2 规格行收起只写「型号 · 时长 · 比例」· F3 点开就地浮层（模型 / 渠道 + 价格 / 时长 / 比例 / 清晰度），与确认卡、左栏同一份规格。' },
    h('③ 视频助手全状态'),
    { t: 'mock', html: `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start">${VD_STATES.join('')}</div>`, md: '6 态：V1 一句话 → 第一档（全局设定 + 情绪 + 逐镜，写进左栏）· V2 剧本 → 第二档（先一行叙事再逐镜，转场写名字）· V3 挂了参考图（先看图，绑定句「将图片1中的红发女孩定义为林夏」，编号跟素材轨）· V4 说了「不要…」（没有负面栏的模型写进全局设定，系统追加一句灰字）· V5 让这张图动起来（挂成首帧，灰字变图生视频）· V6 素材超出建议数（问一次；硬上限直接挡）。' },
    h('手机'),
    { t: 'mock', html: `<div style="margin-top:12px">${VD_PHONE}</div>`, md: '手机：左栏同顺序竖排；素材轨横向滚动、格子点击区 ≥44；点格子弹底部菜单，不用长按。' },
    h('④ 各模型写法', '09-24 三路调研 + 一手核对（官方指南 / fal OpenAPI / MiniMax v2 API）。助手按当前模型写它自己的格式'),
    table(
      ['模型', '分镜时间', '素材指代', '声音', '负面', '要点'],
      [
        ['Seedance 2.0', '镜头1 / 镜头2（秒数不认）', '将图片1中的…定义为…', '{台词} <音效> （音乐） 【字幕】', '无 → 进全局设定', '≤500 字；一镜一动；段名不加【】'],
        ['Seedance 2.5', '整秒时间戳', '同 2.0', '同 2.0', '无', '最长 30 秒'],
        ['Wan 3.0', '第1个镜头[0-3秒]（每段 2–5 秒）', '图1 / 视频1 / 音频1；「音色参考音频1」+「口型同步」', '角色说："…"；不要就写「无台词」「无bgm」', '无 → 末尾「负向清单：…」', '智能改写默认开，别关；一镜到底写「生成单镜头」'],
        ['MiniMax H3', '[Shot 1] …；[Shot 2] At 00:03.500, the camera cuts to…', 'Image 1 / Video 1 / Audio 1，各写用途', '三段英文：画面 · overall_soundscape · non_diegetic_music；台词 (S1) <d>[Chinese]原文</d>', '无 → 正文写', '一定出声；运镜写成句内短语；首尾帧与参考不能混用'],
        ['Kling V3 Pro', 'multi_prompt 字段（每镜 + 秒数）或 Shot 1, … Shot 2, …', '@Element1', '[名, 声线]: "…"，先动作后台词', '有（≤2500）', '无固定顺序'],
        ['Kling O3 Pro', '同 V3', '—', '同 V3；音频默认关', '无', '图生视频字段是 image_url（发送层 bug 已另开任务）'],
        ['HappyHorse', 'Shot 1 (0-1s): …', '首帧不指代', '引号嵌进叙述', '无', '约 20 个英文词；越长脸手越易走样'],
        ['Gemini Omni', '[0-3s]；单镜头必须写 No scene cuts', '<IMAGE_REF_0> 起编', '自然语言 Sound design: …', '无 → 正文写', '只评估过英文'],
        ['LTX-2.3', '段落里写 Cut to …', '图生视频只写运动', '引号，拆短句', '无', '一段英文 ≈200 词，先写动作'],
      ],
      { widths: ['92px', null, null, null, '96px', null], firstStrong: true },
    ),
    h('写法规则（助手）'),
    table(
      ['#', '规则', '细节'],
      [
        ['W1', '分两档', '一句话 / 一个画面 → 全局设定 + 情绪 + 逐镜；故事 / 剧本 / 多场 → 先一行叙事（起承转合 + 情绪走向）再逐镜。⛔ 不空手反问'],
        ['W2', '时间轴', '**按模型写它自己的格式**（见 ④ 表）；整秒、首尾相接、加起来等于时长；约 3 秒一个镜头'],
        ['W3', '一镜一动', '每个镜头只一种运镜，并且跟着一个事件走；写清结束时停在哪；转场写名字'],
        ['W4', '段名与符号按模型', 'Seedance：【】是字幕记号，段名写「全局设定：」，符号 {台词} · <音效> · （音乐） · 【字幕】。其余模型没有保留符号，见 ④ 表'],
        ['W5', '素材指代', '编号 = 左栏素材编号，写法按模型（④ 表）；多个素材写明各自用途；多人外观拉开、各写一段、按外貌指认，⛔ 不写「角色1」'],
        ['W6', '约束写正文', '目录里只有 Kling V3 Pro 有负面栏；其余写进正文（Wan 官方是末尾「负向清单：…」，Seedance 进全局设定）。⛔ 不静默丢'],
        ['W7', '写看得见的', '情绪写成表情和身体的变化（owner 资料「肌肉翻译」）；空间用镜头前后 + 距离（「距离镜头约三米」）；画面外的东西不写'],
        ['W8', '长度', 'Seedance 2.0 ≤500 字 · Kling / HappyHorse ≤2500 字符 · LTX ≈200 词 · MiniMax ≤7000 · Wan ≤20000；超了先压描写，⛔ 不砍镜头'],
      ],
      { widths: ['44px', '96px', null], firstStrong: false },
    ),
    h('施工范围'),
    table(
      ['层', '改什么'],
      [
        ['助手提示', 'Seedance 规则按 W1–W8 重写；删掉「硬负面进负面提示词」那条；镜头语法里的秒数节奏和 2.0 规则打架，统一成 W2'],
        ['服务端', '视频域接上「看参考图」；各模型写法规则按 ④ 表重写（纠正 MiniMax「参考图变首帧」「方括号运镜无记载」、Wan「负面 500 字」、Kling「固定顺序」）；发送层不再改写提示词文字；没有负面栏的模型写了负面 → 退回改写进正文（同 NAI 守卫）并追加 V4 那句灰字'],
        ['左栏', '删 `StudioVideoModeToggle` 与模式状态，改用画布的 `videoSendMode`；`StudioVideoReferenceSlots` + 参考图 chip + 音频参考 pill 并成一条素材轨；负面行按模型能力；模型选择器一行一个'],
        ['助手脸', '视频规格行短写 + 浮层；起手 chip ≤2'],
        ['实测', '首尾帧和参考同挂时 Seedance 2.0 实际怎么发；不能混用就把首 / 尾帧角标置灰并说明原因'],
      ],
      { widths: ['90px', null], firstStrong: true },
    ),
    h('动效表'),
    table(
      ['动作', '时长 · 曲线', '动什么', '⛔'],
      [
        ['素材进轨', '`--duration-base` 200ms · `ease-standard`', '新格 opacity 0→1 + scale .96→1；后面的格子让位', '不弹跳'],
        ['角标变化（设为首帧）', '`--duration-fast` 120ms', '角标淡入；灰字「这次按…」交叉淡换', '不闪高亮'],
        ['助手写入提示词', '—', '一次整体替换', '不逐字打进左栏'],
        ['规格浮层', '沿用图片档 B6', 'opacity + 上移 4px', '不遮输入框'],
        ['`prefers-reduced-motion`', '—', '以上直接到位', '—'],
      ],
      { firstStrong: false },
    ),
  ],
}

// ─────────────────────────── 汇总与输出 ───────────────────────────
export const PAGES = [
  { id: 'page-1', name: '1 · 总览', boards: [OVERVIEW] },
  {
    id: 'page-2',
    name: '2 · 业务设计',
    boards: [BIZ_BASE, BIZ_ASSISTANT, BIZ_CARDS, BIZ_IMAGE, BIZ_VIDEO, BIZ_CANVAS, BIZ_LORA, BIZ_ASSETS, BIZ_VOICE, BIZ_HOME],
  },
  { id: 'page-3', name: '3 · UI 总纲', boards: [UI_VISUAL, UI_SHARED, UI_PAGES] },
  { id: 'page-4', name: '4 · 进度表', boards: [PROGRESS] },
  {
    id: 'page-5',
    name: '5 · 厂商速查',
    boards: [VENDOR_IMAGE, VENDOR_VIDEO, VENDOR_VOICE, VENDOR_TEXT, VENDOR_RUNNER],
  },
  { id: 'page-6', name: '6 · 在设计', boards: [D12_MAP, D12_GEN_TOGGLE, D12_UI_AUDIT, D12_UI_DESIGN, D12_CONV_DESIGN, D12_A_STATES, D12_DETAIL_DIRS, SPLIT_REVERSE, VIDEO_ASSISTANT, CARDS_MAP, MEMORY_MAP, MEMORY_UI, BUBBLE_UI] },
  { id: 'page-7', name: '7 · 卡片重设计', boards: [CARD_FLOW_ANSWERS, CARD_FLOW_MAP, CARD_UI, CANVAS_CHAR_MAP, CANVAS_CHAR_UI] },
]

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(BOARD_DIR, { recursive: true })
  mkdirSync(MD_DIR, { recursive: true })
  for (const page of PAGES) {
    for (const board of page.boards) {
      writeFileSync(join(BOARD_DIR, board.file), boardHtml(board))
    }
    const md = [
      `# ${page.name}`,
      `> 由 \`gen/build-digest.mjs\` 生成，与线上画布同一份内容；改内容改脚本，不要手改本文件。`,
      ...page.boards.map(boardMd),
    ].join('\n\n')
    writeFileSync(join(MD_DIR, `${page.id}.md`), `${md}\n`)
  }
  console.log(`wrote ${PAGES.reduce((n, pg) => n + pg.boards.length, 0)} boards · ${PAGES.length} md pages`)
}
