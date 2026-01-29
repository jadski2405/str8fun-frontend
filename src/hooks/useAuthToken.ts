// ============================================================================
// AUTH TOKEN HOOK - Manages auth tokens for secure withdrawals
// Tokens are per-wallet, valid for 2 days
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jbloptamojjqgxfbjqeo.supabase.co';
const TOKEN_STORAGE_KEY = 'pumpit_auth_token';

interface StoredToken {
  wallet: string;
  token: string;
  expiresAt: string;
}

interface AuthTokenState {
  token: string | null;
  expiresAt: Date | null;
  isLoading: boolean;
  error: string | null;
  fetchToken: () => Promise<string | null>;
  clearToken: () => void;
}

export function useAuthToken(walletAddress: string | null): AuthTokenState {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track if we've already fetched for this wallet
  const fetchedForWallet = useRef<string | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    if (!walletAddress) {
      setToken(null);
      setExpiresAt(null);
      return;
    }

    try {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        const parsed: StoredToken = JSON.parse(stored);
        const expires = new Date(parsed.expiresAt);
        
        // Check if token is for this wallet and not expired
        if (parsed.wallet === walletAddress && expires > new Date()) {
          setToken(parsed.token);
          setExpiresAt(expires);
          fetchedForWallet.current = walletAddress;
          return;
        }
      }
    } catch (e) {
      console.error('Error loading stored token:', e);
    }

    // If no valid stored token, we need to fetch one
    // But don't auto-fetch, let the component decide when
    setToken(null);
    setExpiresAt(null);
  }, [walletAddress]);

  // Fetch new token from Edge Function
  const fetchToken = useCallback(async (): Promise<string | null> => {
    if (!walletAddress) {
      setError('No wallet connected');
      return null;
    }

    // Check if we already have a valid token
    if (token && expiresAt && expiresAt > new Date()) {
      return token;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-auth-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to get auth token');
        return null;
      }

      const newToken = result.token;
      const newExpiresAt = new Date(result.expires_at);

      // Store in state
      setToken(newToken);
      setExpiresAt(newExpiresAt);
      fetchedForWallet.current = walletAddress;

      // Store in localStorage
      const toStore: StoredToken = {
        wallet: walletAddress,
        token: newToken,
        expiresAt: newExpiresAt.toISOString(),
      };
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(toStore));

      return newToken;
    } catch (e) {
      console.error('Error fetching auth token:', e);
      setError('Failed to fetch auth token');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, token, expiresAt]);

  // Clear token (on disconnect)
  const clearToken = useCallback(() => {
    setToken(null);
    setExpiresAt(null);
    setError(null);
    fetchedForWallet.current = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  // Clear token when wallet changes
  useEffect(() => {
    if (walletAddress !== fetchedForWallet.current && fetchedForWallet.current !== null) {
      clearToken();
    }
  }, [walletAddress, clearToken]);

  return {
    token,
    expiresAt,
    isLoading,
    error,
    fetchToken,
    clearToken,
  };
}

export default useAuthToken;
