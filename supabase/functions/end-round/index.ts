// ============================================================================
// END ROUND - Supabase Edge Function
// Ends a round, forfeits remaining positions, pays house
// ============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from 'https://esm.sh/@solana/web3.js@1.95.8';
import bs58 from 'https://esm.sh/bs58@5.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { roundId } = await req.json();

    if (!roundId) {
      return new Response(
        JSON.stringify({ error: 'Missing roundId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get round
    const { data: round, error: roundError } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return new Response(
        JSON.stringify({ error: 'Round not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (round.status === 'completed') {
      return new Response(
        JSON.stringify({ error: 'Round already completed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all players with remaining positions
    const { data: positions, error: posError } = await supabase
      .from('player_positions')
      .select('*, profiles(wallet_address)')
      .eq('round_id', roundId)
      .gt('token_balance', 0);

    if (posError) {
      console.error('Error fetching positions:', posError);
    }

    const poolSol = Number(round.pool_sol_balance) || 0;
    const tokenSupply = Number(round.pool_token_supply) || 1_000_000;
    const accumulatedFees = Number(round.accumulated_fees) || 0;

    // Calculate forfeited value
    let totalForfeited = 0;
    const forfeitures: any[] = [];

    for (const pos of (positions || [])) {
      const tokens = Number(pos.token_balance);
      if (tokens <= 0) continue;

      // Calculate SOL value of forfeited tokens
      const k = poolSol * tokenSupply;
      const newTokenSupply = tokenSupply + tokens;
      const newPoolSol = k / newTokenSupply;
      const forfeitedValue = poolSol - newPoolSol;

      totalForfeited += forfeitedValue;

      forfeitures.push({
        round_id: roundId,
        profile_id: pos.profile_id,
        tokens_forfeited: tokens,
        sol_value_forfeited: forfeitedValue,
      });
    }

    // Record forfeitures
    if (forfeitures.length > 0) {
      await supabase.from('forfeitures').insert(forfeitures);
    }

    // Calculate total house earnings
    const totalToHouse = accumulatedFees + totalForfeited;

    // Send to house wallet if we have funds and config
    const houseWallet = Deno.env.get('HOUSE_WALLET_ADDRESS');
    const escrowPrivateKey = Deno.env.get('ESCROW_PRIVATE_KEY');
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL');

    let txSignature = '';

    if (totalToHouse > 0 && houseWallet && escrowPrivateKey && rpcUrl) {
      try {
        const connection = new Connection(rpcUrl, 'confirmed');
        const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKey));

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: escrowKeypair.publicKey,
            toPubkey: new PublicKey(houseWallet),
            lamports: Math.floor(totalToHouse * LAMPORTS_PER_SOL),
          })
        );

        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = escrowKeypair.publicKey;

        tx.sign(escrowKeypair);
        txSignature = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(txSignature);

        console.log(`House payout tx: ${txSignature}`);
      } catch (err) {
        console.error('Error sending house payout:', err);
      }
    }

    // Record settlement
    await supabase.from('round_settlements').insert({
      round_id: roundId,
      accumulated_fees: accumulatedFees,
      forfeited_sol: totalForfeited,
      total_to_house: totalToHouse,
      tx_signature: txSignature || 'pending',
    });

    // Mark round as completed
    await supabase.from('game_rounds').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      forfeited_sol: totalForfeited,
      settlement_tx_signature: txSignature || null,
    }).eq('id', roundId);

    return new Response(
      JSON.stringify({
        success: true,
        forfeitures: forfeitures.length,
        totalForfeited,
        accumulatedFees,
        totalToHouse,
        txSignature,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('End round error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
