import { Link } from 'react-router-dom'
import './Navbar.css'

function Navbar() {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <span className="logo-text">Paymi</span>
      </Link>
      <Link to="/contacts" className="navbar-link">
        Contact
      </Link>
    </nav>
  )
}

export default Navbar

