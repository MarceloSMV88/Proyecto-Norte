import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProfileProvider } from '@/contexts/ProfileContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/components/ui/Toast'
import Sidebar from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider ownProfile={null}>
          <ToastProvider>
            <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
              <Sidebar />
              <div className="main-content" style={{ flex: 1 }}>
                {children}
              </div>
            </div>
          </ToastProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
