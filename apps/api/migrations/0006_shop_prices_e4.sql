-- Preços da loja da entrega 4 (cerca de 30% a menos): cores a 70, degradês a 200, molduras de 200 a
-- 400 e pacotes de reações a 280. Só o preço muda; quem já comprou não recebe diferença.
UPDATE `shop_items` SET `price` = 70 WHERE `kind` = 'name_color' AND `price` = 100;
--> statement-breakpoint
UPDATE `shop_items` SET `price` = 200 WHERE `kind` = 'name_gradient' AND `price` = 300;
--> statement-breakpoint
UPDATE `shop_items` SET `price` = CASE `price` WHEN 300 THEN 200 WHEN 450 THEN 300 WHEN 600 THEN 400 ELSE `price` END
WHERE `kind` = 'avatar_frame';
--> statement-breakpoint
UPDATE `shop_items` SET `price` = 280 WHERE `kind` = 'reaction_pack' AND `price` = 400;
