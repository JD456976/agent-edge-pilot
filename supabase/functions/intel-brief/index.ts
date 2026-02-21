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

    const { entity_type, entity_id } = await req.json();
    if (!entity_type || !entity_id) throw new Error("entity_type and entity_id required");

    // ── Gather entity info ──────────────────────────────────────────
    let entityName = "";
    let entityContext = "";

    if (entity_type === "lead") {
      const { data: lead } = await serviceClient.from("leads")
        .select("name, source, lead_temperature, engagement_score, notes, last_contact_at, last_touched_at, created_at, status_tags")
        .eq("id", entity_id).single();
      if (!lead) throw new Error("Lead not found");
      entityName = lead.name;
      entityContext = `Lead: ${lead.name}
Source: ${lead.source || "Unknown"}
Temperature: ${lead.lead_temperature || "cold"}
Engagement Score: ${lead.engagement_score}/100
Created: ${lead.created_at}
Last Contact: ${lead.last_contact_at || "Never"}
Last Touched: ${lead.last_touched_at || "Never"}
Status Tags: ${(lead.status_tags || []).join(", ") || "None"}
Notes: ${lead.notes || "None"}`;
    } else if (entity_type === "deal") {
      const { data: deal } = await serviceClient.from("deals")
        .select("title, price, stage, side, close_date, risk_level, risk_flags, milestone_inspection, milestone_financing, milestone_appraisal, created_at, outcome_note")
        .eq("id", entity_id).single();
      if (!deal) throw new Error("Deal not found");
      entityName = deal.title;
      entityContext = `Deal: ${deal.title}
Price: $${deal.price?.toLocaleString()}
Stage: ${deal.stage}
Side: ${deal.side}
Close Date: ${deal.close_date}
Risk Level: ${deal.risk_level}
Risk Flags: ${(deal.risk_flags || []).join(", ") || "None"}
Milestones - Inspection: ${deal.milestone_inspection}, Financing: ${deal.milestone_financing}, Appraisal: ${deal.milestone_appraisal}
Created: ${deal.created_at}
Outcome Note: ${deal.outcome_note || "None"}`;
    }

    // ── Gather ALL activity (Deal Pilot touches) ────────────────────
    const { data: activityEvents } = await serviceClient.from("activity_events")
      .select("touch_type, note, created_at")
      .eq("entity_id", entity_id)
      .order("created_at", { ascending: true })
      .limit(200);

    // ── Gather ALL FUB activity ─────────────────────────────────────
    const { data: fubActivity } = await serviceClient.from("fub_activity_log")
      .select("activity_type, subject, body_preview, direction, occurred_at")
      .eq("entity_id", entity_id)
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: true })
      .limit(200);

    // ── Gather FUB appointments ─────────────────────────────────────
    const appointmentCol = entity_type === "lead" ? "related_lead_id" : "related_deal_id";
    const { data: appointments } = await serviceClient.from("fub_appointments")
      .select("title, start_at, location, description")
      .eq(appointmentCol, entity_id)
      .eq("user_id", user.id)
      .order("start_at", { ascending: true })
      .limit(50);

    // ── Gather AI follow-up drafts history ──────────────────────────
    const { data: aiDrafts } = await serviceClient.from("ai_follow_up_drafts")
      .select("draft_type, subject, body, tone, created_at, sent_at, status")
      .eq("entity_id", entity_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(20);

    // ── Build timeline for the AI ───────────────────────────────────
    const timeline: string[] = [];

    (activityEvents || []).forEach((a: any) => {
      timeline.push(`[${a.created_at}] TOUCH (${a.touch_type}): ${a.note || "No note"}`);
    });

    (fubActivity || []).forEach((a: any) => {
      const dir = a.direction ? ` [${a.direction}]` : "";
      timeline.push(`[${a.occurred_at}] FUB ${a.activity_type}${dir}: ${a.subject || ""} ${a.body_preview || ""}`.trim());
    });

    (appointments || []).forEach((a: any) => {
      timeline.push(`[${a.start_at}] APPOINTMENT: ${a.title} ${a.location ? `@ ${a.location}` : ""} ${a.description || ""}`.trim());
    });

    (aiDrafts || []).forEach((a: any) => {
      const sentLabel = a.sent_at ? `(SENT ${a.sent_at})` : `(${a.status})`;
      timeline.push(`[${a.created_at}] AI DRAFT ${a.draft_type} ${sentLabel}: ${a.subject || ""} - ${(a.body || "").slice(0, 100)}`);
    });

    // Sort chronologically
    timeline.sort();

    const totalActivityCount = timeline.length;
    const timelineText = timeline.length > 0 ? timeline.join("\n") : "No activity history found.";

    // ── AI Prompt ───────────────────────────────────────────────────
    const systemPrompt = `You are an elite real estate intelligence analyst. Your job is to take a complete communication and activity history for a lead or deal and distill it into a concise, actionable intelligence brief.

ENTITY INFORMATION:
${entityContext}

COMPLETE ACTIVITY TIMELINE (${totalActivityCount} events):
${timelineText}

Generate a structured intelligence brief with these exact sections. Be specific and reference actual dates, events, and communication patterns from the timeline.

Return valid JSON with this structure:
{
  "summary": "2-3 sentence executive summary of the relationship and current status",
  "timeline_highlights": ["Key milestone 1 with date", "Key milestone 2 with date", "..."],
  "motivation_and_intent": "What does this person actually want? What are their goals, needs, and buying/selling triggers based on the communication history?",
  "concerns_and_objections": "Any objections, concerns, hesitations, or deal-breakers that have been raised",
  "communication_pattern": "How often they communicate, preferred channels, responsiveness patterns",
  "last_meaningful_exchange": "What was the last substantive interaction, when it happened, and what was discussed",
  "recommended_next_action": "Specific, actionable next step with reasoning based on the intelligence",
  "risk_factors": ["Risk 1", "Risk 2"],
  "opportunity_signals": ["Signal 1", "Signal 2"]
}

RULES:
- Do NOT fabricate details not present in the timeline
- If a section has no data, say "No data available" rather than making something up
- Be concise but specific — reference actual dates and events
- Focus on actionable intelligence, not fluff
- The brief should save the agent 15-20 minutes of reviewing history`;

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
          { role: "user", content: `Generate a comprehensive intel brief for ${entityName}. There are ${totalActivityCount} activity events to analyze.` },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      throw new Error(`AI gateway error (${aiRes.status}): ${errText}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    let briefJson: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      briefJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content };
    } catch {
      briefJson = { summary: content };
    }

    // ── Persist the brief ───────────────────────────────────────────
    await serviceClient.from("intel_briefs").upsert({
      user_id: user.id,
      entity_id,
      entity_type,
      brief_json: briefJson,
      activity_count: totalActivityCount,
      generated_at: new Date().toISOString(),
    }, { onConflict: "user_id,entity_id" });

    return new Response(JSON.stringify({
      brief: briefJson,
      entity_name: entityName,
      activity_count: totalActivityCount,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[INTEL-BRIEF] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
