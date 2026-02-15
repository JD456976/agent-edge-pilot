import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchFubSince(apiKey: string, endpoint: string, since: string | null, limit = 50) {
  let url = `https://api.followupboss.com/v1/${endpoint}?limit=${limit}&sort=-updated`;
  // FUB supports lastModified filter on some endpoints
  if (since) {
    url += `&lastModified=${encodeURIComponent(since)}`;
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${btoa(apiKey + ":")}`,
      Accept: "application/json",
    },
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) return [];
  const data = await res.json();
  return data.people || data.deals || data.tasks || data[endpoint] || [];
}

function normalizePerson(p: any) {
  return {
    fub_id: String(p.id),
    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown",
    email: p.emails?.[0]?.value || "",
    phone: p.phones?.[0]?.value || "",
    source: p.source || "",
    stage: p.stage || "",
    updated: p.updated || p.lastActivity || p.created || "",
  };
}

function normalizeDeal(d: any) {
  return {
    fub_id: String(d.id),
    title: d.name || d.title || d.address || "Untitled Deal",
    price: d.price || d.value || 0,
    stage: d.stage || d.stageCategory || "",
    closeDate: d.closingDate || d.closeDate || "",
    updated: d.updated || d.created || "",
  };
}

function normalizeTask(t: any) {
  return {
    fub_id: String(t.id),
    title: t.name || t.subject || t.text || "Untitled Task",
    type: t.type || "",
    dueDate: t.dueDate || t.due || "",
    completed: t.isCompleted || false,
    updated: t.updated || t.created || "",
  };
}

type DeltaStatus = "new" | "updated" | "conflict";

interface DeltaItem {
  entity_type: string;
  fub_id: string;
  label: string;
  status: DeltaStatus;
  changes: string[];
  fub_updated: string;
  local_modified?: string;
  urgency: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const encryptionKey = Deno.env.get("FUB_ENCRYPTION_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Server config error");
    if (!encryptionKey) throw new Error("Encryption key not configured");

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const svc = createClient(supabaseUrl, serviceKey);

    // Check integration
    const { data: integ } = await svc.from("crm_integrations").select("status").eq("user_id", userId).single();
    if (integ?.status !== "connected") throw new Error("Integration not connected");

    // Decrypt key
    const { data: apiKey } = await svc.rpc("get_decrypted_api_key", {
      p_user_id: userId, p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No API key found");

    // Get sync state
    const { data: syncState } = await svc.from("fub_sync_state")
      .select("*").eq("user_id", userId).maybeSingle();

    const cursor = syncState?.last_delta_check_at || syncState?.last_commit_at || null;

    // Get ignored changes (non-expired)
    const { data: ignoredRows } = await svc.from("fub_ignored_changes")
      .select("fub_id, entity_type")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString());
    const ignoredSet = new Set((ignoredRows || []).map(r => `${r.entity_type}:${r.fub_id}`));

    // Fetch FUB data since cursor
    let rawPeople: any[] = [];
    let rawDeals: any[] = [];
    let rawTasks: any[] = [];

    try {
      [rawPeople, rawDeals, rawTasks] = await Promise.all([
        fetchFubSince(apiKey, "people", cursor, 50),
        fetchFubSince(apiKey, "deals", cursor, 50),
        fetchFubSince(apiKey, "tasks", cursor, 50),
      ]);
    } catch (e: any) {
      if (e.message === "rate_limited") {
        // Return last known summary with error status
        return new Response(JSON.stringify({
          error: "rate_limited",
          last_summary: syncState?.last_delta_summary || null,
          last_check: syncState?.last_delta_check_at || null,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }

    // Normalize
    const fubLeads = rawPeople.map(normalizePerson);
    const fubDeals = rawDeals.map(normalizeDeal);
    const fubTasks = rawTasks.map(normalizeTask);

    // Get local data for comparison
    const [{ data: localLeads }, { data: localDeals }, { data: localTasks }] = await Promise.all([
      svc.from("leads").select("id, name, source, imported_from, import_run_id, last_modified_at, last_contact_at").eq("assigned_to_user_id", userId),
      svc.from("deals").select("id, title, price, stage, close_date, imported_from, import_run_id, last_modified_at, last_touched_at").eq("assigned_to_user_id", userId),
      svc.from("tasks").select("id, title, type, due_at, imported_from, import_run_id, last_modified_at, completed_at").eq("assigned_to_user_id", userId),
    ]);

    // Build lookup maps by name (simple matching)
    const localLeadsByName = new Map<string, any>();
    (localLeads || []).forEach(l => localLeadsByName.set(l.name?.toLowerCase() || "", l));

    const localDealsByTitle = new Map<string, any>();
    (localDeals || []).forEach(d => localDealsByTitle.set(d.title?.toLowerCase() || "", d));

    const localTasksByTitle = new Map<string, any>();
    (localTasks || []).forEach(t => localTasksByTitle.set(t.title?.toLowerCase() || "", t));

    const deltas: DeltaItem[] = [];

    // Compare leads
    for (const fl of fubLeads) {
      if (ignoredSet.has(`lead:${fl.fub_id}`)) continue;
      const local = localLeadsByName.get(fl.name.toLowerCase());
      if (!local) {
        deltas.push({ entity_type: "lead", fub_id: fl.fub_id, label: fl.name, status: "new", changes: ["New lead in FUB"], fub_updated: fl.updated, urgency: 30 });
      } else if (local.imported_from === "fub") {
        // Check if FUB updated after our last import
        const fubTime = new Date(fl.updated).getTime();
        const localModTime = local.last_modified_at ? new Date(local.last_modified_at).getTime() : 0;
        if (fubTime > localModTime && localModTime > 0) {
          deltas.push({ entity_type: "lead", fub_id: fl.fub_id, label: fl.name, status: "conflict", changes: ["Updated in FUB after local edit"], fub_updated: fl.updated, local_modified: local.last_modified_at, urgency: 60 });
        } else if (!cursor || fubTime > new Date(cursor).getTime()) {
          const changes: string[] = [];
          if (fl.source && fl.source !== local.source) changes.push(`Source: ${fl.source}`);
          if (fl.email) changes.push(`Email updated`);
          if (changes.length > 0) {
            deltas.push({ entity_type: "lead", fub_id: fl.fub_id, label: fl.name, status: "updated", changes, fub_updated: fl.updated, urgency: 20 });
          }
        }
      }
    }

    // Compare deals
    for (const fd of fubDeals) {
      if (ignoredSet.has(`deal:${fd.fub_id}`)) continue;
      const local = localDealsByTitle.get(fd.title.toLowerCase());
      if (!local) {
        deltas.push({ entity_type: "deal", fub_id: fd.fub_id, label: fd.title, status: "new", changes: ["New deal in FUB"], fub_updated: fd.updated, urgency: 40 });
      } else if (local.imported_from === "fub") {
        const fubTime = new Date(fd.updated).getTime();
        const localModTime = local.last_modified_at ? new Date(local.last_modified_at).getTime() : 0;
        if (fubTime > localModTime && localModTime > 0) {
          deltas.push({ entity_type: "deal", fub_id: fd.fub_id, label: fd.title, status: "conflict", changes: ["Updated in FUB after local edit"], fub_updated: fd.updated, local_modified: local.last_modified_at, urgency: 70 });
        } else if (!cursor || fubTime > new Date(cursor).getTime()) {
          const changes: string[] = [];
          if (fd.price !== Number(local.price)) changes.push(`Price: $${fd.price.toLocaleString()}`);
          if (fd.stage && fd.stage !== local.stage) changes.push(`Stage: ${fd.stage}`);
          if (changes.length > 0) {
            deltas.push({ entity_type: "deal", fub_id: fd.fub_id, label: fd.title, status: "updated", changes, fub_updated: fd.updated, urgency: 35 });
          }
        }
      }
    }

    // Compare tasks
    for (const ft of fubTasks) {
      if (ignoredSet.has(`task:${ft.fub_id}`)) continue;
      const local = localTasksByTitle.get(ft.title.toLowerCase());
      if (!local) {
        deltas.push({ entity_type: "task", fub_id: ft.fub_id, label: ft.title, status: "new", changes: ["New task in FUB"], fub_updated: ft.updated, urgency: 25 });
      } else if (local.imported_from === "fub") {
        const fubTime = new Date(ft.updated).getTime();
        const localModTime = local.last_modified_at ? new Date(local.last_modified_at).getTime() : 0;
        if (fubTime > localModTime && localModTime > 0) {
          deltas.push({ entity_type: "task", fub_id: ft.fub_id, label: ft.title, status: "conflict", changes: ["Updated in FUB after local edit"], fub_updated: ft.updated, local_modified: local.last_modified_at, urgency: 50 });
        } else if (!cursor || fubTime > new Date(cursor).getTime()) {
          const changes: string[] = [];
          if (ft.dueDate && ft.dueDate !== local.due_at) changes.push(`Due date changed`);
          if (ft.completed && !local.completed_at) changes.push(`Completed in FUB`);
          if (changes.length > 0) {
            deltas.push({ entity_type: "task", fub_id: ft.fub_id, label: ft.title, status: "updated", changes, fub_updated: ft.updated, urgency: 20 });
          }
        }
      }
    }

    // Sort by urgency, take top 3
    deltas.sort((a, b) => b.urgency - a.urgency);
    const topItems = deltas.slice(0, 3);

    // Compute counts
    const counts = {
      new: deltas.filter(d => d.status === "new").length,
      updated: deltas.filter(d => d.status === "updated").length,
      conflict: deltas.filter(d => d.status === "conflict").length,
      total: deltas.length,
    };

    // Severity label
    let severity: "quiet" | "moderate" | "attention_needed" = "quiet";
    if (counts.conflict > 0) severity = "attention_needed";
    else if (counts.total > 3) severity = "moderate";
    else if (counts.total > 0) severity = "moderate";

    const summary = { counts, severity, top_items: topItems, checked_at: new Date().toISOString() };

    // Update sync state
    await svc.from("fub_sync_state").upsert({
      user_id: userId,
      last_delta_check_at: new Date().toISOString(),
      last_delta_summary: summary,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    // Audit log
    await svc.from("admin_audit_events").insert({
      admin_user_id: userId,
      action: "delta_check",
      metadata: { counts, severity },
    });

    return new Response(
      JSON.stringify({ ...summary, all_items: deltas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "rate_limited" ? 429 : 400;

    // Log error
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const svc = createClient(supabaseUrl, serviceKey);
        await svc.from("admin_audit_events").insert({
          admin_user_id: "00000000-0000-0000-0000-000000000000",
          action: "delta_check_error",
          metadata: { error: message },
        });
      }
    } catch { /* swallow logging errors */ }

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
