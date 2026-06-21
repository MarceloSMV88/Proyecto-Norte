'use client'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M18 2L22.5 13.5L34 18L22.5 22.5L18 34L13.5 22.5L2 18L13.5 13.5Z" fill="var(--accent)" />
    </svg>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="card w-full max-w-sm" style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Logo />
          <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Norte
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>
            Finanzas personales y familiares
          </p>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--danger)', background: 'rgba(239,122,99,.1)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', width: '100%' }}>
            Error de autenticación. Intenta nuevamente.
          </p>
        )}

        <button
          onClick={signInWithGoogle}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '13px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: '#06140e',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            fontSize: 14.5,
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <GoogleIcon />
          Continuar con Google
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5, margin: 0 }}>
          Al continuar, aceptas el uso de tus datos para acceder a la app. Solo se admite el acceso por invitación del administrador del hogar.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
