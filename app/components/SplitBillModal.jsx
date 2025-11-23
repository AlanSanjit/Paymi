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
      setIsCurrentUserSelected(false)
      setSelectedUsers([])
      setSplitType(null)
      setCustomAmount('')
      setError(null)
    }
  }, [isOpen])

  const fetchUsers = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://127.0.0.1:8003'
      const response = await fetch(`${apiUrl}/api/users`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      
      const data = await response.json()
      // Filter out the current user from the list
      const userStr = localStorage.getItem('user')
      if (userStr) {
        try {
          const currentUser = JSON.parse(userStr)
          const otherUsers = (data.users || []).filter(user => user.id !== currentUser.id)
          setUsers(otherUsers)
        } catch (e) {
          setUsers(data.users || [])
        }
      } else {
        setUsers(data.users || [])
      }
    } catch (err) {
      setError(err.message || 'Failed to load users')
      console.error('Error fetching users:', err)
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

  const handleConfirm = () => {
    if (!splitType) {
      setError('Please select a split option')
      return
    }

    if (splitType === 'custom' && (!customAmount || parseFloat(customAmount) <= 0)) {
      setError('Please enter a valid custom amount')
      return
    }

    // Count total participants: current user (if selected) + other selected users
    const totalParticipants = (isCurrentUserSelected ? 1 : 0) + selectedUsers.length
    
    if (totalParticipants === 0) {
      setError('Please select at least one person to split with (including yourself)')
      return
    }

    const splitAmount = calculateSplitAmount()
    const amountPerPerson = splitAmount / totalParticipants

    // Here you would save the split to the database
    const allParticipants = []
    if (isCurrentUserSelected && currentUser) {
      allParticipants.push(currentUser)
    }
    selectedUsers.forEach(userId => {
      const user = users.find(u => u.id === userId)
      if (user) allParticipants.push(user)
    })

    console.log('Split Details:', {
      items: selectedItems,
      splitType,
      splitAmount,
      amountPerPerson,
      totalParticipants,
      participants: allParticipants,
      currentUserIncluded: isCurrentUserSelected,
      totalSelected: selectedTotal
    })

    // Close modal and reset
    onClose()
    // You can add a success message or callback here
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

                {/* Other Users */}
                {users.length === 0 ? (
                  <p style={{ color: '#6b7280', padding: '1rem', textAlign: 'center' }}>
                    {currentUser ? 'No other users available' : 'Loading users...'}
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
            disabled={!splitType || totalParticipants === 0}
          >
            Confirm Split
          </button>
        </div>
      </div>
    </div>
  )
}

