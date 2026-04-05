import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI gateway not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { entity_type, entity_id, draft_type = "email", tone = "professional", context } = await req.json();
    if (!entity_type || !entity_id) throw new Error("entity_type and entity_id required");

    // Gather context
    let entityName = "";
    let entityContext = "";

    if (entity_type === "lead") {
      const { data: lead } = await serviceClient.from("leads")
        .select("name, source, lead_temperature, engagement_score, notes, last_contact_at, last_touched_at")
        .eq("id", entity_id).single();
      if (!lead) throw new Error("Lead not found");
      entityName = lead.name;
      entityContext = `Lead: ${lead.name}
Source: ${lead.source || "Unknown"}
Temperature: ${lead.lead_temperature || "cold"}
Engagement Score: ${lead.engagement_score}/100
Last Contact: ${lead.last_contact_at || "Never"}
Last Touched: ${lead.last_touched_at || "Never"}
Notes: ${lead.notes || "None"}`;
    } else if (entity_type === "deal") {
      const { data: deal } = await serviceClient.from("deals")
        .select("title, price, stage, side, close_date, risk_level, risk_flags")
        .eq("id", entity_id).single();
      if (!deal) throw new Error("Deal not found");
      entityName = deal.title;
      entityContext = `Deal: ${deal.title}
Price: $${deal.price?.toLocaleString()}
Stage: ${deal.stage}
Side: ${deal.side}
Close Date: ${deal.close_date}
Risk Level: ${deal.risk_level}
Risk Flags: ${(deal.risk_flags || []).join(", ") || "None"}`;
    }

    // Fetch recent activity
    const { data: recentActivity } = await serviceClient.from("activity_events")
      .select("touch_type, note, created_at")
      .eq("entity_id", entity_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const activitySummary = (recentActivity || [])
      .map((a: any) => `- ${a.touch_type} (${new Date(a.created_at).toLocaleDateString()}): ${a.note || "No note"}`)
      .join("\n");

    const toneInstructions: Record<string, string> = {
      professional: "Use a professional, warm but businesslike tone. Be concise and action-oriented.",
      friendly: "Use a casual, friendly tone. Be warm and personable like messaging a neighbor.",
      direct: "Be very direct and to the point. Skip pleasantries, focus on the ask or update.",
    };

    const typeInstructions: Record<string, string> = {
      email: "Write a short email (subject + body). Keep it under 150 words.",
      text: "Write a brief text message. Keep it under 50 words. No subject needed.",
      call_script: "Write a brief call talking points script with 3-4 key points to cover.",
      showing_prep: "Generate exactly 3 concise talking points for a real estate showing. Each should be 1 sentence. Return JSON: {\"talking_points\": [\"...\", \"...\", \"...\"]}. Base points on the client's preferences, price range, location interests, and engagement history. Be specific and actionable.",
    };

    // Rate limit check
    const { checkAndLogUsage } = await import('../_shared/rateLimiter.ts');
    const rateCheck = await checkAndLogUsage(serviceClient, user.id, {
      functionName: 'ai-follow-up',
      dailyLimit: 15,
    });
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Daily limit reached',
          message: `You've used ${rateCheck.used}/${rateCheck.limit} AI requests today. Limit resets at midnight.`,
          limitExceeded: true,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are a real estate agent's AI assistant. Generate a follow-up ${draft_type} for the client described below.

${toneInstructions[tone] || toneInstructions.professional}
${typeInstructions[draft_type] || typeInstructions.email}

CONTEXT:
${entityContext}

RECENT ACTIVITY:
${activitySummary || "No recent activity logged."}

${context ? `ADDITIONAL CONTEXT: ${context}` : ""}

RULES:
- Never fabricate specific details not in the context
- Reference actual interaction history when available
- Include a clear next step or call to action
- For emails, return JSON: {"subject": "...", "body": "..."}
- For texts, return JSON: {"body": "..."}
- For call scripts, return JSON: {"talking_points": ["...", "..."], "opening": "...", "closing": "..."}`;

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${tone} ${draft_type} follow-up for ${entityName}.` },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI gateway error (${aiRes.status}): ${errText}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Try to parse JSON from the response
    let draft: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      draft = jsonMatch ? JSON.parse(jsonMatch[0]) : { body: content };
    } catch {
      draft = { body: content };
    }

    // Store the draft
    const { data: savedDraft } = await serviceClient.from("ai_follow_up_drafts").insert({
      user_id: user.id,
      entity_type,
      entity_id,
      draft_type,
      subject: draft.subject || null,
      body: draft.body || draft.talking_points?.join("\n") || content,
      context_summary: entityContext.slice(0, 500),
      tone,
    }).select("id").single();

    return new Response(JSON.stringify({
      draft_id: savedDraft?.id,
      draft_type,
      ...draft,
      entity_name: entityName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
