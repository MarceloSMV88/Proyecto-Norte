'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

interface ProfileContextValue {
  profiles: Profile[]
  activeProfile: Profile | null
  setActiveProfile: (p: Profile) => void
  refreshProfiles: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children, ownProfile }: { children: React.ReactNode; ownProfile: Profile | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(ownProfile)
  const supabase = createClient()

  const loadProfiles = useCallback(async () => {
    if (!ownProfile) return
    if (ownProfile.role === 'Admin') {
      const { data } = await supabase.from('profiles').select('*').order('created_at')
      if (data) setProfiles(data as Profile[])
    } else {
      setProfiles([ownProfile])
    }
  }, [ownProfile, supabase])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  useEffect(() => {
    if (ownProfile && !activeProfile) setActiveProfileState(ownProfile)
  }, [ownProfile, activeProfile])

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
