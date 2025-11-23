'use client'

import { useState, useEffect } from 'react'
import './SplitBillModal.css'

export default function SplitBillModal({ 
  isOpen, 
  onClose, 
  selectedItems, 
  receiptTotal 
}) {
  const [splitType, setSplitType] = useState(null) // '50', '100', 'custom'
  const [customAmount, setCustomAmount] = useState('')
  const [users, setUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [isCurrentUserSelected, setIsCurrentUserSelected] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Calculate total of selected items
  const selectedTotal = selectedItems.reduce((sum, item) => {
    return sum + (item.total || item.subtotal || 0)
  }, 0)

  useEffect(() => {
    if (isOpen) {
      // Get current logged-in user from localStorage
      const userStr = localStorage.getItem('user')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          setCurrentUser(user)
        } catch (e) {
          console.error('Error parsing user from localStorage:', e)
        }
      }
      fetchUsers()
    } else {
      // Reset state when modal closes
      setSelectedUsers([])
      setIsCurrentUserSelected(false)
      setSplitType(null)
      setCustomAmount('')
      setError(null)
    }
  }, [isOpen])

  const fetchUsers = async () => {
    try {
      // Fetch contacts instead of users
      const response = await fetch('http://127.0.0.1:8005/contacts')
      
      if (!response.ok) {
        throw new Error('Failed to fetch contacts')
      }
      
      const data = await response.json()
      // Convert contacts to user format for compatibility
      const contacts = data.contacts || []
      const formattedUsers = contacts.map(contact => ({
        id: contact.email, // Use email as ID
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        username: contact.username,
      }))
      
      setUsers(formattedUsers)
    } catch (err) {
      setError(err.message || 'Failed to load contacts')
      console.error('Error fetching contacts:', err)
    }
  }

  const handleSplitTypeSelect = (type) => {
    setSplitType(type)
    setCustomAmount('')
  }

  const handleUserToggle = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleCurrentUserToggle = () => {
    setIsCurrentUserSelected(prev => !prev)
  }


  const calculateSplitAmount = () => {
    if (splitType === '50') {
      return selectedTotal * 0.5
    } else if (splitType === '100') {
      return selectedTotal
    } else if (splitType === 'custom') {
      const amount = parseFloat(customAmount) || 0
      return Math.min(amount, selectedTotal)
    }
    return 0
  }

  const handleConfirm = async () => {
    if (!splitType) {
      setError('Please select a split option')
      return
    }

    if (splitType === 'custom' && (!customAmount || parseFloat(customAmount) <= 0)) {
      setError('Please enter a valid custom amount')
      return
    }

    // Count total participants: current user (if selected) + selected contacts
    const totalParticipants = (isCurrentUserSelected ? 1 : 0) + selectedUsers.length
    
    if (totalParticipants === 0) {
      setError('Please select at least one person to split with (including yourself)')
      return
    }

    const splitAmount = calculateSplitAmount()
    const amountPerPerson = splitAmount / totalParticipants

    // Get all participants (current user if selected + selected contacts)
    const allParticipants = []
    
    // If current user is selected, we still need to track them for the split calculation
    // but we won't add debt for them (they're the sender)
    if (isCurrentUserSelected && currentUser) {
      // Current user is included in the split but doesn't get debt added
      // They're paying their share, so we don't need to track it as debt
    }
    
    // Add selected contacts (these will get debt added)
    selectedUsers.forEach(userId => {
      const user = users.find(u => u.id === userId)
      if (user) allParticipants.push(user)
    })

    // We need at least one participant (either current user or contacts)
    if (allParticipants.length === 0 && !isCurrentUserSelected) {
      setError('Please select at least one person to split with')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Call backend to update debts for each participant
      // Note: If current user is selected, they pay their share but don't get debt added
      // Only contacts get debt added (they owe the sender)
      const response = await fetch('http://127.0.0.1:8005/confirm_split', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participants: allParticipants.map(p => p.email), // Send contact emails (not current user)
          amount_per_person: amountPerPerson,
          total_amount: splitAmount,
          items: selectedItems,
          current_user_included: isCurrentUserSelected, // Track if sender is paying their share
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to confirm split')
      }

      const result = await response.json()
      console.log('Split confirmed:', result)

      // Close modal and reset
      onClose()
      
      // Show success message
      alert(`Split confirmed! ${result.message}`)
      
      // If on contacts page, reload to show updated debts
      if (window.location.pathname === '/contacts') {
        window.location.reload()
      }
    } catch (err) {
      setError(err.message || 'Failed to confirm split')
      console.error('Error confirming split:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const splitAmount = calculateSplitAmount()
  const totalParticipants = (isCurrentUserSelected ? 1 : 0) + selectedUsers.length
  const amountPerPerson = splitType && totalParticipants > 0 
    ? splitAmount / totalParticipants 
    : 0

  return (
    <div className="split-modal-overlay" onClick={onClose}>
      <div className="split-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="split-modal-header">
          <h2>Split Bill</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="split-modal-body">
          <div className="selected-items-summary">
            <h3>Selected Items</h3>
            <div className="items-list">
              {selectedItems.map((item, index) => (
                <div key={index} className="item-row">
                  <span className="item-name">{item.item_name || item.name || 'Item'}</span>
                  <span className="item-price">${(item.total || item.subtotal || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="total-row">
              <strong>Total: ${selectedTotal.toFixed(2)}</strong>
            </div>
          </div>

          <div className="split-options">
            <h3>How much do you want to split?</h3>
            <div className="split-buttons">
              <button
                className={`split-option-btn ${splitType === '50' ? 'active' : ''}`}
                onClick={() => handleSplitTypeSelect('50')}
              >
                50%
                <span className="split-amount">${(selectedTotal * 0.5).toFixed(2)}</span>
              </button>
              <button
                className={`split-option-btn ${splitType === '100' ? 'active' : ''}`}
                onClick={() => handleSplitTypeSelect('100')}
              >
                100%
                <span className="split-amount">${selectedTotal.toFixed(2)}</span>
              </button>
              <button
                className={`split-option-btn ${splitType === 'custom' ? 'active' : ''}`}
                onClick={() => handleSplitTypeSelect('custom')}
              >
                Custom
              </button>
            </div>

            {splitType === 'custom' && (
              <div className="custom-amount-input">
                <label>Enter Amount:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedTotal}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={`Max: $${selectedTotal.toFixed(2)}`}
                />
              </div>
            )}

            {splitType && (
              <div className="split-amount-display">
                <p>You're splitting: <strong>${splitAmount.toFixed(2)}</strong></p>
              </div>
            )}
          </div>

          {splitType && (
            <div className="user-selection">
              <h3>Who do you want to split with?</h3>
              {error && <div className="error-message">{error}</div>}
              
              <div className="users-list">
                {/* Current User (You) */}
                {currentUser && (
                  <div
                    className={`user-item current-user ${isCurrentUserSelected ? 'selected' : ''}`}
                    onClick={handleCurrentUserToggle}
                  >
                    <div className="user-avatar">
                      {currentUser.first_name?.charAt(0) || currentUser.username?.charAt(0) || 'U'}
                    </div>
                    <div className="user-info">
                      <div className="user-name">
                        {currentUser.first_name && currentUser.last_name 
                          ? `${currentUser.first_name} ${currentUser.last_name}`
                          : currentUser.username}
                        <span className="you-badge"> (You)</span>
                      </div>
                      <div className="user-email">{currentUser.email}</div>
                    </div>
                    <div className="user-checkbox">
                      {isCurrentUserSelected && '✓'}
                    </div>
                  </div>
                )}

                {/* Contacts */}
                {users.length === 0 ? (
                  <p style={{ color: '#6b7280', padding: '1rem', textAlign: 'center' }}>
                    No contacts available. Add contacts first.
                  </p>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id}
                      className={`user-item ${selectedUsers.includes(user.id) ? 'selected' : ''}`}
                      onClick={() => handleUserToggle(user.id)}
                    >
                      <div className="user-avatar">
                        {user.first_name?.charAt(0) || user.username?.charAt(0) || 'U'}
                      </div>
                      <div className="user-info">
                        <div className="user-name">
                          {user.first_name && user.last_name 
                            ? `${user.first_name} ${user.last_name}`
                            : user.username}
                        </div>
                        <div className="user-email">{user.email}</div>
                      </div>
                      <div className="user-checkbox">
                        {selectedUsers.includes(user.id) && '✓'}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {totalParticipants > 0 && splitAmount > 0 && (
                <div className="split-summary">
                  <p>Amount per person: <strong>${amountPerPerson.toFixed(2)}</strong></p>
                  <p className="split-details">
                    Splitting ${splitAmount.toFixed(2)} between {totalParticipants} {totalParticipants === 1 ? 'person' : 'people'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="split-modal-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button 
            className="confirm-btn" 
            onClick={handleConfirm}
            disabled={!splitType || totalParticipants === 0 || isLoading}
          >
            {isLoading ? 'Processing...' : 'Confirm Split'}
          </button>
        </div>
      </div>
    </div>
  )
}

