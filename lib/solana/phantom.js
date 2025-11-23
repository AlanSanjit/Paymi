/**
 * Phantom Wallet Integration Helper
 * Frontend utilities for connecting and interacting with Phantom wallet
 */

import { 
  Transaction, 
  Connection, 
  PublicKey, 
  SystemProgram, 
  clusterApiUrl, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';

// Check if Phantom is installed
export function isPhantomInstalled() {
  return typeof window !== 'undefined' && window.solana?.isPhantom === true;
}

// Get Phantom provider
export function getPhantomProvider() {
  if (typeof window === 'undefined') return null;
  return window.solana || null;
}

// Connect to Phantom wallet
export async function connectPhantom() {
  const provider = getPhantomProvider();
  
  if (!provider) {
    throw new Error('Phantom wallet is not installed. Please install it from https://phantom.app');
  }

  try {
    const response = await provider.connect();
    return response.publicKey.toString();
  } catch (error) {
    throw new Error(`Failed to connect: ${error.message}`);
  }
}

// Disconnect from Phantom
export async function disconnectPhantom() {
  const provider = getPhantomProvider();
  if (provider) {
    await provider.disconnect();
  }
}

// Get current public key
export function getPublicKey() {
  const provider = getPhantomProvider();
  return provider?.publicKey?.toString() || null;
}

// Check if connected
export function isConnected() {
  const provider = getPhantomProvider();
  return provider?.isConnected === true;
}

// Get wallet balance via backend
export async function getBalance(publicKey, backendUrl = 'http://localhost:8004') {
  try {
    const response = await fetch(`${backendUrl}/wallet/balance/${publicKey}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to get balance');
    }
    
    return data.balance;
  } catch (error) {
    throw new Error(`Balance check failed: ${error.message}`);
  }
}

// Request airdrop
export async function requestAirdrop(publicKey, amountSol = 1, backendUrl = 'http://localhost:8004') {
  try {
    const response = await fetch(`${backendUrl}/wallet/airdrop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey, amountSol })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to request airdrop');
    }
    
    return data.signature;
  } catch (error) {
    throw new Error(`Airdrop failed: ${error.message}`);
  }
}

// Build and sign transaction - CLIENT SIDE VERSION (more reliable)
export async function buildAndSignTransaction(from, to, amountSol, backendUrl = 'http://localhost:8004') {
  try {
    const provider = getPhantomProvider();
    if (!provider) {
      throw new Error('Phantom wallet is not connected');
    }

    // Build transaction directly on client side for better Phantom compatibility
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const fromPubkey = new PublicKey(from);
    const toPubkey = new PublicKey(to);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Create transaction
    const transaction = new Transaction({
      feePayer: fromPubkey,
      blockhash: blockhash,
      lastValidBlockHeight: lastValidBlockHeight,
    }).add(
      SystemProgram.transfer({
        fromPubkey: fromPubkey,
        toPubkey: toPubkey,
        lamports: lamports,
      })
    );

    // Sign with Phantom - with better error handling
    console.log('Requesting signature from Phantom...');
    console.log('Transaction details:', {
      from: fromPubkey.toString(),
      to: toPubkey.toString(),
      amount: amountSol,
      lamports: lamports
    });

    let signedTransaction;
    try {
      // Wait a bit to ensure UI is ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Sign with Phantom - this will show a popup
      signedTransaction = await provider.signTransaction(transaction);
      console.log('Transaction signed successfully');
      console.log('Signed transaction object:', {
        hasSignature: !!signedTransaction.signature,
        signaturesCount: signedTransaction.signatures?.length || 0,
        signatures: signedTransaction.signatures
      });
    } catch (signError) {
      console.error('Signing error:', signError);
      
      // Check for specific error types
      const errorMsg = signError.message || String(signError);
      if (errorMsg.includes('User rejected') || 
          errorMsg.includes('not been authorized') ||
          errorMsg.includes('User cancelled') ||
          errorMsg.includes('User denied') ||
          errorMsg.includes('4001')) {
        throw new Error('Transaction was rejected. Please click "Send Payment" again and make sure to APPROVE the transaction in the Phantom wallet popup (don\'t close it or click reject).');
      }
      if (errorMsg.includes('timeout') || errorMsg.includes('expired')) {
        throw new Error('Transaction signing timed out. Please try again.');
      }
      throw signError;
    }

    // Verify transaction is signed
    const hasSignature = signedTransaction.signature || 
                        (signedTransaction.signatures && 
                         signedTransaction.signatures.length > 0 && 
                         signedTransaction.signatures.some(sig => sig && sig.length > 0));
    
    if (!hasSignature) {
      console.error('Transaction not signed:', {
        signature: signedTransaction.signature,
        signatures: signedTransaction.signatures
      });
      throw new Error('Transaction was not signed properly by Phantom');
    }

    // Serialize signed transaction (with signatures)
    const signedBytes = signedTransaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    
    console.log('Transaction serialized, length:', signedBytes.length);
    if (signedTransaction.signature) {
      console.log('Transaction signature:', signedTransaction.signature.toString('base64'));
    }
    if (signedTransaction.signatures) {
      console.log('Transaction signatures count:', signedTransaction.signatures.length);
    }
    
    let binary = '';
    for (let i = 0; i < signedBytes.length; i++) {
      binary += String.fromCharCode(signedBytes[i]);
    }
    const signedBase64 = btoa(binary);

    return signedBase64;
  } catch (error) {
    // Provide more helpful error messages
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('rejected') || 
        errorMsg.includes('not been authorized') ||
        errorMsg.includes('cancelled') ||
        errorMsg.includes('denied')) {
      throw new Error('Transaction was rejected. Please click "Send Payment" again and make sure to APPROVE the transaction in the Phantom wallet popup.');
    }
    throw new Error(`Transaction signing failed: ${errorMsg}`);
  }
}

// Send payment (complete flow)
export async function sendPayment(from, to, amountSol, backendUrl = 'http://localhost:8004') {
  try {
    // Build and sign transaction
    const signedTransaction = await buildAndSignTransaction(from, to, amountSol, backendUrl);

    // Broadcast transaction
    const sendResponse = await fetch(`${backendUrl}/transactions/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedTransaction })
    });
    
    const sendData = await sendResponse.json();
    
    if (!sendData.success) {
      throw new Error(sendData.error || 'Failed to send transaction');
    }
    
    return sendData;
  } catch (error) {
    throw new Error(`Payment failed: ${error.message}`);
  }
}

// Listen to Phantom events
export function listenToPhantom(onConnect, onDisconnect) {
  const provider = getPhantomProvider();
  if (!provider) return () => {};

  const connectHandler = () => {
    if (provider.publicKey && onConnect) {
      onConnect(provider.publicKey.toString());
    }
  };

  const disconnectHandler = () => {
    if (onDisconnect) {
      onDisconnect();
    }
  };

  provider.on('connect', connectHandler);
  provider.on('disconnect', disconnectHandler);

  return () => {
    provider.removeListener('connect', connectHandler);
    provider.removeListener('disconnect', disconnectHandler);
  };
}

