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

    // Use tool calling for structured extraction
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
            content: `You are a real estate lead data extractor. Extract structured lead information from a voice transcription by a real estate agent. Call the extract_lead function with the parsed data. If a field is not mentioned, leave it as an empty string. Normalize phone numbers with dashes. Convert spoken numbers to digits (e.g. "five hundred thousand" → "$500,000").`,
          },
          { role: "user", content: audio_text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_lead",
              description: "Extract structured lead information from voice transcription",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Full name of the lead" },
                  phone: { type: "string", description: "Phone number if mentioned" },
                  email: { type: "string", description: "Email address if mentioned" },
                  lead_type: { type: "string", enum: ["buyer", "seller", "both", "investor", "renter", ""], description: "Type of lead" },
                  price_range: { type: "string", description: "Budget or price range mentioned (e.g. '$400K–$600K', 'around $500,000')" },
                  bedrooms: { type: "string", description: "Number of bedrooms mentioned (e.g. '3', '3–4')" },
                  neighborhood: { type: "string", description: "Neighborhood, city, or area mentioned" },
                  source: { type: "string", description: "How they met or lead source (e.g. 'Referral from John Kim', 'Open House'). Default 'Voice Capture'" },
                  notes: { type: "string", description: "Any other details: timeline, preferences, special requests" },
                },
                required: ["name"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_lead" } },
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      throw new Error(`AI error (${aiRes.status}): ${errText}`);
    }

    const aiData = await aiRes.json();

    // Extract from tool call response
    let result: any = null;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        result = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } catch {
        result = null;
      }
    }

    // Fallback: try parsing from content
    if (!result) {
      const content = aiData.choices?.[0]?.message?.content || "";
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        result = null;
      }
    }

    if (!result) {
      result = { name: "", phone: "", email: "", lead_type: "", price_range: "", bedrooms: "", neighborhood: "", source: "Voice Capture", notes: audio_text };
    }

    return new Response(
      JSON.stringify({
        name: result.name || "",
        phone: result.phone || "",
        email: result.email || "",
        lead_type: result.lead_type || "",
        price_range: result.price_range || "",
        bedrooms: result.bedrooms || "",
        neighborhood: result.neighborhood || "",
        source: result.source || "Voice Capture",
        notes: result.notes || "",
        raw_transcript: audio_text,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
