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

    const { audio_text } = await req.json();
    if (!audio_text) throw new Error("audio_text required");

    // Rate limit
    const { checkAndLogUsage } = await import("../_shared/rateLimiter.ts");
    const rateCheck = await checkAndLogUsage(serviceClient, user.id, {
      functionName: "voice-lead-capture",
      dailyLimit: 30,
    });
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "Daily limit reached", limitExceeded: true }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a real estate lead parser. Extract structured lead information from a voice transcription.
Return ONLY valid JSON with these fields:
{
  "name": "Full name of the lead (required)",
  "phone": "Phone number if mentioned, empty string if not",
  "email": "Email if mentioned, empty string if not",
  "source": "How they met (e.g. Open House, Referral, Cold Call). Default to 'Voice Capture' if unclear",
  "notes": "A clean summary of all other details: what they're looking for, budget, timeline, preferences, etc."
}
Rules:
- Extract phone numbers in any format and normalize to digits with dashes
- If no name is clearly stated, use "Unknown Lead"
- Keep notes concise but preserve all property preferences, budget info, and timeline details
- Do not invent information not in the transcript`,
          },
          { role: "user", content: audio_text },
        ],
        temperature: 0.2,
        max_tokens: 400,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI error (${aiRes.status}): ${errText}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let result: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      result = null;
    }

    if (!result) {
      result = { name: "", phone: "", email: "", source: "Voice Capture", notes: audio_text };
    }

    return new Response(
      JSON.stringify({
        name: result.name || "",
        phone: result.phone || "",
        email: result.email || "",
        source: result.source || "Voice Capture",
        notes: result.notes || audio_text,
        raw_transcript: audio_text,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
