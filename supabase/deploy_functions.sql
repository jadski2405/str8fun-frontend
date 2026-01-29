-- =============================================
-- STR8.FUN DATABASE FUNCTIONS
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- PROFILES TABLE (if not exists)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  deposited_balance NUMERIC(20, 9) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read profiles (drop if exists first)
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
CREATE POLICY "Anyone can read profiles" ON public.profiles
  FOR SELECT USING (true);

-- =============================================
-- GET PROFILE WITH USERNAME FUNCTION
-- =============================================
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
-- CHECK USERNAME AVAILABLE FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT)
RETURNS JSON AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Validate length
  IF LENGTH(p_username) < 1 OR LENGTH(p_username) > 20 THEN
    RETURN json_build_object('valid', false, 'error', 'Username must be 1-20 characters');
  END IF;
  
  -- Validate characters (alphanumeric only)
  IF p_username !~ '^[a-zA-Z0-9]+$' THEN
    RETURN json_build_object('valid', false, 'error', 'Letters and numbers only');
  END IF;
  
  -- Check if exists (case insensitive)
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(p_username)) INTO v_exists;
  
  IF v_exists THEN
    RETURN json_build_object('valid', false, 'error', 'Username already taken');
  END IF;
  
  RETURN json_build_object('valid', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SET USERNAME FUNCTION
-- =============================================
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

-- =============================================
-- DEPOSITS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  amount NUMERIC(20, 9) NOT NULL,
  tx_signature TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

-- Allow reading deposits
DROP POLICY IF EXISTS "Anyone can read deposits" ON public.deposits;
CREATE POLICY "Anyone can read deposits" ON public.deposits FOR SELECT USING (true);

-- Allow inserting deposits (for service role)
DROP POLICY IF EXISTS "Service can insert deposits" ON public.deposits;
CREATE POLICY "Service can insert deposits" ON public.deposits FOR INSERT WITH CHECK (true);

-- =============================================
-- ALLOW PROFILE INSERTS AND UPDATES
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert profiles" ON public.profiles;
CREATE POLICY "Anyone can insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
CREATE POLICY "Anyone can update profiles" ON public.profiles FOR UPDATE USING (true);

-- =============================================
-- RELOAD SCHEMA CACHE
-- =============================================
NOTIFY pgrst, 'reload schema';

-- =============================================
-- SUCCESS MESSAGE
-- =============================================
SELECT 'All functions and tables deployed successfully!' as status;
