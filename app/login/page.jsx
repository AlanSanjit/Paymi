'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  connectPhantom, 
  getPublicKey, 
  isConnected,
  isPhantomInstalled
} from '../../lib/solana/phantom'
import './page.css'

export default function LoginPage() {
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [phantomInstalled, setPhantomInstalled] = useState(false)

  useEffect(() => {
    setPhantomInstalled(isPhantomInstalled())
    if (isConnected()) {
      const pubkey = getPublicKey()
      if (pubkey) {
        setWalletAddress(pubkey)
      }
    }
  }, [])

  const handleConnectWallet = async () => {
    try {
      setIsConnectingWallet(true)
      setError(null)
      const address = await connectPhantom()
      setWalletAddress(address)
    } catch (err) {
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setIsConnectingWallet(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (!email || !password || !walletAddress) {
        setError('Please fill in all fields and connect your wallet')
        setIsLoading(false)
        return
      }
      
      if (isSignUp && (!username || !firstName || !lastName)) {
        setError('Please fill in all required fields')
        setIsLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://127.0.0.1:8003'
      
      if (isSignUp) {
        // Register new user
        const response = await fetch(`${apiUrl}/api/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            username,
            password,
            wallet_address: walletAddress,
            first_name: firstName,
            last_name: lastName
          }),
        })

        const data = await response.json()
        
        if (!response.ok) {
          throw new Error(data.detail || 'Registration failed')
        }

        // Store user data in localStorage
        localStorage.setItem('user', JSON.stringify(data.user))
        localStorage.setItem('isAuthenticated', 'true')
        
        // Redirect to main app
        router.push('/')
      } else {
        // Login existing user
        const response = await fetch(`${apiUrl}/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password
          }),
        })

        const data = await response.json()
        
        if (!response.ok) {
          throw new Error(data.detail || 'Login failed')
        }

        // Store user data in localStorage
        localStorage.setItem('user', JSON.stringify(data.user))
        localStorage.setItem('isAuthenticated', 'true')
        
        // Redirect to main app
        router.push('/')
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">PayMi</h1>
          <p className="login-subtitle">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </p>

          {!phantomInstalled && (
            <div className="phantom-warning">
              <p>⚠️ Phantom wallet is required</p>
              <a 
                href="https://phantom.app" 
                target="_blank" 
                rel="noopener noreferrer"
                className="install-link"
              >
                Install Phantom Wallet
              </a>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            {isSignUp && (
              <>
                <div className="form-group">
                  <label htmlFor="firstName">First Name</label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter your first name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lastName">Last Name</label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter your last name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="username">Username</label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    required
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <div className="form-group">
              <label>Phantom Wallet</label>
              {walletAddress ? (
                <div className="wallet-connected">
                  <div className="wallet-info">
                    <span className="wallet-icon">✓</span>
                    <span className="wallet-address">
                      {walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 8)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalletAddress('')}
                    className="wallet-disconnect"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectWallet}
                  disabled={!phantomInstalled || isConnectingWallet}
                  className="connect-wallet-btn"
                >
                  {isConnectingWallet ? 'Connecting...' : 'Connect Phantom Wallet'}
                </button>
              )}
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !walletAddress}
              className="submit-btn"
            >
              {isLoading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Log In'}
            </button>

            <div className="form-footer">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError(null)
                  // Clear signup-specific fields when switching to login
                  if (!isSignUp) {
                    setFirstName('')
                    setLastName('')
                    setUsername('')
                  }
                }}
                className="toggle-mode"
              >
                {isSignUp 
                  ? 'Already have an account? Log in' 
                  : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

