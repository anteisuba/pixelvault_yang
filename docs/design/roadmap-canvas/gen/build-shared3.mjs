// Page 5 additions: API key gate, ⌘K command palette, list page header.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', GREEN = '#16794c', AMBER = '#a04f00', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
`
const page = (title, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap">
  <style>${STYLE}</style>
</helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">
${body}
</div>
</x-dc>
</body>
</html>
`
const header = (title, sub) => `<div style="margin-bottom:24px;max-width:960px"><div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">PixelVault · 共享组件 · 2026-09-17</div><h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2">${esc(title)}</h1><p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p></div>`
const sec = (t, s) => `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(t)}</div>${s ? `<div style="font-size:12px;color:${MUTED}">${esc(s)}</div>` : ''}</div>`
const table = (cols, rows) => `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const label = (t) => `<div style="${MONO}font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:8px">${esc(t)}</div>`
const frame = (inner) => `<div style="padding:22px;background:#f5f5f5;border-radius:12px;display:flex;flex-direction:column;align-items:flex-start;gap:12px">${inner}</div>`
const cap = (t) => `<div style="font-size:12px;line-height:1.55;color:#525252;max-width:560px">${esc(t)}</div>`
const panel = (inner, w = 340) => `<div style="width:${w}px;background:#fff;border:1px solid ${LINE};border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:8px;display:flex;flex-direction:column;gap:2px">${inner}</div>`
const btn = (t, dark = false) => `<span style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:999px;background:${dark ? FG : '#fff'};color:${dark ? '#fff' : FG};border:1px solid ${dark ? FG : LINE};font-size:12px;font-weight:500;white-space:nowrap">${esc(t)}</span>`
const seg = (items) => `<div style="display:inline-flex;padding:3px;border-radius:9px;background:#ececec;gap:2px">${items.map(([t, on]) => `<div style="padding:5px 10px;border-radius:7px;background:${on ? '#fff' : 'transparent'};box-shadow:${on ? '0 1px 2px rgba(0,0,0,.12)' : 'none'};font-size:12px;font-weight:${on ? 600 : 500};white-space:nowrap">${esc(t)}</div>`).join('')}</div>`
const chipx = (t) => `<span style="display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px 0 10px;border-radius:999px;background:#fff;border:1px solid ${LINE};font-size:12px">${esc(t)}<span style="color:${MUTED}">×</span></span>`

// ═══ key 门 ═══
const kRow = (name, status, color, right) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px"><div style="width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#e6e6e6,#f4f4f4);flex:none"></div><div style="flex:1;font-size:13px;font-weight:500">${esc(name)}</div><span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:${color}"><span style="width:7px;height:7px;border-radius:999px;background:${color};display:inline-block"></span>${esc(status)}</span><span style="${MONO}font-size:11px;color:${MUTED};min-width:70px;text-align:right">${esc(right)}</span></div>`
const B_KEY = header('API key 门 · 五种表现 → 一种规则、两个面', '缺 key 现在有五种表现：模型灰显可点（方案 A）、锁标 + 禁用（三层钻取）、点生成才弹 QuickSetupDialog、侧栏抽屉通盘管理、3D / LoRA 各自的提示条。规则收成一条：缺 key = 灰显可点 → 内联配置；面收成两个：内联配置弹层（一把 key）与账户页（全部 key）。') +
  sec('现状 · 五处') + table(['位置', '组件', '表现', '问题'], [
    ['模型选择器（方案 A）', 'ModelPickerPopover → onRequestSetup', '灰显可点，点了弹 QuickSetupDialog', '正确基线'],
    ['模型选择器（三层）', 'BaseModelPickerPanel', '锁标，点进 setup', '两种表现并存；随方向 A 消失'],
    ['生成按钮', 'StudioPromptArea / Studio3DWorkspace / LoraWorkbench', '点生成才发现缺 key，弹窗', '发现太晚；用户已写完提示词'],
    ['侧栏 / 移动顶栏', 'ApiKeyDrawerTrigger → ApiKeyManager 抽屉', '通盘管理：增删改、健康点、能力表', '新用户找不到「在哪配 key」'],
    ['画布', 'ShellApiKeys（⌘K 动作 / 顶栏）', '同一抽屉的第二个入口', '与工作台入口位置不同'],
  ]) +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px">
    <div>${frame(label('面 1 · 内联配置弹层 QuickSetupDialog（一把 key）') + panel(`<div style="padding:10px 10px 4px;font-size:14px;font-weight:600">配置 fal 的 key 才能用 Kling O3 Pro</div><div style="padding:0 10px 8px;font-size:12px;color:${MUTED}">fal 一把 key 同时解锁 Kling · Wan · HappyHorse · FLUX 2 等 31 个模型</div><div style="margin:0 10px;padding:8px 10px;border-radius:8px;background:#f5f5f5;font-size:12px;${MONO}color:${MUTED}">fal_xxxxxxxxxxxxxxxx</div><div style="display:flex;justify-content:space-between;align-items:center;padding:10px 10px 4px"><span style="font-size:11.5px;color:${MUTED};text-decoration:underline">去 fal.ai 拿 key →</span><div style="display:flex;gap:6px">${btn('用平台额度先出一张')}${btn('保存并继续', true)}</div></div>`) + cap('标题写清「为什么现在要它」与「这把 key 还能解锁什么」；保存后即时校验（健康点），成功回到刚才的动作继续；有平台额度的模型给「先出一张」的旁路，不逼配置。'))}</div>
    <div>${frame(label('面 2 · 账户页 /settings · key 与额度（全部 key）') + panel(`<div style="padding:8px 10px 4px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:14px;font-weight:600">API key</span>${btn('+ 添加')}</div>${kRow('fal.ai', '健康', GREEN, '31 模型')}${kRow('OpenAI', '401 · 失效', RED, '5 模型')}${kRow('Fish Audio', '健康', GREEN, '2 模型')}${kRow('火山 Ark', '未配置', '#a3a3a3', '9 模型')}${kRow('NovelAI', '未配置', '#a3a3a3', '4 模型')}<div style="padding:10px 10px 4px;border-top:1px solid ${LINE};margin-top:4px;display:flex;justify-content:space-between;font-size:12px"><span style="color:${MUTED}">平台额度 · 今日 3 / 10 张 · Runner 本月 42 / 300</span><span style="text-decoration:underline">用量明细</span></div>`, 360) + cap('抽屉的内容升级成一页：每行 = provider · 健康 · 解锁模型数；失效的 key 排最前并标红；额度与用量在同一页。抽屉保留作快捷入口，内容即此页。'))}</div>
  </div>` +
  sec('契约') + table(['项', '约定'], [
    ['一条规则', '缺 key 的模型 / 渠道一律灰显可点，点了弹面 1；不再有锁标 + 禁用、也不再等到点生成才提示'],
    ['前置提示', '模型选择器行第二行已写「缺 key · 点击配置」；生成按钮在缺 key 时文案改「配置 key 并生成」而不是禁用'],
    ['平台额度', '这一档不存在（owner 2026-09-17）：全部自己的 key，只有 Gemini 走平台 key 自动配置；freeTier / freeQuota 概念从代码里删（进度表 60）'],
    ['健康度', '保存即校验；失效 key（401）在选择器渠道区显示「上次选的 X 已不可用，已回到自动」（方案 ①）'],
    ['一把 key 多模型', '面 1 与面 2 都显示「这把 key 解锁 N 个模型」，来源 provider-capabilities'],
    ['入口', '侧栏底部 key 图标 · 账户菜单 · ⌘K「配置 key」· 画布顶栏 — 四处都开同一页 / 同一弹层'],
  ])

// ═══ ⌘K ═══
const cmd = (t, right = '', on = false) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;background:${on ? '#f5f5f5' : 'transparent'};font-size:13px"><span style="flex:1">${esc(t)}</span><span style="${MONO}font-size:10.5px;color:${MUTED}">${esc(right)}</span></div>`
const gh = (t) => `<div style="${MONO}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};padding:8px 10px 4px">${esc(t)}</div>`
const B_CMDK = header('⌘K 命令面板 · 两份实现 → 一份注册表、按页面注入', '工作台的 StudioCommandPalette 只管模态 / 工作流 / 模型；画布的 ShellCommandPalette 管节点定位 / 新建 / 上传 / 问助手 / 剪辑台 / 切项目。同一个动作在两处名字不同，切页命令两处都没有。') +
  sec('现状 · 两份词表') + table(['分组', '工作台 StudioCommandPalette', '画布 ShellCommandPalette'], [
    ['切页 / 模态', '图片 / 视频 / 音频模式（页内切）', '—（只能切项目）'],
    ['新建', '—', '新建 文本 / 图片 / 声音 / 视频 节点（带查询词当名字）'],
    ['定位', '—', '搜节点定位（缩略 · 名 · 子型）'],
    ['模型', '按模型名 + key 名 + 渠道搜，直接切模型', '—'],
    ['工作流', '快速生成 / 卡片生成', '—'],
    ['上传 / 素材', '—', '上传 ⌘U'],
    ['助手', '—', '问助手「…」'],
    ['其他', '—', '剪辑台 · 切换项目 · 配置 key'],
  ]) +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px">
    <div>${frame(label('统一面板 · 空查询时按页面注入') + panel(`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid ${LINE};font-size:13px;color:${MUTED}">输入命令、模型、节点或页面…<span style="margin-left:auto;${MONO}font-size:10.5px">esc</span></div>${gh('本页 · 画布')}${cmd('新建 图片节点', 'I', true)}${cmd('新建 视频节点', 'V')}${cmd('上传…', '⌘U')}${cmd('问助手「…」', '')}${cmd('剪辑台', '')}${gh('去处')}${cmd('图片工作台', '⌘⇧1')}${cmd('素材库', '')}${cmd('画廊', '')}${gh('模型 · 当前节点')}${cmd('Seedance 2.5 · BytePlus', '$0.23/s')}${cmd('Kling O3 Pro', '$0.11/s')}${gh('账户')}${cmd('配置 API key', '')}${cmd('切换项目 · 借伞', '')}`) + cap('顺序固定：本页动作 → 去处（全站切页）→ 模型（当前上下文的模型集）→ 账户。查询非空时四组合并按匹配度排，模型搜索沿用「模型名 + key 名 + 渠道」。'))}</div>
    <div>${frame(label('注册表 · 一份，按 page / context 过滤') + table(['字段', '说明'], [
      ['id · 标题 · 图标 · 分组', '分组 ∈ 本页 / 去处 / 模型 / 账户'],
      ['pages[]', '在哪些页面出现（* = 全站）；「去处」组全站可见'],
      ['context?', '需要的上下文（当前节点类型 · 当前模态 · 已选卡）；不满足则隐藏而非禁用'],
      ['shortcut', '与全站快捷键表同一来源（⌘⇧1/2/3 · T/I/A/V · ⌘U · ⌘K）'],
      ['run(query)', '带查询词（新建节点用它当名字、问助手用它当问题）'],
      ['keywords · i18n', '三语标签 + 别名（「生图」「出图」都命中新建图片节点）'],
    ]) + cap('工作台与画布各自只提供「本页」组的条目；去处 / 账户两组由壳提供；模型组由当前页的模型选择器数据源提供（同一份 StudioModelOption）。'))}</div>
  </div>` +
  sec('契约') + table(['项', '约定'], [
    ['一份注册表', 'src/constants/commands.ts 定义分组与全站条目；各页用 useRegisterCommands() 注入本页条目，卸载即移除'],
    ['触发', '⌘K 全站；壳顶栏 / 侧栏搜索图标；画布右键菜单末项「更多命令…」'],
    ['查询语义', '前缀 > 去 X（切页）· @ 定位节点 / 素材 · / 调 skill（助手 skill 想法落地时）· 其余全文'],
    ['最近', '顶部「最近使用」≤3 条，按页记'],
    ['键盘', '↑↓ Enter Esc；⌘Enter 在新标签打开去处'],
    ['手机', '同一列表 inline 进 Sheet；快捷键列隐藏'],
  ])

// ═══ 列表页头 ═══
const B_LIST = header('列表页页头 · 四个去处页四种头 → 一个 ListPageHeader', '画廊是大标题 + 分面 chip + 计数；素材库是吸顶实色工具条 + 五分面 + 密度；卡片页是三 tab；提示词页是双 tab + 搜索。它们都在做同一件事：标题 · 计数 · 分面 · 排序 · 视图密度 · 主动作。') +
  sec('现状 · 四页') + table(['页', '组件', '结构', '差异'], [
    ['画廊 /gallery', 'GalleryFilterBar', '大标题「公开画廊」+ 右上计数 pill · 排序 chip 组 · 类型 chip 组 · 时间 chip 组 · 搜索 · 密度', '分面是并排 chip 组，占两行；无主动作'],
    ['素材库 /assets', 'AssetFacetBar（2026-08-30 契约）', '吸顶 rounded-2xl 实色工具条：类型 / 状态 / 模型 / 时间 / 排序 五分面下拉 + 已选 chip 可删 · 右侧 上传 / 选择 / 密度', '分面是下拉不是 chip；有主动作；吸顶'],
    ['卡片 /cards', 'CardManagerToolbar + tabs', '三 tab（角色 / 风格 / 背景）+ 工具栏', 'tab 是分类不是分面'],
    ['提示词 /prompts', 'PromptLibraryTabs', '双 tab（我的 / 灵感）+ 搜索 + 新建弹窗', '新建在页头'],
  ]) +
  `<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:22px">
    <div>${frame(label('统一页头 · 三行可折成一行') + `<div style="width:640px;background:#fff;border:1px solid ${LINE};border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:12px"><div style="font-size:20px;font-weight:600">素材库</div><span style="${MONO}font-size:11px;color:${MUTED}">已显示 20 / 1,284</span><div style="margin-left:auto;display:flex;gap:6px">${btn('上传', true)}${btn('选择')}${seg([['▦', true], ['▤', false]])}</div></div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${seg([['全部', false], ['图片', true], ['视频', false], ['声音', false], ['LoRA', false]])}<span style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;border:1px solid ${LINE};font-size:12px">模型 ▾</span><span style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;border:1px solid ${LINE};font-size:12px">时间 ▾</span><span style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;border:1px solid ${LINE};font-size:12px">最新优先 ▾</span><span style="margin-left:auto;display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 10px;border-radius:8px;background:#f5f5f5;font-size:12px;color:${MUTED}">搜索…</span></div>
      <div style="display:flex;align-items:center;gap:6px">${chipx('图片')}${chipx('Seedance 2.5')}${chipx('本周')}<span style="font-size:12px;color:${MUTED};text-decoration:underline;margin-left:4px">清除</span></div>
    </div>` + cap('行 1 = 标题 · 计数 · 主动作 · 密度；行 2 = 一级分面（分段控件，≤5 项）+ 二级分面（下拉）+ 排序 + 搜索；行 3 = 已生效条件 chip（可删 + 清除）。滚动吸顶时收成一行：标题变小、行 2 只留分段控件与搜索、行 3 并入。'))}</div>
    <div>${frame(label('四页怎么套') + table(['页', '一级分面', '二级分面', '主动作'], [
      ['素材库', '类型（全部 / 图 / 视频 / 声音 / LoRA）', '模型 · 时间 · 状态（已发布 / 收藏）· 排序', '上传 · 选择'],
      ['画廊', '类型', '模型 · 时间 · 排序', '—（未登录时「登录发布」）'],
      ['卡片', '角色 / 风格 / 背景', '来源 · 状态（DRAFT / STABLE）', '新建卡'],
      ['提示词', '我的 / 灵感', '类型 · 模型', '新建模板'],
    ]) + cap('卡片页与提示词页的 tab 就是一级分面，用同一个分段控件；不再各写一套 tabs。'))}</div>
  </div>` +
  sec('契约') + table(['项', '约定'], [
    ['组件', 'ListPageHeader{ title, count, primaryActions, facets: {primary, secondary[]}, sort, search, density, activeChips }'],
    ['URL 状态', '所有分面与排序进 query（现状素材库 / 画廊已如此），刷新与分享可复现'],
    ['吸顶', '同一组件两态：展开三行 / 吸顶一行；切换走 duration-base，reduced-motion 直接切'],
    ['皮肤', '去处页保持纯白浏览面；页头白卡 + border-border，不用工作台灰底'],
    ['手机', '行 1 保留标题 + 主动作；行 2 分段控件横滑；二级分面收进「筛选」Sheet；行 3 保留'],
    ['空态', '筛选无结果 = 页头之下一句「没有符合条件的 X」+ 清除按钮；真空态走空态引导卡'],
  ])

for (const [name, html] of [
  ['SharedKeyGate.dc.html', page('API key 门', B_KEY + reply(26, '删除「用平台额度先出一张」。', ['已删：契约表「平台额度」一行改为不做旁路；面 1 弹层不再出现第二个按钮，只剩「保存并生成」。', 'freeTier 仍保留在渠道排序里（方案 ① 的自动渠道），但不再作为 key 门的绕行。']))],
  ['SharedCmdK.dc.html', page('⌘K 命令面板', B_CMDK + reply(29, '这个我觉得可以换成右键或者双击出现的那个列表。', ['同意换入口，不换注册表：一份命令注册表不变，入口改为 ① 画布空白处右键 / 双击 = 「添加节点」列表（就是今天 ＋添加 的意图表 NODE_ASSISTANT_ADD_INTENTS）；节点上右键 = 结果去向菜单（批注 27 同一份）。', '② 工作台：结果卡与参考轨右键出同一份去向 / 参考动作；页面级动作（切页 · 新建 · 上传 · 问助手）挂在侧栏底部一枚「⋯」。', '③ ⌘K 只留给键盘用户，打开的仍是这同一份列表；顶栏 / 侧栏的搜索图标去掉，不再是两套词表。', '改动顺序：先合注册表（纯前端），再把右键 / 双击接上，最后删旧 ShellCommandPalette。']))],
  ['SharedListHeader.dc.html', page('列表页页头', B_LIST + reply(28, '素材库应该还有文件夹的设计。', ['补文件夹层：页头之下一条「文件夹条」= 面包屑（全部 › 角色 › 小雅）+ 子文件夹 chip 行 + 末尾「新建文件夹」；≥1280 宽时左侧 200px 文件夹树可折叠，窄屏只留面包屑。', '移动方式三种：卡片拖到 chip / 树节点上；多选后工具条「移到…」；素材详情 ⋯ 里「移到文件夹」（去向菜单同一注册表）。', '空文件夹给空态大标题 + 「从素材库拖进来」提示（设计师视角批注 39 / 54 的空态槽正好用在这里）。', '助手已能 list_folders 读文件夹；写操作（建 / 改名 / 移动）带撤销，按素材库四条写操作的既有契约。', '路由：文件夹进 URL（/assets?folder=），与 /assets/[id] 详情路由一起做（批注 45）。']))],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
