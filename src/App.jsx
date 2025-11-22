import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import ScanPage from './pages/ScanPage'
import ContactsPage from './pages/ContactsPage'
import './App.css'

function App() {
  return (
    <Router>
      <div className="app">
        <Navbar />
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App

