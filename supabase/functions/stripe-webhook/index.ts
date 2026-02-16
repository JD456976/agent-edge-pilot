import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    logStep("ERROR", { message: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET" });
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "No signature" }), { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    logStep("Signature verification failed", { error: err.message });
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  const relevantEvents = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
  ];

  if (!relevantEvents.includes(event.type)) {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  // Look up user by stripe customer email
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.email) {
    logStep("Customer deleted or no email", { customerId });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  // Find user by email
  const { data: users, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr) {
    logStep("Error listing users", { error: userErr.message });
    return new Response(JSON.stringify({ error: "Failed to find user" }), { status: 500 });
  }

  const user = users.users.find((u) => u.email === customer.email);
  if (!user) {
    logStep("No user found for email", { email: customer.email });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  logStep("Matched user", { userId: user.id, email: customer.email });

  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const isTrial = subscription.status === "trialing";
  const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const priceId = subscription.items.data[0]?.price?.id;

  if (event.type === "customer.subscription.deleted") {
    // Subscription cancelled/expired
    await supabase.from("user_entitlements").upsert({
      user_id: user.id,
      is_pro: false,
      is_trial: false,
      expires_at: subscriptionEnd,
      trial_ends_at: null,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      source: "stripe",
    }, { onConflict: "user_id" });
    logStep("Subscription deleted — entitlements cleared", { userId: user.id });
  } else {
    // Created, updated, or trial_will_end
    await supabase.from("user_entitlements").upsert({
      user_id: user.id,
      is_pro: !isTrial && isActive,
      is_trial: isTrial,
      expires_at: subscriptionEnd,
      trial_ends_at: trialEnd,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      source: "stripe",
    }, { onConflict: "user_id" });
    logStep("Entitlements synced", { userId: user.id, isActive, isTrial });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
