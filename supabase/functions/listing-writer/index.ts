import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const {
      bedrooms, bathrooms, sqft, price, propertyType,
      neighborhood, yearBuilt, features, angle, style,
    } = await req.json();

    const propertyDetails = [
      `${bedrooms} bedrooms, ${bathrooms} bathrooms`,
      `${sqft} sq ft`,
      `Listed at ${price}`,
      `Property type: ${propertyType}`,
      `Location: ${neighborhood}`,
      yearBuilt ? `Built in ${yearBuilt}` : null,
      features ? `Key features: ${features}` : null,
      angle ? `Agent's selling angle: ${angle}` : null,
    ].filter(Boolean).join(". ");

    const prompt = `You are an expert real estate copywriter. Write 3 listing descriptions for this property using a "${style}" writing style.

Property details: ${propertyDetails}

Return ONLY valid JSON with exactly these keys:
{
  "mls": "MLS listing description, 150-200 words, professional and factual",
  "social": "Social media post, 80-110 words, engaging with relevant hashtags",
  "email": "Client email description, 120-160 words, warm with a clear call to action"
}

Do not include any text outside the JSON object.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a professional real estate listing copywriter. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "listing_descriptions",
              description: "Return three listing descriptions in different formats",
              parameters: {
                type: "object",
                properties: {
                  mls: { type: "string", description: "MLS listing description, 150-200 words" },
                  social: { type: "string", description: "Social media post, 80-110 words with hashtags" },
                  email: { type: "string", description: "Client email description, 120-160 words" },
                },
                required: ["mls", "social", "email"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "listing_descriptions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached — please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI generation failed");
    }

    const aiData = await response.json();

    // Extract from tool call response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let result: { mls: string; social: string; email: string };

    if (toolCall?.function?.arguments) {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      // Fallback: parse from content
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse AI response");
      result = JSON.parse(jsonMatch[0]);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("listing-writer error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
