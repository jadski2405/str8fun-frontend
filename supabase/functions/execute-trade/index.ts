// ============================================================================
// EXECUTE TRADE - Supabase Edge Function
// Handles buy/sell trades with server-side validation
// ============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Constants
const MIN_TRADE_SOL = 0.01;
const HOUSE_FEE_PERCENT = 2;
const INITIAL_TOKEN_SUPPLY = 1_000_000;
const BASE_PRICE = 0.000001;

interface TradeRequest {
  roundId: string;
  profileId: string;
  tradeType: 'buy' | 'sell';
  solAmount: number;
  txSignature?: string;
}

// Calculate tokens for SOL (buy)
function calculateBuy(poolSol: number, tokenSupply: number, solAmount: number) {
  const fee = solAmount * (HOUSE_FEE_PERCENT / 100);
  const netSolIn = solAmount - fee;

  if (poolSol <= 0) {
    // First buy - use base price
    const tokensOut = netSolIn / BASE_PRICE;
    const newPoolSol = netSolIn;
    const newTokenSupply = INITIAL_TOKEN_SUPPLY - tokensOut;
    const newPrice = newPoolSol / newTokenSupply;
    return { fee, netSolIn, tokensOut, newPoolSol, newTokenSupply, newPrice };
  }

  // Constant product AMM
  const k = poolSol * tokenSupply;
  const newPoolSol = poolSol + netSolIn;
  const newTokenSupply = k / newPoolSol;
  const tokensOut = tokenSupply - newTokenSupply;
  const newPrice = newPoolSol / newTokenSupply;

  return { fee, netSolIn, tokensOut, newPoolSol, newTokenSupply, newPrice };
}

// Calculate SOL for tokens (sell)
function calculateSell(poolSol: number, tokenSupply: number, tokenAmount: number) {
  if (poolSol <= 0) throw new Error('No liquidity');

  const k = poolSol * tokenSupply;
  const newTokenSupply = tokenSupply + tokenAmount;
  const newPoolSol = k / newTokenSupply;
  const grossSolOut = poolSol - newPoolSol;
  const fee = grossSolOut * (HOUSE_FEE_PERCENT / 100);
  const netSolOut = grossSolOut - fee;
  const newPrice = newPoolSol / newTokenSupply;

  return { fee, grossSolOut, netSolOut, newPoolSol, newTokenSupply, newPrice };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { roundId, profileId, tradeType, solAmount, txSignature }: TradeRequest = await req.json();

    // Validation
    if (!roundId || !profileId || !tradeType || !solAmount) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (solAmount < MIN_TRADE_SOL) {
      return new Response(
        JSON.stringify({ error: `Minimum trade is ${MIN_TRADE_SOL} SOL`, code: 'MIN_TRADE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current round state
    const { data: round, error: roundError } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return new Response(
        JSON.stringify({ error: 'Round not found', code: 'ROUND_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (round.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Round is not active', code: 'ROUND_NOT_ACTIVE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check round hasn't expired
    const startedAt = new Date(round.started_at);
    const elapsed = (Date.now() - startedAt.getTime()) / 1000;
    if (elapsed >= round.duration_seconds) {
      return new Response(
        JSON.stringify({ error: 'Round has ended', code: 'ROUND_ENDED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get player position
    const { data: position } = await supabase
      .from('player_positions')
      .select('*')
      .eq('round_id', roundId)
      .eq('profile_id', profileId)
      .single();

    const poolSol = Number(round.pool_sol_balance) || 0;
    const tokenSupply = Number(round.pool_token_supply) || INITIAL_TOKEN_SUPPLY;
    const playerTokens = Number(position?.token_balance) || 0;

    let result: any;
    let tradeData: any;

    if (tradeType === 'buy') {
      // Execute buy
      result = calculateBuy(poolSol, tokenSupply, solAmount);
      
      tradeData = {
        round_id: roundId,
        profile_id: profileId,
        trade_type: 'buy',
        sol_amount: solAmount,
        fee_amount: result.fee,
        net_amount: result.netSolIn,
        token_amount: result.tokensOut,
        price_at_trade: poolSol > 0 ? poolSol / tokenSupply : BASE_PRICE,
        tx_signature: txSignature,
      };

      // Update pool
      await supabase.from('game_rounds').update({
        pool_sol_balance: result.newPoolSol,
        pool_token_supply: result.newTokenSupply,
        current_price: result.newPrice,
        accumulated_fees: Number(round.accumulated_fees) + result.fee,
      }).eq('id', roundId);

      // Upsert player position
      await supabase.from('player_positions').upsert({
        round_id: roundId,
        profile_id: profileId,
        token_balance: playerTokens + result.tokensOut,
        total_sol_in: Number(position?.total_sol_in || 0) + solAmount,
        total_fees_paid: Number(position?.total_fees_paid || 0) + result.fee,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'round_id,profile_id' });

    } else {
      // Execute sell
      // Calculate tokens needed for the requested SOL value
      const currentPrice = poolSol / tokenSupply;
      let tokensToSell = solAmount / currentPrice;

      if (tokensToSell > playerTokens) {
        return new Response(
          JSON.stringify({ error: 'Insufficient tokens', code: 'INSUFFICIENT_TOKENS' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      result = calculateSell(poolSol, tokenSupply, tokensToSell);

      tradeData = {
        round_id: roundId,
        profile_id: profileId,
        trade_type: 'sell',
        sol_amount: result.grossSolOut,
        fee_amount: result.fee,
        net_amount: result.netSolOut,
        token_amount: tokensToSell,
        price_at_trade: currentPrice,
      };

      // Update pool
      await supabase.from('game_rounds').update({
        pool_sol_balance: result.newPoolSol,
        pool_token_supply: result.newTokenSupply,
        current_price: result.newPrice,
        accumulated_fees: Number(round.accumulated_fees) + result.fee,
      }).eq('id', roundId);

      // Update player position
      await supabase.from('player_positions').update({
        token_balance: playerTokens - tokensToSell,
        total_sol_out: Number(position?.total_sol_out || 0) + result.netSolOut,
        total_fees_paid: Number(position?.total_fees_paid || 0) + result.fee,
        updated_at: new Date().toISOString(),
      }).eq('round_id', roundId).eq('profile_id', profileId);

      // TODO: Send SOL from escrow to player wallet
      // This requires the escrow private key and a Solana transaction
    }

    // Record trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert(tradeData)
      .select()
      .single();

    if (tradeError) {
      console.error('Error recording trade:', tradeError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        trade,
        newPrice: result.newPrice,
        newPoolBalance: result.newPoolSol,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Trade execution error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
