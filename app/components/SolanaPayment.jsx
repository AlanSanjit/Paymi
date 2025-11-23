'use client'

import { useState, useEffect } from 'react';
import { 
  connectPhantom, 
  disconnectPhantom, 
  getPublicKey, 
  isConnected,
  getBalance,
  sendPayment,
  isPhantomInstalled
} from '../../lib/solana/phantom';

export default function SolanaPayment() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [phantomInstalled, setPhantomInstalled] = useState(false);

  useEffect(() => {
    setPhantomInstalled(isPhantomInstalled());
    if (isConnected()) {
      const pubkey = getPublicKey();
      if (pubkey) {
        setWalletAddress(pubkey);
        loadBalance(pubkey);
      }
    }
  }, []);

  const loadBalance = async (address) => {
    try {
      const bal = await getBalance(address);
      setBalance(bal);
    } catch (err) {
      console.error('Failed to load balance:', err);
    }
  };

  const handleConnect = async () => {
    try {
      setError(null);
      const address = await connectPhantom();
      setWalletAddress(address);
      await loadBalance(address);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectPhantom();
      setWalletAddress(null);
      setBalance(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSendPayment = async () => {
    if (!walletAddress || !recipientAddress || !amount) {
      setError('Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Show a message that user needs to approve in Phantom
      setSuccess('⏳ A Phantom wallet popup should appear. Please approve the transaction...');
      
      const result = await sendPayment(walletAddress, recipientAddress, amountNum);
      setSuccess(`✅ Payment sent successfully! Signature: ${result.signature.substring(0, 20)}...`);
      setError(null);
      setRecipientAddress('');
      setAmount('');
      // Reload balance after a short delay
      setTimeout(async () => {
        await loadBalance(walletAddress);
      }, 2000);
    } catch (err) {
      let errorMessage = err.message;
      if (errorMessage.includes('rejected') || errorMessage.includes('not been authorized') || errorMessage.includes('cancelled')) {
        errorMessage = '❌ Transaction was rejected. Please:\n1. Click "Send Payment" again\n2. Look for the Phantom wallet popup (it may be behind your browser window)\n3. Click "Approve" or "Confirm" in the popup\n4. Do NOT close or reject the popup';
      } else if (errorMessage.includes('Cannot connect') || errorMessage.includes('Failed to fetch')) {
        errorMessage = '❌ Cannot connect to Solana backend. Make sure you started it with: npm run solana:dev';
      } else if (errorMessage.includes('timeout')) {
        errorMessage = '⏱️ Transaction timed out. Please try again.';
      }
      setError(errorMessage);
      setSuccess(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!phantomInstalled) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Phantom Wallet Required</h2>
        <p>Please install Phantom wallet to use Solana payments.</p>
        <a 
          href="https://phantom.app" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            display: 'inline-block', 
            marginTop: '1rem', 
            padding: '0.75rem 1.5rem',
            background: '#512DA8',
            color: 'white',
            borderRadius: '8px',
            textDecoration: 'none'
          }}
        >
          Install Phantom
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Solana Payment</h2>

      {!walletAddress ? (
        <div>
          <button
            onClick={handleConnect}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#512DA8',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Connect Phantom Wallet
          </button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
            <p><strong>Wallet:</strong> {walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 8)}</p>
            <p><strong>Balance:</strong> {balance !== null ? `${balance.toFixed(4)} SOL` : 'Loading...'}</p>
            <button
              onClick={handleDisconnect}
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                background: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Disconnect
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Recipient Wallet Address:
            </label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Enter Phantom wallet address"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Amount (SOL):
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.1"
              step="0.001"
              min="0"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>

          <button
            onClick={handleSendPayment}
            disabled={isLoading || !recipientAddress || !amount}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: isLoading ? '#999' : '#512DA8',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {isLoading ? 'Processing...' : 'Send Payment'}
          </button>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#fee',
              color: '#c00',
              borderRadius: '8px',
              whiteSpace: 'pre-line'
            }}>
              Error: {error}
            </div>
          )}

          {success && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#efe',
              color: '#0a0',
              borderRadius: '8px'
            }}>
              {success}
            </div>
          )}
        </div>
      )}
    </div>
  );
}



