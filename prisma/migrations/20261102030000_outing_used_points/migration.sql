-- 平台点数第 5 片：角色出门的额度按钱算（1 点 = 1 美分）。只加一列，旧行按 usedTokens 旧口径显示。
ALTER TABLE "CharacterOuting" ADD COLUMN "usedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0;
