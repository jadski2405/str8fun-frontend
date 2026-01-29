// ============================================================================
// WALLET HOOK - Custom hook for wallet state and actions
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { ESCROW_WALLET, MIN_TRADE_SOL } from '../lib/solana';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';
const TOKEN_STORAGE_KEY = 'pumpit_auth_token';

interface StoredToken {
  wallet: string;
  token: string;
  expiresAt: string;
}

export interface WalletState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  
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
  
  // Username
  setUsername: (username: string) => Promise<{ success: boolean; error?: string }>;
  checkUsernameAvailable: (username: string) => Promise<{ valid: boolean; error?: string }>;
  
  // Deposit/Withdraw (require wallet approval)
  deposit: (amount: number) => Promise<{ success: boolean; error?: string }>;
  withdraw: (amount: number) => Promise<{ success: boolean; error?: string; txSignature?: string }>;
  
  // Legacy - kept for compatibility but prefer deposit system
  sendSOLToEscrow: (amount: number) => Promise<string | null>;
}

export function useSolanaWallet(): WalletState {
  const { 
    publicKey, 
    connected, 
    connecting,
    wallet,
    connect: walletConnect,
    disconnect: walletDisconnect,
    sendTransaction,
  } = useWallet();
  
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [depositedBalance, setDepositedBalance] = useState(0);
  const [isLoadingDepositedBalance, setIsLoadingDepositedBalance] = useState(false);
  
  // Profile state
  const [profileId, setProfileId] = useState<string | null>(null);
  const [username, setUsernameState] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  
  // Auth token state (stored in ref to avoid re-renders)
  const authTokenRef = useRef<string | null>(null);
  const tokenExpiresRef = useRef<Date | null>(null);

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
    if (connected && publicKey) {
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
    }
  }, [connected, publicKey, connection, refreshBalance]);

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

  // Send SOL to escrow for trading
  const sendSOLToEscrow = useCallback(async (amount: number): Promise<string | null> => {
    if (!publicKey || !ESCROW_WALLET) {
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
      const escrowPubkey = new PublicKey(ESCROW_WALLET);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: escrowPubkey,
          lamports,
        })
      );
      
      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Send transaction
      const signature = await sendTransaction(transaction, connection);
      
      // Wait for confirmation
      await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature,
      });
      
      // Refresh balance after transaction
      await refreshBalance();
      
      return signature;
    } catch (error) {
      console.error('Error sending SOL to escrow:', error);
      return null;
    }
  }, [publicKey, balance, connection, sendTransaction, refreshBalance]);

  // ============================================================================
  // PROFILE & DEPOSITED BALANCE
  // ============================================================================
  
  // Fetch profile with username and balance from Express backend
  const refreshProfile = useCallback(async () => {
    if (!publicKey) {
      setProfileId(null);
      setUsernameState(null);
      setNeedsUsername(false);
      setDepositedBalance(0);
      return;
    }
    
    setIsLoadingDepositedBalance(true);
    const walletAddress = publicKey.toString();
    
    try {
      console.log('[useSolanaWallet] Fetching profile for:', walletAddress);
      
      // Get or create profile via Express API
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
  }, [publicKey]);

  // Alias for backward compatibility
  const refreshDepositedBalance = refreshProfile;

  // Auto-fetch profile when connected
  useEffect(() => {
    if (connected && publicKey) {
      refreshProfile();
      // Also load auth token from storage
      loadStoredToken();
    } else {
      setProfileId(null);
      setUsernameState(null);
      setNeedsUsername(false);
      setDepositedBalance(0);
      authTokenRef.current = null;
      tokenExpiresRef.current = null;
    }
  }, [connected, publicKey, refreshProfile]);

  // ============================================================================
  // AUTH TOKEN MANAGEMENT
  // ============================================================================
  
  const loadStoredToken = useCallback(() => {
    if (!publicKey) return;
    
    try {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        const parsed: StoredToken = JSON.parse(stored);
        const expires = new Date(parsed.expiresAt);
        
        if (parsed.wallet === publicKey.toString() && expires > new Date()) {
          authTokenRef.current = parsed.token;
          tokenExpiresRef.current = expires;
        }
      }
    } catch (e) {
      console.error('Error loading stored token:', e);
    }
  }, [publicKey]);

  // Auth token getter - available for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getAuthToken = useCallback(async (): Promise<string | null> => {
    if (!publicKey) return null;
    
    // Check if we have a valid token
    if (authTokenRef.current && tokenExpiresRef.current && tokenExpiresRef.current > new Date()) {
      return authTokenRef.current;
    }
    
    // Fetch new token from Express backend
    try {
      const response = await fetch(`${API_URL}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: publicKey.toString() }),
      });
      
      const result = await response.json();
      
      if (result.success || result.token) {
        authTokenRef.current = result.token;
        tokenExpiresRef.current = new Date(result.expires_at || Date.now() + 48 * 60 * 60 * 1000);
        
        // Store in localStorage
        const toStore: StoredToken = {
          wallet: publicKey.toString(),
          token: result.token,
          expiresAt: result.expires_at || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        };
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(toStore));
        
        return result.token;
      }
    } catch (e) {
      console.error('Error fetching auth token:', e);
    }
    
    return null;
  }, [publicKey]);

  // Suppress unused warning - available for future use
  void _getAuthToken;

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
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    // Validate first
    const validation = await checkUsernameAvailable(newUsername);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    try {
      // Update username via Express API
      const response = await fetch(`${API_URL}/api/auth/username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          wallet_address: publicKey.toString(),
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
  }, [publicKey, checkUsernameAvailable]);

  // ============================================================================
  // DEPOSIT - Send SOL to escrow, credit in-game balance
  // ============================================================================
  const deposit = useCallback(async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (!publicKey || !ESCROW_WALLET) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (amount < 0.01) {
      return { success: false, error: 'Minimum deposit is 0.01 SOL' };
    }
    
    if (amount > balance) {
      return { success: false, error: 'Insufficient wallet balance' };
    }
    
    try {
      // Step 1: Send SOL to escrow (this requires wallet approval)
      const escrowPubkey = new PublicKey(ESCROW_WALLET);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: escrowPubkey,
          lamports,
        })
      );
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      const signature = await sendTransaction(transaction, connection);
      
      await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature,
      });
      
      // Step 2: Call Express API to verify and credit balance
      const response = await fetch(`${API_URL}/api/deposit/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toString(),
          tx_signature: signature,
          amount: amount,
        }),
      });
      
      const result = await response.json();
      
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
  }, [publicKey, balance, connection, sendTransaction, refreshBalance]);

  // ============================================================================
  // WITHDRAW - Send SOL from escrow back to wallet
  // ============================================================================
  const withdraw = useCallback(async (amount: number): Promise<{ success: boolean; error?: string; txSignature?: string }> => {
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (amount < 0.01) {
      return { success: false, error: 'Minimum withdrawal is 0.01 SOL' };
    }
    
    if (amount > depositedBalance) {
      return { success: false, error: 'Insufficient deposited balance' };
    }
    
    try {
      // Call Express API to process withdrawal
      const response = await fetch(`${API_URL}/api/withdraw`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: publicKey.toString(),
          amount,
        }),
      });
      
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
  }, [publicKey, depositedBalance, refreshBalance]);

  return {
    isConnected: connected,
    isConnecting: connecting,
    publicKey: publicKey?.toString() || null,
    walletName: wallet?.adapter.name || null,
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
    setUsername,
    checkUsernameAvailable,
    deposit,
    withdraw,
    sendSOLToEscrow,
  };
}

export default useSolanaWallet;
