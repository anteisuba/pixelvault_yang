// 浓缩版画布（2026-09-23 起）：19 页 → 5 页。
// 这里是唯一的内容源：跑一次同时写出 digest/*.dc.html（画板）与 ../digest/*.md（仓库镜像）。
// 改内容只改这个文件，再按 README 重新 seed 与发布；不要手改输出文件。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { boardHtml, boardMd } from './digest-render.mjs'

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
            { name: '助手', status: '进行中', note: '公共层与四张脸已落；正在讨论「怎么做出用户想要的结果」' },
            { name: '卡片', status: '待设计', note: 'v2 字段已落；卡片总线 35 + D6 设计未开 —— **挡着画布**，建议与助手讨论并行开' },
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
      '同时要定：什么时候问 / 什么时候做 · 界面 · 各页助手分别管什么 · 画布导演流程。下一步出 ② 思维导图。',
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
        ['35', '卡片总线 spec + v3 迁移', '建议与助手讨论并行开', '待 spec'],
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
      P('—', '讨论：怎么做出用户想要的结果（问 / 做 · 分析 · 界面 · 各页分工 · 导演流程）→ ② 思维导图', '—', '进行中'),
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
      P('35', '卡片总线 spec（referenceSlots）+ v3 迁移（handle · summary · relations · loreEntries · persona.examples · extensions）', '27 ✓', '待 spec'),
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
