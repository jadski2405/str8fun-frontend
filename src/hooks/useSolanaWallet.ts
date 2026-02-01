// ============================================================================
// WALLET HOOK - Custom hook for wallet state and actions
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { ESCROW_WALLET as ENV_ESCROW_WALLET, MIN_TRADE_SOL } from '../lib/solana';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

export interface WalletState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  isWalletLoading: boolean;
  
  // Wallet info
  publicKey: string | null;
  walletName: string | null;
  
  // Profile info
  profileId: string | null;
  username: string | null;
  needsUsername: boolean;
  
  // Balance (wallet on-chain balance) - keeping for deposits
  balance: number;
  isLoadingBalance: boolean;
  
  // Deposited balance (in-game balance for instant trading)
  depositedBalance: number;
  isLoadingDepositedBalance: boolean;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  refreshDepositedBalance: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateDepositedBalance: (newBalance: number) => void;  // Immediate update after trades
  
  // Username
  setUsername: (username: string) => Promise<{ success: boolean; error?: string }>;
  checkUsernameAvailable: (username: string) => Promise<{ valid: boolean; error?: string }>;
  
  // Deposit/Withdraw (require wallet approval)
  deposit: (amount: number) => Promise<{ success: boolean; error?: string }>;
  withdraw: (amount: number) => Promise<{ success: boolean; error?: string; txSignature?: string }>;
  
  // Legacy - kept for compatibility but prefer deposit system
  sendSOLToEscrow: (amount: number) => Promise<string | null>;
  
  // Privy auth token getter (for API calls)
  getAuthToken: () => Promise<string | null>;
}

export function useSolanaWallet(): WalletState {
  const { 
    publicKey: walletAdapterPublicKey, 
    connected: walletAdapterConnected, 
    connecting,
    wallet,
    connect: walletConnect,
    disconnect: walletDisconnect,
    sendTransaction: walletAdapterSendTransaction,
  } = useWallet();
  
  const { connection } = useConnection();
  
  // Privy auth - get access token for API calls and wallet info
  const { getAccessToken, authenticated, logout } = usePrivy();
  
  // Privy Solana wallets - PRIMARY source for connected wallets
  const { wallets: privyWallets } = usePrivySolanaWallets();
  const { signAndSendTransaction: privySignAndSendTransaction } = useSignAndSendTransaction();
  
  // Get the first connected Privy Solana wallet
  const privyWallet = privyWallets?.[0] || null;
  
  // Derive wallet address: Privy wallet first, then wallet-adapter
  const walletAddress = useMemo(() => {
    if (privyWallet?.address) return privyWallet.address;
    if (walletAdapterPublicKey) return walletAdapterPublicKey.toString();
    return null;
  }, [privyWallet?.address, walletAdapterPublicKey]);
  
  // Derive connection state: ONLY connected when we have a usable wallet address
  // This fixes race condition where authenticated=true but wallet not yet populated
  const isConnected = (authenticated && !!walletAddress) || walletAdapterConnected;
  
  // Loading state: authenticated but wallet not yet available
  const isWalletLoading = authenticated && !walletAddress && !walletAdapterConnected;
  
  // Debug logging for wallet state
  useEffect(() => {
    console.log('[useSolanaWallet] State:', {
      authenticated,
      privyWalletsCount: privyWallets?.length || 0,
      walletAddress,
      walletAdapterConnected,
      isConnected,
      isWalletLoading
    });
  }, [authenticated, privyWallets?.length, walletAddress, walletAdapterConnected, isConnected, isWalletLoading]);
  
  // Create PublicKey from address for balance fetching
  const publicKey = useMemo(() => {
    if (!walletAddress) return null;
    try {
      return new PublicKey(walletAddress);
    } catch {
      return null;
    }
  }, [walletAddress]);
  
  const [balance, setBalance] = useState(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [depositedBalance, setDepositedBalance] = useState(0);
  const [isLoadingDepositedBalance, setIsLoadingDepositedBalance] = useState(false);
  
  // Escrow address - fetched from API, fallback to env
  const [escrowAddress, setEscrowAddress] = useState<string>(ENV_ESCROW_WALLET);
  
  // Fetch escrow address from API on mount
  useEffect(() => {
    const fetchEscrowAddress = async () => {
      try {
        const response = await fetch(`${API_URL}/api/deposit/escrow`);
        const data = await response.json();
        if (data.success && data.escrow_address) {
          setEscrowAddress(data.escrow_address);
          console.log('[useSolanaWallet] Escrow address:', data.escrow_address);
        }
      } catch (error) {
        console.error('[useSolanaWallet] Error fetching escrow address:', error);
        // Keep using env fallback
      }
    };
    fetchEscrowAddress();
  }, []);
  
  // Profile state
  const [profileId, setProfileId] = useState<string | null>(null);
  const [username, setUsernameState] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  // Fetch SOL balance
  const refreshBalance = useCallback(async () => {
    if (!publicKey) {
      setBalance(0);
      return;
    }
    
    setIsLoadingBalance(true);
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error('Error fetching balance:', error);
      setBalance(0);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [publicKey, connection]);

  // Auto-fetch balance when connected
  useEffect(() => {
    if (isConnected && publicKey) {
      refreshBalance();
      
      // Set up balance subscription
      const subscriptionId = connection.onAccountChange(
        publicKey,
        (accountInfo) => {
          setBalance(accountInfo.lamports / LAMPORTS_PER_SOL);
        },
        'confirmed'
      );
      
      return () => {
        connection.removeAccountChangeListener(subscriptionId);
      };
    } else {
      setBalance(0);
    }
  }, [isConnected, publicKey, connection, refreshBalance]);

  // Connect wallet
  const connect = useCallback(async () => {
    try {
      await walletConnect();
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  }, [walletConnect]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      await walletDisconnect();
      setBalance(0);
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      throw error;
    }
  }, [walletDisconnect]);

  // Send SOL to escrow for trading (legacy - prefer deposit)
  const sendSOLToEscrow = useCallback(async (amount: number): Promise<string | null> => {
    if (!walletAddress || !escrowAddress) {
      console.error('Wallet not connected or escrow not configured');
      return null;
    }
    
    if (amount < MIN_TRADE_SOL) {
      console.error(`Minimum trade is ${MIN_TRADE_SOL} SOL`);
      return null;
    }
    
    if (amount > balance) {
      console.error('Insufficient balance');
      return null;
    }
    
    try {
      const fromPubkey = new PublicKey(walletAddress);
      const escrowPubkey = new PublicKey(escrowAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      let signature: string;
      
      if (privyWallet) {
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey: escrowPubkey,
            lamports,
          })
        );
        
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = fromPubkey;
        
        const serializedTx = transaction.serialize({ requireAllSignatures: false });
        const result = await privySignAndSendTransaction({
          transaction: new Uint8Array(serializedTx),
          wallet: privyWallet,
        });
        signature = Buffer.from(result.signature).toString('base64');
      } else if (walletAdapterPublicKey && walletAdapterSendTransaction) {
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: walletAdapterPublicKey,
            toPubkey: escrowPubkey,
            lamports,
          })
        );
        
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletAdapterPublicKey;
        
        signature = await walletAdapterSendTransaction(transaction, connection);
        
        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });
      } else {
        console.error('No wallet available for signing');
        return null;
      }
      
      // Refresh balance after transaction
      await refreshBalance();
      
      return signature;
    } catch (error) {
      console.error('Error sending SOL to escrow:', error);
      return null;
    }
  }, [walletAddress, privyWallet, walletAdapterPublicKey, walletAdapterSendTransaction, balance, connection, privySignAndSendTransaction, refreshBalance]);

  // ============================================================================
  // PROFILE & DEPOSITED BALANCE
  // ============================================================================
  
  // Get Privy access token for authenticated API calls
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getAccessToken();
      return token;
    } catch (e: unknown) {
      console.error('Error getting Privy access token:', e);
      // If token refresh fails, the session is invalid - logout to clear stale tokens
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (errorMessage.includes('refresh') || errorMessage.includes('token')) {
        console.log('[useSolanaWallet] Stale session detected, logging out...');
        try {
          await logout();
        } catch (logoutError) {
          console.error('Error during logout:', logoutError);
        }
      }
      return null;
    }
  }, [getAccessToken, logout]);
  
  // Fetch profile with username and balance from Express backend
  const refreshProfile = useCallback(async () => {
    if (!walletAddress) {
      setProfileId(null);
      setUsernameState(null);
      setNeedsUsername(false);
      setDepositedBalance(0);
      return;
    }
    
    // Wait for Privy authentication before making API calls
    if (!authenticated) {
      console.log('[useSolanaWallet] Waiting for Privy authentication...');
      return;
    }
    
    setIsLoadingDepositedBalance(true);
    
    try {
      console.log('[useSolanaWallet] Fetching profile for:', walletAddress);
      
      // Get Privy auth token (optional - backend should work without it)
      const token = await getAuthToken();
      
      // Get or create profile via Express API
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({ wallet_address: walletAddress }),
      });
      
      if (response.ok) {
        const profile = await response.json();
        console.log('[useSolanaWallet] Got profile:', profile);
        setProfileId(profile.id);
        setUsernameState(profile.username);
        setNeedsUsername(profile.needsUsername || profile.username === null);
        setDepositedBalance(Number(profile.deposited_balance) || 0);
      } else {
        console.error('[useSolanaWallet] Profile fetch failed:', response.status, await response.text());
        setNeedsUsername(true);
      }
    } catch (error) {
      console.error('[useSolanaWallet] Error fetching profile:', error);
    } finally {
      setIsLoadingDepositedBalance(false);
    }
  }, [walletAddress, authenticated, getAuthToken]);

  // Alias for backward compatibility
  const refreshDepositedBalance = refreshProfile;

  // Auto-fetch profile when connected AND authenticated
  useEffect(() => {
    if (isConnected && walletAddress && authenticated) {
      refreshProfile();
    } else if (!isConnected) {
      setProfileId(null);
      setUsernameState(null);
      setNeedsUsername(false);
      setDepositedBalance(0);
    }
  }, [isConnected, publicKey, authenticated, refreshProfile]);

  // Auto-refresh balance every 5 seconds when connected
  useEffect(() => {
    if (!isConnected || !walletAddress || !authenticated) return;
    
    // Poll every 5 seconds to keep balance in sync
    const interval = setInterval(() => {
      refreshProfile();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isConnected, walletAddress, authenticated, refreshProfile]);

  // ============================================================================
  // USERNAME FUNCTIONS
  // ============================================================================
  
  const checkUsernameAvailable = useCallback(async (usernameToCheck: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      // Validate length
      if (usernameToCheck.length < 1 || usernameToCheck.length > 20) {
        return { valid: false, error: 'Username must be 1-20 characters' };
      }
      
      // Validate characters (alphanumeric only)
      if (!/^[a-zA-Z0-9]+$/.test(usernameToCheck)) {
        return { valid: false, error: 'Letters and numbers only' };
      }
      
      // Check max 1 capital letter
      const capitalCount = (usernameToCheck.match(/[A-Z]/g) || []).length;
      if (capitalCount > 1) {
        return { valid: false, error: 'Max 1 capital letter allowed' };
      }
      
      // Check if username exists via Express API
      const response = await fetch(`${API_URL}/api/auth/check-username/${encodeURIComponent(usernameToCheck)}`);
      
      if (response.ok) {
        const result = await response.json();
        if (!result.available) {
          return { valid: false, error: 'Username already taken' };
        }
        return { valid: true };
      }
      return { valid: false, error: 'Failed to check username' };
    } catch (e) {
      return { valid: false, error: 'Network error' };
    }
  }, []);

  const setUsername = useCallback(async (newUsername: string): Promise<{ success: boolean; error?: string }> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    // Validate first
    const validation = await checkUsernameAvailable(newUsername);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    try {
      // Get Privy auth token
      const token = await getAuthToken();
      
      // Update username via Express API
      const response = await fetch(`${API_URL}/api/auth/username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          wallet_address: walletAddress,
          username: newUsername 
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setUsernameState(newUsername);
          setNeedsUsername(false);
          return { success: true };
        }
        return { success: false, error: result.error || 'Failed to set username' };
      }
      return { success: false, error: 'Failed to set username' };
    } catch (e) {
      return { success: false, error: 'Network error' };
    }
  }, [walletAddress, checkUsernameAvailable, getAuthToken]);

  // ============================================================================
  // DEPOSIT - Send SOL to escrow, credit in-game balance
  // ============================================================================
  const deposit = useCallback(async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (!escrowAddress) {
      return { success: false, error: 'Escrow wallet not configured - contact support' };
    }
    
    if (amount < 0.001) {
      return { success: false, error: 'Minimum deposit is 0.001 SOL' };
    }
    
    if (amount > balance) {
      return { success: false, error: 'Insufficient wallet balance' };
    }
    
    try {
      const fromPubkey = new PublicKey(walletAddress);
      const escrowPubkey = new PublicKey(escrowAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      let signature: string;
      
      // Use Privy wallet signing if available, otherwise fall back to wallet-adapter
      if (privyWallet) {
        // Build transaction for Privy signing
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey: escrowPubkey,
            lamports,
          })
        );
        
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = fromPubkey;
        
        // Serialize the transaction for Privy
        const serializedTx = transaction.serialize({ requireAllSignatures: false });
        
        // Sign and send via Privy
        const result = await privySignAndSendTransaction({
          transaction: new Uint8Array(serializedTx),
          wallet: privyWallet,
        });
        
        // Convert signature to base58 string (Solana standard format)
        if (result.signature instanceof Uint8Array) {
          const bs58 = await import('bs58');
          signature = bs58.default.encode(result.signature);
        } else {
          // Already a base58 string
          signature = result.signature;
        }
        // For Solana, we need to wait for confirmation differently
        // The transaction is already sent, we just need to confirm
      } else if (walletAdapterPublicKey && walletAdapterSendTransaction) {
        // Fallback to wallet-adapter
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: walletAdapterPublicKey,
            toPubkey: escrowPubkey,
            lamports,
          })
        );
        
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletAdapterPublicKey;
        
        signature = await walletAdapterSendTransaction(transaction, connection);
        
        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });
      } else {
        return { success: false, error: 'No wallet available for signing' };
      }
      
      // Step 2: Call Express API to verify and credit balance
      // Note: wallet_address + tx_signature is sufficient auth (signature proves ownership)
      const token = await getAuthToken();
      console.log('[Deposit] Confirming deposit:', { walletAddress, signature: signature.slice(0, 20) + '...', amount });
      
      const response = await fetch(`${API_URL}/api/deposit/confirm`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Send token if available, but backend should work without it
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          tx_signature: signature,
          amount: amount,
        }),
      });
      
      console.log('[Deposit] Response status:', response.status);
      
      // Handle non-OK responses before trying to parse JSON
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Deposit] Error response:', errorText);
        if (response.status === 401) {
          return { success: false, error: 'Backend auth issue - deposit sent, contact support with tx: ' + signature.slice(0, 20) };
        }
        return { success: false, error: `Server error ${response.status}` };
      }
      
      const result = await response.json();
      console.log('[Deposit] Success:', result);
      
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to confirm deposit' };
      }
      
      // Update local state
      setDepositedBalance(Number(result.new_balance) || 0);
      await refreshBalance();
      
      return { success: true };
    } catch (error) {
      console.error('Deposit error:', error);
      return { success: false, error: 'Transaction failed or cancelled' };
    }
  }, [walletAddress, privyWallet, walletAdapterPublicKey, walletAdapterSendTransaction, balance, connection, privySignAndSendTransaction, refreshBalance, getAuthToken]);

  // ============================================================================
  // WITHDRAW - Send SOL from escrow back to wallet
  // ============================================================================
  const withdraw = useCallback(async (amount: number): Promise<{ success: boolean; error?: string; txSignature?: string }> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (amount < 0.001) {
      return { success: false, error: 'Minimum withdrawal is 0.001 SOL' };
    }
    
    if (amount > depositedBalance) {
      return { success: false, error: 'Insufficient deposited balance' };
    }
    
    try {
      // Get auth token if available (backend should work without it)
      const token = await getAuthToken();
      console.log('[Withdraw] Requesting withdrawal:', { walletAddress, amount });
      
      // Call Express API to process withdrawal
      const response = await fetch(`${API_URL}/api/withdraw`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          amount,
        }),
      });
      
      console.log('[Withdraw] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Withdraw] Error:', errorText);
        return { success: false, error: `Server error ${response.status}` };
      }
      
      const result = await response.json();
      
      if (!result.success) {
        return { success: false, error: result.error || 'Withdrawal failed' };
      }
      
      // Update local state
      setDepositedBalance(Number(result.new_balance) || Math.max(0, depositedBalance - amount));
      await refreshBalance();
      
      return { success: true, txSignature: result.tx_signature };
    } catch (error) {
      console.error('Withdrawal error:', error);
      return { success: false, error: 'Withdrawal failed' };
    }
  }, [walletAddress, depositedBalance, refreshBalance, getAuthToken]);

  // Immediate balance update (for after trades)
  const updateDepositedBalance = useCallback((newBalance: number) => {
    setDepositedBalance(newBalance);
  }, []);

  return {
    isConnected,
    isConnecting: connecting,
    isWalletLoading,
    publicKey: walletAddress,
    walletName: wallet?.adapter.name || 'Wallet',
    profileId,
    username,
    needsUsername,
    balance,
    isLoadingBalance,
    depositedBalance,
    isLoadingDepositedBalance,
    connect,
    disconnect,
    refreshBalance,
    refreshDepositedBalance,
    refreshProfile,
    updateDepositedBalance,
    setUsername,
    checkUsernameAvailable,
    deposit,
    withdraw,
    sendSOLToEscrow,
    getAuthToken,
  };
}

export default useSolanaWallet;
