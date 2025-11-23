'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import './Navbar.css'

export default function Navbar() {
  const router = useRouter()

  const handleLogout = () => {
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
        <Link href="/payments" className="navbar-link">
          Payments
        </Link>
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

