-- Cupo total de tarjetas de crédito (solo aplica a type='Crédito').
-- Aplicada vía MCP el 2026-06-29.
-- Modelo TC: balance = deuda como negativo; credit_limit = cupo total;
-- disponible = credit_limit - abs(balance). Patrimonio neto resta la deuda.

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS credit_limit bigint;
