import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer '))
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('AI gateway not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { open_house_id, visitor_ids } = await req.json();

    // Get open house info
    const { data: oh } = await serviceClient.from('open_houses')
      .select('*')
      .eq('id', open_house_id)
      .eq('user_id', user.id)
      .single();
    if (!oh) throw new Error('Open house not found');

    // Get visitors
    let query = serviceClient.from('open_house_visitors')
      .select('*')
      .eq('open_house_id', open_house_id)
      .eq('user_id', user.id);
    
    if (visitor_ids?.length) {
      query = query.in('id', visitor_ids);
    }

    const { data: visitors } = await query;
    if (!visitors?.length) throw new Error('No visitors found');

    const drafts: any[] = [];

    for (const visitor of visitors.slice(0, 10)) {
      const responses = visitor.responses as Record<string, any>;
      
      const visitorContext = `Visitor: ${visitor.full_name}
Email: ${visitor.email || 'Not provided'}
Phone: ${visitor.phone || 'Not provided'}
Property Visited: ${oh.property_address}
Visit Date: ${new Date(visitor.created_at).toLocaleDateString()}
Is Existing Contact: ${visitor.is_existing_contact ? 'Yes' : 'No'}
Working with Agent: ${responses.working_with_agent || 'Unknown'}
Buy Timeline: ${responses.buy_timeline || 'Unknown'}
Sell Timeline: ${responses.sell_timeline || 'Unknown'}
Price Range: ${responses.price_range || 'Unknown'}
Property Type: ${responses.property_type || 'Unknown'}
Areas of Interest: ${responses.areas_interest || 'Not specified'}
Selling Home: ${responses.selling_home || 'Unknown'}
Notes: ${responses.visitor_notes || 'None'}`;

      const systemPrompt = `You are a real estate agent's AI assistant. Generate a personalized follow-up email for a visitor who attended an open house.

CONTEXT:
${visitorContext}

Agent Name: ${oh.agent_name || 'The Agent'}
Agent Email: ${oh.agent_email || ''}
Agent Phone: ${oh.agent_phone || ''}

RULES:
- Keep the email under 120 words
- Reference specific details from their visit (property address, their timeline, interests)
- If they said they're NOT working with an agent, be inviting but not pushy
- If they ARE working with an agent, be professional and offer to be a resource
- If they're "just browsing", keep it light and offer to stay in touch
- If they have a near-term timeline (ASAP, 1-3 months), create urgency
- If they're also selling, mention a free market analysis
- Include a clear call to action
- Return JSON: {"subject": "...", "body": "...", "priority": "high|medium|low"}`;

      try {
        const aiRes = await fetch(AI_GATEWAY_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Generate a personalized follow-up email for ${visitor.full_name} who visited ${oh.property_address}.` },
            ],
            temperature: 0.7,
            max_tokens: 400,
          }),
        });

        if (!aiRes.ok) continue;

        const aiData = await aiRes.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        
        let draft: any;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          draft = jsonMatch ? JSON.parse(jsonMatch[0]) : { body: content, subject: `Great meeting you at ${oh.property_address}` };
        } catch {
          draft = { body: content, subject: `Great meeting you at ${oh.property_address}` };
        }

        drafts.push({
          visitor_id: visitor.id,
          visitor_name: visitor.full_name,
          visitor_email: visitor.email,
          subject: draft.subject,
          body: draft.body,
          priority: draft.priority || 'medium',
        });
      } catch (e) {
        console.error(`Failed to generate for ${visitor.full_name}:`, e);
      }
    }

    return new Response(JSON.stringify({ drafts, count: drafts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
