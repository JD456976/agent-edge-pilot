import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Deterministic client analysis built entirely from FUB activity data – no AI involved. */

interface ActivityRow {
  activity_type: string;
  direction: string | null;
  body_preview: string | null;
  subject: string | null;
  occurred_at: string;
}

function analyzeActivities(activities: ActivityRow[], leadData: any, clientIdentity: any) {
  const now = Date.now();

  // --- Communication channel breakdown ---
  const channelCounts: Record<string, number> = { text: 0, email: 0, call: 0, other: 0 };
  for (const a of activities) {
    const t = (a.activity_type || "").toLowerCase();
    if (t.includes("text") || t.includes("sms")) channelCounts.text++;
    else if (t.includes("email") || t.includes("mail")) channelCounts.email++;
    else if (t.includes("call") || t.includes("phone")) channelCounts.call++;
    else channelCounts.other++;
  }
  const total = activities.length || 1;
  const preferred_channel =
    channelCounts.text >= channelCounts.email && channelCounts.text >= channelCounts.call
      ? "text"
      : channelCounts.email >= channelCounts.call
      ? "email"
      : "call";

  // --- Responsiveness / cadence ---
  const timestamps = activities.map((a) => new Date(a.occurred_at).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) gaps.push(timestamps[i] - timestamps[i - 1]);
  const avgGapMs = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
  const avgGapDays = avgGapMs / (1000 * 60 * 60 * 24);

  const inbound = activities.filter((a) => a.direction === "incoming" || a.direction === "inbound");
  const outbound = activities.filter((a) => a.direction === "outgoing" || a.direction === "outbound");
  const responsiveness =
    inbound.length > outbound.length * 1.2
      ? "very_responsive"
      : inbound.length > outbound.length * 0.5
      ? "responsive"
      : inbound.length > 0
      ? "slow"
      : "unknown";

  // --- Keyword extraction from body previews ---
  const allText = activities
    .map((a) => `${a.subject || ""} ${a.body_preview || ""}`)
    .join(" ")
    .toLowerCase();

  // Property type signals
  const propertyTypes: string[] = [];
  if (/\bcondo\b/.test(allText)) propertyTypes.push("condo");
  if (/\btownho(me|use)\b/.test(allText)) propertyTypes.push("townhouse");
  if (/\bsingle[- ]?family\b/.test(allText)) propertyTypes.push("single-family");
  if (/\bmulti[- ]?family\b/.test(allText)) propertyTypes.push("multi-family");
  if (/\bland\b/.test(allText)) propertyTypes.push("land");
  if (/\bfarm\b/.test(allText)) propertyTypes.push("farm/ranch");
  if (propertyTypes.length === 0) propertyTypes.push("not specified");

  // Bedroom signals
  let bedrooms = "not specified";
  const bedMatch = allText.match(/(\d)\s*(?:bed|br|bedroom)/);
  if (bedMatch) bedrooms = `${bedMatch[1]}+`;

  // Budget signals
  let priceLow: number | null = null;
  let priceHigh: number | null = null;
  const priceMatches = allText.match(/\$\s*([\d,.]+)\s*k?/g);
  if (priceMatches) {
    const values = priceMatches.map((m) => {
      let v = parseFloat(m.replace(/[$,]/g, ""));
      if (v < 1000) v *= 1000; // e.g. $350k
      return v;
    }).filter((v) => v >= 50000 && v <= 50000000);
    if (values.length) {
      priceLow = Math.min(...values);
      priceHigh = Math.max(...values);
    }
  }

  // Location signals
  const preferredAreas: string[] = [];
  // Look for common location patterns: "in <place>", "near <place>", "<place> area"
  const locationPatterns = allText.match(/(?:in|near|around|looking at)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g);
  if (locationPatterns) {
    for (const lp of locationPatterns) {
      const area = lp.replace(/^(?:in|near|around|looking at)\s+/i, "").trim();
      if (area.length > 2 && !preferredAreas.includes(area)) preferredAreas.push(area);
    }
  }

  // Client type
  const buyerSignals = (allText.match(/\b(buy|purchase|offer|pre-approv|mortgage|loan|looking for|house hunt)/g) || []).length;
  const sellerSignals = (allText.match(/\b(sell|list|listing|market value|comp|cma|asking price)/g) || []).length;
  const clientType =
    buyerSignals > 0 && sellerSignals > 0
      ? "both"
      : buyerSignals > sellerSignals
      ? "buyer"
      : sellerSignals > 0
      ? "seller"
      : "unknown";

  // Readiness
  const urgentSignals = (allText.match(/\b(asap|urgent|lease expir|relocat|must move|deadline)/g) || []).length;
  const activeSignals = (allText.match(/\b(showing|tour|open house|visit|walk.?through|schedule)/g) || []).length;
  const offerSignals = (allText.match(/\b(offer|bid|counter|earnest|escrow|under contract)/g) || []).length;
  const readinessStage =
    offerSignals > 0
      ? "ready_to_offer"
      : activeSignals > 2
      ? "actively_searching"
      : activities.length > 5
      ? "exploring"
      : "unknown";

  // Timeline
  const urgency = urgentSignals > 0 ? "urgent" : activeSignals > 3 ? "moderate" : "relaxed";

  // Key concerns
  const concerns: string[] = [];
  if (/interest rate/.test(allText)) concerns.push("Interest rates");
  if (/bidding war/.test(allText)) concerns.push("Bidding wars / competition");
  if (/inventory|supply/.test(allText)) concerns.push("Low inventory");
  if (/school/.test(allText)) concerns.push("School district quality");
  if (/commute|drive|transit/.test(allText)) concerns.push("Commute / transportation");
  if (/budget|afford/.test(allText)) concerns.push("Affordability");
  if (/closing cost/.test(allText)) concerns.push("Closing costs");

  // Pre-approval
  const preApproved = /pre.?approv/.test(allText) ? "yes" : "unknown";
  const financingType = /\bfha\b/.test(allText)
    ? "FHA"
    : /\bva\b/.test(allText)
    ? "VA"
    : /\bcash\b/.test(allText)
    ? "cash"
    : /\bconventional\b/.test(allText)
    ? "conventional"
    : "not specified";

  // Must-haves & deal-breakers
  const mustHaves: string[] = [];
  const dealBreakers: string[] = [];
  if (/garage/.test(allText)) mustHaves.push("garage");
  if (/pool/.test(allText)) mustHaves.push("pool");
  if (/yard|backyard/.test(allText)) mustHaves.push("yard/outdoor space");
  if (/basement/.test(allText)) mustHaves.push("basement");
  if (/no hoa|hate hoa/.test(allText)) dealBreakers.push("HOA");
  if (/no pool/.test(allText)) dealBreakers.push("pool");

  // Recommended next actions
  const recommendedActions: string[] = [];
  if (clientType === "unknown") recommendedActions.push("Ask if they are looking to buy, sell, or both");
  if (priceLow === null) recommendedActions.push("Confirm their budget range");
  if (preApproved === "unknown" && clientType !== "seller") recommendedActions.push("Ask about pre-approval status");
  if (preferredAreas.length === 0) recommendedActions.push("Discuss preferred neighborhoods / areas");
  if (bedrooms === "not specified") recommendedActions.push("Clarify bedroom / bathroom requirements");
  if (activities.length < 5) recommendedActions.push("Increase touchpoint frequency — limited interaction history");
  const lastActivity = timestamps.length ? timestamps[timestamps.length - 1] : 0;
  const daysSinceLast = lastActivity ? (now - lastActivity) / (1000 * 60 * 60 * 24) : 999;
  if (daysSinceLast > 14) recommendedActions.push(`Re-engage — last interaction was ${Math.round(daysSinceLast)} days ago`);

  // Suggested questions
  const suggestedQuestions: string[] = [];
  if (clientType === "buyer" || clientType === "unknown") {
    suggestedQuestions.push("What's driving your timeline for the move?");
    suggestedQuestions.push("Are there specific neighborhoods you're most interested in?");
  }
  if (clientType === "seller" || clientType === "both") {
    suggestedQuestions.push("Have you thought about your ideal listing price?");
    suggestedQuestions.push("Is there a timeline you need to sell by?");
  }
  if (preApproved === "unknown") suggestedQuestions.push("Have you started the pre-approval process?");
  suggestedQuestions.push("What are your absolute must-haves in a home?");

  // Data gaps
  const dataGaps: string[] = [];
  if (activities.length < 3) dataGaps.push("Very limited communication history");
  if (priceLow === null) dataGaps.push("No budget indicators found");
  if (preferredAreas.length === 0) dataGaps.push("No location preferences detected");
  if (clientType === "unknown") dataGaps.push("Buyer/seller intent unclear");

  // Evidence quotes
  const evidenceQuotes: string[] = [];
  for (const a of activities.slice(0, 50)) {
    const preview = a.body_preview || "";
    if (preview.length > 30) {
      evidenceQuotes.push(`[${a.activity_type}] "${preview.slice(0, 200)}"`);
      if (evidenceQuotes.length >= 5) break;
    }
  }

  const confidence = activities.length > 20 ? "high" : activities.length > 5 ? "medium" : "low";

  // Summary
  const clientName = [clientIdentity.first_name, clientIdentity.last_name].filter(Boolean).join(" ") || clientIdentity.email_normalized;
  const summary = `${clientName} is ${clientType === "unknown" ? "a contact" : `a ${clientType}`} with ${activities.length} recorded interactions. ${
    readinessStage === "ready_to_offer"
      ? "They appear ready to make an offer."
      : readinessStage === "actively_searching"
      ? "They are actively searching for properties."
      : readinessStage === "exploring"
      ? "They are in the early exploration phase."
      : "More engagement is needed to determine their readiness."
  } Communication is primarily via ${preferred_channel}${avgGapDays > 0 ? `, averaging every ${Math.round(avgGapDays)} days` : ""}.`;

  return {
    summary,
    client_type: clientType,
    readiness_stage: readinessStage,
    property_preferences: {
      property_types: propertyTypes,
      bedrooms,
      bathrooms: "not specified",
      must_haves: mustHaves,
      deal_breakers: dealBreakers,
      style_preferences: [],
    },
    location_preferences: {
      preferred_areas: preferredAreas,
      school_district_priority: /school/.test(allText),
      commute_considerations: /commute|drive|transit/.test(allText) ? "Mentioned commute concerns" : "",
      urban_suburban: /\burban\b/.test(allText) ? "urban" : /\bsuburb/.test(allText) ? "suburban" : /\brural\b/.test(allText) ? "rural" : "unknown",
    },
    budget: {
      price_range_low: priceLow,
      price_range_high: priceHigh,
      pre_approved: preApproved,
      financing_type: financingType,
    },
    timeline: {
      urgency,
      target_move_date: "",
      driving_event: urgentSignals > 0 ? "Detected urgency signals in communication" : "",
    },
    communication_insights: {
      preferred_channel,
      responsiveness,
      best_contact_time: "",
      tone: "",
      channel_breakdown: {
        text_pct: Math.round((channelCounts.text / total) * 100),
        email_pct: Math.round((channelCounts.email / total) * 100),
        call_pct: Math.round((channelCounts.call / total) * 100),
      },
      avg_gap_days: Math.round(avgGapDays * 10) / 10,
      total_interactions: activities.length,
      inbound_count: inbound.length,
      outbound_count: outbound.length,
    },
    key_concerns: concerns,
    recommended_actions: recommendedActions,
    suggested_questions: suggestedQuestions,
    evidence_quotes: evidenceQuotes,
    confidence_level: confidence,
    data_gaps: dataGaps,
  };
}

function computeClientFit(analysis: any, totalActivities: number, daysSinceLast: number): object {
  let difficulty = 0;
  const red_flags: string[] = [];
  const positive_signals: string[] = [];

  // RESPONSIVENESS
  if (analysis.communication_insights.responsiveness === 'slow') {
    difficulty += 20;
    red_flags.push('Low response rate — agent initiates most contact');
  }
  if (analysis.communication_insights.responsiveness === 'very_responsive') {
    positive_signals.push('Highly responsive communicator');
  }

  // INBOUND/OUTBOUND RATIO
  const inbound = analysis.communication_insights.inbound_count;
  const outbound = analysis.communication_insights.outbound_count;
  const total = analysis.communication_insights.total_interactions;
  if (total >= 5 && outbound > 0 && inbound / outbound < 0.3) {
    difficulty += 25;
    red_flags.push('Agent initiating 70%+ of contact — client not engaging');
  } else if (total >= 5 && inbound >= outbound) {
    positive_signals.push('Client initiates contact regularly');
  }

  // STAGNATION
  if (total >= 10 && analysis.readiness_stage === 'exploring') {
    difficulty += 15;
    red_flags.push(`${total} interactions but still in early exploration — possible tire-kicker`);
  }
  if (total >= 15 && analysis.readiness_stage === 'unknown') {
    difficulty += 20;
    red_flags.push('Extensive contact history but intent remains unclear');
  }

  // RECENCY
  if (daysSinceLast > 30 && total >= 5) {
    difficulty += 15;
    red_flags.push(`No contact in ${Math.round(daysSinceLast)} days despite prior engagement`);
  } else if (daysSinceLast > 14 && total >= 5) {
    difficulty += 8;
    red_flags.push(`Contact gap widening — last interaction ${Math.round(daysSinceLast)} days ago`);
  }

  // DATA GAPS
  const gapCount = analysis.data_gaps.length;
  if (total >= 8 && gapCount >= 3) {
    difficulty += 15;
    red_flags.push('Client withholding key info (budget, location, intent) despite many interactions');
  }

  // PRE-APPROVAL
  if (analysis.client_type === 'buyer' && analysis.budget.pre_approved === 'unknown' && total >= 8) {
    difficulty += 10;
    red_flags.push('Buyer has not discussed pre-approval after 8+ interactions');
  }

  // BUDGET UNKNOWN
  if (total >= 6 && analysis.budget.price_range_low === null && analysis.client_type !== 'seller') {
    difficulty += 8;
    red_flags.push('No budget indicators detected after multiple interactions');
  }

  // POSITIVE SIGNALS
  if (analysis.readiness_stage === 'ready_to_offer') positive_signals.push('Ready to make an offer');
  if (analysis.readiness_stage === 'actively_searching') positive_signals.push('Actively searching — high intent');
  if (analysis.budget.pre_approved === 'yes') positive_signals.push('Pre-approved for financing');
  if (analysis.timeline.urgency === 'urgent') positive_signals.push('Motivated by deadline or life event');
  if (analysis.budget.price_range_low !== null) positive_signals.push('Has shared budget parameters');

  // CADENCE
  const avgGap = analysis.communication_insights.avg_gap_days;
  if (avgGap > 14 && total >= 5) {
    difficulty += 8;
    red_flags.push(`Slow communication cadence — averaging ${avgGap} days between contacts`);
  } else if (avgGap > 0 && avgGap < 5 && total >= 5) {
    positive_signals.push('Tight, consistent communication cadence');
  }

  difficulty = Math.min(100, Math.max(0, difficulty));

  const agent_recommendation =
    difficulty <= 25 ? 'take' :
    difficulty <= 55 ? 'nurture' :
    'pass';

  const time_investment_estimate =
    difficulty <= 25 ? 'low' :
    difficulty <= 55 ? 'medium' :
    'high';

  const commission_likelihood =
    analysis.readiness_stage === 'ready_to_offer' && difficulty <= 40 ? 'high' :
    analysis.readiness_stage === 'actively_searching' && difficulty <= 55 ? 'medium' :
    difficulty > 55 ? 'low' :
    'medium';

  let reasoning = '';
  if (total < 3) {
    reasoning = 'Insufficient interaction history to evaluate client fit. Continue building rapport before assessing.';
  } else if (agent_recommendation === 'take') {
    reasoning = `${analysis.communication_insights.responsiveness === 'very_responsive' ? 'Strong communicator' : 'Engaged client'} with ${total} interactions${positive_signals.length ? ' and clear positive signals' : ''}. Low risk to take on.`;
  } else if (agent_recommendation === 'nurture') {
    reasoning = `Some positive indicators but ${red_flags.length} concern${red_flags.length > 1 ? 's' : ''} noted. Continue qualifying before investing significant time.`;
  } else {
    reasoning = `High difficulty score driven by ${red_flags.slice(0, 2).join(' and ').toLowerCase()}. Carefully consider time investment before committing.`;
  }

  const insufficient_data = total < 3;

  return {
    difficulty_score: insufficient_data ? null : difficulty,
    time_investment_estimate: insufficient_data ? null : time_investment_estimate,
    commission_likelihood: insufficient_data ? null : commission_likelihood,
    agent_recommendation: insufficient_data ? null : agent_recommendation,
    red_flags,
    positive_signals,
    reasoning,
    insufficient_data,
    scored_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Check cache
    if (!force_refresh) {
      const { data: existing } = await serviceClient
        .from("client_market_analyses")
        .select("*")
        .eq("agent_user_id", user.id)
        .eq("client_identity_id", client_identity_id)
        .maybeSingle();

      if (existing && existing.activity_count > 0) {
        const age = Date.now() - new Date(existing.updated_at).getTime();
        const hasClientFit = !!(existing.analysis_json as any)?.client_fit;
        if (age < 24 * 60 * 60 * 1000 && hasClientFit) {
          return new Response(JSON.stringify({ analysis: existing.analysis_json, cached: true, activity_count: existing.activity_count, updated_at: existing.updated_at }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Get client identity
    const { data: clientIdentity } = await serviceClient
      .from("client_identities")
      .select("*")
      .eq("id", client_identity_id)
      .single();

    if (!clientIdentity)
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });

    // Get FUB contact link
    const { data: agentClient } = await serviceClient
      .from("agent_clients")
      .select("fub_contact_id")
      .eq("agent_user_id", user.id)
      .eq("client_identity_id", client_identity_id)
      .maybeSingle();

    const fubContactId = agentClient?.fub_contact_id;

    let leadData: any = null;
    let activityData: ActivityRow[] = [];

    if (fubContactId) {
      const { data: lead } = await serviceClient
        .from("leads")
        .select("*")
        .eq("imported_from", `fub:${fubContactId}`)
        .eq("assigned_to_user_id", user.id)
        .maybeSingle();

      leadData = lead;

      if (lead) {
        const { data: activity } = await serviceClient
          .from("fub_activity_log")
          .select("activity_type, direction, body_preview, subject, occurred_at")
          .eq("entity_id", lead.id)
          .eq("user_id", user.id)
          .order("occurred_at", { ascending: false })
          .limit(500);

        activityData = (activity || []) as ActivityRow[];
      }
    }

    // Fallback: match by name
    if (!leadData) {
      const { data: lead } = await serviceClient
        .from("leads")
        .select("*")
        .eq("assigned_to_user_id", user.id)
        .ilike("name", `%${clientIdentity.first_name || ""}%`)
        .limit(1)
        .maybeSingle();
      leadData = lead;
    }

    // Build analysis from raw data
    const analysis = analyzeActivities(activityData, leadData, clientIdentity);

    // Compute deterministic client fit scoring
    const cfNow = Date.now();
    const cfLastActivity = activityData.length
      ? new Date(activityData[0].occurred_at).getTime()
      : 0;
    const cfDaysSinceLast = cfLastActivity ? (cfNow - cfLastActivity) / (1000 * 60 * 60 * 24) : 999;
    (analysis as any).client_fit = computeClientFit(analysis, activityData.length, cfDaysSinceLast);

    // Persist
    await serviceClient
      .from("client_market_analyses")
      .upsert({
        agent_user_id: user.id,
        client_identity_id,
        analysis_json: analysis,
        activity_count: activityData.length,
        model_used: "deterministic-v1",
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
