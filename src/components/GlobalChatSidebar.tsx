import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, MessageCircle, Loader2 } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { TIER_COLORS, TIER_NAMES, tierIconUrl } from '../types/game';

interface GlobalChatSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  room?: string;
  isWalletConnected?: boolean;
  walletAddress?: string | null;
  getAuthToken?: () => Promise<string | null>;
  onlineCount?: number;
}

// Badge styles - enough variety to avoid duplicates in typical chat
const BADGE_STYLES = [
  { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '👑', color: '#facc15' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: '💎', color: '#a855f7' },
  { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '⚡', color: '#3b82f6' },
  { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', label: '🌿', color: '#22c55e' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', label: '🌸', color: '#ec4899' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: '🔥', color: '#f97316' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', label: '❄️', color: '#06b6d4' },
  { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: '♦️', color: '#ef4444' },
  { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', label: '🔮', color: '#6366f1' },
  { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30', label: '🍀', color: '#14b8a6' },
  { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', label: '⭐', color: '#f59e0b' },
  { bg: 'bg-lime-500/20', text: 'text-lime-400', border: 'border-lime-500/30', label: '🥝', color: '#84cc16' },
];

const GlobalChatSidebar: React.FC<GlobalChatSidebarProps> = ({ 
  isCollapsed: _isCollapsed, 
  onToggleCollapse: _onToggleCollapse,
  room = 'global',
  isWalletConnected = false,
  walletAddress = null,
  getAuthToken = undefined,
  onlineCount = 0
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const { messages, loading, error, sendMessage, isRateLimited } = useChat({ room, walletAddress, getAuthToken });

  // Build a map of unique usernames to unique badge styles
  // This ensures no two users share the same badge in the current message list
  const userStyleMap = useMemo(() => {
    const uniqueUsers = [...new Set(messages.map(m => m.username))];
    const styleMap = new Map<string, typeof BADGE_STYLES[0]>();
    
    uniqueUsers.forEach((username, index) => {
      // Assign badge in order of first appearance, cycling through available styles
      styleMap.set(username, BADGE_STYLES[index % BADGE_STYLES.length]);
    });
    
    return styleMap;
  }, [messages]);

  // Get style for a username (guaranteed unique within current messages)
  const getRankStyle = (username: string) => {
    return userStyleMap.get(username) || BADGE_STYLES[0];
  };

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
              const rankStyle = getRankStyle(msg.username);
              const hasTier = typeof msg.tier === 'number' && msg.tier >= 0 && msg.tier <= 9;
              const tierColor = hasTier ? TIER_COLORS[msg.tier!] : undefined;
              
              return (
                /* Chat Message Row - Badge + Content aligned */
                <div 
                  key={msg.id} 
                  className="chat-message-row"
                >
                  {/* Badge Container - Fixed 40px width, centered */}
                  <div className="chat-badge-container">
                    {hasTier ? (
                      <img 
                        src={tierIconUrl(msg.tier!)} 
                        alt={TIER_NAMES[msg.tier!]} 
                        className="chat-tier-badge"
                        title={TIER_NAMES[msg.tier!]}
                        style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'contain' }}
                        onError={(e) => {
                          // Fallback to emoji badge on icon load failure
                          const parent = (e.target as HTMLImageElement).parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="chat-badge ${rankStyle.bg} ${rankStyle.text} border ${rankStyle.border}">${rankStyle.label}</span>`;
                          }
                        }}
                      />
                    ) : (
                      <span className={`chat-badge ${rankStyle.bg} ${rankStyle.text} border ${rankStyle.border}`}>
                        {rankStyle.label}
                      </span>
                    )}
                  </div>
                  
                  {/* Content Container - Username + Message */}
                  <div className="chat-content">
                    <span 
                      className="chat-username" 
                      style={tierColor ? { color: tierColor } : undefined}
                    >
                      {msg.username}
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
              maxLength={500}
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
    </div>
  );
};

export default GlobalChatSidebar;
