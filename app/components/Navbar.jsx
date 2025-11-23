import Link from 'next/link'
import './Navbar.css'

export default function Navbar() {
  return (
    <nav className="navbar">
      <Link href="/" className="navbar-logo">
        <span className="logo-text">Paymi</span>
      </Link>
      <Link href="/payments" className="navbar-link">
        Payments
      </Link>
      <Link href="/contacts" className="navbar-link">
        Contact
      </Link>
    </nav>
  )
}

