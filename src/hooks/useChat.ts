import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.str8.fun';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://api.str8.fun';

// Messages older than 10 minutes are auto-deleted
const MESSAGE_TTL_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

export interface ChatMessage {
  id: string;
  user_id: string | null;
  username: string;
  message: string;
  room: string;
  created_at: string;
}

interface UseChatOptions {
  room?: string;
  limit?: number;
  walletAddress?: string | null;
  username?: string | null;
}

interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<boolean>;
  currentUserId: string | null;
  isRateLimited: boolean;
}

// Helper: Check if message is within TTL (not expired)
const isMessageValid = (msg: ChatMessage): boolean => {
  const messageTime = new Date(msg.created_at).getTime();
  const now = Date.now();
  return (now - messageTime) < MESSAGE_TTL_MS;
};

export function useChat({ room = 'pumpit', limit = 50, walletAddress = null, username: _username = null }: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [, setCleanupTick] = useState(0); // Force re-render for cleanup
  
  const wsRef = useRef<WebSocket | null>(null);
  const currentUserId = walletAddress;

  // Filter out expired messages (older than 10 minutes)
  const validMessages = useMemo(() => {
    return messages.filter(isMessageValid);
  }, [messages]);

  // Periodic cleanup: Remove expired messages every 30 seconds
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setMessages(prev => {
        const filtered = prev.filter(isMessageValid);
        // Only update if something was removed
        if (filtered.length !== prev.length) {
          return filtered;
        }
        return prev;
      });
      // Force a re-render tick for useMemo recalculation
      setCleanupTick(t => t + 1);
    }, 30000); // Check every 30 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // Load initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/api/chat/${encodeURIComponent(room)}?limit=${limit}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const data = await response.json();
        // Filter out expired messages on load
        const validData = (data || []).filter(isMessageValid);
        setMessages(validData);
      } catch (err) {
        console.error('Error fetching messages:', err);
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [room, limit]);

  // Subscribe to realtime updates via WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let isMounted = true;
    
    const connect = () => {
      if (!isMounted) return;
      
      ws = new WebSocket(`${WS_URL}/ws`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        if (!isMounted) return;
        console.log(`✅ Chat WebSocket connected to room: ${room}`);
        // Subscribe to chat channel
        ws?.send(JSON.stringify({
          type: 'subscribe',
          channels: ['chat'],
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'CHAT' && data.message) {
            const newMessage = data.message as ChatMessage;
            // Only add if it's for our room
            if (newMessage.room === room) {
              setMessages((prev) => {
                // Avoid duplicates
                if (prev.some((msg) => msg.id === newMessage.id)) {
                  return prev;
                }
                // Keep only the last `limit` messages
                const updated = [...prev, newMessage];
                if (updated.length > limit) {
                  return updated.slice(-limit);
                }
                return updated;
              });
            }
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      };
      
      ws.onerror = () => {
        // Suppress error logging - reconnection will handle it
      };
      
      ws.onclose = () => {
        console.log('Chat WebSocket disconnected');
        // Reconnect after 2 seconds if still mounted
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    };
    
    // Small delay to avoid React Strict Mode double-mount issues
    const initTimeout = setTimeout(connect, 100);

    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [room, limit]);

  // Send message function
  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const trimmedText = text.trim();
    
    if (!trimmedText) {
      return false;
    }

    if (trimmedText.length > 500) {
      setError('Message too long (max 500 characters)');
      return false;
    }

    // Must have wallet connected to send messages
    if (!walletAddress) {
      setError('Connect wallet to send messages');
      return false;
    }

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          message: trimmedText,
          room,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || 'Failed to send message');
        return false;
      }

      // Rate limiting - disable send for 1 second
      setIsRateLimited(true);
      setTimeout(() => setIsRateLimited(false), 1000);

      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
      return false;
    }
  }, [room, walletAddress]);

  return {
    messages: validMessages,
    loading,
    error,
    sendMessage,
    currentUserId,
    isRateLimited,
  };
}

export default useChat;
