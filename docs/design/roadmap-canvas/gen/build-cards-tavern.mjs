// 卡片设计 · 酒馆（SillyTavern）角色卡对照板（第 6 页，挂在 DesignCards 下方）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', AMBER = '#a04f00', GREEN = '#16794c', RED = '#b3261e'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  table { border-collapse:collapse; font-size:12.5px; margin-top:12px; width:100% } th, td { border:1px solid ${BORDER}; padding:7px 10px; text-align:left; vertical-align:top; line-height:1.5 } th { background:${MUTEDBG}; font-weight:600; font-size:12px }
  .tag { display:inline-block; ${MONO} font-size:10px; letter-spacing:.05em; padding:2px 7px; border-radius:999px; margin-right:6px; vertical-align:1px }
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252; max-width:900px }
  .cols { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:16px; margin-top:12px }
  .box { border:1px solid ${BORDER}; border-radius:12px; padding:12px 14px; font-size:12.5px; line-height:1.55 } .box b { display:block; font-size:13.5px; margin-bottom:6px }
  .box li { margin:0 0 4px 0 } .box ul { margin:0; padding-left:16px }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const tag = (t, c) => `<span class="tag" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc(t)}</span>`
const table = (cols, rows) => `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
const decided = (t, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="${MONO}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 拍板 · 2026-09-19</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(t)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`

const BODY = header('PixelVault · 设计 · 卡片 · 2026-09-19', '角色卡 · 借酒馆（SillyTavern）什么、不借什么', 'owner 09-19 要求参考酒馆。一手调研在 research/sillytavern-cards.md（V1 / V2 / V3 规范 · World Info · 群聊 · 导入导出 · 中文站 · 启动器；§12 补充：语气 / 情感 / 关系的机制级核实）。结论：值得借的不是字段表，是三件结构性设计——卡是自包含可交换文件；卡自带一本按关键词触发的私有知识库；extensions 逃生舱且不认识的键不许销毁。对话导向字段不借。') +
  sec('借（借的理由 → 落到 PixelVault 的什么）') +
  table(['酒馆机制', '借成', '落点'], [
    ['<code>extensions</code> + 「导入导出不许销毁不认识的键」', '卡上加 <code>extensions Json</code> 逃生舱，规则写进 cards.md', 'Prisma 新列'],
    ['字段按「进不进提示词」硬性二分（creator_notes MUST NOT · system_prompt MUST）', '每个卡字段注释里写死「进不进 card-recipe-compiler」', '注释 / 文档'],
    ['<b>character_book / lorebook</b>：关键词触发的条目注入 + 预算 + 位置', '<b>loreEntries 最小版</b>：<code>{keys[], content, slot, order, enabled}</code>；例 keys=[雨, 雨夜] → 「红色连帽雨衣，帽子戴上」进正面后缀；keys=[战斗] → 「不要出现雨衣」进负面', '先进 extensions，验证后提成 CharacterLoreEntry 表'],
    ['<code>constant</code>（永远在场）', '身份锚点无条件进每条编译产物', '编译器'],
    ['Match whole words 中日文必须关', 'loreConfig 中文默认 <code>matchWholeWords:false</code>', 'extensions'],
    ['<code>alternate_greetings</code>（一张卡多个起手）', 'posePresets：3–5 个默认姿态 / 构图，生成时切换', 'extensions 起步'],
    ['V3 <code>assets[]</code> {type, uri, name} + 「多个 icon 必须恰有一个 main」', 'referenceSlots{role, url, cardId, isPrimary}，identity 槽恰有一个 primary', 'Prisma JSON（35 合并 referenceImages + referenceRoles）'],
    ['V3 <code>nickname</code>（prompt 里替换 {{char}}）', '<b>handle</b>：@名字 的稳定锚点，与展示名解耦', 'Prisma 新列（唯一约束）'],
    ['<code>creator_notes</code>（给人看不给模型看）', '<b>summary</b>：卡库与详情页显示，⛔ 不进 prompt', 'Prisma 新列'],
    ['V3 <code>source[]</code> 只追加不删改', 'provenance 写入语义 = 追加', '现有 JSON'],
    ['tags 生态：导入两栏确认 · 三态筛选 · 标签当虚拟文件夹 · 批量打标 · 备份', '卡库组织方式', '卡库 UI（D6）'],
    ['表情包 ZIP 批量导入（约定文件名落目录）', '三视图 / 多姿态参考图批量导入', '建卡向导（D6）'],
    ['<b>.charx</b>（zip + card.json + assets/…）', '「一张卡带 3–10 张参考图」的导出载体；PNG 内嵌只放元数据', '导入导出（D6）'],
    ['群聊默认 Swap 不 Join；官方警告 Join 会「角色串味、人格融合」', '<b>多角色同框按槽分，不拼 characterPrompt</b>：每角色独立 referenceSlot 组 + @handle', '编译器 · 35'],
    ['卡库：按使用度排序 · Duplicate · Replace/Update 保留下游关联', '最近用过 · 变体最短路径 · 换新版卡不断血缘', '卡库 UI（D6）'],
  ]) +
  sec('不借', '对话导向 · 与生成场景不匹配') +
  `<div class="cols">
    <div class="box"><b>纯对话字段</b><ul><li>first_mes · mes_example（&lt;START&gt;）· post_history_instructions：生成没有「第一条消息」与「对话样例」</li><li>talkativeness · 群聊四种发言顺序：依赖轮流发言的时间轴</li><li>Author's / Character's Note 的 @Depth：没有聊天历史就没有深度；「必须在场」用 constant 承接</li></ul></div>
    <div class="box"><b>安全 / 可复现</b><ul><li>system_prompt 默认替换全局系统提示：在有 credit 与合规要求的产品里是安全问题</li><li>probability 随机插入：可复现交给 seed 不交给 prompt 装配</li><li>递归触发 · sticky / cooldown / delay：时间轴单位是消息条数；递归会撑爆 prompt</li></ul></div>
    <div class="box"><b>规范层的妥协</b><ul><li>V3 @@ 装饰器（把控制信息写进正文）：我们自定 schema，不需要</li><li>PNG tEXt 塞多个资产：V3 自己都说改用 .charx</li><li>⚠ 命名陷阱：酒馆的 Persona = <b>用户</b>人设；PixelVault 现有 <code>persona</code> = <b>角色</b>的行为与说话方式，同名异义，文档必须写清</li></ul></div>
  </div>` +
  sec('PixelVault 独有 · 酒馆没有的七件（抄不来）') +
  `<div class="cols">
    <div class="box"><b>1 参考图槽带生成语义</b>酒馆 assets 只有 icon / background / user_icon / emotion 四种展示用途；我们 11 类 role 直接映射各 provider 的参考槽。</div>
    <div class="box"><b>2 音色一等公民</b>voiceCardId 软引用 + voiceProfile{emotions, sampleLines} 参与视频编译（Vidu voice_id）与配音间 cast；酒馆 TTS 是第三方扩展。</div>
    <div class="box"><b>3 一致性检查闭环</b>stabilityScore + character-refine：卡能自评、能被修；聊天没有客观的「像不像」。</div>
    <div class="box"><b>4 跨 provider 编译</b>一张卡 → N 个形状各异的 API（一张图 / 多张带 role / 只吃文本 / 吃 LoRA 权重）；酒馆所有 LLM 接口同构。</div>
    <div class="box"><b>5 LoRA 绑定与训练血缘</b>loras + LoraTrainingJob。</div>
    <div class="box"><b>6 变体树</b>parentId / variantLabel：动画版 / 3D 版 / Q 版是父子且随父删；酒馆只有扁平列表 + version 字符串。</div>
    <div class="box" style="grid-column:span 3"><b>7 生成物反向关联</b>GenerationCharacterCard：归档产品必须能回答「这张卡生成过哪些图 / 视频」。</div>
  </div>` +
  decided('description 现在拆 · loreEntries 做最小版', [
    'description 只留视觉描述进编译器；新增 summary 给人看、不进 prompt。随 D6 一起做迁移：现有文字默认归视觉，简介留空待补。',
    'loreEntries 最小版：纯文本 keys + slot（正面前缀 / 后缀 / 负面 / 参考图选择）+ order + enabled；不做正则 / 递归 / 概率 / 装饰器。',
  ]) +
  decided('酒馆里最想要的两个能力 · 机制已核实（research §12）', [
    '① 语气：酒馆有，而且是整张卡的主线——承载嗓音的不是形容词字段，是示例对白 mes_example 以「真实轮次」形态注入（Instruct 套同一组前后缀 / CC 拆成 system+name），上下文吃紧时按 <START> 块整块裁、示例先于聊天历史被挤出。→ PixelVault：persona 必补 examples[]（按场景切成多个独立 block，喂 LLM 时按轮次渲染）；预算按 block 砍。',
    '① 情感：酒馆有但不是我们要的——事后分类（本地 BERT 28 类 go-emotions 或多问一次 LLM 只输出一个词），只为换立绘，不进 prompt、TTS 里没有情绪通道。→ PixelVault 不照抄：台词生成直接产出 {line, emotion, delivery} 结构化结果；自定面向表演的十几类情绪词表，JSON Schema enum + 多级解析容错 + 按这张卡实际有的表情图 / 音色情绪档裁剪候选（filterAvailable）；配音单元从第一天就是结构化 {text, speaker, emotion}。',
    '① 群聊保口吻靠四道闸：一次生成只跑一个角色（不是提示词工程）· 其他成员名进 stop sequences · 「只写 @X」钉在历史末尾且预留预算不被裁 · 推理隔离。→ 单角色台词 / 配音照抄这四条；我们「按槽分」= 酒馆 Swap，方向对。',
    '② 关系：酒馆没有原生字段（V2 / V3 规范 0 处、全量前端 UI 0 处，三重核实）；根因是「一张 PNG 自包含」不允许卡间硬引用——对我们不成立。社区十来个扩展全走「LLM 抽取 → 自存 → 自注入」，无事实标准。→ PixelVault 两者都要：relations[]{targetCardId, relation, note, strength?} 结构化存作事实层（双向、可投影到剧本节点、可统计同框次数）；注入时降解成 lorebook 式条目（keys = 对方 handle）只在对方出场才花预算，并按视角裁剪。',
    '两个坑：World Info 的 Character Filter 实际按「当前发言者」而非「在场」过滤，群聊只加载当前发言者那一张卡的 character_book——多角色同框时我们要让所有在场角色的卡级设定都在场；点名匹配用 \\b\\w+\\b 整词，中文名直接失效——@角色 锚点不能用整词匹配。',
  ]) +
  sec('v3 字段草案（摘要）', '判据：需查询 / 索引 / 外键 / 被编译器读 → Prisma 列；形状未定 → extensions 观察') +
  table(['字段', '来源', '用途', '落点'], [
    ['<code>handle</code>', tag('借 V3 nickname', GREEN), '@名字 锚点，user 内唯一', 'Prisma 新列'],
    ['<code>description</code>', tag('收窄', AMBER), '只放视觉', 'Prisma（现有）'],
    ['<code>summary</code>', tag('借 creator_notes', GREEN), '给人看，不进 prompt', 'Prisma 新列'],
    ['<code>relations[]</code>', tag('自有', FG), '角色关系（事实层，双向）；注入时降解为 lore 条目', 'Prisma JSON'],
    ['<code>persona.examples[]</code>', tag('借 mes_example 形态', GREEN), '按场景分 block 的示例对白，按轮次渲染', 'Prisma（现有 persona 内）'],
    ['情绪词表 · <code>{line, emotion, delivery}</code>', tag('反着借', AMBER), '模型直接输出结构化台词，不事后分类；enum + 容错 + filterAvailable', 'constants + 台词生成契约'],
    ['<code>persona</code>', tag('自有 · 同名异义', RED), '行为 · 说话方式 · 口头禅 · 范例 → 对白与音色情绪', 'Prisma（现有）'],
    ['<code>referenceSlots[]</code>', tag('借 assets 形状', GREEN), 'role · url · cardId · isPrimary', 'Prisma JSON（35）'],
    ['<code>loreEntries[]</code> / <code>loreConfig</code>', tag('借 character_book', GREEN), '条件注入最小版', 'extensions → 表'],
    ['<code>posePresets[]</code>', tag('借 alternate_greetings', GREEN), '3–5 个默认姿态', 'extensions'],
    ['<code>extensions</code>', tag('借', GREEN), '逃生舱，不认识的键不销毁', 'Prisma 新列'],
    ['<code>negativePrompt</code>', tag('自有', FG), '一致性护栏', 'extensions 起步'],
  ]) +
  `<div class="cap">完整表（身份 / 视觉与编译 / 参考图 / 音色 / 条件注入 / 归档元数据）见 research/sillytavern-cards.md §10；D6 ① 反问会把「关系怎么编」「以角色口吻的入口放哪」「summary 与 persona 在向导第几步填」列进去。</div>`

for (const [name, html] of [['DesignCardsTavern.dc.html', page('卡片 · 酒馆对照', BODY)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
