// ============================================================================
// PAYOUT SELL - Supabase Edge Function
// Sends SOL from escrow back to player wallet on sell
// ============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from 'https://esm.sh/@solana/web3.js@1.95.8';
import bs58 from 'https://esm.sh/bs58@5.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PayoutRequest {
  profileId: string;
  solAmount: number;
  tradeId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { profileId, solAmount, tradeId }: PayoutRequest = await req.json();

    // Validation
    if (!profileId || !solAmount || solAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid payout request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get player wallet address
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get config
    const escrowPrivateKey = Deno.env.get('ESCROW_PRIVATE_KEY');
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL');

    if (!escrowPrivateKey || !rpcUrl) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create and send transaction
    const connection = new Connection(rpcUrl, 'confirmed');
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKey));
    const playerPubkey = new PublicKey(profile.wallet_address);

    // Check escrow balance
    const escrowBalance = await connection.getBalance(escrowKeypair.publicKey);
    const lamportsToSend = Math.floor(solAmount * LAMPORTS_PER_SOL);

    if (escrowBalance < lamportsToSend + 5000) { // 5000 lamports for fees
      return new Response(
        JSON.stringify({ error: 'Insufficient escrow balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: playerPubkey,
        lamports: lamportsToSend,
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = escrowKeypair.publicKey;

    tx.sign(escrowKeypair);
    const signature = await connection.sendRawTransaction(tx.serialize());

    // Wait for confirmation
    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature,
    });

    // Update trade with payout tx signature
    if (tradeId) {
      await supabase.from('trades').update({
        tx_signature: signature,
      }).eq('id', tradeId);
    }

    console.log(`Payout sent: ${solAmount} SOL to ${profile.wallet_address} | TX: ${signature}`);

    return new Response(
      JSON.stringify({
        success: true,
        signature,
        amount: solAmount,
        recipient: profile.wallet_address,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Payout error:', error);
    return new Response(
      JSON.stringify({ error: 'Payout failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
