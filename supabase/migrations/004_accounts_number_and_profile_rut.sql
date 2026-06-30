-- Soporte de transferencias por Gmail. Aplicada vía MCP el 2026-06-29.

-- N° de cuenta bancaria (para matchear transferencias con la cuenta en Norte; match por dígitos)
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS account_number text;

-- RUT del perfil (clasificación de transferencias: ¿el origen/destino soy yo?)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rut text;
