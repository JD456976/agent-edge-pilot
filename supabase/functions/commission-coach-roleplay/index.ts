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

    const {
      data: { user },
    } = await supabase.auth.getUser();
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
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let systemPrompt: string;
    let userPrompt: string;

    if (action === "presentation") {
      const { agentName, yearsExp, avgSalePrice, marketingHighlights } = body;
      systemPrompt =
        "You are an expert real estate commission justification writer. Write a compelling, personalized commission justification document that an agent can share with sellers at listing appointments. Include sections for: Value Proposition, Marketing Investment, Track Record, Net Proceeds Comparison (agent-assisted vs FSBO), and a confident closing statement. Use the agent's details provided. Keep it professional, data-informed, and persuasive. Output plain text with clear section headers.";
      userPrompt = `Agent: ${agentName}\nYears Experience: ${yearsExp || "Not specified"}\nAverage Sale Price: ${avgSalePrice || "Not specified"}\nMarketing Highlights: ${marketingHighlights || "Professional photography, MLS syndication, digital marketing"}`;
    } else {
      // Roleplay
      const { difficulty, history } = body;
      const difficultyDesc =
        difficulty === "easy"
          ? "a mildly skeptical seller who can be convinced with basic value statements"
          : difficulty === "hard"
          ? "an extremely tough, well-researched seller who has specific counter-arguments, quotes FSBO statistics, mentions flat-fee services, and pushes back aggressively on every point"
          : "a moderately skeptical seller who asks pointed questions and needs real data to be convinced";

      systemPrompt = `You are roleplaying as ${difficultyDesc}. You are interviewing a real estate agent about their commission. Stay in character. Be realistic. Ask tough questions about commission, marketing value, and why you shouldn't just sell FSBO or use a discount brokerage. Keep responses to 2-3 sentences. Never break character. Never give advice — you ARE the seller.`;

      if (action === "start") {
        userPrompt =
          "Start the roleplay. You're a seller meeting this agent for a listing presentation. Open with a greeting and quickly get to your first commission-related question or concern.";
      } else {
        const historyText = (history || [])
          .map(
            (m: { role: string; content: string }) =>
              `${m.role === "user" ? "Agent" : "Seller"}: ${m.content}`
          )
          .join("\n");
        userPrompt = `Conversation so far:\n${historyText}\n\nRespond as the seller. Stay in character. Push back or ask a follow-up based on what the agent said.`;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const aiResponse = await fetch(
      "https://api.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: action === "presentation" ? 1500 : 300,
          temperature: 0.8,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "AI request failed" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const aiData = await aiResponse.json();
    const reply =
      aiData.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Commission coach error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
