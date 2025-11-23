'use client'

import { useState, useEffect } from 'react'
import { 
  connectPhantom, 
  getPublicKey, 
  isConnected,
  getBalance,
  sendPayment,
  isPhantomInstalled
} from '../../lib/solana/phantom'
import './DebtPaymentModal.css'

export default function DebtPaymentModal({ 
  isOpen, 
  onClose, 
  creditor,
  totalDebt,
  paidBack,
  onPaymentSuccess
}) {
  const [walletAddress, setWalletAddress] = useState(null)
  const [balance, setBalance] = useState(null)
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [phantomInstalled, setPhantomInstalled] = useState(false)

  const remainingDebt = totalDebt - paidBack
  // Get wallet address - check both wallet_id (from contacts) and wallet_address (from users)
  const creditorWallet = creditor?.wallet_id || creditor?.wallet_address || ''

  useEffect(() => {
    if (isOpen) {
      setPhantomInstalled(isPhantomInstalled())
      if (isConnected()) {
        const pubkey = getPublicKey()
        if (pubkey) {
          setWalletAddress(pubkey)
          loadBalance(pubkey)
        }
      }
      // Set default amount to empty (user can choose to pay full or partial)
      setAmount('')
      setError(null)
      setSuccess(null)
    }
  }, [isOpen, remainingDebt])

  const loadBalance = async (address) => {
    try {
      const bal = await getBalance(address)
      setBalance(bal)
    } catch (err) {
      console.error('Failed to load balance:', err)
    }
  }

  const handleConnect = async () => {
    try {
      setError(null)
      const address = await connectPhantom()
      setWalletAddress(address)
      await loadBalance(address)
    } catch (err) {
      setError(err.message)
    }
  }

  const handlePayFullAmount = () => {
    setAmount(remainingDebt.toFixed(2))
    setError(null)
  }

  const handleAmountChange = (e) => {
    const value = e.target.value
    
    // Allow empty input
    if (value === '') {
      setAmount('')
      setError(null)
      return
    }
    
    // Parse the input value
    const numValue = parseFloat(value)
    
    // If it's a valid number
    if (!isNaN(numValue)) {
      // Cap at remaining debt
      if (numValue > remainingDebt) {
        setAmount(remainingDebt.toFixed(2))
        setError(`Amount cannot exceed remaining debt of $${remainingDebt.toFixed(2)}`)
      } else if (numValue <= 0) {
        setAmount(value) // Allow typing, but validation will catch it on submit
        setError(null)
      } else {
        setAmount(value)
        setError(null)
      }
    } else {
      // Allow typing (for cases like "0." or "-")
      setAmount(value)
      setError(null)
    }
  }

  const handleSendPayment = async () => {
    if (!walletAddress || !creditorWallet || !amount) {
      setError('Please fill in all fields')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount greater than $0.00')
      return
    }

    // Ensure amount doesn't exceed remaining debt (with small tolerance for floating point)
    const maxAmount = remainingDebt + 0.01 // Small tolerance for floating point precision
    if (amountNum > maxAmount) {
      setError(`Amount cannot exceed remaining debt of $${remainingDebt.toFixed(2)}`)
      return
    }
    
    // Cap the amount at remaining debt if somehow it's slightly over
    const finalAmount = Math.min(amountNum, remainingDebt)

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Show a message that user needs to approve in Phantom
      setSuccess('⏳ A Phantom wallet popup should appear. Please approve the transaction...')
      
      // Convert USD amount to SOL
      // Note: In production, fetch current SOL/USD rate from an API (e.g., CoinGecko, CoinMarketCap)
      // For now using a placeholder rate: 1 SOL = $150 (adjust as needed)
      const SOL_PRICE_USD = 150 // Current SOL price in USD - should be fetched dynamically
      const solAmount = finalAmount / SOL_PRICE_USD
      
      const result = await sendPayment(walletAddress, creditorWallet, solAmount)
      
      // Update debt record on backend
      try {
        // Get current user's email
        const userStr = localStorage.getItem('user')
        let currentUserEmail = null
        if (userStr) {
          try {
            const user = JSON.parse(userStr)
            currentUserEmail = user.email
          } catch (e) {
            console.error('Error parsing user from localStorage:', e)
          }
        }
        
        if (!currentUserEmail) {
          throw new Error('User email not found')
        }
        
        const response = await fetch('http://127.0.0.1:8005/record_payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contact_email: creditor.email,  // Creditor's email (who is being paid)
            debtor_email: currentUserEmail,  // Current user's email (who is making the payment)
            amount: finalAmount,
            description: `Payment via PayMi - ${result.signature.substring(0, 20)}...`
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to update debt record')
        }
      } catch (err) {
        console.error('Failed to update debt record:', err)
        // Payment was sent but debt record update failed - still show success
      }
      
      setSuccess(`✅ Payment sent successfully! Transaction: ${result.signature.substring(0, 20)}...`)
      setError(null)
      
      // Reload balance after a short delay
      setTimeout(async () => {
        await loadBalance(walletAddress)
      }, 2000)

      // Call onPaymentSuccess callback after a delay to allow user to see success message
      setTimeout(() => {
        if (onPaymentSuccess) {
          onPaymentSuccess(finalAmount)
        }
        onClose()
      }, 3000)
    } catch (err) {
      let errorMessage = err.message
      if (errorMessage.includes('rejected') || errorMessage.includes('not been authorized') || errorMessage.includes('cancelled')) {
        errorMessage = '❌ Transaction was rejected. Please try again and approve in Phantom wallet.'
      } else if (errorMessage.includes('Cannot connect') || errorMessage.includes('Failed to fetch')) {
        errorMessage = '❌ Cannot connect to Solana backend. Please check your connection.'
      } else if (errorMessage.includes('timeout')) {
        errorMessage = '⏱️ Transaction timed out. Please try again.'
      }
      setError(errorMessage)
      setSuccess(null)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const creditorName = creditor?.first_name && creditor?.last_name
    ? `${creditor.first_name} ${creditor.last_name}`
    : creditor?.username || creditor?.email || 'Creditor'

  return (
    <div className="debt-payment-modal-overlay" onClick={onClose}>
      <div className="debt-payment-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="debt-payment-modal-header">
          <h2>PayMi - Send Payment</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="debt-payment-modal-body">
          <div className="debt-summary">
            <h3>Paying: {creditorName}</h3>
            <div className="debt-details">
              <p>Total Debt: ${totalDebt.toFixed(2)}</p>
              <p>Already Paid: ${paidBack.toFixed(2)}</p>
              <p>Remaining: ${remainingDebt.toFixed(2)}</p>
            </div>
          </div>

          {!phantomInstalled ? (
            <div className="phantom-install-prompt">
              <p>Phantom Wallet is required to send payments.</p>
              <a 
                href="https://phantom.app" 
                target="_blank" 
                rel="noopener noreferrer"
                className="install-phantom-btn"
              >
                Install Phantom Wallet
              </a>
            </div>
          ) : !walletAddress ? (
            <div className="wallet-connect-section">
              <p>Connect your Phantom wallet to send payment</p>
              <button onClick={handleConnect} className="connect-wallet-btn">
                Connect Phantom Wallet
              </button>
            </div>
          ) : (
            <div className="payment-form">
              <div className="wallet-info">
                <p>Your Wallet: {walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 8)}</p>
                <p>Balance: {balance !== null ? `${balance.toFixed(4)} SOL` : 'Loading...'}</p>
              </div>

              <div className="recipient-info">
                <p>Recipient: {creditorName}</p>
                <p>Wallet: {creditorWallet ? `${creditorWallet.substring(0, 8)}...${creditorWallet.substring(creditorWallet.length - 8)}` : 'Not available'}</p>
              </div>

              {!creditorWallet && (
                <div className="error-message">
                  ⚠️ Creditor's wallet address is not available. Please contact them to add their wallet address.
                </div>
              )}

              <div className="amount-input-group">
                <label htmlFor="payment-amount">
                  Payment Amount (USD):
                </label>
                <div className="amount-input-wrapper">
                  <input
                    id="payment-amount"
                    type="number"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder={`Enter amount (max: $${remainingDebt.toFixed(2)})`}
                    step="0.01"
                    min="0"
                    max={remainingDebt}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={handlePayFullAmount}
                    disabled={isLoading}
                    className="pay-full-btn"
                  >
                    Pay Full
                  </button>
                </div>
                <small>Maximum: ${remainingDebt.toFixed(2)} (Remaining Debt)</small>
              </div>

              <button
                onClick={handleSendPayment}
                disabled={isLoading || !amount || !creditorWallet || parseFloat(amount) <= 0 || parseFloat(amount) > (remainingDebt + 0.01)}
                className="send-payment-btn"
              >
                {isLoading ? 'Processing...' : 'Send Payment via PayMi'}
              </button>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              {success && (
                <div className="success-message">
                  {success}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

