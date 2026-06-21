'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'

const ADMIN_EMAIL = 'marcelo.moyav@gmail.com'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  isSuperAdmin: boolean
  canWrite: boolean
  canRead: boolean
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadProfile = useCallback(async (u: User) => {
    const { data } = await supabase.rpc('upsert_norte_profile', {
      p_email: u.email,
      p_name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario',
      p_full_name: u.user_metadata?.full_name || u.user_metadata?.name || '',
      p_avatar_url: u.user_metadata?.avatar_url || '',
      p_user_id: u.id,
    })

    if (data) {
      const p = data as Profile
      setProfile(p)
      // Seed default categories if this profile has none yet
      const { count } = await supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', p.id)
      if ((count ?? 0) === 0) {
        await supabase.rpc('seed_default_categories', { p_profile_id: p.id })
      }
    }
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    await loadProfile(user)
  }, [user, loadProfile])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u)
      if (u) loadProfile(u).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) loadProfile(u)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [supabase, loadProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === 'Admin' || user?.email === ADMIN_EMAIL
  const isSuperAdmin = user?.email === ADMIN_EMAIL
  const canRead = !!profile
  const canWrite = isAdmin || profile?.role === 'Pro'

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, isSuperAdmin, canRead, canWrite, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
