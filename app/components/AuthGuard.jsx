'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function AuthGuard({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // Check authentication status
    if (typeof window !== 'undefined') {
      const isAuthenticated = localStorage.getItem('isAuthenticated')
      const isLoginPage = pathname === '/login'

      if (!isAuthenticated && !isLoginPage) {
        router.push('/login')
        return
      } else if (isAuthenticated && isLoginPage) {
        router.push('/')
        return
      }
    }
    setIsChecking(false)
  }, [pathname, router])

  // Don't render children until auth check is complete
  if (isChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)'
      }}>
        <div style={{ color: '#ffffff', fontSize: '1.1rem' }}>Loading...</div>
      </div>
    )
  }

  return children
}

