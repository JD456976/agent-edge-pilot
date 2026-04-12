import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * fub-auto-sync: Lightweight sync that auto-imports new FUB items
 * and returns conflicts (items that exist in both with differences) for user resolution.
 */

async function fetchFubPage(apiKey: string, endpoint: string, limit: number, offset = 0) {
  const res = await fetch(
    `https://api.followupboss.com/v1/${endpoint}?limit=${limit}&offset=${offset}&sort=-updated`,
    {
      headers: {
        Authorization: `Basic ${btoa(apiKey + ":")}`,
        Accept: "application/json",
      },
    }
  );
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) return [];
  const data = await res.json();
  return data.people || data.deals || data.tasks || data[endpoint] || [];
}

function normalizeName(p: any): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

    const svc = createClient(supabaseUrl, serviceKey);

    // Check integration
    const { data: integ } = await svc.from("crm_integrations").select("status").eq("user_id", userId).single();
    if (integ?.status !== "connected") {
      return new Response(JSON.stringify({ skipped: true, reason: "not_connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decrypt API key
    const { data: apiKey } = await svc.rpc("get_decrypted_api_key", {
      p_user_id: userId, p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No API key found");

    // Fetch recent FUB data (limit 100 each for speed)
    const [rawPeople, rawDeals, rawTasks] = await Promise.all([
      fetchFubPage(apiKey, "people", 100),
      fetchFubPage(apiKey, "deals", 50),
      fetchFubPage(apiKey, "tasks", 100),
    ]);

    // Load existing local data
    const [{ data: existingLeads }, { data: existingDeals }, { data: existingTasks }] = await Promise.all([
      svc.from("leads").select("id, name, source, imported_from, last_modified_at, lead_temperature, notes, removed_from_fub").eq("assigned_to_user_id", userId),
      svc.from("deals").select("id, title, price, stage, close_date, imported_from, last_modified_at").eq("assigned_to_user_id", userId),
      svc.from("tasks").select("id, title, completed_at, due_at, imported_from, type").eq("assigned_to_user_id", userId),
    ]);

    // Build lookup maps by FUB ID
    const leadsByFubId = new Map<string, any>();
    for (const l of (existingLeads || [])) {
      if (l.imported_from?.startsWith("fub:")) {
        leadsByFubId.set(l.imported_from.replace("fub:", ""), l);
      }
    }
    const dealsByFubId = new Map<string, any>();
    for (const d of (existingDeals || [])) {
      if (d.imported_from?.startsWith("fub:")) {
        dealsByFubId.set(d.imported_from.replace("fub:", ""), d);
      }
    }
    const tasksByFubId = new Map<string, any>();
    for (const t of (existingTasks || [])) {
      if (t.imported_from?.startsWith("fub:")) {
        tasksByFubId.set(t.imported_from.replace("fub:", ""), t);
      }
    }

    // Also build lookup by name for new item dedup
    const leadsByName = new Map<string, any>();
    for (const l of (existingLeads || [])) {
      leadsByName.set(l.name?.toLowerCase()?.trim(), l);
    }
    const dealsByTitle = new Map<string, any>();
    for (const d of (existingDeals || [])) {
      dealsByTitle.set(d.title?.toLowerCase()?.trim(), d);
    }

    const autoImported: Record<string, number> = { leads: 0, deals: 0, tasks_synced: 0, leads_removed: 0, deals_removed: 0 };
    const conflicts: any[] = [];

    // Process people
    for (const p of rawPeople) {
      const fubId = String(p.id);
      const name = normalizeName(p);
      const existing = leadsByFubId.get(fubId);

      if (existing) {
        // Always refresh contact fields from FUB (they may have been missing before)
        const contactUpdate: Record<string, string | null> = {};
        const fubPhone = p.phones?.[0]?.value || null;
        const fubMobile = p.phones?.find((ph: any) => ph.type === 'mobile')?.value || null;
        const fubEmail = p.emails?.[0]?.value || null;
        if (fubPhone && !existing.phone_primary) contactUpdate.phone_primary = fubPhone;
        if (fubMobile && !existing.phone_mobile) contactUpdate.phone_mobile = fubMobile;
        if (fubEmail && !existing.email_primary) contactUpdate.email_primary = fubEmail;
        // Always overwrite if FUB has data (FUB is source of truth for contact info)
        if (fubPhone) contactUpdate.phone_primary = fubPhone;
        if (fubMobile) contactUpdate.phone_mobile = fubMobile;
        if (fubEmail) contactUpdate.email_primary = fubEmail;

        if (Object.keys(contactUpdate).length > 0) {
          await svc.from("leads").update(contactUpdate).eq("id", existing.id);
        }

        // Exists in both — compare key fields
        const diffs: any[] = [];
        const fubSource = p.source || "";
        if (fubSource && fubSource !== existing.source) {
          diffs.push({ field: "source", fub_value: fubSource, dp_value: existing.source || "" });
        }
        if (name !== existing.name) {
          diffs.push({ field: "name", fub_value: name, dp_value: existing.name });
        }
        if (diffs.length > 0) {
          const fubUpdated = p.updated || p.lastModified || p.created || null;
          const dpUpdated = existing.last_modified_at || null;
          conflicts.push({
            entity_type: "lead",
            entity_id: existing.id,
            fub_id: fubId,
            entity_name: name,
            differences: diffs,
            fub_updated_at: fubUpdated,
            dp_updated_at: dpUpdated,
            newer: fubUpdated && dpUpdated
              ? new Date(fubUpdated) > new Date(dpUpdated) ? "fub" : "dp"
              : fubUpdated ? "fub" : "dp",
          });
        }
      } else {
        // Check if name already exists (avoid duplicates)
        const nameKey = name.toLowerCase().trim();
        if (leadsByName.has(nameKey)) {
          // Name match without fub link — treat as conflict
          const matched = leadsByName.get(nameKey);
          conflicts.push({
            entity_type: "lead",
            entity_id: matched.id,
            fub_id: fubId,
            entity_name: name,
            differences: [{ field: "new_in_fub", fub_value: "Exists in FUB", dp_value: "Exists in Deal Pilot (unlinked)" }],
            fub_updated_at: p.updated || p.created || null,
            dp_updated_at: matched.last_modified_at || null,
            newer: "fub",
          });
          continue;
        }

        // New in FUB — auto-import
        const { error: insertErr } = await svc.from("leads").insert({
          name,
          source: p.source || "FUB Auto-Sync",
          imported_from: `fub:${fubId}`,
          imported_at: new Date().toISOString(),
          assigned_to_user_id: userId,
          last_contact_at: p.lastActivity || p.created || new Date().toISOString(),
          engagement_score: 0,
          notes: p.emails?.[0]?.value ? `Email: ${p.emails[0].value}` : "",
          phone_primary: p.phones?.[0]?.value || null,
          phone_mobile: p.phones?.find((ph: any) => ph.type === 'mobile')?.value || null,
          email_primary: p.emails?.[0]?.value || null,
          email_secondary: p.emails?.[1]?.value || null,
        });
        if (!insertErr) autoImported.leads++;
      }
    }

    // Process deals
    for (const d of rawDeals) {
      const fubId = String(d.id);
      const title = d.name || d.title || d.address || "Untitled Deal";
      const existing = dealsByFubId.get(fubId);

      if (existing) {
        // Exists in both — compare
        const diffs: any[] = [];
        const fubPrice = d.price || d.value || 0;
        if (fubPrice && fubPrice !== existing.price) {
          diffs.push({ field: "price", fub_value: fubPrice, dp_value: existing.price });
        }
        if (title !== existing.title) {
          diffs.push({ field: "title", fub_value: title, dp_value: existing.title });
        }
        if (diffs.length > 0) {
          const fubUpdated = d.updated || d.lastModified || d.created || null;
          const dpUpdated = existing.last_modified_at || null;
          conflicts.push({
            entity_type: "deal",
            entity_id: existing.id,
            fub_id: fubId,
            entity_name: title,
            differences: diffs,
            fub_updated_at: fubUpdated,
            dp_updated_at: dpUpdated,
            newer: fubUpdated && dpUpdated
              ? new Date(fubUpdated) > new Date(dpUpdated) ? "fub" : "dp"
              : fubUpdated ? "fub" : "dp",
          });
        }
      } else {
        // Check title match
        const titleKey = title.toLowerCase().trim();
        if (dealsByTitle.has(titleKey)) {
          const matched = dealsByTitle.get(titleKey);
          conflicts.push({
            entity_type: "deal",
            entity_id: matched.id,
            fub_id: fubId,
            entity_name: title,
            differences: [{ field: "new_in_fub", fub_value: "Exists in FUB", dp_value: "Exists in Deal Pilot (unlinked)" }],
            fub_updated_at: d.updated || d.created || null,
            dp_updated_at: matched.last_modified_at || null,
            newer: "fub",
          });
          continue;
        }

        // New in FUB — auto-import
        const { error: insertErr } = await svc.from("deals").insert({
          title,
          price: d.price || d.value || 0,
          stage: "offer",
          close_date: d.closingDate || d.closeDate || new Date(Date.now() + 30 * 86400000).toISOString(),
          imported_from: `fub:${fubId}`,
          imported_at: new Date().toISOString(),
          assigned_to_user_id: userId,
        });
        if (!insertErr) autoImported.deals++;
      }
    }

    // Reconcile removed leads — flag any FUB-imported leads no longer in FUB response
    const fubPeopleIds = new Set(rawPeople.map((p: any) => String(p.id)));
    const leadsToRemove: string[] = [];
    for (const [fubId, local] of leadsByFubId) {
      if (!fubPeopleIds.has(fubId)) {
        leadsToRemove.push(local.id);
      }
    }
    if (leadsToRemove.length > 0) {
      await svc.from("leads").update({
        removed_from_fub: true,
        removed_from_fub_at: new Date().toISOString(),
      }).in("id", leadsToRemove);
      autoImported.leads_removed = leadsToRemove.length;
    }

    // Reconcile removed deals
    const fubDealIds = new Set(rawDeals.map((d: any) => String(d.id)));
    const dealsToRemove: string[] = [];
    for (const [fubId, local] of dealsByFubId) {
      if (!fubDealIds.has(fubId)) {
        dealsToRemove.push(local.id);
      }
    }
    if (dealsToRemove.length > 0) {
      await svc.from("deals").update({
        removed_from_fub: true,
        removed_from_fub_at: new Date().toISOString(),
      }).in("id", dealsToRemove);
      autoImported.deals_removed = dealsToRemove.length;
    }

    // Un-flag leads that reappear in FUB (e.g. reassigned back)
    const reappearedLeads = (existingLeads || []).filter(
      (l: any) => l.removed_from_fub && l.imported_from?.startsWith("fub:") && fubPeopleIds.has(l.imported_from.replace("fub:", ""))
    );
    if (reappearedLeads.length > 0) {
      await svc.from("leads").update({
        removed_from_fub: false,
        removed_from_fub_at: null,
      }).in("id", reappearedLeads.map((l: any) => l.id));
    }

    // Process tasks — sync completion status from FUB
    for (const t of rawTasks) {
      const fubId = String(t.id);
      const existing = tasksByFubId.get(fubId);

      if (existing) {
        // If FUB task is completed but DP isn't, sync the completion
        const fubCompleted = t.completed || t.isCompleted || t.status === 'completed';
        if (fubCompleted && !existing.completed_at) {
          await svc.from("tasks").update({
            completed_at: t.completedAt || t.updatedAt || new Date().toISOString(),
          }).eq("id", existing.id);
          autoImported.tasks_synced++;
        }
        // If FUB task is NOT completed but DP shows completed, un-complete it
        if (!fubCompleted && existing.completed_at) {
          await svc.from("tasks").update({ completed_at: null }).eq("id", existing.id);
          autoImported.tasks_synced++;
        }
      }
    }

    // Update sync state
    await svc.from("fub_sync_state").upsert({
      user_id: userId,
      last_successful_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(
      JSON.stringify({
        auto_imported: autoImported,
        conflicts,
        total_checked: { leads: rawPeople.length, deals: rawDeals.length, tasks: rawTasks.length },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "rate_limited" ? 429 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
