import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // First check server-side entitlements (admin grants)
    const { data: entRow } = await supabaseClient
      .from("user_entitlements")
      .select("is_pro, is_trial, expires_at, trial_ends_at")
      .eq("user_id", user.id)
      .maybeSingle();

    // Check if admin-granted pro (no stripe needed)
    if (entRow?.is_pro && entRow.source !== 'stripe') {
      if (!entRow.expires_at || new Date(entRow.expires_at) > new Date()) {
        return new Response(JSON.stringify({
          subscribed: true,
          product_id: null,
          subscription_end: entRow.expires_at,
          is_trial: false,
          trial_end: null,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        subscription_end: null,
        is_trial: false,
        trial_end: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Check active + trialing subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
    });

    const activeSub = subscriptions.data.find(
      (s) => s.status === "active" || s.status === "trialing"
    );

    if (!activeSub) {
      logStep("No active subscription");
      // Update entitlements to reflect no subscription
      await supabaseClient.from("user_entitlements").upsert({
        user_id: user.id,
        is_pro: false,
        is_trial: false,
        expires_at: null,
        trial_ends_at: null,
        stripe_customer_id: customerId,
        source: "stripe",
      }, { onConflict: "user_id" });

      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        subscription_end: null,
        is_trial: false,
        trial_end: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isTrial = activeSub.status === "trialing";
    const subscriptionEnd = new Date(activeSub.current_period_end * 1000).toISOString();
    const trialEnd = activeSub.trial_end
      ? new Date(activeSub.trial_end * 1000).toISOString()
      : null;
    const productId = activeSub.items.data[0]?.price?.product as string;
    const priceId = activeSub.items.data[0]?.price?.id;

    logStep("Active subscription found", { status: activeSub.status, isTrial, subscriptionEnd });

    // Sync to user_entitlements
    await supabaseClient.from("user_entitlements").upsert({
      user_id: user.id,
      is_pro: !isTrial,
      is_trial: isTrial,
      expires_at: subscriptionEnd,
      trial_ends_at: trialEnd,
      stripe_customer_id: customerId,
      stripe_subscription_id: activeSub.id,
      stripe_price_id: priceId,
      source: "stripe",
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({
      subscribed: true,
      product_id: productId,
      subscription_end: subscriptionEnd,
      is_trial: isTrial,
      trial_end: trialEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
