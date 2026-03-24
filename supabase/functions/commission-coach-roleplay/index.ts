import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt: string;
    let userPrompt: string;
    let maxTokens = 1000;
    let useToolCalling = false;
    let tools: any[] = [];
    let toolChoice: any = undefined;

    if (action === "build_case") {
      const { agentName, propertyAddress, listingPrice, neighborhood, yearsAgent, homesSold, marketing } = body;
      systemPrompt = `You are an expert real estate commission coach. Generate a personalized commission defense package for an agent preparing for a listing appointment.`;
      userPrompt = `Agent: ${agentName}
Property: ${propertyAddress || "Not specified"}
Listing Price: ${listingPrice || "Not specified"}
Neighborhood: ${neighborhood || "Not specified"}
Years as Agent: ${yearsAgent || "Not specified"}
Homes Sold: ${homesSold || "Not specified"}
Marketing Capabilities: ${marketing || "Professional photography, MLS syndication"}

Generate:
1. A confident 3-4 paragraph justification script the agent can memorize, personalized to this property and price range
2. 4-5 data-backed value points specific to this price range and market
3. Rebuttals for these specific objections: "I found a 1% agent online", "My neighbor's agent only charged 2%", "The market is hot, I don't need marketing"`;

      useToolCalling = true;
      tools = [{
        type: "function",
        function: {
          name: "build_case_result",
          description: "Return the commission defense package",
          parameters: {
            type: "object",
            properties: {
              script: { type: "string", description: "The 3-4 paragraph justification script" },
              valuePoints: { type: "array", items: { type: "string" }, description: "4-5 data-backed value points" },
              objections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    rebuttal: { type: "string" },
                  },
                  required: ["question", "rebuttal"],
                },
                description: "Rebuttals for common objections",
              },
            },
            required: ["script", "valuePoints", "objections"],
          },
        },
      }];
      toolChoice = { type: "function", function: { name: "build_case_result" } };
      maxTokens = 1500;

    } else if (action === "critique") {
      const { sellerObjection, agentResponse } = body;
      systemPrompt = `You are a tough, experienced real estate seller evaluating an agent's response to your commission objection. Score their response honestly and help them improve.`;
      userPrompt = `Seller objection: "${sellerObjection}"
Agent's response: "${agentResponse}"

Score this response 1-10 (be tough but fair), explain specifically what was weak or missing, and write a stronger version they should use instead.`;

      useToolCalling = true;
      tools = [{
        type: "function",
        function: {
          name: "critique_result",
          description: "Return the critique of the agent's response",
          parameters: {
            type: "object",
            properties: {
              score: { type: "number", description: "Score 1-10" },
              weak: { type: "string", description: "What was weak or missing in their response" },
              stronger: { type: "string", description: "A stronger version of their response" },
            },
            required: ["score", "weak", "stronger"],
          },
        },
      }];
      toolChoice = { type: "function", function: { name: "critique_result" } };
      maxTokens = 800;

    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const requestBody: any = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    };

    if (useToolCalling) {
      requestBody.tools = tools;
      requestBody.tool_choice = toolChoice;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("AI API error:", status, errText);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();

    // Extract tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ result: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback to content
    const reply = aiData.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
    return new Response(JSON.stringify({ result: reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Commission coach error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
