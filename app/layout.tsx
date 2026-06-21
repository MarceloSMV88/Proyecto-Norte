import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Norte — Finanzas personales',
  description: 'Control presupuestario personal y familiar',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}
