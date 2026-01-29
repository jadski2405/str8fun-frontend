// ============================================================================
// SOLANA WALLET PROVIDER
// Wraps the app with Phantom & Solflare wallet support
// ============================================================================

import React, { useMemo, useCallback } from 'react';
import { 
  ConnectionProvider, 
  WalletProvider,
  useWallet as useSolanaWallet,
  useConnection
} from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { WalletError } from '@solana/wallet-adapter-base';
import { SOLANA_RPC_URL } from '../lib/solana';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

interface SolanaWalletProviderProps {
  children: React.ReactNode;
}

export const SolanaWalletProvider: React.FC<SolanaWalletProviderProps> = ({ children }) => {
  // Initialize wallet adapters - empty array uses wallet-standard auto-detection
  // This automatically detects Phantom, Solflare, and other installed wallets
  const wallets = useMemo(() => [], []);

  // Error handler
  const onError = useCallback((error: WalletError) => {
    console.error('[Wallet Error]', error);
    // You can add toast notifications here
  }, []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={true}
        onError={onError}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

// Re-export hooks for convenience
export { useSolanaWallet as useWallet, useConnection };
export { WalletMultiButton };

export default SolanaWalletProvider;
