// ============================================================================
// PROCESS WITHDRAW - Sends SOL from escrow back to user's wallet
// REQUIRES AUTH TOKEN - Token must match wallet address
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from 'https://esm.sh/@solana/web3.js@1.95.8';
import { decode as decodeBase58 } from 'https://deno.land/std@0.168.0/encoding/base58.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-auth-token',
};

interface WithdrawRequest {
  wallet_address: string;
  amount: number; // SOL
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========================================
    // AUTH TOKEN VERIFICATION
    // ========================================
    const authToken = req.headers.get('x-auth-token');
    
    if (!authToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate the auth token
    const { data: tokenData, error: tokenError } = await supabase.rpc('validate_auth_token', {
      p_token: authToken,
    });

    if (tokenError || !tokenData.valid) {
      console.error('Token validation failed:', tokenError || tokenData.error);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authorizedWallet = tokenData.wallet_address;

    // ========================================
    // REQUEST VALIDATION
    // ========================================
    const { wallet_address, amount } = await req.json() as WithdrawRequest;

    // Verify wallet address matches token
    if (wallet_address !== authorizedWallet) {
      console.error(`Wallet mismatch: requested ${wallet_address}, token for ${authorizedWallet}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Wallet address does not match auth token' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate inputs
    if (!wallet_address || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Minimum withdrawal
    if (amount < 0.01) {
      return new Response(
        JSON.stringify({ success: false, error: 'Minimum withdrawal is 0.01 SOL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
    const escrowPrivateKey = Deno.env.get('ESCROW_PRIVATE_KEY');

    if (!rpcUrl || !escrowPrivateKey) {
      console.error('Missing server configuration');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First, deduct from balance (this locks the funds)
    const { data: withdrawResult, error: withdrawError } = await supabase.rpc('process_withdrawal', {
      p_wallet_address: wallet_address,
      p_amount: amount,
    });

    if (withdrawError) {
      console.error('Database error:', withdrawError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process withdrawal' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!withdrawResult.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: withdrawResult.error,
          available: withdrawResult.available,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profileId = withdrawResult.profile_id;

    // Initialize Solana connection
    const connection = new Connection(rpcUrl, 'confirmed');

    // Load escrow keypair
    const escrowKeypair = Keypair.fromSecretKey(decodeBase58(escrowPrivateKey));
    const userPubkey = new PublicKey(wallet_address);

    // Create transfer transaction
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: userPubkey,
        lamports,
      })
    );

    // Send transaction
    console.log(`Sending ${amount} SOL to ${wallet_address}`);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [escrowKeypair],
      { commitment: 'confirmed' }
    );

    console.log(`Withdrawal confirmed: ${signature}`);

    // Record the confirmed withdrawal
    await supabase.rpc('confirm_withdrawal', {
      p_profile_id: profileId,
      p_amount: amount,
      p_tx_signature: signature,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        amount,
        tx_signature: signature,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ success: false, error: 'Transaction failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
