import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY");

    if (!lovableApiKey)
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), { status: 500, headers: corsHeaders });

    // Auth user
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { client_identity_id, force_refresh } = await req.json();
    if (!client_identity_id)
      return new Response(JSON.stringify({ error: "client_identity_id required" }), { status: 400, headers: corsHeaders });

    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Check for existing analysis if not forcing refresh
    if (!force_refresh) {
      const { data: existing } = await serviceClient
        .from("client_market_analyses")
        .select("*")
        .eq("agent_user_id", user.id)
        .eq("client_identity_id", client_identity_id)
        .maybeSingle();

      if (existing && existing.activity_count > 0) {
        // Return cached if less than 24h old
        const age = Date.now() - new Date(existing.updated_at).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          return new Response(JSON.stringify({ analysis: existing.analysis_json, cached: true, updated_at: existing.updated_at }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Get client identity info
    const { data: clientIdentity } = await serviceClient
      .from("client_identities")
      .select("*")
      .eq("id", client_identity_id)
      .single();

    if (!clientIdentity)
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });

    // Get agent_client link to find fub_contact_id
    const { data: agentClient } = await serviceClient
      .from("agent_clients")
      .select("fub_contact_id")
      .eq("agent_user_id", user.id)
      .eq("client_identity_id", client_identity_id)
      .maybeSingle();

    const fubContactId = agentClient?.fub_contact_id;

    // Find the lead linked to this FUB contact
    let leadData: any = null;
    let activityData: any[] = [];

    if (fubContactId) {
      const { data: lead } = await serviceClient
        .from("leads")
        .select("*")
        .eq("imported_from", `fub:${fubContactId}`)
        .eq("assigned_to_user_id", user.id)
        .maybeSingle();

      leadData = lead;

      // Get ALL FUB activity for this lead
      if (lead) {
        const { data: activity } = await serviceClient
          .from("fub_activity_log")
          .select("*")
          .eq("entity_id", lead.id)
          .eq("user_id", user.id)
          .order("occurred_at", { ascending: false })
          .limit(500);

        activityData = activity || [];
      }
    }

    // Also try matching by email if no FUB link
    if (!leadData) {
      const { data: lead } = await serviceClient
        .from("leads")
        .select("*")
        .eq("assigned_to_user_id", user.id)
        .ilike("name", `%${clientIdentity.first_name || ''}%`)
        .limit(1)
        .maybeSingle();

      leadData = lead;
    }

    // Get intel brief if exists
    let intelBrief: any = null;
    if (leadData) {
      const { data: brief } = await serviceClient
        .from("intel_briefs")
        .select("brief_json")
        .eq("entity_id", leadData.id)
        .eq("user_id", user.id)
        .maybeSingle();
      intelBrief = brief?.brief_json;
    }

    // Build context for AI
    const clientName = [clientIdentity.first_name, clientIdentity.last_name].filter(Boolean).join(" ") || clientIdentity.email_normalized;

    const communicationSummary = activityData.map(a => {
      const dir = a.direction ? ` (${a.direction})` : '';
      const preview = a.body_preview ? `: ${a.body_preview.slice(0, 300)}` : '';
      const subj = a.subject ? ` - ${a.subject}` : '';
      return `[${a.occurred_at}] ${a.activity_type}${dir}${subj}${preview}`;
    }).join("\n");

    const leadContext = leadData ? `
Lead Name: ${leadData.name}
Source: ${leadData.source}
Temperature: ${leadData.lead_temperature || 'unknown'}
Status Tags: ${(leadData.status_tags || []).join(', ') || 'none'}
Notes: ${leadData.notes || 'none'}
Created: ${leadData.created_at}
Last Contact: ${leadData.last_contact_at}
Engagement Score: ${leadData.engagement_score}
` : 'No lead record found.';

    const intelContext = intelBrief ? `
Intel Brief Data:
${JSON.stringify(intelBrief, null, 1).slice(0, 2000)}
` : '';

    const systemPrompt = `You are a real estate market intelligence analyst working inside "Deal Pilot," a CRM intelligence platform for real estate agents. Your job is to analyze ALL available communication data from Follow Up Boss (FUB) and produce a comprehensive, actionable client profile.

You must return a JSON object using the tool provided. Analyze every communication detail—emails, texts, calls, property inquiries—to extract:

1. **Buyer/Seller Profile**: Are they buying, selling, or both? What stage are they at?
2. **Property Preferences**: Type (single-family, condo, townhouse), bedrooms, bathrooms, lot size, style preferences, must-haves, deal-breakers
3. **Location Preferences**: Specific towns/neighborhoods, school districts, commute considerations, urban vs suburban
4. **Budget & Financial**: Price range, pre-approval status, down payment indicators, financing type
5. **Timeline & Urgency**: When do they need to move? Lease expiring? Life event driving the move?
6. **Communication Style**: Preferred channel, response patterns, best times to reach
7. **Key Concerns**: What worries them? Market conditions, bidding wars, interest rates?
8. **Recommended Strategy**: Specific talking points, properties to suggest, next steps

Be specific and evidence-based. Quote exact phrases from communications when possible. If data is thin, say so and suggest what questions the agent should ask next.`;

    const userPrompt = `Analyze this client's FUB data and produce a comprehensive market intelligence report.

CLIENT: ${clientName}
Email: ${clientIdentity.email_normalized}
Phone: ${clientIdentity.phone || 'unknown'}

${leadContext}

${intelContext}

COMMUNICATION HISTORY (${activityData.length} interactions):
${communicationSummary || 'No communication history available.'}

Generate the analysis now.`;

    // Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "client_market_analysis",
              description: "Return a structured client market analysis based on FUB communication data.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "2-3 sentence executive summary of the client's situation" },
                  client_type: { type: "string", enum: ["buyer", "seller", "both", "investor", "unknown"], description: "Primary client type" },
                  readiness_stage: { type: "string", enum: ["exploring", "actively_searching", "ready_to_offer", "under_contract", "unknown"], description: "How ready the client is" },
                  property_preferences: {
                    type: "object",
                    properties: {
                      property_types: { type: "array", items: { type: "string" }, description: "e.g. single-family, condo, townhouse" },
                      bedrooms: { type: "string", description: "e.g. '3-4' or '3+'" },
                      bathrooms: { type: "string", description: "e.g. '2+'" },
                      must_haves: { type: "array", items: { type: "string" }, description: "Features they must have" },
                      deal_breakers: { type: "array", items: { type: "string" }, description: "Things they won't accept" },
                      style_preferences: { type: "array", items: { type: "string" }, description: "e.g. modern, colonial, ranch" },
                    },
                  },
                  location_preferences: {
                    type: "object",
                    properties: {
                      preferred_areas: { type: "array", items: { type: "string" }, description: "Towns, neighborhoods, or areas mentioned" },
                      school_district_priority: { type: "boolean" },
                      commute_considerations: { type: "string", description: "Commute-related preferences" },
                      urban_suburban: { type: "string", enum: ["urban", "suburban", "rural", "flexible", "unknown"] },
                    },
                  },
                  budget: {
                    type: "object",
                    properties: {
                      price_range_low: { type: "number", description: "Low end of budget" },
                      price_range_high: { type: "number", description: "High end of budget" },
                      pre_approved: { type: "string", enum: ["yes", "no", "unknown"] },
                      financing_type: { type: "string", description: "e.g. conventional, FHA, VA, cash" },
                    },
                  },
                  timeline: {
                    type: "object",
                    properties: {
                      urgency: { type: "string", enum: ["urgent", "moderate", "relaxed", "unknown"] },
                      target_move_date: { type: "string", description: "When they want to move, if mentioned" },
                      driving_event: { type: "string", description: "Life event driving the move, if any" },
                    },
                  },
                  communication_insights: {
                    type: "object",
                    properties: {
                      preferred_channel: { type: "string", enum: ["text", "email", "call", "mixed"] },
                      responsiveness: { type: "string", enum: ["very_responsive", "responsive", "slow", "unresponsive", "unknown"] },
                      best_contact_time: { type: "string", description: "Best time to reach them" },
                      tone: { type: "string", description: "Their communication style/tone" },
                    },
                  },
                  key_concerns: { type: "array", items: { type: "string" }, description: "Their main worries or concerns" },
                  recommended_actions: { type: "array", items: { type: "string" }, description: "Specific next steps for the agent" },
                  suggested_questions: { type: "array", items: { type: "string" }, description: "Questions to ask the client to fill knowledge gaps" },
                  evidence_quotes: { type: "array", items: { type: "string" }, description: "Direct quotes from communications supporting the analysis" },
                  confidence_level: { type: "string", enum: ["high", "medium", "low"], description: "How confident the analysis is based on available data" },
                  data_gaps: { type: "array", items: { type: "string" }, description: "Areas where more information is needed" },
                },
                required: ["summary", "client_type", "readiness_stage", "recommended_actions", "confidence_level"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "client_market_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    let analysis: any = {};

    // Extract from tool call
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        analysis = JSON.parse(toolCall.function.arguments);
      } catch {
        analysis = { summary: "Analysis could not be parsed.", confidence_level: "low" };
      }
    }

    // Persist the analysis
    await serviceClient
      .from("client_market_analyses")
      .upsert({
        agent_user_id: user.id,
        client_identity_id,
        analysis_json: analysis,
        activity_count: activityData.length,
        model_used: "google/gemini-3-flash-preview",
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_user_id,client_identity_id" });

    return new Response(JSON.stringify({
      analysis,
      cached: false,
      activity_count: activityData.length,
      updated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("client-analysis error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
