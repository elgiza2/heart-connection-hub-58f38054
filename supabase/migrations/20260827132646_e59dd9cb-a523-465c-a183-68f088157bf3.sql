UPDATE public.reward_catalog SET active = false WHERE billing_period = 'yearly';
INSERT INTO public.reward_catalog (slug, title, description, plan, billing_period, points_cost, stock_total, active, sort_order)
VALUES ('elite-monthly', 'Elite', 'Highest allowance, priority queue and early features.', 'elite', 'monthly', 2500, 20, true, 30)
ON CONFLICT (slug) DO UPDATE SET active = true, billing_period = 'monthly', points_cost = 2500, stock_total = 20;