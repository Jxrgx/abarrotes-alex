-- =============================================================================
-- Abarrotes Alex · Ajustes al modelo (Fase 2.1)
-- =============================================================================

-- La asignación de roles privilegiados debe ser explícita: sin DEFAULT, un
-- INSERT sin role falla por NOT NULL.
alter table public.profiles alter column role drop default;

-- Productos locales, a granel o genéricos pueden no tener marca comercial.
-- La FK products_brand_id_fkey (ON DELETE RESTRICT) se conserva y solo aplica
-- cuando brand_id tiene valor.
alter table public.products alter column brand_id drop not null;
