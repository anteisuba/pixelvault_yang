-- 助手 v2 §11.1 / §7.4 · 三档人设（谨慎 / 平衡 / 放手）落一列。
--
-- ⚠ 新列**可空**：NULL 就是「自定义」这一档真正的值，⛔ 不是「还没填」。
-- 默认值在下面那段一起设成 'balanced'（新行的那五格本来就是「平衡」）。
-- 存量行全部留 NULL，读的那一跳用 `matchAssistantPersonaArchetype` 按
-- tone / verbosity / planMode / nextStepHint / useMyWords 五格回推 ——
-- ⛔ 不在这里写 UPDATE 回填：映射表住 constants，SQL 里抄一份必然与它漂。
--
-- ⛔ 不进 prisma/migration-safety.test.ts 的 ACKNOWLEDGED（那份登记簿只收
-- 唯一索引 / SET NOT NULL / 改列类型 / 非空无默认的新列）。

-- AlterTable
ALTER TABLE "AssistantPersona" ADD COLUMN     "archetype" TEXT;

-- 默认档 = 「平衡」（owner 2026-09-11 定，取代 2026-09-06 的「简短直接 · 简洁」）：
-- 新用户 / 从没动过设置的人打开设置就该看到一张卡亮着。
-- ⚠ 这几个 DEFAULT 与 `ASSISTANT_PERSONA_ARCHETYPE_PRESETS.balanced` 逐格一致，
-- 也与 `ASSISTANT_PERSONA_DEFAULTS` 逐字一致 —— 三处漂了，「没存过」和
-- 「存了默认值」就是两个不同的助手。
-- ⛔ 不写 UPDATE 回填存量行：DEFAULT 只管此后新插入的行，已存的那几格保持原值，
-- 读的那一跳按五格回推显示「自定义」或某一档。
ALTER TABLE "AssistantPersona" ALTER COLUMN "tone" SET DEFAULT 'friendly';
ALTER TABLE "AssistantPersona" ALTER COLUMN "verbosity" SET DEFAULT 'standard';
ALTER TABLE "AssistantPersona" ALTER COLUMN "nextStepHint" SET DEFAULT true;
ALTER TABLE "AssistantPersona" ALTER COLUMN "archetype" SET DEFAULT 'balanced';
