import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { intake_token, full_name, email, phone, responses } = await req.json();

    if (!intake_token || !full_name?.trim()) {
      return new Response(JSON.stringify({ error: 'Name and token are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Look up the open house
    const { data: oh, error: ohErr } = await supabase
      .from('open_houses')
      .select('*')
      .eq('intake_token', intake_token)
      .eq('status', 'active')
      .maybeSingle();

    if (ohErr || !oh) {
      return new Response(JSON.stringify({ error: 'Invalid or expired open house link' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check FUB integration for this user
    let isExisting = false;
    let fubContactId: string | null = null;
    let fubMatchStatus = 'no_integration';

    const encKey = Deno.env.get('FUB_ENCRYPTION_KEY');
    if (encKey) {
      const { data: apiKey } = await supabase.rpc('get_decrypted_api_key', {
        p_user_id: oh.user_id,
        p_encryption_key: encKey,
      });

      if (apiKey) {
        // Search FUB for existing contact
        try {
          const searchParams = new URLSearchParams();
          if (email) searchParams.set('email', email);
          
          const fubRes = await fetch(`https://api.followupboss.com/v1/people?${searchParams.toString()}`, {
            headers: { 'Authorization': `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
          });

          if (fubRes.ok) {
            const fubData = await fubRes.json();
            if (fubData.people && fubData.people.length > 0) {
              isExisting = true;
              fubContactId = String(fubData.people[0].id);
              fubMatchStatus = 'existing';

              // Add note to existing contact
              await fetch('https://api.followupboss.com/v1/notes', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  personId: fubData.people[0].id,
                  subject: `Open House Visit - ${oh.property_address}`,
                  body: `Visited open house at ${oh.property_address} on ${new Date().toLocaleDateString()}.\n\nResponses:\n${Object.entries(responses || {}).filter(([k]) => !['full_name', 'email', 'phone'].includes(k)).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`,
                }),
              });

              // Add tag
              await fetch(`https://api.followupboss.com/v1/people/${fubData.people[0].id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tags: [...(fubData.people[0].tags || []), `Open House - ${oh.property_address}`],
                }),
              });
            } else {
              // Create new contact in FUB
              fubMatchStatus = 'new';
              const createRes = await fetch('https://api.followupboss.com/v1/people', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  firstName: full_name.split(' ')[0],
                  lastName: full_name.split(' ').slice(1).join(' ') || '',
                  emails: email ? [{ value: email }] : [],
                  phones: phone ? [{ value: phone }] : [],
                  tags: [`Open House - ${oh.property_address}`],
                  source: 'Open House',
                }),
              });

              if (createRes.ok) {
                const created = await createRes.json();
                fubContactId = String(created.id);

                // Add note with responses
                if (created.id) {
                  await fetch('https://api.followupboss.com/v1/notes', {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      personId: created.id,
                      subject: `Open House Visit - ${oh.property_address}`,
                      body: `Visited open house at ${oh.property_address} on ${new Date().toLocaleDateString()}.\n\nResponses:\n${Object.entries(responses || {}).filter(([k]) => !['full_name', 'email', 'phone'].includes(k)).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`,
                    }),
                  });
                }
              }
            }
          }
        } catch (fubErr) {
          console.error('FUB integration error:', fubErr);
          fubMatchStatus = 'error';
        }
      }
    }

    // Save visitor record
    const { error: visErr } = await supabase.from('open_house_visitors').insert({
      open_house_id: oh.id,
      user_id: oh.user_id,
      full_name: full_name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      responses: responses || {},
      is_existing_contact: isExisting,
      fub_contact_id: fubContactId,
      fub_match_status: fubMatchStatus,
    });

    if (visErr) {
      console.error('Visitor insert error:', visErr);
      return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      is_existing: isExisting,
      fub_match_status: fubMatchStatus,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Submission error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
