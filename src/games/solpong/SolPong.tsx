import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import GlobalHeader from '../../components/GlobalHeader';
import GlobalChatSidebar from '../../components/GlobalChatSidebar';
import { useSolanaWallet } from '../../hooks/useSolanaWallet';

const SolPong: React.FC = () => {
  // Chat sidebar state - open by default on desktop, collapsed on mobile
  const [chatCollapsed, setChatCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  const { isConnected, publicKey, getAuthToken } = useSolanaWallet();

  return (
    <div className={`layout-vertical ${!chatCollapsed ? 'sidebar-open' : ''}`}>
      {/* Header */}
      <header id="app-hdr">
        <GlobalHeader
          onToggleChat={() => setChatCollapsed(!chatCollapsed)}
        />
      </header>

      {/* Content with Sidebar */}
      <div id="cntnt">
        {/* Global Chat Sidebar */}
        <aside id="sidebar" className={chatCollapsed ? 'collapsed' : ''}>
          <div id="sidebar-inner">
            <GlobalChatSidebar
              isCollapsed={chatCollapsed}
              onToggleCollapse={() => setChatCollapsed(!chatCollapsed)}
              room="solpong"
              isWalletConnected={isConnected}
              walletAddress={publicKey || null}
              getAuthToken={getAuthToken}
              onlineCount={50}
            />
          </div>
        </aside>

        {/* Main Content - Centered "Coming Soon" */}
        <main id="main-stage">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              minHeight: '60vh',
              gap: 24,
            }}
          >
            <span style={{ fontSize: 80 }}>🍳</span>
            <h1
              style={{
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 32,
                fontWeight: 600,
                color: '#facc15',
                textAlign: 'center',
                margin: 0,
              }}
            >
              devs are cooking
            </h1>
            <p
              style={{
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 16,
                color: '#9ca3af',
                textAlign: 'center',
                margin: 0,
              }}
            >
              SolPong coming soon...
            </p>
          </div>
        </main>
      </div>

      {/* Chat Toggle Button - Always visible, moves with sidebar */}
      <button
        id="chat-toggle-btn"
        type="button"
        onClick={() => setChatCollapsed(!chatCollapsed)}
        className={`fixed z-50 rounded-full bg-[#facc15] flex items-center justify-center shadow-lg hover:bg-[#e6b800] transition-all duration-300 ${
          chatCollapsed ? 'w-12 h-12' : 'w-9 h-9'
        }`}
        style={{ 
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', 
          left: chatCollapsed ? 16 : 320 + 8,
          boxShadow: '0 0 20px rgba(250, 204, 21, 0.3)',
          transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s, height 0.2s, transform 0.3s ease',
        }}
        aria-label={chatCollapsed ? 'Open chat' : 'Close chat'}
      >
        <MessageCircle size={chatCollapsed ? 22 : 16} className="text-black" />
      </button>
    </div>
  );
};

export default SolPong;
