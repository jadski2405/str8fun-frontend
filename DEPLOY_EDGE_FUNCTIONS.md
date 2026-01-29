# ============================================================================
# SUPABASE EDGE FUNCTIONS DEPLOYMENT GUIDE
# ============================================================================

## Prerequisites

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

## Link Your Project

```bash
cd c:\Users\jadog\OneDrive\Desktop\pumpit
supabase link --project-ref jbloptamojjqgxfbjqeo
```

## Set Environment Secrets

These secrets are required for the Edge Functions to work:

```bash
# Solana RPC URL (Helius mainnet)
supabase secrets set SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=00885373-fbb8-47cc-bf5e-04d552d6d6bc"

# Escrow wallet private key (base58 encoded)
# ⚠️ IMPORTANT: Replace with your actual escrow wallet private key
supabase secrets set ESCROW_PRIVATE_KEY="your-escrow-private-key-here"

# House wallet address (receives fees + forfeitures)
supabase secrets set HOUSE_WALLET_ADDRESS="DdGmjNhA5qQp4ABTSG1BwpQjZNLkYEgxRLcBtJTaKRwr"
```

## Deploy Functions

Deploy all functions at once:
```bash
supabase functions deploy execute-trade
supabase functions deploy end-round
supabase functions deploy payout-sell
```

Or deploy all:
```bash
supabase functions deploy
```

## Function URLs

After deployment, your functions will be available at:
- `https://jbloptamojjqgxfbjqeo.supabase.co/functions/v1/execute-trade`
- `https://jbloptamojjqgxfbjqeo.supabase.co/functions/v1/end-round`
- `https://jbloptamojjqgxfbjqeo.supabase.co/functions/v1/payout-sell`

## Test Functions Locally

```bash
supabase functions serve
```

This starts a local server at `http://localhost:54321/functions/v1/`

## Usage Examples

### Execute Trade (Buy)
```bash
curl -X POST "https://jbloptamojjqgxfbjqeo.supabase.co/functions/v1/execute-trade" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "roundId": "uuid-here",
    "profileId": "uuid-here",
    "tradeType": "buy",
    "solAmount": 0.1,
    "txSignature": "solana-tx-signature"
  }'
```

### Execute Trade (Sell)
```bash
curl -X POST "https://jbloptamojjqgxfbjqeo.supabase.co/functions/v1/execute-trade" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "roundId": "uuid-here",
    "profileId": "uuid-here",
    "tradeType": "sell",
    "solAmount": 0.05
  }'
```

### End Round
```bash
curl -X POST "https://jbloptamojjqgxfbjqeo.supabase.co/functions/v1/end-round" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"roundId": "uuid-here"}'
```

## Automated Round Ending

To automatically end rounds after 30 seconds, you can:

### Option 1: Supabase Cron (pg_cron)
Add this to your SQL editor:

```sql
-- Enable pg_cron extension (if not already)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to end expired rounds
CREATE OR REPLACE FUNCTION end_expired_rounds()
RETURNS void AS $$
DECLARE
  expired_round RECORD;
BEGIN
  FOR expired_round IN 
    SELECT id FROM game_rounds 
    WHERE status = 'active' 
    AND started_at + (duration_seconds || ' seconds')::INTERVAL < now()
  LOOP
    -- Mark as completed (Edge Function will handle payouts)
    UPDATE game_rounds 
    SET status = 'completed', ended_at = now() 
    WHERE id = expired_round.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule to run every 5 seconds
SELECT cron.schedule('end-rounds', '*/5 * * * *', 'SELECT end_expired_rounds()');
```

### Option 2: Client-Side Timer
The frontend already has a timer that triggers a state refresh when round ends.

## Security Notes

1. **Never expose ESCROW_PRIVATE_KEY** - only set it as a Supabase secret
2. **Use RLS policies** to protect database tables
3. **Validate all inputs** in Edge Functions
4. **Rate limit** trade requests to prevent spam
