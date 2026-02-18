import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageCircle, Loader2, X } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { tierIconUrl, ProfileStats, RecentGame } from '../types/game';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

interface GlobalChatSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isWalletConnected?: boolean;
  walletAddress?: string | null;
  getAuthToken?: () => Promise<string | null>;
  onlineCount?: number;
  playerTier?: number;
}

/* ============ Player Profile Popup ============ */
interface PlayerPopupProps {
  wallet: string;
  username: string;
  onClose: () => void;
}

const PlayerPopup: React.FC<PlayerPopupProps> = ({ wallet, username, onClose }) => {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sRes, gRes] = await Promise.all([
          fetch(`${API_URL}/api/profile/stats?wallet=${wallet}`),
          fetch(`${API_URL}/api/profile/recent-games?wallet=${wallet}`),
        ]);
        if (!cancelled && sRes.ok) setStats(await sRes.json());
        if (!cancelled && gRes.ok) {
          const gData = await gRes.json();
          setGames(Array.isArray(gData) ? gData : gData.games || []);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [wallet]);

  return (
    <div className="chat-player-popup-overlay" onClick={onClose}>
      <div className="chat-player-popup" onClick={e => e.stopPropagation()}>
        <button className="chat-player-popup-close" onClick={onClose}><X size={18} /></button>
        <div className="chat-player-popup-header">
          <span className="chat-player-popup-name">{username}</span>
          <span className="chat-player-popup-wallet">{wallet.slice(0, 4)}...{wallet.slice(-4)}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Loader2 size={24} className="text-[#2DE2E6] animate-spin" />
          </div>
        ) : stats ? (
          <>
            <div className="chat-player-popup-stats">
              <div className="chat-player-popup-stat"><span className="label">Level</span><span className="value">{(stats as any).level ?? '—'}</span></div>
              <div className="chat-player-popup-stat"><span className="label">XP</span><span className="value">{(stats as any).xp?.toLocaleString() ?? '—'}</span></div>
              <div className="chat-player-popup-stat"><span className="label">Total PnL</span><span className="value" style={{ color: stats.total_pnl >= 0 ? '#4ade80' : '#f87171' }}>{stats.total_pnl >= 0 ? '+' : ''}{stats.total_pnl.toFixed(4)}</span></div>
              <div className="chat-player-popup-stat"><span className="label">7d PnL</span><span className="value" style={{ color: stats.pnl_7d >= 0 ? '#4ade80' : '#f87171' }}>{stats.pnl_7d >= 0 ? '+' : ''}{stats.pnl_7d.toFixed(4)}</span></div>
              <div className="chat-player-popup-stat"><span className="label">Games</span><span className="value">{stats.games_played}</span></div>
              <div className="chat-player-popup-stat"><span className="label">Profitable</span><span className="value">{stats.profitable_rounds}</span></div>
              <div className="chat-player-popup-stat"><span className="label">Volume</span><span className="value">{stats.total_volume.toFixed(2)}</span></div>
              <div className="chat-player-popup-stat"><span className="label">Member Since</span><span className="value">{new Date(stats.member_since).toLocaleDateString()}</span></div>
            </div>

            {games.length > 0 && (
              <div className="chat-player-popup-games">
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#9ca3af' }}>Recent Games</h4>
                {games.slice(0, 5).map(g => (
                  <div key={g.round_id} className="chat-player-popup-game-row">
                    <span className="chat-player-popup-game-time">{new Date(g.timestamp).toLocaleDateString()}</span>
                    <span style={{ color: g.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                      {g.pnl >= 0 ? '+' : ''}{g.pnl.toFixed(4)} SOL
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>{g.peak_multiplier.toFixed(2)}x</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: 16 }}>No profile data</p>
        )}
      </div>
    </div>
  );
};

const GlobalChatSidebar: React.FC<GlobalChatSidebarProps> = ({ 
  isCollapsed: _isCollapsed, 
  onToggleCollapse: _onToggleCollapse,
  isWalletConnected = false,
  walletAddress = null,
  getAuthToken = undefined,
  onlineCount = 0,
  playerTier = 0,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [popupPlayer, setPopupPlayer] = useState<{ wallet: string; username: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const { messages, loading, error, sendMessage, isRateLimited } = useChat({ walletAddress, getAuthToken });

  // Wallet → tier cache: fetch real tier for every unique wallet in chat
  const [tierCache, setTierCache] = useState<Record<string, number>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  // Seed own wallet into cache immediately
  useEffect(() => {
    if (walletAddress && playerTier !== undefined) {
      setTierCache(prev => ({ ...prev, [walletAddress]: playerTier }));
    }
  }, [walletAddress, playerTier]);

  const fetchTier = useCallback(async (wallet: string) => {
    if (pendingRef.current.has(wallet)) return;
    pendingRef.current.add(wallet);
    try {
      const res = await fetch(`${API_URL}/api/rewards/xp`, {
        headers: { 'x-wallet-address': wallet },
      });
      if (res.ok) {
        const data = await res.json();
        const idx = typeof data.tier_index === 'number' ? data.tier_index : 0;
        setTierCache(prev => ({ ...prev, [wallet]: idx }));
      } else {
        setTierCache(prev => ({ ...prev, [wallet]: 0 }));
      }
    } catch {
      setTierCache(prev => ({ ...prev, [wallet]: 0 }));
    }
  }, []);

  // Fetch tiers for any wallets not yet in cache
  useEffect(() => {
    const unknownWallets = messages
      .map(m => m.wallet_address)
      .filter(w => w && !(w in tierCache) && !pendingRef.current.has(w));
    const unique = [...new Set(unknownWallets)];
    unique.forEach(w => fetchTier(w));
  }, [messages, tierCache, fetchTier]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isRateLimited || !isWalletConnected) return;
    
    setInputValue('');
    const success = await sendMessage(text);
    
    if (!success) {
      setInputValue(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 320,
        height: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: 'rgb(21, 22, 29)',
        boxSizing: 'border-box',
        fontFamily: "'DynaPuff', sans-serif",
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.5,
        color: 'rgb(248, 248, 252)',
        userSelect: 'text',
        wordBreak: 'break-word',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Header - 319px x 65px, sticky at top */}
      <div 
        style={{
          width: 319,
          height: 65,
          position: 'sticky',
          top: 0,
          zIndex: 2,
          flexShrink: 0,
          padding: 16,
          borderBottom: '1px solid rgb(56, 57, 67)',
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          borderWidth: 0,
          borderStyle: 'solid',
          boxSizing: 'border-box',
          fontFamily: "'DynaPuff', sans-serif",
          fontSize: 16,
          lineHeight: '24px',
          fontWeight: 400,
          color: 'rgb(248, 248, 252)',
          userSelect: 'text',
          pointerEvents: 'auto',
          WebkitFontSmoothing: 'antialiased',
          backgroundColor: 'rgb(21, 22, 29)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 8,
        }}
      >
        {/* Pulsing Online Indicator */}
        <span style={{ position: 'relative', display: 'flex', width: 10, height: 10, flexShrink: 0 }}>
          <span 
            className="animate-ping" 
            style={{ 
              position: 'absolute', 
              width: '100%', 
              height: '100%', 
              borderRadius: '50%', 
              backgroundColor: '#4ade80', 
              opacity: 0.75 
            }} 
          />
          <span 
            style={{ 
              position: 'relative', 
              width: 10, 
              height: 10, 
              borderRadius: '50%', 
              backgroundColor: '#22c55e' 
            }} 
          />
        </span>
        {/* Online Text with Player Count */}
        <span 
          style={{ 
            fontFamily: "'DynaPuff', sans-serif", 
            fontSize: 16,
            lineHeight: '24px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.025em',
            color: 'rgb(248, 248, 252)',
            cursor: 'pointer',
          }}
        >
          ONLINE({onlineCount > 0 ? onlineCount.toLocaleString() : '...'})
        </span>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Message List */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin"
        style={{ 
          userSelect: 'text',
          scrollBehavior: 'smooth',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="text-[#2DE2E6] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-12 h-12 rounded-full bg-[#1F2937]/50 flex items-center justify-center mb-3">
              <MessageCircle size={24} className="text-[#9CA3AF]/50" />
            </div>
            <p className="text-sm text-[#9CA3AF]">No messages yet</p>
            <p className="text-xs text-[#9CA3AF]/60 mt-1">Be the first to chat!</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const badgeTier = tierCache[msg.wallet_address] ?? 0;
              const displayName = msg.username || 'Anon';
              
              return (
                <div 
                  key={msg.id} 
                  className="chat-message-row"
                >
                  {/* Tier Icon Badge */}
                  <div className="chat-badge-container">
                    <img 
                      src={tierIconUrl(badgeTier)} 
                      alt="tier"
                      className="chat-tier-badge"
                      style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  
                  {/* Content Container - Username + Message */}
                  <div className="chat-content">
                    {typeof msg.level === 'number' && (
                      <span className="chat-level-badge">Lv{msg.level}</span>
                    )}
                    <span
                      className="chat-username"
                      onClick={() => msg.wallet_address && setPopupPlayer({ wallet: msg.wallet_address, username: displayName })}
                    >
                      {displayName}
                    </span>
                    <span className="chat-message-text">{msg.message}</span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area Wrapper - docked to bottom with equal padding */}
      <div 
        style={{ 
          width: 319,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          position: 'relative',
          boxSizing: 'border-box',
          backgroundColor: 'rgb(21, 22, 29)',
          padding: 12,
          flexShrink: 0,
          overflowX: 'visible',
          overflowY: 'visible',
          fontFamily: "'DynaPuff', sans-serif",
          fontSize: 16,
          lineHeight: '24px',
          fontWeight: 400,
          color: 'rgb(248, 248, 252)',
          WebkitFontSmoothing: 'antialiased',
          pointerEvents: 'auto',
          userSelect: 'text',
        }}
      >
        {isWalletConnected ? (
          /* Input Form Container - strictly contained within 319px wrapper */
          <div 
            style={{ 
              width: '100%',
              height: 45,
              maxWidth: '100%',
              display: 'flex',
              alignItems: 'center',
              position: 'relative',
              boxSizing: 'border-box',
              border: '1px solid rgb(68, 68, 68)',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'rgb(68, 68, 68)',
              borderRadius: 8,
              backgroundColor: 'transparent',
              pointerEvents: 'auto',
              userSelect: 'text',
            }}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRateLimited ? 'Wait...' : 'Type a message...'}
              disabled={isRateLimited}
              maxLength={280}
              style={{
                flexGrow: 1,
                height: '100%',
                minWidth: 0,
                fontFamily: "'DynaPuff', sans-serif",
                fontSize: 16,
                fontWeight: 400,
                lineHeight: '23px',
                color: 'rgb(248, 248, 252)',
                backgroundColor: 'transparent',
                backgroundImage: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
                border: 'none',
                borderWidth: 0,
                borderStyle: 'solid',
                borderRadius: 0,
                padding: '10px 12px 10px 12px',
                boxSizing: 'border-box',
                outline: 'none',
                userSelect: 'text',
                pointerEvents: 'auto',
                WebkitFontSmoothing: 'antialiased',
                overflowWrap: 'break-word',
                overflowX: 'hidden',
                cursor: isRateLimited ? 'not-allowed' : 'text',
                opacity: isRateLimited ? 0.5 : 1,
              }}
            />
            {/* Send Button - inside container, no extra margin */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isRateLimited || !inputValue.trim()}
              style={{
                width: 40,
                height: 40,
                marginRight: 2,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: 'none',
                borderWidth: 0,
                borderStyle: 'solid',
                fontFamily: "'DynaPuff', sans-serif",
                boxSizing: 'border-box',
                cursor: isRateLimited || !inputValue.trim() ? 'not-allowed' : 'pointer',
                backgroundColor: isRateLimited || !inputValue.trim() ? 'rgba(31, 41, 55, 0.5)' : '#00ff88',
                color: isRateLimited || !inputValue.trim() ? 'rgba(156, 163, 175, 0.3)' : '#000',
                transition: 'all 0.15s ease',
              }}
            >
              <Send size={18} />
            </button>
          </div>
        ) : (
          <div 
            style={{
              width: '100%',
              height: 45,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 400,
              color: 'rgba(156, 163, 175, 0.6)',
              backgroundColor: 'rgba(31, 41, 55, 0.3)',
              border: '1px solid rgba(51, 51, 51, 0.5)',
              borderRadius: 8,
              boxSizing: 'border-box',
              cursor: 'not-allowed',
              userSelect: 'none',
            }}
          >
            Connect wallet to chat
          </div>
        )}
      </div>

      {/* Player Profile Popup */}
      {popupPlayer && (
        <PlayerPopup
          wallet={popupPlayer.wallet}
          username={popupPlayer.username}
          onClose={() => setPopupPlayer(null)}
        />
      )}
    </div>
  );
};

export default GlobalChatSidebar;
