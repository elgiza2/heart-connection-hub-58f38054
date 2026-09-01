-- Seedream: upgrade to the Seedream 5 Lite model id available on Renderful
update public.image_models
set model_id_api = 'seedream-5.0-lite',
    display_name = 'Seedream 5 Lite',
    unit_cost_usd = 0.035,
    description = 'ByteDance Seedream 5 Lite through Renderful.',
    supports_image_editing = true,
    endpoint_image_to_image = 'image-to-image',
    updated_at = now()
where slug = 'renderful-seedream-4-5';

-- All Renderful models have image-to-image variants; mark editing support
update public.image_models
set supports_image_editing = true,
    endpoint_image_to_image = 'image-to-image',
    updated_at = now()
where slug in ('renderful-gpt-image-2', 'renderful-nano-banana-2', 'renderful-grok-imagine-image');