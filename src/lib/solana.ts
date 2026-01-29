// ============================================================================
// SOLANA CONNECTION CONFIGURATION
// ============================================================================

import { Connection, clusterApiUrl } from '@solana/web3.js';

// Network configuration
export const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK || 'mainnet-beta';

// Use Helius RPC if available, otherwise fallback to public RPC
export const SOLANA_RPC_URL = 
  import.meta.env.VITE_SOLANA_RPC_URL || 
  (SOLANA_NETWORK === 'mainnet-beta' 
    ? 'https://api.mainnet-beta.solana.com'
    : clusterApiUrl(SOLANA_NETWORK as 'devnet' | 'testnet'));

// Create connection instance
export const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
});

// Escrow wallet for the pool
export const ESCROW_WALLET = import.meta.env.VITE_ESCROW_WALLET || '';
export const HOUSE_WALLET = import.meta.env.VITE_HOUSE_WALLET || '';

// Trade constants
export const MIN_TRADE_SOL = 0.01;
export const HOUSE_FEE_PERCENT = 2;
export const ROUND_DURATION_SECONDS = 30;
export const INITIAL_TOKEN_SUPPLY = 1_000_000;
export const INITIAL_PRICE = 0.000001; // 1.00x multiplier at this base

// Helper to get SOL balance
export async function getSOLBalance(publicKey: string): Promise<number> {
  try {
    const { PublicKey } = await import('@solana/web3.js');
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    return 0;
  }
}

// Helper to format SOL amount
export function formatSOL(amount: number, decimals = 4): string {
  return amount.toFixed(decimals);
}

// Helper to format wallet address
export function formatAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
