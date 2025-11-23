/**
 * Standalone Solana Payment Backend
 * Independent Express server for Solana Devnet transactions
 */

const express = require('express');
const cors = require('cors');
const { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  sendAndConfirmTransaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');

const app = express();
const PORT = process.env.SOLANA_PORT || 8004;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Solana connection to Devnet
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Helper: Convert SOL to lamports
function solToLamports(sol) {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

// Helper: Convert lamports to SOL
function lamportsToSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Solana Payment Backend',
    network: 'devnet',
    port: PORT
  });
});

// Test connection
app.get('/connection-test', async (req, res) => {
  try {
    const blockHeight = await connection.getBlockHeight();
    res.json({
      success: true,
      message: 'Connected to Solana Devnet',
      blockHeight: blockHeight
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get wallet balance
app.get('/wallet/balance/:publicKey', async (req, res) => {
  try {
    const { publicKey } = req.params;
    const pubkey = new PublicKey(publicKey);
    const balance = await connection.getBalance(pubkey);
    
    res.json({
      success: true,
      balance: lamportsToSol(balance),
      balanceLamports: balance,
      publicKey: publicKey
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Request airdrop (Devnet only)
app.post('/wallet/airdrop', async (req, res) => {
  try {
    const { publicKey, amountSol = 1 } = req.body;
    
    if (!publicKey) {
      return res.status(400).json({
        success: false,
        error: 'publicKey is required'
      });
    }

    const pubkey = new PublicKey(publicKey);
    const lamports = solToLamports(amountSol);
    
    console.log(`Requesting airdrop of ${amountSol} SOL to ${publicKey}`);
    const signature = await connection.requestAirdrop(pubkey, lamports);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    res.json({
      success: true,
      signature: signature,
      amountSol: amountSol,
      message: `Airdrop of ${amountSol} SOL successful`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Build unsigned transaction
app.post('/transactions/build', async (req, res) => {
  try {
    const { from, to, amountSol } = req.body;
    
    if (!from || !to || !amountSol) {
      return res.status(400).json({
        success: false,
        error: 'from, to, and amountSol are required'
      });
    }

    if (amountSol <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amountSol must be greater than 0'
      });
    }

    const fromPubkey = new PublicKey(from);
    const toPubkey = new PublicKey(to);
    const lamports = solToLamports(amountSol);

    // Check balance
    const balance = await connection.getBalance(fromPubkey);
    if (balance < lamports) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance'
      });
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Create transfer instruction
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

    // Serialize transaction (unsigned)
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.json({
      success: true,
      unsignedTransaction: serialized.toString('base64'),
      from: from,
      to: to,
      amountSol: amountSol,
      message: 'Transaction built successfully. Sign it with Phantom and send to /transactions/send'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Broadcast signed transaction
app.post('/transactions/send', async (req, res) => {
  try {
    const { signedTransaction } = req.body;
    
    if (!signedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'signedTransaction is required (base64 string)'
      });
    }

    // Deserialize signed transaction
    const signedBuffer = Buffer.from(signedTransaction, 'base64');
    const transaction = Transaction.from(signedBuffer);

    // Check if transaction has any signatures
    const hasSignatures = transaction.signatures && transaction.signatures.length > 0 && 
                         transaction.signatures.some(sig => sig && sig.length > 0);
    
    if (!hasSignatures && !transaction.signature) {
      console.error('Transaction has no signatures');
      console.error('Signatures array:', transaction.signatures);
      return res.status(400).json({
        success: false,
        error: 'Transaction is not signed. Please sign the transaction with Phantom wallet.'
      });
    }

    console.log('Broadcasting transaction...');
    if (transaction.signature) {
      console.log('Transaction signature:', transaction.signature.toString('base64'));
    }
    if (transaction.signatures && transaction.signatures.length > 0) {
      console.log('Transaction signatures count:', transaction.signatures.length);
    }

    // Serialize the transaction for sending
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    // Send raw transaction
    const signature = await connection.sendRawTransaction(
      serializedTx,
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    console.log('Transaction sent, signature:', signature);

    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');

    res.json({
      success: true,
      signature: signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      message: 'Transaction broadcast successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Complete payment flow (build + send in one call)
// Note: This requires the transaction to be pre-signed by the frontend
app.post('/transactions/pay', async (req, res) => {
  try {
    const { from, to, amountSol, signedTransaction } = req.body;
    
    if (!from || !to || !amountSol || !signedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'from, to, amountSol, and signedTransaction are required'
      });
    }

    // Deserialize and broadcast
    const signedBuffer = Buffer.from(signedTransaction, 'base64');
    const transaction = Transaction.from(signedBuffer);

    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const signature = await connection.sendRawTransaction(
      serializedTx,
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    await connection.confirmTransaction(signature, 'confirmed');

    res.json({
      success: true,
      signature: signature,
      from: from,
      to: to,
      amountSol: amountSol,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      message: 'Payment completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get transaction status
app.get('/transactions/status/:signature', async (req, res) => {
  try {
    const { signature } = req.params;
    const status = await connection.getSignatureStatus(signature);
    
    res.json({
      success: true,
      signature: signature,
      status: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Solana Payment Backend running on http://localhost:${PORT}`);
  console.log(`📡 Connected to Solana Devnet`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
