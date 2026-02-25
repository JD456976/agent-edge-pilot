import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-federation-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Federation API — exposes Deal Pilot data to sibling apps
 * (Market Compass, Agent Pulse) via shared FEDERATION_SECRET.
 *
 * Endpoints (via `action` field in POST body):
 *   search_clients  — fuzzy search client_identities + leads by name/email
 *   get_client       — full client context (identity, deals, activity)
 *   get_agent_summary — agent intelligence profile for a given email
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: validate FEDERATION_SECRET ---
    const federationSecret = req.headers.get('x-federation-secret');
    const expectedSecret = Deno.env.get('FEDERATION_SECRET');

    if (!expectedSecret || !federationSecret || federationSecret !== expectedSecret) {
      return json({ error: 'Unauthorized: invalid federation secret' }, 401);
    }

    const body = await req.json();
    const { action, agent_email, ...params } = body;

    if (!agent_email || typeof agent_email !== 'string') {
      return json({ error: 'agent_email is required' }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Resolve agent user_id from email in profiles
    const { data: agentProfile, error: profileErr } = await serviceClient
      .from('profiles')
      .select('user_id, name, email')
      .eq('email', agent_email.trim().toLowerCase())
      .maybeSingle();

    if (profileErr || !agentProfile) {
      return json({ error: 'Agent not found in Deal Pilot. Ensure the same email is used across apps.' }, 404);
    }

    const agentUserId = agentProfile.user_id;

    switch (action) {
      case 'search_clients':
        return await handleSearchClients(serviceClient, agentUserId, params);
      case 'get_client':
        return await handleGetClient(serviceClient, agentUserId, params);
      case 'get_agent_summary':
        return await handleGetAgentSummary(serviceClient, agentUserId, agentProfile);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('Federation API error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

// --- Handlers ---

async function handleSearchClients(
  client: ReturnType<typeof createClient>,
  agentUserId: string,
  params: { query?: string; limit?: number }
) {
  const query = (params.query || '').trim().toLowerCase();
  if (query.length < 2) {
    return json({ error: 'Query must be at least 2 characters' }, 400);
  }

  const limit = Math.min(params.limit || 20, 50);

  // Search across client_identities linked to this agent + leads
  const [identitiesRes, leadsRes] = await Promise.all([
    // Search client identities by normalized email or name
    client
      .from('agent_clients')
      .select('client_identity_id, fub_contact_id, client_identities!inner(id, first_name, last_name, email_normalized, email_original, phone)')
      .eq('agent_user_id', agentUserId)
      .or(`email_normalized.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`, { referencedTable: 'client_identities' })
      .limit(limit),

    // Also search leads by name
    client
      .from('leads')
      .select('id, name, source, engagement_score, lead_temperature, last_contact_at, status_tags')
      .eq('assigned_to_user_id', agentUserId)
      .ilike('name', `%${query}%`)
      .limit(limit),
  ]);

  const clients = (identitiesRes.data || []).map((row: any) => ({
    client_identity_id: row.client_identity_id,
    fub_contact_id: row.fub_contact_id,
    first_name: row.client_identities?.first_name,
    last_name: row.client_identities?.last_name,
    email: row.client_identities?.email_original || row.client_identities?.email_normalized,
    phone: row.client_identities?.phone,
    source: 'deal_pilot_identity',
  }));

  const leads = (leadsRes.data || []).map((lead: any) => ({
    lead_id: lead.id,
    name: lead.name,
    source: lead.source,
    engagement_score: lead.engagement_score,
    temperature: lead.lead_temperature,
    last_contact_at: lead.last_contact_at,
    status_tags: lead.status_tags,
    source_type: 'deal_pilot_lead',
  }));

  return json({ clients, leads, total: clients.length + leads.length });
}

async function handleGetClient(
  client: ReturnType<typeof createClient>,
  agentUserId: string,
  params: { client_identity_id?: string; email?: string }
) {
  let clientIdentityId = params.client_identity_id;

  // If email provided, resolve to identity
  if (!clientIdentityId && params.email) {
    const normalized = params.email.trim().toLowerCase();
    const { data } = await client
      .from('client_identities')
      .select('id')
      .eq('email_normalized', normalized)
      .maybeSingle();
    clientIdentityId = data?.id;
  }

  if (!clientIdentityId) {
    return json({ error: 'Client not found' }, 404);
  }

  // Verify agent has access
  const { data: assoc } = await client
    .from('agent_clients')
    .select('id')
    .eq('agent_user_id', agentUserId)
    .eq('client_identity_id', clientIdentityId)
    .maybeSingle();

  if (!assoc) {
    return json({ error: 'Client not linked to this agent' }, 403);
  }

  // Get full client context
  const [identityRes, dealsRes, activityRes, analysisRes] = await Promise.all([
    client
      .from('client_identities')
      .select('*')
      .eq('id', clientIdentityId)
      .single(),
    client
      .from('deals')
      .select('id, title, stage, price, commission_amount, close_date, risk_level, side, closed_at, cancelled_at')
      .eq('assigned_to_user_id', agentUserId)
      .order('close_date', { ascending: false })
      .limit(20),
    client
      .from('activity_events')
      .select('touch_type, entity_type, note, created_at')
      .eq('user_id', agentUserId)
      .order('created_at', { ascending: false })
      .limit(30),
    client
      .from('client_market_analyses')
      .select('analysis_json, activity_count, updated_at')
      .eq('agent_user_id', agentUserId)
      .eq('client_identity_id', clientIdentityId)
      .maybeSingle(),
  ]);

  return json({
    identity: identityRes.data,
    deals: dealsRes.data || [],
    recent_activity: activityRes.data || [],
    market_analysis: analysisRes.data,
  });
}

async function handleGetAgentSummary(
  client: ReturnType<typeof createClient>,
  agentUserId: string,
  agentProfile: { user_id: string; name: string; email: string }
) {
  const [profileRes, commissionRes, dealsRes] = await Promise.all([
    client
      .from('agent_intelligence_profile')
      .select('*')
      .eq('user_id', agentUserId)
      .maybeSingle(),
    client
      .from('commission_defaults')
      .select('*')
      .eq('user_id', agentUserId)
      .maybeSingle(),
    client
      .from('deals')
      .select('id, stage, price, commission_amount, close_date, risk_level')
      .eq('assigned_to_user_id', agentUserId)
      .in('stage', ['offer', 'under_contract', 'pending'])
      .limit(50),
  ]);

  return json({
    agent: {
      name: agentProfile.name,
      email: agentProfile.email,
    },
    intelligence_profile: profileRes.data,
    commission_defaults: commissionRes.data,
    active_pipeline: dealsRes.data || [],
    pipeline_count: (dealsRes.data || []).length,
    pipeline_value: (dealsRes.data || []).reduce((sum: number, d: any) => sum + (d.price || 0), 0),
  });
}

// --- Helpers ---

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
