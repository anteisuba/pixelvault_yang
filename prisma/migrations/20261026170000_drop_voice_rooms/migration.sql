-- 配音间的聊天房间下线（owner 2026-10-26「直接删掉吧，基本都是我自己的，没关系」）：
-- 聊天并回对话（②c），聊天页 /studio/audio、左栏「聊天」键和整套 VoiceRoom 代码在同一个改动里一起删了。
--
-- 不迁移、不备份（owner 定）。念出来的音频是 Generation，照旧留在素材库；
-- VoiceLine.jobId 指向 GenerationJob 的外键随表一起没了，GenerationJob 本身不动。
--
-- 回滚：表结构见 20260829132425_voiceroom_rooms_and_lines + 20261025080000_voice_line_attachments；数据不可恢复。

-- DropTable
DROP TABLE IF EXISTS "VoiceLine";

-- DropTable
DROP TABLE IF EXISTS "VoiceRoom";
