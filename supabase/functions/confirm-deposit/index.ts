// ============================================================================
// CONFIRM DEPOSIT - Verifies on-chain tx and credits user balance
// Called after user sends SOL to escrow from their wallet
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from 'https://esm.sh/@solana/web3.js@1.95.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DepositRequest {
  wallet_address: string;
  tx_signature: string;
  expected_amount: number; // SOL
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet_address, tx_signature, expected_amount } = await req.json() as DepositRequest;

    // Validate inputs
    if (!wallet_address || !tx_signature || !expected_amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
    const escrowWallet = Deno.env.get('ESCROW_WALLET_ADDRESS') || 'DdGmjNhA5qQp4ABTSG1BwpQjZNLkYEgxRLcBtJTaKRwr';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!rpcUrl) {
      console.error('Missing SOLANA_RPC_URL');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Solana connection
    const connection = new Connection(rpcUrl, 'confirmed');

    // Fetch and verify the transaction
    console.log(`Verifying transaction: ${tx_signature}`);
    
    const tx = await connection.getParsedTransaction(tx_signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tx.meta?.err) {
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction failed on-chain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the transfer
    // Look for a transfer from wallet_address to escrow
    let depositAmount = 0;
    let fromWalletVerified = false;
    let toEscrowVerified = false;

    const escrowPubkey = new PublicKey(escrowWallet);
    const userPubkey = new PublicKey(wallet_address);

    // Check pre/post balances to find the transfer amount
    const accountKeys = tx.transaction.message.accountKeys;
    const preBalances = tx.meta.preBalances;
    const postBalances = tx.meta.postBalances;

    for (let i = 0; i < accountKeys.length; i++) {
      const account = accountKeys[i];
      const pubkey = account.pubkey.toString();
      
      if (pubkey === escrowWallet) {
        // Escrow received funds
        const received = (postBalances[i] - preBalances[i]) / LAMPORTS_PER_SOL;
        if (received > 0) {
          depositAmount = received;
          toEscrowVerified = true;
        }
      }
      
      if (pubkey === wallet_address) {
        // User sent funds (balance decreased)
        const sent = (preBalances[i] - postBalances[i]) / LAMPORTS_PER_SOL;
        if (sent > 0) {
          fromWalletVerified = true;
        }
      }
    }

    if (!toEscrowVerified || !fromWalletVerified) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Transaction does not contain valid transfer to escrow from specified wallet' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify amount matches (with small tolerance for fees)
    const tolerance = 0.001; // 0.001 SOL tolerance
    if (Math.abs(depositAmount - expected_amount) > tolerance) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Amount mismatch. Expected ${expected_amount}, got ${depositAmount}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this transaction was already processed
    const { data: existingDeposit } = await supabase
      .from('deposits')
      .select('id')
      .eq('tx_signature', tx_signature)
      .maybeSingle();

    if (existingDeposit) {
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction already processed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create the user's profile
    let { data: profile } = await supabase
      .from('profiles')
      .select('id, deposited_balance')
      .eq('wallet_address', wallet_address)
      .maybeSingle();

    if (!profile) {
      // Create profile if doesn't exist
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({ wallet_address, deposited_balance: 0 })
        .select('id, deposited_balance')
        .single();
      
      if (createError) {
        console.error('Failed to create profile:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create user profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      profile = newProfile;
    }

    // Calculate new balance
    const currentBalance = Number(profile.deposited_balance) || 0;
    const newBalance = currentBalance + depositAmount;

    // Update the user's deposited balance
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ deposited_balance: newBalance })
      .eq('wallet_address', wallet_address);

    if (updateError) {
      console.error('Failed to update balance:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to credit balance' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record the deposit transaction
    const { error: depositError } = await supabase
      .from('deposits')
      .insert({
        wallet_address,
        amount: depositAmount,
        tx_signature,
        status: 'confirmed',
      });

    if (depositError) {
      console.log('Could not record deposit:', depositError);
      // Don't fail - balance was already updated
    }

    console.log(`Deposit confirmed: ${depositAmount} SOL for ${wallet_address}. New balance: ${newBalance}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        amount: depositAmount,
        new_balance: newBalance,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
