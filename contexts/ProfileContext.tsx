'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile } from '@/lib/types'

interface ProfileContextValue {
  profiles: Profile[]
  activeProfile: Profile | null
  setActiveProfile: (p: Profile) => void
  refreshProfiles: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null)
  const supabase = createClient()

  const loadProfiles = useCallback(async () => {
    if (!profile) return
    if (profile.role === 'Admin') {
      const { data } = await supabase.from('profiles').select('*').order('created_at')
      if (data) setProfiles(data as Profile[])
    } else {
      setProfiles([profile])
    }
  }, [profile, supabase])

  useEffect(() => {
    if (profile) {
      setActiveProfileState(prev => {
        if (!prev) return profile
        // Sync fresh auth profile data when it's the same person
        if (prev.id === profile.id) return profile
        return prev
      })
      loadProfiles()
    }
  }, [profile, loadProfiles])

  const setActiveProfile = (p: Profile) => setActiveProfileState(p)
  const refreshProfiles = loadProfiles

  return (
    <ProfileContext.Provider value={{ profiles, activeProfile, setActiveProfile, refreshProfiles }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfiles() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfiles must be used within ProfileProvider')
  return ctx
}
