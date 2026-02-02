// ============================================================================
// AUTH FETCH - Wrapper for authenticated API calls with automatic retry on 401
// ============================================================================

/**
 * Authenticated fetch wrapper that automatically retries on 401 (Unauthorized).
 * On 401, it will call getAuthToken() again to get a fresh token (Privy auto-refreshes)
 * and retry the request.
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options (method, body, etc.)
 * @param getAuthToken - Function to get auth token (from useSolanaWallet)
 * @param maxRetries - Number of retries on 401 (default: 1)
 * @returns Promise<Response>
 */
export async function authFetch(
  url: string,
  options: RequestInit,
  getAuthToken: () => Promise<string | null>,
  maxRetries = 1
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Get fresh token on each attempt (Privy auto-refreshes if expired)
    const token = await getAuthToken();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { 
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token 
        } : {}),
      },
    });
    
    // Retry on 401 if we have attempts left
    if (response.status === 401 && attempt < maxRetries) {
      console.log(`[authFetch] 401 received for ${url}, refreshing token and retrying (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    
    return response;
  }
  
  // This should never be reached due to the loop structure, but TypeScript needs it
  throw new Error('Request failed after retries');
}

/**
 * Helper to create headers with auth token
 */
export function createAuthHeaders(token: string | null, additionalHeaders?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { 
      'Authorization': `Bearer ${token}`,
      'x-auth-token': token 
    } : {}),
    ...additionalHeaders,
  };
}
