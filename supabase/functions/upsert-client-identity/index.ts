import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const { first_name, last_name, email, phone, fub_contact_id } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emailNormalized = email.trim().toLowerCase();

    // Use service role for upsert since RLS on client_identities requires agent_clients association first
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Upsert client identity
    const { data: identity, error: identityError } = await serviceClient
      .from('client_identities')
      .upsert(
        {
          email_normalized: emailNormalized,
          email_original: email.trim(),
          first_name: first_name || null,
          last_name: last_name || null,
          phone: phone || null,
        },
        { onConflict: 'email_normalized' }
      )
      .select('id')
      .single();

    if (identityError) {
      console.error('Identity upsert error:', identityError);
      return new Response(JSON.stringify({ error: 'Failed to upsert client identity' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upsert agent-client association
    const { error: assocError } = await serviceClient
      .from('agent_clients')
      .upsert(
        {
          agent_user_id: agentUserId,
          client_identity_id: identity.id,
          fub_contact_id: fub_contact_id || null,
        },
        { onConflict: 'agent_user_id,client_identity_id' }
      );

    if (assocError) {
      console.error('Agent-client association error:', assocError);
      return new Response(JSON.stringify({ error: 'Failed to link agent to client' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ client_identity_id: identity.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
