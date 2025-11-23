'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { disconnectPhantom } from '../../lib/solana/phantom'
import './Navbar.css'

export default function Navbar() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      // Disconnect Phantom wallet
      await disconnectPhantom()
    } catch (err) {
      console.error('Error disconnecting Phantom wallet:', err)
      // Continue with logout even if disconnect fails
    }
    
    // Clear authentication data
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('user')
    
    // Redirect to login page
    router.push('/login')
  }

  return (
    <nav className="navbar">
      <Link href="/" className="navbar-logo">
        <span className="logo-text">PayMi</span>
      </Link>
      <div className="navbar-links">
        <Link href="/contacts" className="navbar-link">
          Contact
        </Link>
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </div>
    </nav>
  )
}

