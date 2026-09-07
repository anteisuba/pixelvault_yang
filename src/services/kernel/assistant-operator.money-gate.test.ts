import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_MUTATING_TOOLS,
  ASSISTANT_OPERATOR_SPEND_TOOLS,
  ASSISTANT_OPERATOR_TOOLS,
} from '@/constants/assistant-operator'

/**
 * **钱闸的结构性证明**（拍板 2 · 任务包 §2「服务端没有任何工具能创建 generation」）。
 *
 * ⚠ 这是一份**读源码**的测试，不是行为测试 —— 有意的。行为测试只能证明「我写的
 * 这几条路径没花钱」；这份证明的是「这个文件够不着花钱的东西」。前者会被下一个人
 * 加的一条新路径绕过，后者不会：他得先来改这份允许名单，而改名单是一个看得见的动作。
 *
 * 同类先例：`prisma/migration-safety.test.ts`（约束型迁移 CI 抓不到，只能读文件锁）。
 */

const SERVICE_PATH = join(
  process.cwd(),
  'src/services/kernel/assistant-operator.service.ts',
)
const SOURCE = readFileSync(SERVICE_PATH, 'utf8')
const FOLDER_VISION_SERVICE_PATH = join(
  process.cwd(),
  'src/services/kernel/assistant-asset-folder-vision.service.ts',
)
const FOLDER_VISION_SOURCE = readFileSync(FOLDER_VISION_SERVICE_PATH, 'utf8')

/**
 * 工具环允许 import 的服务，逐条写明为什么。
 *
 * ⛔ 往这里加一条之前先回答：它会不会（直接或间接）创建 generation、扣 credit、
 * 调 provider 出图？会就不该出现在这个文件里 —— 助手的活是填表单，不是出图。
 */
const ALLOWED_SERVICE_IMPORTS = new Set([
  // 认人：clerkId → 库里的 user.id，检索要按它收敛。
  '@/services/user.service',
  // 只读分页查询（`search_assets`）。⚠ 同一个模块里有 `createGeneration`，
  // 所以下面还有一条「不许出现的标识符」名单兜着。
  '@/services/generation.service',
  /**
   * 素材文件夹视觉检查：只读用户文件夹与既有图片 URL，再走结构化视觉补全；
   * 不创建 generation、不写库、不下载文件，也不触发图片 / 视频 / 音频生成。
   */
  '@/services/kernel/assistant-asset-folder-vision.service',
  // 选 LLM 路由（用户自己的 key / 平台兜底）。
  '@/services/llm-text.service',
  // 文本补全的重试策略，工具环每一步都走它。
  '@/services/kernel/assistant-completion.service',
  /**
   * 联网**搜图**（P3-B）。⭐ 加它进来的判据就是这条：它是**搜索**模块 ——
   * 出的是一串第三方 URL，一个字节都不落、一分钱都不扣。
   * ⛔ 转存那条腿（`web-image-import.service`，它 import 了 r2 + createGeneration）
   * **有意不在这份名单里**：它是用户点选之后走普通 API 路由触发的，助手够不着。
   * 哪天有人想把它加进来「省一次往返」，那就是钱闸破的那一天 —— 拒绝它，
   * 让转存留在用户手上。
   */
  '@/services/web-research.service',
  /**
   * **有目标的检索**（2026-09-06）。⭐ 判据与上一条**逐字同源**：它是
   * **搜索 + 归并**模块 —— 打萌百 / 中文维基 / Fandom / danbooru / Serper 的只读
   * 接口，出一串证据对象，一个字节都不下载、一分钱都不扣、一行 generation 都不建。
   * ⛔ `@/services/research/research-run.service` **有意不在这份名单里**：那条会读
   * 配额、写 `ResearchRun`，也就是会 import 库客户端 —— 而下面禁字表里那条 import
   * 是硬拦。扇出那一段因此单独住在 `research-fanout.service`，它一行库都不碰。
   * 哪天有人想「复用现成的」把 research-run 换进来，这条名单就是那个看得见的动作。
   */
  '@/services/research/research-fanout.service',
  /**
   * 看图闭环的**路由解析**（P3-C）。⭐ 判据与上一条同源：它产出的是
   * 「用哪把 key、走哪个 adapter」，一个字节都不落、一分钱都不扣。真正看图的那次
   * 补全走的仍是 `assistant-completion.service`（本名单里早就有的那条）。
   * ⛔ `services/vision/vision-analyzer.service` **有意不在名单里**：那条链会落库。
   */
  '@/services/vision/vision-route.service',
  /**
   * LoRA 检索（P4-C）。⭐ 判据与 `web-research.service` 那条**逐字同源**：它是
   * **搜索 + 归一**模块 —— 打 Civitai / HF 的搜索接口，出一串候选对象，一个字节
   * 都不下载、一分钱都不扣、一行 generation 都不创建。
   * ⛔ 导入那条腿（`favoriteExternalLora` / `services/runner/civitai-lora-to-r2`）
   * **有意不在这份名单里**：它会下载权重文件、写 R2、写库。挂载那一跳因此留在
   * 客户端（走既有 `favoriteLoraAPI`），与拍板 22 的 `import_user_url` 同一个形状。
   * 哪天有人想把它加进来「省一次往返」，那就是这道闸破的那一天。
   */
  '@/services/lora/lora-candidates.service',
  /**
   * 助手人设（§8.5）。⭐ 判据：它读写的是**一张只有文本列的 1:1 侧表**——
   * 不创建 generation、不扣 credit、不调任何 provider。
   * ⛔ 自定义头像那条腿**有意不在这份名单里**：它会写 R2，所以它住在另一个文件
   * （`assistant-persona-avatar.service`）。工具环因此在 import 表上就够不着上传 ——
   * 与联网搜图「搜索在名单里、转存不在」是同一条论据的第二次应用。
   */
  '@/services/assistant-persona.service',
  /**
   * 项目规则（§10，拍板 23）。⭐ 判据同上：一张只有文本列的表。
   * ⚠ 它是这份名单里**唯一一条会往库里写**的服务 —— 写的是用户自己说过的一句话
   * （`add_project_rule`），与「创建 generation」不是一回事：没有 provider、
   * 没有 credit、没有字节落地。哪天有人想把别的写操作挂到这个模块上「顺路存一下」，
   * 那就是这条判据破的那一天。
   */
  '@/services/project-rule.service',
  /**
   * **抽帧落库**（第二期 · 视频域评审）。⭐ 这是第五次值得复核的改动，而且是名单
   * 里**第二条会往外写字节**的服务（第一条是 `project-rule.service` 写一行文本）。
   *
   * ── 判据，逐条 ─────────────────────────────────────────────────
   *  · **不建 generation** —— 全文没有 `createGeneration`，也没有任何 prisma /
   *    `@/lib/db` 的 import（下面那条用例逐字扫）。它写完 R2 就返回一个对象，
   *    库里不留任何一行。⭐ owner 定的门槛就是这一条：**只落帧不建 generation
   *    才进得来**。
   *  · **不扣 credit** —— 没有 credit policy、没有 provider 调用；这一整条链花的
   *    是助手线的 token（与 `critique_result` 的视觉那一跳同源），不是用户的积分。
   *  · **落的是什么** —— 客户端在浏览器里抽好的三张帧图（`data:image/…`），
   *    服务端复算计划、核对时间戳、验魔数之后转存到 `VIDEO_FRAME_STORAGE_PREFIX`
   *    下这个用户自己的目录。字节的来源是**用户自己的视频**，不是助手从网上搜到的
   *    候选 —— 这正是 `web-image-import` 被挡在名单外的那条判据的另一面：那条落的是
   *    「助手搜来的、用户还没点头的」东西，这条落的是「用户手上已经有的那段片子的
   *    三个截面」。
   *  · **为什么非落不可** —— 评审卡上那三格要稳定 URL；不落盘就只能把三张
   *    base64 塞进 SSE 载荷，那是几百 KB 走一条本该只走文本的流。
   * ⛔ `@/services/vision/video-analysis.service` **有意不在名单里**：那条经
   * `analyzeVisual` 写 `ResearchRun`，也就是会 import 库客户端。哪天有人想
   * 「复用现成的视频分析入口」把它换进来，这份名单就是那个看得见的动作。
   */
  '@/services/video-frames/video-frame-set.service',
])

/** 出现即失败的标识符 —— 每一条都是一条能花掉用户钱的路。 */
const FORBIDDEN_IDENTIFIERS = [
  'createGeneration',
  'generateImage',
  'generateVideo',
  'generateAudio',
  'deductCredits',
  'submitGeneration',
  'execution-worker',
  'generate-image.service',
  'generate-video.service',
  'generate-audio.service',
  // db 直连：这一层不该有第二条查库的路，检索走 generation.service 的分页查询。
  "from '@/lib/db'",
  /**
   * 联网搜图的**转存**那条腿（P3-B）。搜索可以在这里，落地不行 ——
   * owner 拍板「用户确定了再落 R2」的结构表达就是这三条：工具环够不着转存服务、
   * 够不着 R2 上传、够不着 `uploadFromHttpToR2`。
   */
  'web-image-import',
  'importWebImage',
  'uploadToR2',
  'uploadFromHttpToR2',
]

function importedModules(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
}

describe('⛔ 助手工具环的钱闸', () => {
  it('只 import 允许名单里的服务', () => {
    const services = importedModules(SOURCE).filter((moduleId) =>
      moduleId.startsWith('@/services/'),
    )
    expect(services.length).toBeGreaterThan(0)
    for (const moduleId of services) {
      expect(
        ALLOWED_SERVICE_IMPORTS.has(moduleId),
        `${moduleId} 不在允许名单里。它会花钱吗？会的话别在工具环里 import 它。`,
      ).toBe(true)
    }
  })

  it('源码里不出现任何一条能花钱的标识符', () => {
    for (const identifier of FORBIDDEN_IDENTIFIERS) {
      expect(SOURCE.includes(identifier), `源码里出现了 ${identifier}`).toBe(
        false,
      )
    }
  })

  it('文件夹视觉服务只看既有素材，不具备生成、扣费或写入能力', () => {
    for (const identifier of [
      'createGeneration',
      'generateImage',
      'generateVideo',
      'generateAudio',
      'deductCredits',
      'submitGeneration',
      'execution-worker',
      'uploadToR2',
      'uploadFromHttpToR2',
      '.create(',
      '.update(',
      '.delete(',
      '.upsert(',
    ]) {
      expect(
        FOLDER_VISION_SOURCE.includes(identifier),
        `文件夹视觉服务里出现了 ${identifier}`,
      ).toBe(false)
    }
    expect(FOLDER_VISION_SOURCE).toContain('db.generation.findMany')
    expect(FOLDER_VISION_SOURCE).toContain('completeVisionStructured')
  })

  it('工具表里没有任何一条叫 generate 的（prime 除外，而它只置态）', () => {
    const generating = ASSISTANT_OPERATOR_TOOLS.filter(
      (tool) => tool.includes('generate') && tool !== 'prime_generate',
    )
    expect(generating).toEqual([])
    // prime 是改动型的（因此可撤销），但它改的是按钮的样子，不是账单。
    expect(ASSISTANT_OPERATOR_MUTATING_TOOLS).toContain('prime_generate')
  })

  /**
   * ⭐ **第四次值得复核的改动**（前三次是 `import_user_url` / `mount_lora` /
   * `add_project_rule`）：`request_generation` 是名字离「花钱」最近的一条，
   * 而它照样进得来。判据仍然只有一条 —— **服务端只吐载荷，扣扳机在客户端**。
   *
   * ── 这条规则**没有被改**，一个字都没有 ──────────────────────────────
   * 上面那条用例扫的是 `tool.includes('generate')`：`generation` 里没有 `generate`
   * 这个词（少了结尾那个 e），所以这条工具天然过闸。这不是钻空子 —— 规则的本意是
   * 「服务端不得创建 generation」，而下面三条断言把那个本意逐条钉住：允许名单没变、
   * 禁字表没松、这个模块里没有任何一条能把 generation 建出来的路。
   * ⛔ 下一个人「顺手统一命名」把它改成 `start_generate`，上面那条当场红 ——
   *    那时该改的是名字，不是钱闸。
   */
  it('⭐ request_generation 在表里，而服务端仍然只吐载荷（扳机在客户端）', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('request_generation')
    // 它既不是「读」也不是「改动型」—— 它撤不掉，所以它自己一档。
    expect(ASSISTANT_OPERATOR_MUTATING_TOOLS).not.toContain(
      'request_generation',
    )
    expect(ASSISTANT_OPERATOR_SPEND_TOOLS).toContain('request_generation')
    // 服务端确实接了这条工具（switch 分派）……
    expect(SOURCE).toContain('planRequestGeneration')
    // ……而它的实现里没有任何一条能花钱的路：禁字表那条用例逐条扫着同一份源码，
    // 允许名单那条用例逐条扫着同一份 import 表。这里再补两条 provider 侧的：
    expect(SOURCE).not.toContain('studioGenerateAPI')
    expect(SOURCE).not.toContain('submit-image.service')
    expect(SOURCE).not.toContain('creditCost')
  })

  /**
   * 「本会话不再问」（拍板 24）**的记忆不在服务端**。
   *
   * ⭐ 服务端存一份「这个用户说过不用问了」的记忆，就等于把「花不花钱」这件事的
   * 状态挪到了客户端够不着的地方 —— 而本仓这条链的全部安全感来自「服务端零会话
   * 态」。这里锁的是：作用域三要素靠请求里那张条子（`autoApprove`）逐次核，
   * ⛔ 不查库、⛔ 不进 persona、⛔ 不进项目规则。
   */
  it('⛔ 「不再问」不在服务端留任何记忆', () => {
    expect(SOURCE).toContain('isSpendAutoApproved')
    expect(SOURCE).toContain('request.autoApprove')
    for (const identifier of [
      'saveAutoApprove',
      'rememberAutoApprove',
      'autoApproveStore',
    ]) {
      expect(SOURCE.includes(identifier), `源码里出现了 ${identifier}`).toBe(
        false,
      )
    }
  })

  /**
   * ⭐ 拍板 22 加的 `import_user_url` 是这份名单最值得复核的一次改动：它名字里就
   * 有 import，做的事也确实是「把一张图收进库」—— 但**收的那一跳在客户端**。
   * 服务端只吐一个带着源地址的 op，所以上面那两条（允许名单 + 禁字表）一条都不用松。
   * 哪天有人想「顺手在服务端 import 一下省一次往返」，先过这里。
   */
  it('import_user_url 在表里，而服务端仍然够不着导入 / R2', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('import_user_url')
    // 工具名出现在源码里（switch 分派），而导入模块的名字一个都不许出现 ——
    // 后者由上面那条 FORBIDDEN_IDENTIFIERS 用例逐条锁着。
    expect(SOURCE).toContain('importUserUrl')
    expect(SOURCE).not.toContain('api-client')
    expect(SOURCE).not.toContain('fetchAsBuffer')
  })

  /**
   * ⭐ P4-A 的视频出声开关**为什么叫 `set_sound`**，锁在这里。
   *
   * 表单那一侧的字段名是 provider 的那个词，而它逐字在上面的禁字表里
   * （它同时也是一条真的能出声、能花钱的服务函数名）。协议这一侧因此改叫
   * "sound"，落到表单字段的那一跳发生在客户端 `studio-operator-apply.ts`。
   * ⛔ 下一个人「顺手统一命名」把它改回去，禁字表那条用例会红 —— 但那时他大概
   * 会以为是禁字表写错了。这一条就是写给他看的。
   */
  it('视频出声开关的工具名不带 provider 那个字段名（否则钱闸禁字表当场红）', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('set_sound')
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(tool.includes(identifier)).toBe(false)
      }
    }
  })

  /**
   * ⭐ P4-C 的 `mount_lora` 是这份名单第二次值得复核的改动（第一次是
   * `import_user_url`）：它做的事确实是「把一把 LoRA 收进库并挂上」—— 但**收的
   * 那一跳在客户端**。服务端只吐一个带着 `importPayload` 的 op，从本轮检索结果里
   * 抄过来而已。所以允许名单只多了一条**检索**服务，禁字表一条不松。
   */
  it('LoRA 挂载在表里，而服务端仍然够不着导入 / 下载 / R2', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('search_loras')
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('mount_lora')
    expect(SOURCE).toContain('searchLoraCandidates')
    // 导入那条腿的三个名字，一个都不许出现在工具环里。
    expect(SOURCE).not.toContain('favoriteExternalLora')
    expect(SOURCE).not.toContain('favoriteLoraAPI')
    expect(SOURCE).not.toContain('civitai-lora-to-r2')
    // LoRA 训练是另一条会扣钱的链 —— 它连名字都不该出现在这里。
    expect(SOURCE).not.toContain('lora-training')
    expect(SOURCE).not.toContain('startLoraTraining')
  })

  /**
   * ⭐ 第三次值得复核的改动（前两次是 `import_user_url` 与 `mount_lora`）：
   * `add_project_rule` 名字里就有 add，做的事也确实是**往库里写一行** —— 而它照样
   * 进得来，判据只有一条：那一行是**用户自己说过的一句话**，没有 provider、没有
   * credit、没有字节落地。
   *
   * ⛔ 与此同时，persona 的**头像上传**那条腿一个字都不许出现在工具环里：它会写
   * R2，所以它住在另一个文件。下面两条把这件事锁死。
   */
  it('规则可写、persona 可读，而工具环仍然够不着头像上传那条腿', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('read_project_rules')
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('add_project_rule')
    expect(SOURCE).toContain('addProjectRule')
    expect(SOURCE).toContain('getAssistantPersonaByUserId')
    // 头像那条腿的三个名字，一个都不许出现。
    expect(SOURCE).not.toContain('assistant-persona-avatar')
    expect(SOURCE).not.toContain('uploadAssistantAvatar')
    expect(SOURCE).not.toContain('removeAssistantAvatar')
  })

  /**
   * 两个新服务**自己**也得够不着花钱的那几条路 —— 上面那份 import 白名单只管
   * 工具环这一个文件，不管它 import 进来的模块里有什么。形状照抄文件夹视觉那一条。
   */
  /**
   * ⭐ 第五次值得复核的改动（前四次是 `import_user_url` / `mount_lora` /
   * `add_project_rule` / `request_generation`）：抽帧那条**真的会写 R2**，
   * 而它照样进得来 —— 判据只有一条：**只落帧，不建 generation、不扣 credit**。
   *
   * 这条用例把那句话钉成机器可读的：帧服务里不许出现任何一条能建 generation /
   * 扣钱 / 查库的路，而 `uploadToR2` **必须**出现（它就是那条被允许的、也是唯一的
   * 副作用；哪天有人把它换成别的写入，这里会红）。
   * ⛔ 工具环那一侧的禁字表**一个字都没松**：`uploadToR2` 仍然不许出现在
   * `assistant-operator.service.ts` 里，上面那条用例照旧扫着。
   */
  it('⭐ 抽帧服务只落帧：写 R2 是它唯一的副作用，够不着 generation / credit / 库', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/services/video-frames/video-frame-set.service.ts',
      ),
      'utf8',
    )
    for (const identifier of [
      'createGeneration',
      'generateImage',
      'generateVideo',
      'generateAudio',
      'deductCredits',
      'submitGeneration',
      'execution-worker',
      "from '@/lib/db'",
      'prisma',
      'creditCost',
    ]) {
      expect(
        source.includes(identifier),
        `抽帧服务里出现了 ${identifier}`,
      ).toBe(false)
    }
    // 唯一被允许的那条副作用，必须还在（换掉了就得重新过一次这条判据）。
    expect(source).toContain('uploadToR2')
  })

  it('persona / 规则两个服务都不具备生成、扣费或上传能力', () => {
    for (const path of [
      'src/services/assistant-persona.service.ts',
      'src/services/project-rule.service.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), path), 'utf8')
      for (const identifier of [
        'createGeneration',
        'generateImage',
        'generateVideo',
        'generateAudio',
        'deductCredits',
        'submitGeneration',
        'execution-worker',
        'uploadToR2',
        'uploadFromHttpToR2',
        'deleteFromR2',
      ]) {
        expect(
          source.includes(identifier),
          `${path} 里出现了 ${identifier}`,
        ).toBe(false)
      }
    }
  })

  it('查库只有一处，且一定按 userId 收敛（不许翻别人的库）', () => {
    const callSites = [...SOURCE.matchAll(/getPublicGenerationPage\(/g)]
    // 一处 import + 一处调用
    expect(callSites).toHaveLength(1)
    const callBlock = SOURCE.slice(
      SOURCE.indexOf('getPublicGenerationPage({'),
      SOURCE.indexOf('getPublicGenerationPage({') + 400,
    )
    expect(callBlock).toContain('userId,')
  })
})
