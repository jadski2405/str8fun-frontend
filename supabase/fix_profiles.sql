-- =============================================
-- FIX PROFILES TABLE AND RLS
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Create profiles table if not exists
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  deposited_balance NUMERIC(20, 9) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Drop all existing policies
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 4. Create permissive policies (allow all operations for now)
CREATE POLICY "Public read access" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access" ON public.profiles FOR UPDATE USING (true);

-- 5. Create game_rounds table if not exists
CREATE TABLE IF NOT EXISTS public.game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  house_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 2.0,
  pool_sol_balance DECIMAL(20, 9) DEFAULT 0,
  pool_token_supply DECIMAL(20, 9) DEFAULT 1000000,
  current_price DECIMAL(20, 9) DEFAULT 0.000001,
  accumulated_fees DECIMAL(20, 9) DEFAULT 0,
  forfeited_sol DECIMAL(20, 9) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  settlement_tx_signature TEXT
);

-- Enable RLS on game_rounds
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read game rounds" ON public.game_rounds;
DROP POLICY IF EXISTS "Anyone can insert game rounds" ON public.game_rounds;
DROP POLICY IF EXISTS "Anyone can update game rounds" ON public.game_rounds;
CREATE POLICY "Anyone can read game rounds" ON public.game_rounds FOR SELECT USING (true);
CREATE POLICY "Anyone can insert game rounds" ON public.game_rounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update game rounds" ON public.game_rounds FOR UPDATE USING (true);

-- 6. Create deposits table
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  amount NUMERIC(20, 9) NOT NULL,
  tx_signature TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read deposits" ON public.deposits;
DROP POLICY IF EXISTS "Service can insert deposits" ON public.deposits;
CREATE POLICY "Anyone can read deposits" ON public.deposits FOR SELECT USING (true);
CREATE POLICY "Service can insert deposits" ON public.deposits FOR INSERT WITH CHECK (true);

-- 7. Reload schema cache
NOTIFY pgrst, 'reload schema';

-- 8. Test: Check if your profile exists (replace with your actual wallet address)
-- SELECT * FROM profiles;

-- 9. If you want to reset a profile's username for testing:
-- UPDATE profiles SET username = NULL WHERE wallet_address = 'YOUR_WALLET_ADDRESS';

SELECT 'Profiles table and RLS policies configured successfully!' as status;
