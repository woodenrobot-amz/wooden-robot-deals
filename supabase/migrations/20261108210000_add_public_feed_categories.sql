insert into public.categories (id, name, is_active, sort_order)
values
  ('dad_deals', 'Dad Deals', true, 70),
  ('maker_space', 'Maker Space', true, 80),
  ('shop_savers', 'Shop Savers', true, 90),
  ('top_deals', 'Top Deals', true, 100)
on conflict (id) do nothing;
