-- Catálogo inicial da loja (entrega 3): 8 cores a 100, 6 degradês a 300, 6 molduras de 300 a 600 e
-- 3 pacotes de reações a 400. Cada cor tem o valor do tema claro e o do escuro (contraste AA).
INSERT INTO `shop_items` (`id`, `kind`, `name`, `price`, `data`, `sort`, `active`) VALUES
  ('color_red', 'name_color', 'Vermelho', 100, '{"light":["#b3261e"],"dark":["#ff8a80"]}', 10, 1),
  ('color_orange', 'name_color', 'Laranja', 100, '{"light":["#a84300"],"dark":["#ffa66b"]}', 20, 1),
  ('color_amber', 'name_color', 'Âmbar', 100, '{"light":["#7a5c00"],"dark":["#f2c94c"]}', 30, 1),
  ('color_green', 'name_color', 'Verde', 100, '{"light":["#1b6e3c"],"dark":["#6fd08c"]}', 40, 1),
  ('color_teal', 'name_color', 'Turquesa', 100, '{"light":["#00696b"],"dark":["#5fd4d6"]}', 50, 1),
  ('color_blue', 'name_color', 'Azul', 100, '{"light":["#0b57d0"],"dark":["#7fb2ff"]}', 60, 1),
  ('color_violet', 'name_color', 'Violeta', 100, '{"light":["#6f3fc4"],"dark":["#b79cff"]}', 70, 1),
  ('color_pink', 'name_color', 'Rosa', 100, '{"light":["#b0246e"],"dark":["#ff8fc7"]}', 80, 1),
  ('gradient_sunset', 'name_gradient', 'Pôr do sol', 300, '{"light":["#b3261e","#a84300"],"dark":["#ff8a80","#ffa66b"]}', 90, 1),
  ('gradient_ocean', 'name_gradient', 'Oceano', 300, '{"light":["#0b57d0","#00696b"],"dark":["#7fb2ff","#5fd4d6"]}', 100, 1),
  ('gradient_forest', 'name_gradient', 'Floresta', 300, '{"light":["#1b6e3c","#7a5c00"],"dark":["#6fd08c","#f2c94c"]}', 110, 1),
  ('gradient_aurora', 'name_gradient', 'Aurora', 300, '{"light":["#00696b","#6f3fc4"],"dark":["#5fd4d6","#b79cff"]}', 120, 1),
  ('gradient_candy', 'name_gradient', 'Doce', 300, '{"light":["#b0246e","#6f3fc4"],"dark":["#ff8fc7","#b79cff"]}', 130, 1),
  ('gradient_fire', 'name_gradient', 'Fogo', 300, '{"light":["#7a5c00","#b3261e"],"dark":["#f2c94c","#ff8a80"]}', 140, 1),
  ('frame_silver', 'avatar_frame', 'Prata', 300, '{"light":["#86868b"],"dark":["#a8a8ad"]}', 150, 1),
  ('frame_sky', 'avatar_frame', 'Céu', 300, '{"light":["#0b57d0"],"dark":["#7fb2ff"]}', 160, 1),
  ('frame_emerald', 'avatar_frame', 'Esmeralda', 450, '{"light":["#1b6e3c","#00696b"],"dark":["#6fd08c","#5fd4d6"]}', 170, 1),
  ('frame_rose', 'avatar_frame', 'Rosa', 450, '{"light":["#b0246e","#6f3fc4"],"dark":["#ff8fc7","#b79cff"]}', 180, 1),
  ('frame_gold', 'avatar_frame', 'Ouro', 600, '{"light":["#7a5c00","#a84300"],"dark":["#f2c94c","#ffa66b"]}', 190, 1),
  ('frame_flame', 'avatar_frame', 'Chama', 600, '{"light":["#b3261e","#7a5c00"],"dark":["#ff8a80","#f2c94c"]}', 200, 1),
  ('pack_party', 'reaction_pack', 'Festa', 400, '{"reactions":["🔥","💯","🙌","🥳","✨","🚀"]}', 210, 1),
  ('pack_feelings', 'reaction_pack', 'Sentimentos', 400, '{"reactions":["🥰","😭","😡","🤔","😴","🫡"]}', 220, 1),
  ('pack_gamer', 'reaction_pack', 'Gamer', 400, '{"reactions":["🎮","🏆","💀","👀","🤝","😎"]}', 230, 1);
--> statement-breakpoint
-- Prata de boas-vindas para as contas que já existiam na estreia: saldo e linha do livro-razão
-- juntos. Contas novas recebem na criação (mesma referência `welcome:<conta>`, uma vez só).
INSERT INTO `wallets` (`user_id`, `silver`, `gold`, `updated_at`)
SELECT `id`, 300, 0, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM `users`;
--> statement-breakpoint
INSERT INTO `wallet_ledger` (`id`, `user_id`, `currency`, `amount`, `reason`, `reference`, `created_at`)
SELECT 'welcome-' || `id`, `id`, 'silver', 300, 'welcome', 'welcome:' || `id`,
  CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM `users`;
