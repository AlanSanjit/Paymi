'use client'

import { useState, useEffect } from 'react'
import './page.css'

export default function ContactsPage() {
  const [contacts, setContacts] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    wallet_id: '',
  })

  // Load contacts on page load
  useEffect(() => {
    loadContacts()
  }, [])

  const loadContacts = async () => {
    try {
      // Get logged-in user's email from localStorage
      const userStr = localStorage.getItem('user')
      let userEmail = null
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          userEmail = user.email
        } catch (e) {
          console.error('Error parsing user from localStorage:', e)
        }
      }
      
      // Build URL with user_email parameter
      const url = userEmail 
        ? `http://127.0.0.1:8005/contacts?user_email=${encodeURIComponent(userEmail)}`
        : 'http://127.0.0.1:8005/contacts'
      
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to load contacts')
      }
      const data = await response.json()
      setContacts(data.contacts || [])
    } catch (err) {
      console.error('Error loading contacts:', err)
      // Don't show error on initial load, just log it
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('http://127.0.0.1:8005/add_contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to add contact')
      }

      const newContact = await response.json()
      
      // Reload contacts to get updated list with categories
      await loadContacts()
      
      // Close the form and reset
      setShowAddForm(false)
      setFormData({
        first_name: '',
        last_name: '',
        username: '',
        email: '',
        wallet_id: '',
      })
    } catch (err) {
      setError(err.message || 'An error occurred while adding the contact')
      console.error('Error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setError(null)
    setFormData({
      first_name: '',
      last_name: '',
      username: '',
      email: '',
      wallet_id: '',
    })
  }

  // Categorize contacts
  const owesMe = contacts.filter(c => c.category === 'owes_me')
  const iOwe = contacts.filter(c => c.category === 'i_owe')
  const neutral = contacts.filter(c => c.category === 'neutral')

  const calculateProgress = (total, paid) => {
    if (total === 0) return 0
    return Math.min((paid / total) * 100, 100)
  }

  return (
    <div className="contacts-page">
      <div className="contacts-container">
        <div className="contacts-header">
          <h1 className="contacts-title">Contacts</h1>
          <button 
            className="add-contact-btn"
            onClick={() => setShowAddForm(true)}
          >
            + Add Contact
          </button>
        </div>

        {showAddForm && (
          <div className="add-contact-form-container">
            <div className="add-contact-form">
              <div className="form-header">
                <h2>Add New Contact</h2>
                <button 
                  className="close-form-btn"
                  onClick={handleCancel}
                >
                  ×
                </button>
              </div>
              
              {error && (
                <div className="form-error">
                  {error}
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="first_name">
                    <span className="label-icon">👤</span>
                    First Name
                  </label>
                  <input
                    type="text"
                    id="first_name"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    placeholder="Enter first name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="last_name">
                    <span className="label-icon">👤</span>
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="last_name"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    placeholder="Enter last name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="username">
                    <span className="label-icon">👤</span>
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="Enter username"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">
                    <span className="label-icon">📧</span>
                    Email (Unique)
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter email address"
                    required
                  />
                  <small className="form-hint">This will be used as the unique identifier</small>
                </div>

                <div className="form-group">
                  <label htmlFor="wallet_id">
                    <span className="label-icon">💳</span>
                    Wallet ID (Solana)
                  </label>
                  <input
                    type="text"
                    id="wallet_id"
                    name="wallet_id"
                    value={formData.wallet_id}
                    onChange={handleInputChange}
                    placeholder="Enter Solana wallet address"
                    required
                  />
                  <small className="form-hint">For USDC payments via Solana Pay</small>
                </div>

                <div className="form-actions">
                  <button 
                    type="button"
                    className="cancel-btn"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="submit-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Adding...' : 'Add Contact'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Owes Me Section */}
        {owesMe.length > 0 && (
          <section className="contacts-section">
            <h2 className="section-title owes-title">
              Owes Me <span className="count-badge">{owesMe.length}</span>
            </h2>
            <div className="contacts-list">
              {owesMe.map((contact) => {
                const fullName = `${contact.first_name} ${contact.last_name}`
                const totalDebt = contact.total_debt || 0
                const paidBack = contact.paid_back || 0
                const remaining = totalDebt - paidBack
                const progress = calculateProgress(totalDebt, paidBack)
                
                return (
                  <div key={contact.email} className="contact-card owes-card">
                    <div className="contact-info">
                      <div className="contact-avatar">
                        {contact.first_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="contact-details">
                        <h3 className="contact-name">{fullName}</h3>
                        <div className="debt-info">
                          <div className="debt-amounts">
                            <span className="total-debt">Total: ${totalDebt.toFixed(2)}</span>
                            <span className="remaining-debt">Remaining: ${remaining.toFixed(2)}</span>
                          </div>
                          <div className="progress-bar-container">
                            <div className="progress-bar">
                              <div 
                                className="progress-fill owes-progress"
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                            <span className="progress-text">
                              {paidBack.toFixed(2)} / {totalDebt.toFixed(2)} paid
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button className="contact-action-btn">Request</button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* I Owe Section */}
        {iOwe.length > 0 && (
          <section className="contacts-section">
            <h2 className="section-title owed-title">
              I Owe <span className="count-badge">{iOwe.length}</span>
            </h2>
            <div className="contacts-list">
              {iOwe.map((contact) => {
                const fullName = `${contact.first_name} ${contact.last_name}`
                const totalDebt = contact.total_debt || 0
                const paidBack = contact.paid_back || 0
                const remaining = totalDebt - paidBack
                const progress = calculateProgress(totalDebt, paidBack)
                
                return (
                  <div key={contact.email} className="contact-card owed-card">
                    <div className="contact-info">
                      <div className="contact-avatar">
                        {contact.first_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="contact-details">
                        <h3 className="contact-name">{fullName}</h3>
                        <div className="debt-info">
                          <div className="debt-amounts">
                            <span className="total-debt">Total: ${totalDebt.toFixed(2)}</span>
                            <span className="remaining-debt">Remaining: ${remaining.toFixed(2)}</span>
                          </div>
                          <div className="progress-bar-container">
                            <div className="progress-bar">
                              <div 
                                className="progress-fill owed-progress"
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                            <span className="progress-text">
                              {paidBack.toFixed(2)} / {totalDebt.toFixed(2)} paid
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button className="contact-action-btn pay-btn">Pay</button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Neutral Section */}
        {neutral.length > 0 && (
          <section className="contacts-section">
            <h2 className="section-title neutral-title">
              Neutral <span className="count-badge">{neutral.length}</span>
            </h2>
            <div className="contacts-list">
              {neutral.map((contact) => {
                const fullName = `${contact.first_name} ${contact.last_name}`
                
                return (
                  <div key={contact.email} className="contact-card neutral-card">
                    <div className="contact-info">
                      <div className="contact-avatar">
                        {contact.first_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="contact-details">
                        <h3 className="contact-name">{fullName}</h3>
                        <p className="neutral-status">No outstanding debts</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {contacts.length === 0 && !showAddForm && (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h2>No contacts yet</h2>
            <p>Add your first contact to get started</p>
            <button 
              className="add-contact-btn-large"
              onClick={() => setShowAddForm(true)}
            >
              + Add Contact
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
