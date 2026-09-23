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
const DATE = '2026-09-23'
const BASE = '代码基线 `5e422f97`（= origin/main = 生产）'

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
            { name: '助手', status: '进行中', note: '公共层与四张脸已落；D12「怎么做出用户想要的结果」②③④ 已过（第 6 页），施工前先盘点助手 UI' },
            { name: '卡片', status: '可开工', note: 'v2 字段已落；卡片总线 35 契约 09-24 定（只认角色卡 · 角色与背景共用 @ 名单 · 三次部署已授权），之后 D6 设计 —— **挡着画布**' },
            { name: '图片', status: '部分', note: '两台已落；NAI 角色图用 V5 Full；编辑线等 D4' },
            { name: '视频', status: '部分', note: '模型接入已落；分镜 / 白模动作等 D4' },
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
        ['—', '生成键开关', '09-23 定，未设计', '待设计'],
        ['—', '画布 <768 手机宿主', '手机图片工作台过了不等于画布过了', '待设计'],
        ['21 · 37', '排片提案回传', '`deliverTimelineProposal` 没有生产者：助手没有时间线工具', '待 spec'],
        ['57', '清理旧助手 + 隐身合一', 'CanvasAssistant* 三件 · StudioAssistantDock · PromptAssistantPanel 仍在；隐身时仍保存本轮记录（只不写长期记忆），口径要定', '待 spec'],
        ['—', '16 步用完静默停止', '必须说清剩余事项再停', '可开工'],
        ['—', '3D 图被说成 2D', '复测已能描述体积，不代表根治', '待验'],
        ['59', '/ skill 调用', '09-11 提出，未拍板', '远期'],
      ],
    ),
    h('正在讨论', '09-23 owner：分析能力，以及怎么做才能做出用户想要的结果'),
    ul(
      '拆成一条链：**听懂**（目标 · 必须保留 · 允许改变）→ **看懂**（参考图分析）→ **选对**（型号与参数，例：NAI 角色图必须 V5 Full）→ **你来判断** → **按你的反馈改**。',
      '同时要定：什么时候问 / 什么时候做 · 界面 · 各页助手分别管什么 · 画布导演流程。② 思维导图已出（第 6 页 D12），等 ③ 确认。',
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
        ['35', '卡片总线契约 + v3 迁移', '09-24 定：只认角色卡 · 变体各有 handle、与背景卡共用 @ 名单 · 四列图片并成 referenceSlots · 三次部署已授权；契约见 cards.md', '可开工'],
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
    ),
    h('现状'),
    table(
      ['#', '项', '说明', '状态'],
      [
        ['01 · 28', '修错 · Kling O3 v2v edit 端点', 'videoKind=edit 只进编辑入口', '已落'],
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
  eyebrow: `PixelVault · 4 进度表 · ${DATE}`,
  heading: '进度表：按业务分组，业务按依赖排序',
  sub: `只列没做完的；已完成的压在最后一段。# 沿用原编号，方便对 commit。${BASE}。当前焦点：助手讨论（进行中）与 NAI；建议卡片 35 同时开，因为它挡着画布。`,
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
    ]),
    h('层 1 · 助手'),
    ptable([
      P('D12', '助手：怎么做出用户想要的结果（问 / 做 · 分析 · 界面 · 各页分工 · 导演流程）；②③④ 09-24 已过（第 6 页）；owner 定 ⑤ 之前先盘点助手 UI 现状与优化点、过一轮 UI 设计；09-24 盘点完（U1–U7 · B1–B9 · C1–C11 · Q1–Q8），对话方向定 A，A 全状态画板 09-24 定稿（三处细节 T-A / R-C / S-C + P1–P8 已并入），可进 ⑤', '—', '可开工'),
      P('—', '生成键开关（开 = 助手自动按 · 关 = 你先看）', '讨论', '待设计'),
      P('—', '画布 <768 手机宿主', '55', '待设计'),
      P('—', '16 步用完静默停止 → 说清剩余事项再停', '—', '可开工'),
      P('—', 'NAI 规则：拦中文整句与夸张权重（如 `20::`），角色图选 V5 Full', '—', '可开工'),
      P('21 · 37', '排片提案回传：给助手一个时间线工具，接 `deliverTimelineProposal`', '—', '待 spec'),
      P('57', '清理旧助手（CanvasAssistant* · StudioAssistantDock · PromptAssistantPanel）+ 隐身口径合一 + 拆 operator service', '—', '待 spec'),
      P('59', '/ skill 调用', '—', '远期'),
    ]),
    h('层 1 · 卡片', '挡着画布，建议与助手讨论并行开'),
    ptable([
      P('35', '卡片总线（referenceSlots）+ v3 迁移（handle · summary · relations · loreEntries · persona.examples · extensions）；契约 09-24 定、迁移三次部署已授权，13 片施工顺序见 cards.md', '27 ✓', '可开工'),
      P('D6', '① 反问 → 建卡向导 · 详情页 · 风格卡 · 场景卡（卡 1–4）', '35', '待设计'),
      P('54', '卡片选择器统一', '35', '等依赖'),
      P('43', 'StyleCard 资产化（风格 + 样张 + 参数快照 + 反馈回流）', '35 · D5', '等依赖'),
    ]),
    h('层 1 · 图片'),
    ptable([
      P('—', '标签台默认型号改 V5 Full', '—', '可开工'),
      P('25', 'FLUX.2 [max] → Seedream 组图', '—', '可开工'),
      P('—', 'NAI 精确参考付费联调 · Qwen 2.1 多参考真实出图', '—', '待验'),
      P('42 · 46', '编辑线三分区（含风格迁移）', 'D4', '等依赖'),
    ]),
    h('层 1 · 视频'),
    ptable([
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
      P('65', '资产流水线：参考图 → 角色 / 场景资产 → 分镜 → 视频，自动连线', 'D6', '等依赖'),
      P('24b', '剧本投影时角色 @ 自动装填参考槽 + 音色', '35', '等依赖'),
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
        ['U1', '对话区改**实底**，玻璃只留头部与浮层', '半透明面板把工作台后面的缩略图透过来，时间线与空态背后糊成一片色块；要读的内容放实底（苹果与 Claude 同做法）', '待设计'],
        ['U2', '输入行去掉 **+** 按钮，只剩 上传 · 素材库 · 模型 · 发送；`@` 照旧在输入框里直接打', '+ 里三项：「提及素材」与打 `@` 重复、「上下文卡」没人用、「指定来源」见 U3；上传与素材库用得多，保留独立按钮', '待设计'],
        ['U3', '「指定来源」选择器删掉，改成**在话里说**（「只在 danbooru 查」→ 助手按同一个来源过滤器限定）；长期来源规则仍在助手设置', '代码是通的，但只在助手决定去搜的那一轮起作用，藏在 + 第二层、选了也看不出效果', '待设计'],
        ['U4', '上下文卡：只去掉 + 入口，功能先留（助手提议记卡 · 设置里管理）', '等卡片 35 / D6 落地后再看它剩多少用处', '待设计'],
        ['U5', '手机：账号头像收进导航菜单，右上角只留助手头像', '手机布局里两个圆头像上下叠着（账号在上、助手在下），分不清谁是谁', '待设计'],
        ['U6', '两个「模型」（助手用的 LLM chip · 出图规格那一行）不动', '一个是文字模型、一个是出图模型，owner 认为不混', '—'],
        ['U7', '会话按工作台分开：**画布单独、按画布项目分**；图片 / 视频 / LoRA 仍共用一个列表（每行标来源）', '画布挂的是同一个助手面板、同一份线程：在图片开着会话再去画布，画布的对话就写进这段标着「图片工作台」的会话', '待设计'],
      ],
      { widths: ['60px', null, null, '90px'] },
    ),
    h('要修的：bug，或已定决策还没落地'),
    table(
      ['#', '真机看到的', '改成', '状态'],
      [
        ['B1', '**一轮没有收尾的话**：「校服三视图」那轮，助手把 `set_prompt` 换着措辞连调 8 次、步数用完就停，时间线上只有「执行记录 · 8 步」+「本轮记录」；「只讨论方案」那轮干脆零回复', '每轮必以一句话收尾：做到哪 · 卡在哪 · 你说哪句我接着做（导图「步数用完不静默」那条）；同一工具连续重试同一件事要先停下来说', '可开工'],
        ['B2', '「本轮记录」串轮：只讨论方案那轮的「事实」写的是上一轮画布节点的事；两处「本轮记录」缩进不一（一个缩在执行记录下，一个顶到左边）', '本轮记录只记本轮；缩进统一', '可开工'],
        ['B3', '日期分隔线「2026/9/23 的记录」排在它标注的那几轮**下面**', '分隔线放在那一天的第一条之前', '可开工'],
        ['B4', '出图后还有「它备的那一张回来了 —— 助手正在看」+「自动检查」卡 + 「已预填下一轮」', '按 09-23 决定删掉（出图后不自检，由你指出问题）', '可开工'],
        ['B5', '自动检查卡里缩略图是裂图；模型名写原始 id `nai-diffusion-4-5-curated`', '随 B4 删除；其余处出现模型名一律用显示名', '可开工'],
        ['B6', '点输入框上方的规格摘要，比例 / 张数浮层弹到最左边的参数栏', '就地从那一行弹出', '可开工'],
        ['B7', '⋯ 菜单的「以前的会话」与标题下拉是同一份历史', '删 ⋯ 里那一项，历史只走标题下拉', '可开工'],
        ['B8', '助手说「点击右侧已就绪的生成按钮」，生成键在左边', '提示词里不写方位词', '可开工'],
        ['B9', 'studio 目录 CLAUDE.md 写「头部右上常驻齿轮、⋯ 里没有设置入口」，真机没有齿轮、设置在 ⋯ 里', '以真机为准改文档', '可开工'],
      ],
      { widths: ['60px', null, null, '90px'] },
    ),
    h('对话中（09-24 实跑一轮 + 翻 102 条历史）'),
    table(
      ['#', '真机看到的', '改成', '状态'],
      [
        ['C1', '同一轮助手连出三行，每行都带头像和名字（「正在分析两张参考图」→「计划 · 3 步」→ 又一句「正在分析两张参考图」），同一句话重复两遍', '一轮只出一次头像与名字，本轮内容都挂在它下面；同一句不重复', '待设计'],
        ['C2', '自动续跑每跑一次新起一组「达妮娅 / 计划 · 5 步 / 执行记录 · 1 步」，一次请求堆出 4–5 组，同一份计划重复显示，没有一句话', '续跑合进同一组：计划只出现一次、逐项打勾，跑完一句话收尾', '待设计'],
        ['C3', '执行记录展开后每步一张带边框的卡 + 图标圆圈 + 标题（15px 中粗，比回答正文 15px 常规还重）+ 常驻「恢复到这一步」+ 露出工具名 `set_prompt`', '步骤降成一行一步的小字、无卡无圈；「恢复到这一步」悬停才出现；不露工具名', '待设计'],
        ['C4', '「记录」有四种皮：你选了（灰字）· 执行记录（灰字折叠）· 已改 N 项（绿色左边条）· 本轮记录（带框、默认展开占半屏）', '统一成一种低调样式、默认收起；「待办：等待确认生成」与确认卡重复的那种不再写', '待设计'],
        ['C5', '回答正文里露出内部代号 `@Image1` / `@Image2`，用户那侧同一张图显示成缩略图 chip', '两侧同一种缩略图 chip', '可开工'],
        ['C6', '正文写完后末尾光标块一直挂着（等问题回答时也在）', '写完即收', '可开工'],
        ['C7', '回执「已改 3 项」而左栏「还原（1 处）」；点「先不要」后工作台模型从 FLUX 2 Flash 变成 GPT Image 2.5 Sunburst、规格变 1:1 · auto，改动标记写「你在确认卡上改的」—— 实跑时没碰卡上旋钮', '取消确认卡不改任何字段；回执与改动标记同一计数（先查根因）', '可开工'],
        ['C8', '画布的对话出现在图片工作台的会话里', '见 U7', '待设计'],
        ['C9', '助手称呼「JIAN」，界面上的用户名是「YINIG」', '称呼与账号显示名同源（先查名字从哪来）', '可开工'],
        ['C10', '历史里用户消息的参考图缩略图是裂图', '查过期 URL；裂了显示占位而不是破图标', '可开工'],
        ['C11', '阻塞条把工具失败原文给用户（「这个工作台上没有这个控件」「需要先分析当前参考图」），紧接着的回答又说「已确定」', '失败说人话且与回答一致；技术细节留在展开里', '可开工'],
      ],
      { widths: ['60px', null, null, '90px'] },
    ),
    h('反问'),
    table(
      ['#', '真机看到的', '改成', '状态'],
      [
        ['Q1', '要用户拍板的事在**正文里**问（「请确认是否完全保持 @Image1 的画风……」），用户只能自己打字', '要拍板的都走问题块', '可开工'],
        ['Q2', '正文问一遍「你想优先保留哪一种？」，问题块再问一遍「优先采用哪种画风？」', '正文只说一句原因，问题只在块里问', '可开工'],
        ['Q3', '「这张橘猫图用在哪里？」不是冲突也问了', '真冲突才问；能给默认值就用默认、回复里说一句', '可开工'],
        ['Q4', '两道题分两轮、各自「1 / 1」', '同一轮攒成一组（≤ 4 题）一次一题；只有一题不显示进度', '可开工'],
        ['Q5', '第一项默认就是选中态（实心圆 +「推荐」），又没有确定键，分不清选没选', '不预选，点一下即提交；推荐只用标签', '待设计'],
        ['Q6', '点「其他」后两颗圆点同时选中；就地输入框 + 主输入框「或者直接打字…」两个输入框并存', '「其他」就是主输入框：问题开着时打字即回答', '待设计'],
        ['Q7', '问题块浮在规格行上方，透底，与输入框不在一个框里', '与输入框同框（v2 §3.4 原定）', '待设计'],
        ['Q8', '答完只剩「你选了：纯 2D 赛璐璐」，问题本身消失，回看不知道在选什么', '留问答对：「画风 · 纯 2D 赛璐璐」', '待设计'],
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
  sub: 'owner 09-24 定 A；三处细节定 T-A 裸图标 · R-C 三点 + 正在思考 + 流式 · S-C 开关在发送键旁，二过清单 P1–P8 已并入本版。场景用测试图做「只换衣服」，14 态 + 手机。**这张是施工依据**；对应盘点 C1–C11 · Q1–Q8 · B1 · B3 · B4。',
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
  { id: 'page-6', name: '6 · 在设计', boards: [D12_MAP, D12_GEN_TOGGLE, D12_UI_AUDIT, D12_UI_DESIGN, D12_CONV_DESIGN, D12_A_STATES, D12_DETAIL_DIRS] },
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
