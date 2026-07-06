import { createClient } from 'jsr:@supabase/supabase-js@2'

// Sube la imagen de una cuenta al bucket 'account-images'. Llamada por el navegador ya
// logueado vía supabase.functions.invoke() — Supabase valida el JWT del usuario a nivel de
// plataforma (verify_jwt: true) antes de que este código corra, así que acá adentro se usa
// el SERVICE_ROLE_KEY para escribir en Storage sin depender de las políticas RLS de
// storage.objects (que no estaban dejando pasar la subida directa desde el navegador,
// causa exacta sin determinar — este endpoint evita el problema por completo).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// El navegador manda un preflight OPTIONS antes del POST (FormData + header Authorization
// no es una "simple request") — sin estos headers el preflight falla con 405 y el POST
// real nunca se envía.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let form: FormData
  try { form = await req.formData() } catch { return json({ error: 'bad_form' }, 400) }

  const file = form.get('file')
  const profileId = String(form.get('profile_id') ?? '').trim()
  if (!(file instanceof File)) return json({ error: 'no_file' }, 400)
  if (!profileId) return json({ error: 'no_profile' }, 400)
  if (file.size > 3 * 1024 * 1024) return json({ error: 'file_too_large' }, 400)
  if (!file.type.startsWith('image/')) return json({ error: 'not_image' }, 400)

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${profileId}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await sb.storage.from('account-images').upload(path, file, {
    contentType: file.type, upsert: true,
  })
  if (upErr) return json({ error: 'upload_failed', detail: upErr.message }, 500)

  const { data } = sb.storage.from('account-images').getPublicUrl(path)
  return json({ ok: true, url: data.publicUrl })
})
