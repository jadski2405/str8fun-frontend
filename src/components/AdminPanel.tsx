import React, { useState, useEffect } from 'react';
import { Settings, Play, Wallet, X } from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================
const ADMIN_WALLET = 'KD4nsYvCuiq1JECsT4WDuA3pTuiLJxgR5zKLfAjV2Ws';
const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

// ============================================================================
// TYPES
// ============================================================================
interface AdminPanelProps {
  walletAddress: string | null;
  getAuthToken?: () => Promise<string | null>;
  currentRoundId?: string | null;
  currentRoundStatus?: 'loading' | 'active' | 'ended' | 'countdown' | 'error';
}

type RoundMode = 'amm' | 'random';

// ============================================================================
// ADMIN PANEL COMPONENT
// ============================================================================
const AdminPanel: React.FC<AdminPanelProps> = ({ 
  walletAddress, 
  getAuthToken,
  currentRoundId,
  currentRoundStatus 
}) => {
  // Only render for admin wallet
  const isAdmin = walletAddress === ADMIN_WALLET;
  
  // Panel state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Admin data state - default to random mode
  const [escrowBalance, setEscrowBalance] = useState<number | null>(null);
  const [nextRoundMode, setNextRoundMode] = useState<RoundMode>('random');
  const [currentMode, setCurrentMode] = useState<RoundMode>('random');
  
  // Clear messages after 3 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);
  
  // Fetch admin status on mount
  useEffect(() => {
    if (isAdmin && isExpanded) {
      fetchAdminStatus();
    }
  }, [isAdmin, isExpanded]);
  
  // Don't render if not admin
  if (!isAdmin) return null;
  
  // ============================================================================
  // API CALLS
  // ============================================================================
  
  async function fetchAdminStatus() {
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      // Use query param instead of header to avoid CORS issues
      const url = `${API_URL}/api/admin/status?wallet=${encodeURIComponent(walletAddress || '')}`;
      const response = await fetch(url, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setEscrowBalance(data.escrowBalance ?? null);
        setCurrentMode(data.currentMode ?? 'random');
        setNextRoundMode(data.nextRoundMode ?? 'random');
      } else {
        // Mock data for development
        setEscrowBalance(12.5);
        setCurrentMode('random');
        setNextRoundMode('random');
      }
    } catch (err) {
      // Mock data for development when API not ready
      console.log('Admin API not available, using mock data');
      setEscrowBalance(12.5);
      setCurrentMode('random');
      setNextRoundMode('random');
    }
  }
  
  async function startRandomRound() {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      console.log('[AdminPanel] Starting random round...', { API_URL, walletAddress });
      
      const response = await fetch(`${API_URL}/api/admin/start-random-round`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ wallet_address: walletAddress }),
      });
      
      const data = await response.json();
      console.log('[AdminPanel] Response:', response.status, data);
      
      if (response.ok && data.success !== false) {
        setSuccess(`Round started! ID: ${data.roundId?.slice(0, 8) || 'OK'}...`);
        setTimeout(fetchAdminStatus, 1000);
      } else {
        setError(data.error || data.message || `Failed (${response.status})`);
      }
    } catch (err: any) {
      console.error('[AdminPanel] Error:', err);
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }
  
  function handleSetMode(mode: RoundMode) {
    console.log('Setting mode to:', mode);
    setNextRoundMode(mode);
    setSuccess(`Next round: ${mode === 'random' ? 'House' : 'AMM'}`);
    
    // Sync with backend
    syncModeWithBackend(mode);
  }
  
  async function syncModeWithBackend(mode: RoundMode) {
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await fetch(`${API_URL}/api/admin/set-next-round-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode, wallet_address: walletAddress }),
      });
      
      if (response.ok) {
        console.log('Mode synced with backend');
      } else {
        const text = await response.text();
        console.log('Backend returned error:', response.status, text);
        setError(`Mode sync failed: ${response.status}`);
      }
    } catch (err: any) {
      console.log('Backend not available:', err);
      setError('Network error syncing mode');
    }
  }
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Collapsed State - Just a button */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl shadow-lg transition-all flex items-center gap-2"
          title="Admin Panel"
        >
          <Settings size={20} />
          <span className="text-sm font-bold">ADMIN</span>
        </button>
      )}
      
      {/* Expanded Panel */}
      {isExpanded && (
        <div className="bg-[#12171f] border border-purple-500/50 rounded-2xl shadow-2xl w-72 overflow-hidden">
          {/* Header */}
          <div className="bg-purple-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings size={18} className="text-white" />
              <span className="text-white font-bold">Admin Panel</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-white/70 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Escrow Balance */}
            <div className="bg-[#1a1f2a] rounded-xl p-3 border border-[#2a3441]">
              <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider mb-2">
                <Wallet size={14} />
                <span>Escrow Balance</span>
              </div>
              <div className="text-white font-bold text-xl">
                {escrowBalance !== null ? `${escrowBalance.toFixed(4)} SOL` : '...'}
              </div>
            </div>
            
            {/* Current Round Status */}
            <div className="bg-[#1a1f2a] rounded-xl p-3 border border-[#2a3441]">
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">Current Round</div>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${
                  currentRoundStatus === 'active' ? 'text-green-400' : 
                  currentRoundStatus === 'countdown' ? 'text-yellow-400' : 
                  currentRoundStatus === 'loading' ? 'text-blue-400' :
                  currentRoundStatus === 'error' ? 'text-red-400' : 'text-gray-400'
                }`}>
                  {currentRoundStatus === 'active' ? '🟢 Active' : 
                   currentRoundStatus === 'countdown' ? '🟡 Countdown' : 
                   currentRoundStatus === 'loading' ? '🔵 Loading' :
                   currentRoundStatus === 'error' ? '🔴 Error' : '⚫ Ended'}
                </span>
                <span className="text-xs text-purple-400 font-medium uppercase">
                  {currentMode}
                </span>
              </div>
              {currentRoundId && (
                <div className="text-xs text-gray-500 mt-1 font-mono">
                  {currentRoundId.slice(0, 12)}...
                </div>
              )}
            </div>
            
            {/* Next Round Mode Toggle */}
            <div className="bg-[#1a1f2a] rounded-xl p-3 border border-[#2a3441]">
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-3">Next Round Mode</div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSetMode('amm')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                    nextRoundMode === 'amm'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#2a3441] text-gray-400 hover:text-white'
                  }`}
                >
                  AMM
                </button>
                <button
                  onClick={() => handleSetMode('random')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                    nextRoundMode === 'random'
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#2a3441] text-gray-400 hover:text-white'
                  }`}
                >
                  House
                </button>
              </div>
            </div>
            
            {/* Start Round Button */}
            <button
              onClick={startRandomRound}
              disabled={isLoading || currentRoundStatus === 'active'}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <Play size={18} />
                  <span>Start Round</span>
                </>
              )}
            </button>
            
            {/* Status Messages */}
            {error && (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs text-center">
                {error}
              </div>
            )}
            {success && (
              <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-xs text-center">
                {success}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-4 py-2 bg-[#0a0e14] text-xs text-gray-500 text-center border-t border-[#2a3441]">
            Admin: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
