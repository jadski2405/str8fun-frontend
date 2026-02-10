import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';

export interface ChatMessage {
  id: string;
  username: string;
  wallet_address: string;
  message: string;
  created_at: string;
}

interface UseChatOptions {
  walletAddress?: string | null;
  getAuthToken?: () => Promise<string | null>;
  limit?: number;
}

interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<boolean>;
  currentUserId: string | null;
  isRateLimited: boolean;
}

// Format wallet for display: 7xKX...9fGh
export function shortWallet(addr: string): string {
  if (!addr || addr.length < 8) return addr || '';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function useChat({ walletAddress = null, getAuthToken = undefined, limit = 50 }: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const optimisticIdsRef = useRef<Set<string>>(new Set());

  const currentUserId = walletAddress;

  // Load initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/api/chat/pumpit`);
        if (!response.ok) throw new Error('Failed to fetch messages');
        const data = await response.json();
        // API returns oldest to newest already
        const msgs: ChatMessage[] = Array.isArray(data) ? data : (data.messages || []);
        setMessages(msgs);
      } catch (err) {
        console.error('[useChat] Error fetching messages:', err);
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [limit]);

  // Listen for CHAT_MESSAGE events dispatched from the game WS (useGame.ts)
  useEffect(() => {
    const handleChatMessage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.id) return;

      const newMsg: ChatMessage = {
        id: detail.id,
        username: detail.username || shortWallet(detail.wallet_address || ''),
        wallet_address: detail.wallet_address || '',
        message: detail.message || '',
        created_at: detail.created_at || new Date().toISOString(),
      };

      setMessages(prev => {
        // Skip if already present (optimistic add or duplicate)
        if (prev.some(m => m.id === newMsg.id)) return prev;
        const updated = [...prev, newMsg];
        if (updated.length > limit) return updated.slice(-limit);
        return updated;
      });
    };

    window.addEventListener('pumpit:chat_message', handleChatMessage);
    return () => window.removeEventListener('pumpit:chat_message', handleChatMessage);
  }, [limit]);

  // Send message
  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const trimmedText = text.trim();
    if (!trimmedText) return false;

    if (trimmedText.length > 500) {
      setError('Message too long (max 500 characters)');
      return false;
    }

    if (!walletAddress) {
      setError('Connect wallet to send messages');
      return false;
    }

    // Optimistic add with temp id
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      username: '',
      wallet_address: walletAddress,
      message: trimmedText,
      created_at: new Date().toISOString(),
    };
    optimisticIdsRef.current.add(tempId);
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': walletAddress,
          ...(token ? { 'Authorization': `Bearer ${token}`, 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({ message: trimmedText, room: 'pumpit' }),
      });

      if (!response.ok) {
        // Server may return HTML (proxy error pages) — parse safely
        let errorMsg = `Send failed (${response.status})`;
        try {
          const text = await response.text();
          const parsed = JSON.parse(text);
          if (parsed.error) errorMsg = parsed.error;
        } catch { /* non-JSON response, use default */ }
        setMessages(prev => prev.filter(m => m.id !== tempId));
        optimisticIdsRef.current.delete(tempId);
        setError(errorMsg);
        return false;
      }

      // Parse success response — flat object { id, username, wallet_address, message, room, created_at }
      try {
        const result = await response.json();
        if (result.id) {
          setMessages(prev =>
            prev.map(m => m.id === tempId ? { ...result } : m)
          );
        }
      } catch { /* non-JSON 200 — keep optimistic msg as-is */ }
      optimisticIdsRef.current.delete(tempId);

      // Rate limit: disable send for 2s
      setIsRateLimited(true);
      setTimeout(() => setIsRateLimited(false), 2000);

      return true;
    } catch (err) {
      console.error('[useChat] Error sending message:', err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      optimisticIdsRef.current.delete(tempId);
      setError('Failed to send message');
      return false;
    }
  }, [walletAddress, getAuthToken]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    currentUserId,
    isRateLimited,
  };
}

export default useChat;
