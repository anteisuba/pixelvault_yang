// D3 · API key 门 + /settings + 顶栏胶囊：① 反问（五题带选项 + 小线框 + 建议）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .q { margin-top:30px; border:1px solid ${BORDER}; border-radius:14px; padding:18px 20px 20px }
  .q h2 { margin:0; font-size:17px; font-weight:600 } .q .why { margin:6px 0 0; font-size:13px; color:#525252; line-height:1.55 }
  .opts { display:flex; gap:16px; margin-top:14px; align-items:stretch; flex-wrap:wrap }
  .opt { flex:1; min-width:300px; border:1px solid ${BORDER}; border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:10px; background:#fff }
  .opt.rec { border-color:${FG}; box-shadow:0 0 0 3px ${MUTEDBG} }
  .opt b { font-size:13.5px } .opt .desc { font-size:12.5px; color:#525252; line-height:1.55 }
  .mock { background:${WORKBENCH}; border-radius:10px; padding:12px; min-height:120px; position:relative; overflow:hidden }
  .pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:999px; border:1px solid ${BORDER}; background:#fff; font-size:11px }
  .rec-tag { ${MONO} font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:${FG}; border-radius:999px; padding:2px 8px; display:inline-block; margin-left:8px; vertical-align:middle }
  .pros { font-size:12px; color:#404040; line-height:1.55 } .pros span { color:${MUTED} }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const dot = (c) => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};flex:none"></span>`
const bar = (w, h = 8, c = '#d4d4d4', extra = '') => `<div style="width:${w};height:${h}px;border-radius:4px;background:${c};${extra}"></div>`
const opt = (letter, title, desc, mock, pros, rec = false) => `<div class="opt${rec ? ' rec' : ''}"><div><b>${esc(letter)} · ${esc(title)}</b>${rec ? '<span class="rec-tag">建议</span>' : ''}</div><div class="mock">${mock}</div><div class="desc">${esc(desc)}</div><div class="pros">${pros.map((p) => `<div>· ${esc(p)}</div>`).join('')}</div></div>`
const q = (n, title, why, opts) => `<div class="q"><h2>Q${n} · ${esc(title)}</h2><p class="why">${esc(why)}</p><div class="opts">${opts.join('')}</div></div>`

// ── 小线框 ──
const shellFrame = (inner) => `<div style="display:flex;gap:8px;height:150px"><div style="width:52px;border-radius:8px;background:#e6e6e2"></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};position:relative;overflow:hidden">${inner}</div></div>`
const settingsPage = `<div style="display:flex;height:100%"><div style="width:96px;border-right:1px solid ${BORDER};padding:10px 8px;display:flex;flex-direction:column;gap:7px;font-size:10px"><div style="font-weight:600">API key</div><div style="color:${MUTED}">用量</div><div style="color:${MUTED}">偏好</div><div style="color:${MUTED}">助手人设</div><div style="color:${MUTED}">记忆</div></div><div style="flex:1;padding:10px 12px;display:flex;flex-direction:column;gap:6px">${['fal', 'OpenAI', '火山 Ark', 'NovelAI'].map((p, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:10.5px;padding:5px 8px;border:1px solid ${BORDER};border-radius:6px">${dot(i === 1 ? RED : i > 1 ? '#c4c4c4' : GREEN)}<span style="flex:1">${p}</span><span class="tok" style="font-size:9.5px">${[31, 5, 9, 4][i]} 模型</span></div>`).join('')}</div></div>`
const drawer = `<div style="position:absolute;inset:0;background:rgba(0,0,0,.18)"></div><div style="position:absolute;top:0;right:0;bottom:0;width:62%;background:#fff;box-shadow:${SH_FLOAT};padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600"><span>设置</span><span style="color:${MUTED}">×</span></div><div style="display:flex;gap:6px;font-size:9.5px;color:${MUTED}"><span style="color:${FG};border-bottom:1.5px solid ${FG}">key</span><span>用量</span><span>偏好</span><span>人设</span><span>记忆</span></div>${['fal', 'OpenAI', '火山 Ark'].map((p, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:10px;padding:4px 8px;border:1px solid ${BORDER};border-radius:6px">${dot(i === 1 ? RED : GREEN)}<span style="flex:1">${p}</span></div>`).join('')}</div>`

const q1 = q(1, '/settings 是整页还是右侧大抽屉', '13 要新增「key · 用量 · 偏好 · 助手人设 · 记忆总览」五块；现在只有一个 key 抽屉（ApiKeyManager · Sheet），从侧栏底部、画布 ⌘K、账户菜单三处打开。', [
  opt('A', '整页路由 /settings', '左侧分区导航 + 右侧内容；每块一个子路由（/settings/keys …），可直链、可回退、手机变纵向列表。', shellFrame(settingsPage), ['五块内容都有地方长；记忆总览这种长列表只有整页装得下', '缺 key 弹层里的「管理全部 key」直接跳 /settings/keys', '代价：离开当前工作台一次'], true),
  opt('B', '右侧大抽屉（Sheet 560px）', '任何页都能开，不离开工作台；分区变顶部 tab；URL 带 ?settings=keys 以便直链。', shellFrame(drawer), ['配 key 不打断正在写的提示词', '记忆总览、用量明细在 560px 里拥挤，要二级滚动', '与现有 ApiKeyManager 抽屉是同一形态，改造量最小']),
  opt('C', '整页为主 + key 抽屉保留', 'A 的整页承载五块；现有 key 抽屉只保留「快速看健康 / 加一把」，内容与 /settings/keys 同一组件。', shellFrame(settingsPage.replace('flex:1;padding:10px 12px', 'flex:1;padding:10px 12px;opacity:.55') + `<div style="position:absolute;top:0;right:0;bottom:0;width:46%;background:#fff;box-shadow:${SH_FLOAT};padding:10px 12px;font-size:10px"><div style="font-weight:600;margin-bottom:6px">API key</div>${['fal', 'OpenAI'].map((p, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid ${BORDER};border-radius:6px;margin-bottom:4px">${dot(i ? RED : GREEN)}<span style="flex:1">${p}</span></div>`).join('')}<div style="color:${MUTED};margin-top:6px">全部设置 →</div></div>`), ['两个面都保留，但多一处要维护同步', '快捷抽屉与整页的边界要写清（抽屉只读 + 加 key，编辑去整页）']),
])

const q2 = q(2, 'key 页按什么组织一行', '一把 key 解锁多个模型（fal 31 个），同一 provider 又可能有两把 key（个人 / 工作）；现在 ApiKeyManager 是「按 key 一行」。', [
  opt('A', '按 provider 一行，展开管多把', '行 = provider 名 · 健康点 · 解锁 N 模型 · 本月用量；点开才看到这家的每把 key（标签 · 末四位 · 上次校验 · 删除）。', `<div style="display:flex;flex-direction:column;gap:6px">${[['fal.ai', GREEN, '31 模型', '$12.40'], ['OpenAI', RED, '5 模型 · 401 失效', '—'], ['火山 Ark', '#c4c4c4', '9 模型 · 未配置', '—']].map(([p, c, m, u]) => `<div style="display:flex;align-items:center;gap:10px;font-size:11px;padding:8px 10px;background:#fff;border:1px solid ${BORDER};border-radius:8px">${dot(c)}<span style="flex:1;font-weight:500">${p}</span><span class="tok">${m}</span><span class="tok" style="color:${MUTED}">${u}</span></div>`).join('')}<div style="margin-left:22px;display:flex;gap:6px;font-size:10px;color:${MUTED}"><span class="pill">个人 · …a3f9 ${dot(GREEN)}</span><span class="pill">工作 · …c201 ${dot(GREEN)}</span><span class="pill">+ 加一把</span></div></div>`, ['新用户先看到「哪家没配」，失效的排最前标红', '与选择器渠道面板的绿 / 黄点同一套语义', '多把 key 是少数人的事，折进二级'], true),
  opt('B', '按 key 一行（现状）', '每把 key 一行：标签 · provider · 健康 · 能力表；provider 重复出现。', `<div style="display:flex;flex-direction:column;gap:6px">${[['fal 个人', 'fal.ai'], ['fal 工作', 'fal.ai'], ['OpenAI', 'OpenAI'], ['Fish', 'Fish Audio']].map(([k, p]) => `<div style="display:flex;align-items:center;gap:10px;font-size:11px;padding:7px 10px;background:#fff;border:1px solid ${BORDER};border-radius:8px">${dot(GREEN)}<span style="flex:1">${k}</span><span class="tok" style="color:${MUTED}">${p}</span></div>`).join('')}</div>`, ['改动最小', '看不出「还有哪家没配」，列表随 key 数变长']),
  opt('C', '按模态分组（图 · 视频 · 音频 · 3D）', '每组下列 provider；一家跨多组会重复出现（fal 四组都有）。', `<div style="display:flex;flex-direction:column;gap:6px;font-size:11px">${['图片 · fal · OpenAI · 火山 · NovelAI', '视频 · fal · 火山 · MiniMax', '音频 · Fish · ElevenLabs'].map((t) => `<div style="padding:7px 10px;background:#fff;border:1px solid ${BORDER};border-radius:8px">${t}</div>`).join('')}</div>`, ['贴近「我要做视频，缺谁的 key」', 'fal 一把 key 出现四次，重复感强']),
])

const ring = (pct, txt) => `<div style="display:inline-flex;align-items:center;gap:6px"><svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" stroke="${BORDER}" stroke-width="3" fill="none"/><circle cx="11" cy="11" r="9" stroke="${FG}" stroke-width="3" fill="none" stroke-dasharray="${(pct * 56.5).toFixed(1)} 56.5" stroke-linecap="round" transform="rotate(-90 11 11)"/></svg><span style="font-size:11px">${txt}</span></div>`
const q3 = q(3, '用量 / 额度怎么表达（页内与胶囊里）', '平台额度这一档不存在；能显示的只有：Runner 自托管月额度（42 / 300）、按各渠道单价累计的本月花费估算（用自己的 key，真实账单在 provider 那边）。', [
  opt('A', '只显数字', '胶囊：「¥86」或「42 / 300」纯数字；页内一张表：provider · 本月次数 · 估算花费；Runner 一行「42 / 300 · 月底重置」。', `<div style="display:flex;flex-direction:column;gap:8px"><div class="pill" style="height:26px">$86.20 <span style="color:${MUTED}">本月</span></div><div style="font-size:11px;display:flex;flex-direction:column;gap:4px">${[['fal', '128 次', '$61.10'], ['OpenAI', '40 次', '$25.10'], ['Runner', '42 / 300', '¥0']].map(([p, n, c]) => `<div style="display:flex;gap:10px;padding:5px 8px;background:#fff;border:1px solid ${BORDER};border-radius:6px"><span style="flex:1">${p}</span><span class="tok">${n}</span><span class="tok">${c}</span></div>`).join('')}</div></div>`, ['文字最少，符合你「尽量减少文字」', '估算花费要标「估算」，与真实账单不一致时不背锅'], true),
  opt('B', '环形进度', '胶囊里一个小环 + 数字；只有 Runner 有分母能画环，用 key 的花费没有上限，环没意义。', `<div style="display:flex;gap:14px;align-items:center">${ring(0.14, '42 / 300')}${ring(0.6, '$86')}<span style="font-size:11px;color:${MUTED}">← 第二个环的分母是什么？</span></div>`, ['一眼看饱和度', '除 Runner 外没有分母，环会误导']),
  opt('C', '数字 + 用户自设预算条', '用户在 /settings 设一个月预算（可不设）；设了才出细进度条，胶囊里数字变色（接近预算 → warning）。', `<div style="display:flex;flex-direction:column;gap:8px"><div class="pill" style="height:26px;color:${AMBER};border-color:${AMBER}">$86 / $100</div>${bar('100%', 6, BORDER)}${bar('86%', 6, AMBER, 'margin-top:-6px')}<div style="font-size:10.5px;color:${MUTED}">未设预算时 = A</div></div>`, ['给了「别花超」的闸，也不逼没需求的人设', '多一个设置项与一条阈值逻辑']),
])

const q4 = q(4, '助手人设与记忆总览放哪', '56 说记忆总览「进 /settings」；人设三档（助手重审 2026-09-09）现在在助手面板里切。两者都是「关于助手」的设置。', [
  opt('A', '都进 /settings 的「助手」分区', '/settings/assistant：人设三档 · 记忆总览（可见可编 · 来源可溯）· 隐身模式 · 敏感类目开关。助手面板只留一个「设置 →」入口。', `<div style="font-size:11px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;gap:6px">${['简洁', '标准 ✓', '详尽'].map((t) => `<span class="pill">${t}</span>`).join('')}</div>${['喜欢暗色霓虹街景 · 来自 3 次生成', '常用 Seedance 2.5 · 火山', '不要记：地址 / 支付'].map((t) => `<div style="padding:5px 8px;background:#fff;border:1px solid ${BORDER};border-radius:6px;display:flex;justify-content:space-between"><span>${t}</span><span style="color:${MUTED}">✎</span></div>`).join('')}</div>`, ['「关于我」的东西集中一处，符合 13 的清单', '记忆是长列表，整页才装得下'], true),
  opt('B', '留在助手面板里', '人设与记忆都在助手面板的齿轮里；/settings 不碰助手。', `<div style="display:flex;gap:8px;height:120px"><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div><div style="width:46%;border-radius:8px;background:#fff;border:1px solid ${BORDER};padding:8px;font-size:10px"><div style="display:flex;justify-content:space-between"><span>助手</span><span>⚙</span></div><div style="margin-top:6px;color:${MUTED}">人设 · 记忆 · 隐身</div></div></div>`, ['就地改，不跳页', '记忆总览在窄面板里只能一屏几条']),
  opt('C', '两处入口，同一页', '助手面板齿轮直接打开 /settings/assistant（整页或 Q1 选的形态），不另做一套。', `<div style="font-size:11px;color:#525252;line-height:1.6">助手 ⚙ → /settings/assistant<br>侧栏 / 胶囊 → /settings → 助手<br>同一组件，两条路</div>`, ['A 的收纳 + B 的就近', '要保证从面板跳过去再回来不丢会话（返回键）']),
])

const capsule = (inner) => `<div style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 6px 0 10px;border-radius:999px;background:color-mix(in oklab,#fff 78%,transparent);backdrop-filter:blur(12px);border:1px solid rgba(0,0,0,.08);box-shadow:${SH_FLOAT};font-size:11.5px">${inner}</div>`
const avatar = `<span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#bbb,#888);display:inline-block"></span>`
const q5 = q(5, '应用内顶栏胶囊与侧栏底部账户行的关系', '14 说胶囊（头像 · 额度 · 语言 · key）是 /settings 唯一入口，两态：首页浮岛 / 应用内右上小胶囊。现在侧栏底部已有「积分读数 + 头像菜单」一行。', [
  opt('A', '胶囊替代侧栏底部行', '侧栏只剩导航；账户与额度全部搬到右上胶囊，桌面与手机同一颗（手机在顶栏右侧）。', `<div style="display:flex;gap:8px;height:130px"><div style="width:52px;border-radius:8px;background:#e6e6e2"></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};position:relative"><div style="position:absolute;top:8px;right:8px">${capsule(`<span class="tok">$86</span><span style="width:1px;height:14px;background:${BORDER}"></span><span style="color:${MUTED}">EN</span>${avatar}`)}</div></div></div>`, ['一处入口，14 的「唯一入口」成立', '侧栏折叠时账户仍可达（胶囊不随侧栏走）', '要处理胶囊与页面自己右上角内容（画布工具栏）的位置冲突'], true),
  opt('B', '两处并存', '侧栏底部保留读数 + 头像；胶囊只在首页浮岛出现，应用内不加。', `<div style="display:flex;gap:8px;height:130px"><div style="width:52px;border-radius:8px;background:#e6e6e2;position:relative"><div style="position:absolute;bottom:6px;left:6px;right:6px;height:18px;border-radius:9px;background:#d0d0cc"></div></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div></div>`, ['改动最小', '与 14 冲突：应用内没有胶囊，/settings 入口仍藏在头像菜单']),
  opt('C', '桌面侧栏行 · 手机胶囊', '桌面保留侧栏底部行（加「设置」项）；手机没有侧栏，用顶栏胶囊。', `<div style="display:flex;gap:14px;align-items:flex-end"><div style="display:flex;gap:6px;height:110px"><div style="width:44px;border-radius:8px;background:#e6e6e2;position:relative"><div style="position:absolute;bottom:6px;left:5px;right:5px;height:16px;border-radius:8px;background:#d0d0cc"></div></div><div style="width:90px;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div></div><div style="width:64px;height:110px;border-radius:12px;background:#e6e6e2;position:relative"><div style="position:absolute;top:6px;right:5px;width:34px;height:14px;border-radius:7px;background:#fff;border:1px solid ${BORDER}"></div></div></div>`, ['各端沿用各自习惯位置', '两套入口两套状态，14 的「两态」变成「两处」']),
])

const ASK = header('PixelVault · D3 · ① 反问 · 2026-09-18', 'API key 门 + /settings + 顶栏胶囊 · 五题', 'D2 落地后，缺 key 的渠道点进去有了面 1（QuickSetupDialog），但「全部 key · 用量 · 偏好 · 助手人设 · 记忆」还没有家，胶囊（14）也还没定与侧栏的关系。五题各给 A / B / C 与小线框，加黑边的是我的建议；答完出 ② 思维导图。已定不再问：缺 key 一律灰显可点 → 面 1；没有平台额度档；面 1 是现有 QuickSetupDialog 原样。') + q1 + q2 + q3 + q4 + q5

for (const [name, html] of [['DesignD3Ask.dc.html', page('D3 ① 反问', ASK)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
