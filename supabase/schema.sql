-- =============================================
-- Supabase PumpIt Game Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- =============================================
-- PROFILES (Wallet-linked users)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  avatar_url TEXT,
  -- Deposited balance (SOL in escrow for instant trading)
  deposited_balance DECIMAL(20, 9) DEFAULT 0,
  -- Stats
  total_volume DECIMAL(20, 9) DEFAULT 0,
  total_pnl DECIMAL(20, 9) DEFAULT 0,
  total_fees_paid DECIMAL(20, 9) DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON public.profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(LOWER(username));

-- =============================================
-- WALLET AUTH TOKENS (2-day expiry, for withdrawals only)
-- =============================================
CREATE TABLE IF NOT EXISTS public.wallet_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 days')
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_wallet ON public.wallet_auth_tokens(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON public.wallet_auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON public.wallet_auth_tokens(expires_at);

-- =============================================
-- DEPOSIT HISTORY (Audit trail for deposits/withdrawals)
-- =============================================
CREATE TABLE IF NOT EXISTS public.deposit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('deposit', 'withdraw')),
  amount DECIMAL(20, 9) NOT NULL,
  tx_signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deposit_history_profile ON public.deposit_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_deposit_history_tx ON public.deposit_history(tx_signature);

-- =============================================
-- GAME ROUNDS (30-second trading sessions)
-- =============================================
CREATE TABLE IF NOT EXISTS public.game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  house_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 2.0,
  -- Pool state
  pool_sol_balance DECIMAL(20, 9) DEFAULT 0,
  pool_token_supply DECIMAL(20, 9) DEFAULT 1000000,
  current_price DECIMAL(20, 9) DEFAULT 0.000001,
  -- Accumulated house earnings
  accumulated_fees DECIMAL(20, 9) DEFAULT 0,
  forfeited_sol DECIMAL(20, 9) DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  -- Settlement
  settlement_tx_signature TEXT
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_status ON public.game_rounds(status);
CREATE INDEX IF NOT EXISTS idx_game_rounds_started ON public.game_rounds(started_at DESC);

-- =============================================
-- PLAYER POSITIONS (Tokens held per round)
-- =============================================
CREATE TABLE IF NOT EXISTS public.player_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Current holdings
  token_balance DECIMAL(20, 9) DEFAULT 0,
  total_sol_in DECIMAL(20, 9) DEFAULT 0,
  total_sol_out DECIMAL(20, 9) DEFAULT 0,
  total_fees_paid DECIMAL(20, 9) DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unique per round
  UNIQUE(round_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_player_positions_round ON public.player_positions(round_id);
CREATE INDEX IF NOT EXISTS idx_player_positions_profile ON public.player_positions(profile_id);

-- =============================================
-- TRADES (Buy/Sell history)
-- =============================================
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Trade details
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  sol_amount DECIMAL(20, 9) NOT NULL CHECK (sol_amount >= 0.01),
  fee_amount DECIMAL(20, 9) NOT NULL,
  net_amount DECIMAL(20, 9) NOT NULL,
  token_amount DECIMAL(20, 9) NOT NULL,
  price_at_trade DECIMAL(20, 9) NOT NULL,
  -- On-chain reference
  tx_signature TEXT,
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_round ON public.trades(round_id);
CREATE INDEX IF NOT EXISTS idx_trades_profile ON public.trades(profile_id);
CREATE INDEX IF NOT EXISTS idx_trades_created ON public.trades(created_at DESC);

-- =============================================
-- FORFEITURES (Tokens not sold at round end)
-- =============================================
CREATE TABLE IF NOT EXISTS public.forfeitures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tokens_forfeited DECIMAL(20, 9) NOT NULL,
  sol_value_forfeited DECIMAL(20, 9) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forfeitures_round ON public.forfeitures(round_id);

-- =============================================
-- ROUND SETTLEMENTS (House payout records)
-- =============================================
CREATE TABLE IF NOT EXISTS public.round_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID UNIQUE NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  accumulated_fees DECIMAL(20, 9) NOT NULL,
  forfeited_sol DECIMAL(20, 9) NOT NULL,
  total_to_house DECIMAL(20, 9) NOT NULL,
  tx_signature TEXT NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- CHAT MESSAGES (Global chat)
-- =============================================
-- 1. Create the chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) > 0 AND char_length(message) <= 500),
  room TEXT NOT NULL DEFAULT 'global',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create an index for faster queries by room and time
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created 
ON public.chat_messages(room, created_at DESC);

-- 3. Enable Row Level Security
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Anyone can read messages (public chat)
DROP POLICY IF EXISTS "Anyone can read chat messages" ON public.chat_messages;
CREATE POLICY "Anyone can read chat messages"
ON public.chat_messages
FOR SELECT
USING (true);

-- 5. RLS Policy: Anyone can insert messages (public chat with guests)
-- For production, you may want to add rate limiting at the application level
DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_messages;
CREATE POLICY "Anyone can insert chat messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (true);

-- 6. Enable Realtime for the table
-- Go to Supabase Dashboard > Database > Replication
-- Or run this if you have permissions:
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =============================================
-- RLS POLICIES FOR GAME TABLES
-- =============================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
CREATE POLICY "Anyone can read profiles" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (true);

-- Game Rounds
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read game rounds" ON public.game_rounds;
CREATE POLICY "Anyone can read game rounds" ON public.game_rounds FOR SELECT USING (true);

-- Player Positions
ALTER TABLE public.player_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read positions" ON public.player_positions;
CREATE POLICY "Anyone can read positions" ON public.player_positions FOR SELECT USING (true);

-- Trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read trades" ON public.trades;
CREATE POLICY "Anyone can read trades" ON public.trades FOR SELECT USING (true);

-- Forfeitures
ALTER TABLE public.forfeitures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read forfeitures" ON public.forfeitures;
CREATE POLICY "Anyone can read forfeitures" ON public.forfeitures FOR SELECT USING (true);

-- Round Settlements
ALTER TABLE public.round_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read settlements" ON public.round_settlements;
CREATE POLICY "Anyone can read settlements" ON public.round_settlements FOR SELECT USING (true);

-- =============================================
-- REALTIME SUBSCRIPTIONS
-- =============================================
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rounds;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.player_positions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to get or create profile by wallet address
CREATE OR REPLACE FUNCTION get_or_create_profile(p_wallet_address TEXT)
RETURNS UUID AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Try to get existing profile
  SELECT id INTO v_profile_id FROM public.profiles WHERE wallet_address = p_wallet_address;
  
  -- Create if not exists
  IF v_profile_id IS NULL THEN
    INSERT INTO public.profiles (wallet_address) 
    VALUES (p_wallet_address) 
    RETURNING id INTO v_profile_id;
  END IF;
  
  RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current active round or create new one
CREATE OR REPLACE FUNCTION get_or_create_active_round()
RETURNS UUID AS $$
DECLARE
  v_round_id UUID;
  v_round_end TIMESTAMPTZ;
BEGIN
  -- Get active round that hasn't expired
  SELECT id, started_at + (duration_seconds || ' seconds')::INTERVAL 
  INTO v_round_id, v_round_end
  FROM public.game_rounds 
  WHERE status = 'active' 
  ORDER BY started_at DESC 
  LIMIT 1;
  
  -- If no active round or round expired, create new one
  IF v_round_id IS NULL OR v_round_end < now() THEN
    -- Mark old round as completed if exists
    IF v_round_id IS NOT NULL THEN
      UPDATE public.game_rounds SET status = 'completed', ended_at = now() WHERE id = v_round_id;
    END IF;
    
    -- Create new round
    INSERT INTO public.game_rounds (status, started_at)
    VALUES ('active', now())
    RETURNING id INTO v_round_id;
  END IF;
  
  RETURN v_round_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- Optional: Create a function to clean old messages (run periodically)
-- =============================================
-- CREATE OR REPLACE FUNCTION delete_old_chat_messages()
-- RETURNS void AS $$
-- BEGIN
--   DELETE FROM public.chat_messages
--   WHERE created_at < now() - INTERVAL '7 days';
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- DEPOSIT/WITHDRAW FUNCTIONS
-- =============================================

-- Function to add deposit to player balance (called by Edge Function after verifying tx)
CREATE OR REPLACE FUNCTION confirm_deposit(
  p_wallet_address TEXT,
  p_amount DECIMAL(20, 9),
  p_tx_signature TEXT
)
RETURNS JSON AS $$
DECLARE
  v_profile_id UUID;
  v_new_balance DECIMAL(20, 9);
BEGIN
  -- Get profile
  SELECT id INTO v_profile_id FROM public.profiles WHERE wallet_address = p_wallet_address;
  
  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;
  
  -- Check for duplicate tx
  IF EXISTS (SELECT 1 FROM public.deposit_history WHERE tx_signature = p_tx_signature AND status = 'confirmed') THEN
    RETURN json_build_object('success', false, 'error', 'Transaction already processed');
  END IF;
  
  -- Add deposit to balance
  UPDATE public.profiles 
  SET deposited_balance = deposited_balance + p_amount,
      updated_at = now()
  WHERE id = v_profile_id
  RETURNING deposited_balance INTO v_new_balance;
  
  -- Record deposit history
  INSERT INTO public.deposit_history (profile_id, action_type, amount, tx_signature, status, confirmed_at)
  VALUES (v_profile_id, 'deposit', p_amount, p_tx_signature, 'confirmed', now());
  
  RETURN json_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process withdrawal request (called by Edge Function)
CREATE OR REPLACE FUNCTION process_withdrawal(
  p_wallet_address TEXT,
  p_amount DECIMAL(20, 9)
)
RETURNS JSON AS $$
DECLARE
  v_profile_id UUID;
  v_current_balance DECIMAL(20, 9);
BEGIN
  -- Get profile and current balance
  SELECT id, deposited_balance INTO v_profile_id, v_current_balance 
  FROM public.profiles WHERE wallet_address = p_wallet_address FOR UPDATE;
  
  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;
  
  IF v_current_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance', 'available', v_current_balance);
  END IF;
  
  -- Deduct from balance
  UPDATE public.profiles 
  SET deposited_balance = deposited_balance - p_amount,
      updated_at = now()
  WHERE id = v_profile_id;
  
  RETURN json_build_object('success', true, 'profile_id', v_profile_id, 'amount', p_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record completed withdrawal
CREATE OR REPLACE FUNCTION confirm_withdrawal(
  p_profile_id UUID,
  p_amount DECIMAL(20, 9),
  p_tx_signature TEXT
)
RETURNS JSON AS $$
BEGIN
  INSERT INTO public.deposit_history (profile_id, action_type, amount, tx_signature, status, confirmed_at)
  VALUES (p_profile_id, 'withdraw', p_amount, p_tx_signature, 'confirmed', now());
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to execute trade from balance (no on-chain tx needed)
CREATE OR REPLACE FUNCTION execute_trade_from_balance(
  p_wallet_address TEXT,
  p_round_id UUID,
  p_trade_type TEXT,
  p_sol_amount DECIMAL(20, 9),
  p_fee_amount DECIMAL(20, 9),
  p_net_amount DECIMAL(20, 9),
  p_token_amount DECIMAL(20, 9),
  p_price_at_trade DECIMAL(20, 9),
  p_new_pool_sol DECIMAL(20, 9),
  p_new_token_supply DECIMAL(20, 9),
  p_new_price DECIMAL(20, 9)
)
RETURNS JSON AS $$
DECLARE
  v_profile_id UUID;
  v_current_balance DECIMAL(20, 9);
  v_position_id UUID;
  v_current_tokens DECIMAL(20, 9);
  v_current_sol_in DECIMAL(20, 9);
  v_current_sol_out DECIMAL(20, 9);
  v_current_fees DECIMAL(20, 9);
BEGIN
  -- Get profile
  SELECT id, deposited_balance INTO v_profile_id, v_current_balance 
  FROM public.profiles WHERE wallet_address = p_wallet_address FOR UPDATE;
  
  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;
  
  -- For BUY: check and deduct balance
  IF p_trade_type = 'buy' THEN
    IF v_current_balance < p_sol_amount THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient balance', 'available', v_current_balance);
    END IF;
    
    UPDATE public.profiles 
    SET deposited_balance = deposited_balance - p_sol_amount
    WHERE id = v_profile_id;
  END IF;
  
  -- For SELL: add to balance
  IF p_trade_type = 'sell' THEN
    UPDATE public.profiles 
    SET deposited_balance = deposited_balance + p_net_amount
    WHERE id = v_profile_id;
  END IF;
  
  -- Record trade
  INSERT INTO public.trades (round_id, profile_id, trade_type, sol_amount, fee_amount, net_amount, token_amount, price_at_trade)
  VALUES (p_round_id, v_profile_id, p_trade_type, p_sol_amount, p_fee_amount, p_net_amount, p_token_amount, p_price_at_trade);
  
  -- Update pool state
  UPDATE public.game_rounds
  SET pool_sol_balance = p_new_pool_sol,
      pool_token_supply = p_new_token_supply,
      current_price = p_new_price,
      accumulated_fees = accumulated_fees + p_fee_amount
  WHERE id = p_round_id;
  
  -- Get or create position
  SELECT id, token_balance, total_sol_in, total_sol_out, total_fees_paid 
  INTO v_position_id, v_current_tokens, v_current_sol_in, v_current_sol_out, v_current_fees
  FROM public.player_positions 
  WHERE round_id = p_round_id AND profile_id = v_profile_id;
  
  IF v_position_id IS NULL THEN
    INSERT INTO public.player_positions (round_id, profile_id, token_balance, total_sol_in, total_sol_out, total_fees_paid)
    VALUES (
      p_round_id, 
      v_profile_id, 
      CASE WHEN p_trade_type = 'buy' THEN p_token_amount ELSE 0 END,
      CASE WHEN p_trade_type = 'buy' THEN p_sol_amount ELSE 0 END,
      CASE WHEN p_trade_type = 'sell' THEN p_net_amount ELSE 0 END,
      p_fee_amount
    );
  ELSE
    UPDATE public.player_positions
    SET token_balance = CASE 
          WHEN p_trade_type = 'buy' THEN COALESCE(v_current_tokens, 0) + p_token_amount
          ELSE COALESCE(v_current_tokens, 0) - p_token_amount
        END,
        total_sol_in = CASE WHEN p_trade_type = 'buy' THEN COALESCE(v_current_sol_in, 0) + p_sol_amount ELSE v_current_sol_in END,
        total_sol_out = CASE WHEN p_trade_type = 'sell' THEN COALESCE(v_current_sol_out, 0) + p_net_amount ELSE v_current_sol_out END,
        total_fees_paid = COALESCE(v_current_fees, 0) + p_fee_amount,
        updated_at = now()
    WHERE id = v_position_id;
  END IF;
  
  -- Return new balance
  SELECT deposited_balance INTO v_current_balance FROM public.profiles WHERE id = v_profile_id;
  
  RETURN json_build_object('success', true, 'new_balance', v_current_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS for deposit_history
ALTER TABLE public.deposit_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own deposits" ON public.deposit_history;
CREATE POLICY "Users can read own deposits" ON public.deposit_history FOR SELECT USING (true);

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deposit_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- USERNAME FUNCTIONS
-- =============================================

-- Validate username: 1-20 chars, alphanumeric only, max 1 capital letter
CREATE OR REPLACE FUNCTION validate_username(p_username TEXT)
RETURNS JSON AS $$
DECLARE
  v_capital_count INTEGER;
BEGIN
  -- Check length
  IF LENGTH(p_username) < 1 OR LENGTH(p_username) > 20 THEN
    RETURN json_build_object('valid', false, 'error', 'Username must be 1-20 characters');
  END IF;
  
  -- Check alphanumeric only (letters and numbers)
  IF p_username !~ '^[a-zA-Z0-9]+$' THEN
    RETURN json_build_object('valid', false, 'error', 'Username can only contain letters and numbers');
  END IF;
  
  -- Count capital letters
  v_capital_count := LENGTH(p_username) - LENGTH(TRANSLATE(p_username, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ''));
  IF v_capital_count > 1 THEN
    RETURN json_build_object('valid', false, 'error', 'Username can have at most 1 capital letter');
  END IF;
  
  RETURN json_build_object('valid', true);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check if username is available (case-insensitive)
CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT)
RETURNS JSON AS $$
DECLARE
  v_validation JSON;
  v_exists BOOLEAN;
BEGIN
  -- First validate format
  v_validation := validate_username(p_username);
  IF NOT (v_validation->>'valid')::BOOLEAN THEN
    RETURN v_validation;
  END IF;
  
  -- Check if taken (case-insensitive)
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(p_username)
  ) INTO v_exists;
  
  IF v_exists THEN
    RETURN json_build_object('valid', false, 'error', 'Username is already taken');
  END IF;
  
  RETURN json_build_object('valid', true, 'available', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set username for a wallet (one-time operation)
CREATE OR REPLACE FUNCTION set_username(p_wallet_address TEXT, p_username TEXT)
RETURNS JSON AS $$
DECLARE
  v_profile_id UUID;
  v_current_username TEXT;
  v_validation JSON;
BEGIN
  -- Get profile
  SELECT id, username INTO v_profile_id, v_current_username
  FROM public.profiles WHERE wallet_address = p_wallet_address;
  
  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;
  
  -- Check if already has username
  IF v_current_username IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Username already set');
  END IF;
  
  -- Validate and check availability
  v_validation := check_username_available(p_username);
  IF NOT (v_validation->>'valid')::BOOLEAN THEN
    RETURN json_build_object('success', false, 'error', v_validation->>'error');
  END IF;
  
  -- Set username
  UPDATE public.profiles 
  SET username = p_username, updated_at = now()
  WHERE id = v_profile_id;
  
  RETURN json_build_object('success', true, 'username', p_username);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get profile with username status
CREATE OR REPLACE FUNCTION get_profile_with_username(p_wallet_address TEXT)
RETURNS JSON AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT id, wallet_address, username, deposited_balance
  INTO v_profile
  FROM public.profiles WHERE wallet_address = p_wallet_address;
  
  IF v_profile.id IS NULL THEN
    -- Create new profile
    INSERT INTO public.profiles (wallet_address) 
    VALUES (p_wallet_address) 
    RETURNING id, wallet_address, username, deposited_balance INTO v_profile;
  END IF;
  
  RETURN json_build_object(
    'id', v_profile.id,
    'wallet_address', v_profile.wallet_address,
    'username', v_profile.username,
    'deposited_balance', v_profile.deposited_balance,
    'needs_username', v_profile.username IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- AUTH TOKEN FUNCTIONS
-- =============================================

-- Generate or get existing auth token for wallet (2-day expiry)
CREATE OR REPLACE FUNCTION get_or_create_auth_token(p_wallet_address TEXT)
RETURNS JSON AS $$
DECLARE
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Check for existing valid token
  SELECT token, expires_at INTO v_token, v_expires_at
  FROM public.wallet_auth_tokens 
  WHERE wallet_address = p_wallet_address AND expires_at > now();
  
  IF v_token IS NOT NULL THEN
    RETURN json_build_object('token', v_token, 'expires_at', v_expires_at);
  END IF;
  
  -- Delete expired tokens for this wallet
  DELETE FROM public.wallet_auth_tokens WHERE wallet_address = p_wallet_address;
  
  -- Generate new token (random UUID-based)
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + INTERVAL '2 days';
  
  -- Insert new token
  INSERT INTO public.wallet_auth_tokens (wallet_address, token, expires_at)
  VALUES (p_wallet_address, v_token, v_expires_at);
  
  RETURN json_build_object('token', v_token, 'expires_at', v_expires_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate auth token and return wallet address if valid
CREATE OR REPLACE FUNCTION validate_auth_token(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_wallet_address TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT wallet_address, expires_at INTO v_wallet_address, v_expires_at
  FROM public.wallet_auth_tokens 
  WHERE token = p_token AND expires_at > now();
  
  IF v_wallet_address IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid or expired token');
  END IF;
  
  RETURN json_build_object('valid', true, 'wallet_address', v_wallet_address, 'expires_at', v_expires_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS for wallet_auth_tokens
ALTER TABLE public.wallet_auth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own tokens" ON public.wallet_auth_tokens;
CREATE POLICY "Users can read own tokens" ON public.wallet_auth_tokens FOR SELECT USING (true);
