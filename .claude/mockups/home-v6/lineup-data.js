/* 阵容数据：从 src/constants/homepage-v4.ts 的 HOME_V4_STATIONS + marketing/zh.json 的 Homepage.v4.models 抽出（原型用） */
window.LINEUP = [
 {
  "cat": "图片",
  "key": "gpt",
  "name": "GPT Image 2",
  "img": "media/v4/model-gpt-image-2.webp",
  "pos": "全能第一名：盲测榜连续霸榜，最能读懂复杂指令。",
  "tags": [
   "海报排版",
   "复杂长指令",
   "多语言文字"
  ],
  "plus": [
   "图内文字排版几乎不出错，海报级可用",
   "多条件长 prompt 忠实度最高，不丢要素",
   "中日韩等多语言文字渲染同样在线"
  ],
  "minus": [
   "思考模式带来延迟，出图偏慢",
   "大批量成本高，透明底支持一般"
  ],
  "fare": "按用量计费",
  "routes": "在 ANTEI · 1 条线路"
 },
 {
  "cat": "图片",
  "key": "gemini",
  "name": "Gemini 3 Pro Image",
  "img": "media/v4/model-gemini-3-pro-image.jpg",
  "pos": "又快又稳的主力：2–5 秒出图，编辑控制最细。",
  "tags": [
   "快速迭代",
   "局部编辑",
   "真实场景"
  ],
  "plus": [
   "2–5 秒出图，改图不打断手感",
   "局部重绘、打光、镜头变换控制最细",
   "搜索接地：真实地标与光照有据可依"
  ],
  "minus": [
   "超现实、强风格化反而放不开",
   "小脸与小字等细节仍会崩"
  ],
  "fare": "$0.13 / 张 · Flash 档 $0.03–0.07",
  "routes": "在 ANTEI · 3 条线路"
 },
 {
  "cat": "图片",
  "key": "flux",
  "name": "FLUX 2 Pro",
  "img": "media/v4/model-flux-2-pro.jpg",
  "pos": "质感派：皮肤布纹少塑料光，长描述跟随极稳。",
  "tags": [
   "产品质感",
   "概念设定",
   "高性价比"
  ],
  "plus": [
   "真实质感：少「塑料光」，物体与材质刻画锐利",
   "双流架构，长描述型 prompt 跟随极稳",
   "同档质量里性价比最高，免调参"
  ],
  "minus": [
   "人像易出「瓷娃娃」式过度修饰",
   "图内文字渲染仍不稳定"
  ],
  "fare": "$0.03 / 张 · 编辑 $0.04 · Flash $0.005",
  "routes": "在 ANTEI · 5 条线路"
 },
 {
  "cat": "图片",
  "key": "seedream",
  "name": "Seedream 5.0",
  "img": "media/v4/model-seedream-5.jpg",
  "pos": "设计头脑：懂排版懂中文，还会边生成边查资料。",
  "tags": [
   "中文海报",
   "信息图",
   "设计排版"
  ],
  "plus": [
   "设计级排版理解：杂志封面一把出",
   "10+ 语言原生文字，中文最稳",
   "边生成边联网搜索，真实信息有据"
  ],
  "minus": [
   "长串文字仍会错，8–15 秒偏慢",
   "照片质感偏「AI 味」，写实弱于 Gemini"
  ],
  "fare": "$0.03–0.09 / 张 · 三条接入",
  "routes": "在 ANTEI · 5 条线路"
 },
 {
  "cat": "图片",
  "key": "recraft",
  "name": "Recraft V4 Pro",
  "img": "media/v4/model-recraft-v4-pro.webp",
  "pos": "设计师的那一档：唯一原生出 SVG，整段文字可读。",
  "tags": [
   "LOGO 矢量",
   "品牌物料",
   "整段文字"
  ],
  "plus": [
   "唯一能原生生成矢量 SVG 的模型",
   "整段可读文字：别家 2–3 词它能整段",
   "HF 文生图竞技场 2024 年 10 月起霸榜"
  ],
  "minus": [
   "$0.21 / 张 是图片区最贵",
   "设计特化：通用写实摄影不是主场"
  ],
  "fare": "$0.21 / 张",
  "routes": "在 ANTEI · 1 条线路"
 },
 {
  "cat": "图片",
  "key": "novelai",
  "name": "NovelAI Diffusion V5",
  "img": "media/v4/model-novelai-v5.webp",
  "pos": "动漫专精最新代：22 个角色同画不串，整页漫画一把出。",
  "tags": [
   "动漫立绘",
   "多角色同画",
   "漫画分格"
  ],
  "plus": [
   "体积翻倍 + 32 通道 VAE：发丝饰品级细节",
   "最多 22 个角色同画，多格漫画直接排",
   "日语繁中等多语言 prompt，支持透明底"
  ],
  "minus": [
   "动漫特化，写实场景不适用",
   "不进「无限用」档，计费比 V4.5 收紧"
  ],
  "fare": "按用量 · V4.5 档 $0.01 / 张起",
  "routes": "在 ANTEI · 4 条线路（V5 ×2 ＋ V4.5 ×2）"
 },
 {
  "cat": "角色底模",
  "key": "wai",
  "name": "WAI-Illustrious",
  "img": "media/v4/model-lora-wai-illustrious.webp",
  "pos": "人气调校版：开箱即出精致动漫脸。",
  "tags": [
   "人气调校",
   "开箱即用",
   "动漫角色"
  ],
  "plus": [
   "社区人气榜常客，默认出图就好看",
   "吃 Illustrious 系 LoRA，角色再现稳",
   "Runner 直跑，参数全开"
  ],
  "minus": [
   "风格偏甜系，硬核写实别找它",
   "排队看 Runner 负载"
  ],
  "fare": "按用量（Runner）",
  "routes": "在 ANTEI · 自建 Runner"
 },
 {
  "cat": "角色底模",
  "key": "pencil",
  "name": "Anima Pencil-XL",
  "img": "media/v4/model-lora-anima-pencil-xl.webp",
  "pos": "铅笔清线风：线稿感插画一把出。",
  "tags": [
   "清线风",
   "线稿感",
   "插画"
  ],
  "plus": [
   "铅笔 / 清线质感独一份",
   "线稿到上色两相宜",
   "Runner 直跑，参数全开"
  ],
  "minus": [
   "题材窄：吃插画向",
   "厚涂写实不擅长"
  ],
  "fare": "按用量（Runner）",
  "routes": "在 ANTEI · 自建 Runner"
 },
 {
  "cat": "角色底模",
  "key": "pony",
  "name": "Pony Diffusion V6 XL",
  "img": "media/v4/model-lora-pony-v6-xl.webp",
  "pos": "风格宇宙的祖师爷：什么画风都有人训过。",
  "tags": [
   "风格生态",
   "祖师爷",
   "兼容广"
  ],
  "plus": [
   "LoRA 兼容面最广的一支",
   "风格触发词体系成熟",
   "社区沉淀最深"
  ],
  "minus": [
   "原生脸普通，靠 LoRA 拉",
   "提示词语法有门槛（score 系）"
  ],
  "fare": "按用量（Runner）",
  "routes": "在 ANTEI · 自建 Runner"
 },
 {
  "cat": "角色底模",
  "key": "sdxl",
  "name": "SDXL 1.0",
  "img": "media/v4/model-lora-sdxl-10.webp",
  "pos": "通用老将：写实到插画都能接。",
  "tags": [
   "通用",
   "老将",
   "写实可用"
  ],
  "plus": [
   "生态覆盖最全的开源底模",
   "写实 / 设计 / 插画都能跑",
   "工具链与教程最成熟"
  ],
  "minus": [
   "原生质量被新模甩开",
   "要出彩得靠 LoRA 组合"
  ],
  "fare": "按用量（Runner）",
  "routes": "在 ANTEI · 自建 Runner"
 },
 {
  "cat": "角色底模",
  "key": "anima",
  "name": "Anima（DiT）",
  "img": "media/v4/model-lora-anima-dit.webp",
  "pos": "新架构试验田：DiT 底座的动漫新星。",
  "tags": [
   "DiT 架构",
   "新星",
   "试验田"
  ],
  "plus": [
   "DiT 新架构，细节上限高",
   "站内 v4 管线已部署",
   "动漫向的新选择"
  ],
  "minus": [
   "生态刚起步，LoRA 少",
   "出图时间偏长"
  ],
  "fare": "按用量（Runner）",
  "routes": "在 ANTEI · 自建 Runner（v4 管线）"
 },
 {
  "cat": "视频",
  "key": "seedance",
  "name": "Seedance",
  "clip": "media/production/models/video/model-seedance.mp4",
  "img": "media/v4/model-seedance.webp",
  "pos": "参考生成一梭子：18 条线路的视频主力。",
  "tags": [
   "参考生成",
   "多接入",
   "语音克隆"
  ],
  "plus": [
   "参考端点：图 + 语音 ×3 一起喂",
   "2.0 到 2.5 全档在架，四家接入互备",
   "首帧图生视频跟手最稳"
  ],
  "minus": [
   "顶配 2.5 是每秒最贵档",
   "超 10 秒要拼段"
  ],
  "fare": "$0.12–0.30 / 秒",
  "routes": "在 ANTEI · 18 条线路（fal / 火山 / BytePlus / 方舟）"
 },
 {
  "cat": "视频",
  "key": "minimax",
  "name": "MiniMax H3",
  "clip": "media/production/models/video/model-minimax.mp4",
  "img": "media/v4/model-minimax-h3.webp",
  "pos": "性价比主力：国内外双线，参考也在。",
  "tags": [
   "双线互备",
   "性价比",
   "参考生成"
  ],
  "plus": [
   "低价档还带参考端点",
   "国内线路延迟友好",
   "人物动作自然度口碑好"
  ],
  "minus": [
   "1080p 档少",
   "风格化镜头弱于可灵"
  ],
  "fare": "$0.11–0.13 / 秒",
  "routes": "在 ANTEI · 4 条线路（海外 + 国内 × 参考）"
 },
 {
  "cat": "视频",
  "key": "wan30",
  "name": "Wan 3.0",
  "clip": "media/production/models/video/model-wan30.mp4",
  "img": "media/v4/model-wan-30.jpg",
  "pos": "阿里主力：官方已上线，站内线路还在加。",
  "tags": [
   "参考生成",
   "低价",
   "扩容中"
  ],
  "plus": [
   "全站最低单价档 $0.10 / 秒",
   "reference-to-video 参考线在架",
   "官方持续放新端点，站内跟进扩容"
  ],
  "minus": [
   "镜头语言朴素",
   "长时一致性一般"
  ],
  "fare": "$0.10 / 秒",
  "routes": "在 ANTEI · 2 条线路（文生 / 参考）· 更多日后接入"
 },
 {
  "cat": "视频",
  "key": "horse",
  "name": "HappyHorse 1.1",
  "clip": "media/production/models/video/model-horse.mp4",
  "img": "media/v4/model-happyhorse-11.webp",
  "pos": "快档黑马：盲测榜前五的性价比。",
  "tags": [
   "快档",
   "盲测榜",
   "性价比"
  ],
  "plus": [
   "Artificial Analysis 盲测榜前五（v1.1 与 v1.0 同榜，站内注记）",
   "出片速度快",
   "单价友好"
  ],
  "minus": [
   "风格控制一般",
   "生态资料少"
  ],
  "fare": "$0.14 / 秒",
  "routes": "在 ANTEI · 1 条线路"
 },
 {
  "cat": "视频",
  "key": "kling",
  "name": "可灵",
  "clip": "media/production/models/video/model-kling.mp4",
  "img": "media/v4/model-kling.webp",
  "pos": "镜头派：运镜与质感的口碑担当。",
  "tags": [
   "运镜",
   "质感",
   "Omni"
  ],
  "plus": [
   "运镜与物理质感第一梯队",
   "O3 Pro Omni 全能端",
   "人物表演细腻"
  ],
  "minus": [
   "3.0 Pro 不吃参考输入（站内注记）",
   "单价中上"
  ],
  "fare": "$0.14–0.17 / 秒",
  "routes": "在 ANTEI · 2 条线路（3.0 Pro / O3 Pro Omni）"
 },
 {
  "cat": "视频",
  "key": "gomni",
  "name": "Gemini Omni Flash",
  "img": "media/v4/model-gemini-omni-flash.jpg",
  "pos": "全能快手：便宜地把想法先动起来。",
  "tags": [
   "全能",
   "快",
   "按用量"
  ],
  "plus": [
   "文生 / 图生一把抓",
   "快且便宜，适合打草稿",
   "Google 生态识图强"
  ],
  "minus": [
   "上限不如专业视频模",
   "风格控制粗"
  ],
  "fare": "按用量",
  "routes": "在 ANTEI · 1 条线路"
 },
 {
  "cat": "声音",
  "key": "fish",
  "name": "Fish Audio S2.1 Pro",
  "img": "media/v4/model-fish-audio-s21-pro.jpg",
  "pos": "台词主力：中文语音自然度的口碑档。",
  "tags": [
   "中文台词",
   "音色库",
   "免费 / 付费可选"
  ],
  "plus": [
   "中文口语自然度第一梯队",
   "站内音色库直选 + 克隆",
   "已接 S2.1 Pro 免费版与付费版"
  ],
  "minus": [
   "英文口音略平",
   "极端情绪要调温度"
  ],
  "fare": "免费档 $0；付费档 $15 / 百万 UTF-8 字节",
  "routes": "在 ANTEI · S2.1 Pro 免费 / 付费双档"
 },
 {
  "cat": "声音",
  "key": "eleven",
  "name": "ElevenLabs",
  "img": "media/v4/model-elevenlabs.jpg",
  "pos": "音效与配乐：SFX 和 Music 两条线。",
  "tags": [
   "音效",
   "配乐",
   "双线"
  ],
  "plus": [
   "SFX：一句话直出拟音",
   "Music：整段配乐结构可控",
   "行业标杆音质"
  ],
  "minus": [
   "中文歌词能力一般",
   "按秒计费，片长要控"
  ],
  "fare": "按用量 – $0.15 / 秒",
  "routes": "在 ANTEI · 2 条线路（SFX v2 + Music v2.5）"
 },
 {
  "cat": "3D",
  "key": "rodin",
  "name": "Rodin Gen-2.5",
  "img": "media/v4/model-rodin-gen-25.jpg",
  "pos": "多视图控场：最多 5 张参考喂一个模型。",
  "tags": [
   "多视图",
   "可控",
   "产线感"
  ],
  "plus": [
   "参考图最多 5 张（站内上限）",
   "拓扑质量适合后期改",
   "四方位视图工作流"
  ],
  "minus": [
   "出模速度慢档",
   "贴图上限一般"
  ],
  "fare": "按用量",
  "routes": "在 ANTEI · 1 条线路"
 },
 {
  "cat": "3D",
  "key": "hunyuan",
  "name": "Hunyuan3D",
  "img": "media/v4/model-hunyuan3d.jpg",
  "pos": "面数王：150 万面上限的细节党。",
  "tags": [
   "高面数",
   "细节",
   "双版本"
  ],
  "plus": [
   "面数 4 万–150 万可调（默认 50 万）",
   "纹理网格一次出",
   "v3.1 Pro 细节增强"
  ],
  "minus": [
   "高面数导出文件大",
   "有机体强于硬表面"
  ],
  "fare": "按用量",
  "routes": "在 ANTEI · 2 条线路（v3.1 Pro / v3）"
 },
 {
  "cat": "3D",
  "key": "trellis",
  "name": "Trellis 2",
  "img": "media/v4/model-trellis-2.jpg",
  "pos": "参数全开：分辨率、贴图、减面都在手。",
  "tags": [
   "参数全开",
   "减面",
   "游戏管线"
  ],
  "plus": [
   "分辨率 512 / 1024 / 1536 三档",
   "贴图 1K–4K 可选",
   "减面 5k–2M 直接对接游戏管线"
  ],
  "minus": [
   "速度中庸",
   "风格化输入易翻车"
  ],
  "fare": "按用量",
  "routes": "在 ANTEI · 1 条线路"
 },
 {
  "cat": "3D",
  "key": "tripo",
  "name": "TripoSR",
  "img": "media/v4/model-triposr.jpg",
  "pos": "秒出档：一张图几秒钟一个白模。",
  "tags": [
   "秒出",
   "轻量",
   "打样"
  ],
  "plus": [
   "出模最快",
   "轻量白模适合打样",
   "开源出身生态友好"
  ],
  "minus": [
   "无贴图细节",
   "复杂结构易糊"
  ],
  "fare": "按用量",
  "routes": "在 ANTEI · 1 条线路"
 }
]
