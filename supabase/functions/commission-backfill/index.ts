import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client to get current user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // 1. Load user's commission defaults
    const { data: defaults } = await adminClient
      .from("commission_defaults")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!defaults) {
      return new Response(
        JSON.stringify({
          deals_considered: 0,
          deals_updated: 0,
          participants_created: 0,
          skipped_edited: 0,
          skipped_missing_price: 0,
          skipped_no_defaults: 1,
          skipped_other: 0,
          skipped_details: [{ deal_id: "", reason: "No commission defaults set" }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typicalRate = Number(defaults.default_commission_rate ?? 3);
    const typicalSplit = Number(defaults.default_split ?? 100);
    const typicalReferral = Number(defaults.default_referral_fee ?? 0);

    // 2. Load all user's deals
    const { data: deals } = await adminClient
      .from("deals")
      .select("*")
      .eq("assigned_to_user_id", user.id)
      .neq("stage", "closed");

    if (!deals || deals.length === 0) {
      return new Response(
        JSON.stringify({
          deals_considered: 0,
          deals_updated: 0,
          participants_created: 0,
          skipped_edited: 0,
          skipped_missing_price: 0,
          skipped_no_defaults: 0,
          skipped_other: 0,
          skipped_details: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Load existing participants for these deals
    const dealIds = deals.map((d: any) => d.id);
    const { data: existingParticipants } = await adminClient
      .from("deal_participants")
      .select("*")
      .in("deal_id", dealIds);

    const participantsByDeal = new Map<string, any[]>();
    (existingParticipants || []).forEach((p: any) => {
      const arr = participantsByDeal.get(p.deal_id) || [];
      arr.push(p);
      participantsByDeal.set(p.deal_id, arr);
    });

    // 4. Process each deal
    let deals_updated = 0;
    let participants_created = 0;
    let skipped_edited = 0;
    let skipped_missing_price = 0;
    let skipped_other = 0;
    const skipped_details: { deal_id: string; reason: string }[] = [];

    for (const deal of deals) {
      const dealParticipants = participantsByDeal.get(deal.id) || [];
      const hasMyParticipant = dealParticipants.some((p: any) => p.user_id === user.id);
      const hasCommission = (deal.commission_rate && Number(deal.commission_rate) > 0) || (Number(deal.commission_amount) > 0);

      // Skip if already fully set up
      if (hasMyParticipant && hasCommission) {
        continue;
      }

      // Skip if user has edited the deal
      if (deal.last_modified_at) {
        const modifiedAt = new Date(deal.last_modified_at).getTime();
        const createdAt = new Date(deal.created_at).getTime();
        const importedAt = deal.imported_at ? new Date(deal.imported_at).getTime() : createdAt;
        const baseline = Math.max(createdAt, importedAt);

        // If modified significantly after creation/import (>60s buffer), skip
        if (modifiedAt > baseline + 60000) {
          skipped_edited++;
          if (skipped_details.length < 20) {
            skipped_details.push({ deal_id: deal.id, reason: "Deal was edited by user" });
          }
          continue;
        }
      }

      let dealUpdated = false;

      // Create participant if missing
      if (!hasMyParticipant) {
        const { error: pErr } = await adminClient.from("deal_participants").insert({
          deal_id: deal.id,
          user_id: user.id,
          role: "primary_agent",
          split_percent: typicalSplit,
          commission_override: null,
        });
        if (!pErr) {
          participants_created++;
          dealUpdated = true;
        }
      }

      // Apply commission defaults if missing
      if (!hasCommission) {
        const price = Number(deal.price);
        if (!price || price <= 0) {
          skipped_missing_price++;
          if (skipped_details.length < 20) {
            skipped_details.push({ deal_id: deal.id, reason: "Missing deal price" });
          }
          // Still count as updated if participant was created
          if (dealUpdated) deals_updated++;
          continue;
        }

        const commissionAmount = Math.round(price * (typicalRate / 100));
        const { error: dErr } = await adminClient
          .from("deals")
          .update({
            commission_rate: typicalRate,
            commission_amount: commissionAmount,
            referral_fee_percent: typicalReferral,
          })
          .eq("id", deal.id);

        if (!dErr) dealUpdated = true;
      }

      if (dealUpdated) deals_updated++;
    }

    // 5. Audit log
    await adminClient.from("admin_audit_events").insert({
      admin_user_id: user.id,
      action: "commission_backfill_run",
      metadata: {
        deals_considered: deals.length,
        deals_updated,
        participants_created,
        skipped_edited,
        skipped_missing_price,
      },
    });

    const result = {
      deals_considered: deals.length,
      deals_updated,
      participants_created,
      skipped_edited,
      skipped_missing_price,
      skipped_no_defaults: 0,
      skipped_other,
      skipped_details,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
