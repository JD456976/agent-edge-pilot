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

    // Rate limit
    const { checkAndLogUsage } = await import("../_shared/rateLimiter.ts");
    const rateCheck = await checkAndLogUsage(serviceClient, user.id, {
      functionName: "deal-risk-analysis",
      dailyLimit: 25,
    });
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "Daily limit reached", limitExceeded: true }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lead_name, days_since_contact, engagement_score, temperature, source, notes, risk_score, risk_factors } = await req.json();

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert real estate deal risk analyst. Given a lead's data, provide a concise 2-sentence risk assessment followed by one specific recommended action. Be direct and actionable — this is for a busy real estate agent checking their phone between showings. Use the agent's perspective ("your lead", "you should"). Never be generic — reference the specific data points provided.`,
          },
          {
            role: "user",
            content: `Lead: ${lead_name}
Days since last contact: ${days_since_contact ?? 'unknown'}
Engagement score: ${engagement_score}/100
Temperature: ${temperature}
Source: ${source || 'unknown'}
Notes: ${notes || 'none'}
Current risk score: ${risk_score}/100
Risk factors: ${(risk_factors || []).join(', ')}

Provide your 2-sentence risk assessment and one recommended action.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 200,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error (${aiRes.status})`);
    }

    const aiData = await aiRes.json();
    const analysis = aiData.choices?.[0]?.message?.content?.trim() || "Unable to generate analysis.";

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
