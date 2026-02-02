// ============================================================================
// PRIVY AUTHENTICATION PROVIDER
// Wraps the app with Privy wallet auth for Phantom & Solflare
// ============================================================================

import React from 'react';
import { PrivyProvider as PrivyAuth } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// Privy App ID from environment or fallback
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmi8zsbx8006sl40c5kxvypwi';

// Configure Solana wallet connectors
const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

interface PrivyProviderProps {
  children: React.ReactNode;
}

export const PrivyWalletProvider: React.FC<PrivyProviderProps> = ({ children }) => {
  return (
    <PrivyAuth
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#ffc107', // Yellow to match wallet connection theme
          walletChainType: 'solana-only',
        },
        loginMethods: ['wallet'], // Wallet only - no email/social
        // Disable embedded wallets - only use external wallets
        embeddedWallets: {
          createOnLogin: 'off',
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      {children}
    </PrivyAuth>
  );
};

export default PrivyWalletProvider;
