import { Buffer } from 'buffer';
window.Buffer = Buffer;

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { PrivyWalletProvider } from './providers/PrivyProvider'
import { SolanaWalletProvider } from './providers/WalletProvider'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PrivyWalletProvider>
        <SolanaWalletProvider>
          <App />
        </SolanaWalletProvider>
      </PrivyWalletProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
