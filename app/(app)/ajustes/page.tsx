'use client'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/contexts/ProfileContext'
import { useTheme } from '@/contexts/ThemeContext'
import Topbar from '@/components/layout/Topbar'
import ProfileModal from '@/components/modals/ProfileModal'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import type { AccentColor, Density, Theme, ProfileRole } from '@/lib/types'

const ACCENTS: { key: AccentColor; hex: string }[] = [
  { key: 'emerald', hex: '#34c98a' },
  { key: 'blue', hex: '#4f93f5' },
  { key: 'violet', hex: '#9b8cf0' },
  { key: 'amber', hex: '#e6b25a' },
  { key: 'red', hex: '#ef7a63' },
]

const DENSITY_OPTS: { key: Density; label: string }[] = [
  { key: 'compact', label: 'Compacta' },
  { key: 'normal', label: 'Normal' },
  { key: 'comfy', label: 'Amplia' },
]

export default function AjustesPage() {
  const { user, profile, isAdmin, isSuperAdmin } = useAuth()
  const { profiles, activeProfile, refreshProfiles } = useProfiles()
  const { theme, accent, density, setTheme, setAccent, setDensity } = useTheme()
  const { showToast } = useToast()
  const supabase = createClient()
  const [showProfileModal, setShowProfileModal] = useState(false)

  async function changeRole(profileId: string, newRole: ProfileRole) {
    if (!isAdmin) return
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId)
    if (error) { showToast('Error al cambiar rol'); return }
    showToast('✓ Rol actualizado')
    refreshProfiles()
  }

  async function removeProfile(profileId: string) {
    if (!isAdmin || profileId === profile?.id) return
    if (!confirm('¿Eliminar este perfil? Esta acción no se puede deshacer.')) return
    await supabase.from('profiles').delete().eq('id', profileId)
    showToast('✓ Perfil eliminado')
    refreshProfiles()
  }

  const COLOR_HEX: Record<string, string> = {
    emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63',
  }

  return (
    <div>
      <Topbar title="Ajustes" />

      <div style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', maxWidth: 700 }}>

        {/* Apariencia */}
        <div className="card">
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, marginBottom: 20, color: 'var(--text)' }}>Apariencia</div>

          {/* Tema */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', marginBottom: 10 }}>Tema</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {([['dark', 'Oscuro', '#08090b', '#f1f3f5'], ['light', 'Claro clásico', '#f4f5f3', '#15191c']] as [Theme, string, string, string][]).map(([t, l, bg, tx]) => (
                <button key={t} onClick={() => setTheme(t)}
                  style={{
                    flex: 1, padding: 16, borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${theme === t ? 'var(--accent)' : 'var(--border)'}`,
                    background: bg, cursor: 'pointer', transition: 'border .15s',
                  }}
                >
                  <div style={{ width: 40, height: 6, background: tx + '40', borderRadius: 3, marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-ui)', color: tx }}>{l}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Acento */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', marginBottom: 10 }}>Color de acento</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {ACCENTS.map(({ key, hex }) => (
                <button key={key} onClick={() => setAccent(key)}
                  style={{
                    width: 36, height: 36, borderRadius: '50%', background: hex, border: accent === key ? '3px solid var(--text)' : '3px solid transparent',
                    cursor: 'pointer', transition: 'border .15s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Densidad */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', marginBottom: 10 }}>Densidad</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {DENSITY_OPTS.map(({ key, label }) => (
                <button key={key} onClick={() => setDensity(key)}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${density === key ? 'var(--accent)' : 'var(--border)'}`,
                    background: density === key ? 'rgba(52,201,138,.1)' : 'var(--surface-2)',
                    color: density === key ? 'var(--accent)' : 'var(--text-2)',
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s',
                  }}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Perfiles */}
        <div className="card">
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--text)' }}>
            {isAdmin ? 'Perfiles del hogar' : 'Mi perfil'}
          </div>

          {isAdmin ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 16 }}>
                Cada integrante solo ve sus propios datos. Tú, como administrador, puedes gestionar todos los perfiles.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {profiles.map(p => {
                  const color = COLOR_HEX[p.color] || '#34c98a'
                  const isOwn = p.id === profile?.id
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: color + '20', border: `2px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-ui)', color, flexShrink: 0 }}>
                        {p.initials}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>{p.full_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{p.user_id ? 'Cuenta Google vinculada' : 'Sin cuenta Google'}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: p.role === 'Admin' ? 'rgba(52,201,138,.15)' : 'var(--surface-3)', color: p.role === 'Admin' ? 'var(--ok)' : 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>
                        {p.role}
                      </span>
                      {!isOwn && isSuperAdmin && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select
                            value={p.role}
                            onChange={e => changeRole(p.id, e.target.value as ProfileRole)}
                            style={{ padding: '5px 8px', fontSize: 12, borderRadius: 8, outline: 'none', cursor: 'pointer' }}
                          >
                            <option value="Pro">Pro</option>
                            <option value="Admin">Admin</option>
                          </select>
                          <button onClick={() => removeProfile(p.id)}
                            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
                            Quitar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setShowProfileModal(true)}
                style={{ marginTop: 14, width: '100%', padding: '11px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}
              >
                + Agregar integrante
              </button>
            </>
          ) : (
            activeProfile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: (COLOR_HEX[activeProfile.color] || '#34c98a') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-ui)', color: COLOR_HEX[activeProfile.color] || '#34c98a' }}>
                  {activeProfile.initials}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>{activeProfile.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Los demás perfiles los administra el responsable del hogar.</div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Cuenta y datos */}
        <div className="card">
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, marginBottom: 16, color: 'var(--text)' }}>Cuenta y datos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13.5, color: 'var(--text-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Moneda</span>
              <span style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>CLP (Peso chileno)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Email de cuenta</span>
              <span style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>{user?.email}</span>
            </div>
          </div>
        </div>

        {/* Acerca de */}
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>Norte</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Finanzas personales y familiares · v0.1.0</div>
        </div>
      </div>

      {showProfileModal && profile && (
        <ProfileModal createdBy={profile.id} onClose={() => setShowProfileModal(false)} onSaved={refreshProfiles} />
      )}
    </div>
  )
}
