import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MARKET_COMPASS_URL = 'https://market-compass.lovable.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const agentUserId = claimsData.claims.sub;

    const { report_id, client_identity_id, report_type } = await req.json();

    if (!report_id || !client_identity_id) {
      return new Response(JSON.stringify({ error: 'report_id and client_identity_id are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify agent owns this client association
    const { data: assoc, error: assocError } = await serviceClient
      .from('agent_clients')
      .select('id')
      .eq('agent_user_id', agentUserId)
      .eq('client_identity_id', client_identity_id)
      .maybeSingle();

    if (assocError || !assoc) {
      return new Response(JSON.stringify({ error: 'Client not linked to your account' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate a random token (32 bytes = 64 hex chars)
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const rawToken = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Hash it with SHA-256
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // The share URL uses MC's existing /share/:sessionId route
    // report_id IS the MC session ID
    const shareUrl = `${MARKET_COMPASS_URL}/share/${report_id}`;

    const { data: tokenRecord, error: tokenError } = await serviceClient
      .from('report_share_tokens')
      .insert({
        report_id,
        report_type: report_type || 'market_compass',
        client_identity_id,
        token_hash: tokenHash,
        share_url: shareUrl,
        created_by: agentUserId,
      })
      .select('id, share_url, expires_at')
      .single();

    if (tokenError) {
      console.error('Token creation error:', tokenError);
      return new Response(JSON.stringify({ error: 'Failed to create share token' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      share_url: shareUrl,
      token_id: tokenRecord.id,
      expires_at: tokenRecord.expires_at,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
