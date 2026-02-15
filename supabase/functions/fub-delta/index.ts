import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Safe fields that can be auto-applied from FUB without risk
const SAFE_FIELDS = new Set(["email", "phone", "source", "stage", "status", "due_date", "price", "close_date"]);
const PROTECTED_FIELDS = new Set(["notes", "commission", "commission_amount", "commission_rate", "split_percent", "participants"]);

async function fetchFubSince(apiKey: string, endpoint: string, since: string | null, limit = 50) {
  let url = `https://api.followupboss.com/v1/${endpoint}?limit=${limit}&sort=-updated`;
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

interface DeltaChange {
  field: string;
  fub_value: string;
  local_value?: string;
  safe: boolean;
}

interface DeltaItem {
  entity_type: string;
  fub_id: string;
  label: string;
  status: DeltaStatus;
  changes: string[];
  field_diffs: DeltaChange[];
  fub_updated: string;
  local_modified?: string;
  urgency: number;
}

function classifyField(field: string): boolean {
  return SAFE_FIELDS.has(field.toLowerCase());
}

function computeDriftReason(counts: { new: number; updated: number; conflict: number }, deltas: DeltaItem[]): string {
  if (counts.conflict > 0) return "Conflicts detected — records changed in both systems";
  const hasHighValue = deltas.some(d => d.entity_type === "deal" && d.urgency >= 35);
  if (hasHighValue) return "High-value items updated in FUB";
  if (counts.new > 0 && counts.updated === 0) return "New items available to stage";
  if (counts.updated > 0 && counts.new === 0) return "Existing records updated in FUB";
  if (counts.new > 0 && counts.updated > 0) return "New and updated items detected";
  return "No meaningful changes";
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
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

    const svc = createClient(supabaseUrl, serviceKey);

    const { data: integ } = await svc.from("crm_integrations").select("status").eq("user_id", userId).single();
    if (integ?.status !== "connected") throw new Error("Integration not connected");

    const { data: apiKey } = await svc.rpc("get_decrypted_api_key", {
      p_user_id: userId, p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No API key found");

    const { data: syncState } = await svc.from("fub_sync_state")
      .select("*").eq("user_id", userId).maybeSingle();

    const cursor = syncState?.last_delta_check_at || syncState?.last_commit_at || null;

    // Get ignored changes (non-expired) with scope awareness
    const { data: ignoredRows } = await svc.from("fub_ignored_changes")
      .select("fub_id, entity_type, scope, field_rule")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString());

    const ignoredItemSet = new Set<string>();
    const ignoredTypeSet = new Set<string>();
    const hasFieldRuleIgnore = new Set<string>();
    for (const r of (ignoredRows || [])) {
      if (r.scope === "item") ignoredItemSet.add(`${r.entity_type}:${r.fub_id}`);
      else if (r.scope === "type") ignoredTypeSet.add(r.entity_type);
      else if (r.scope === "field_rule") hasFieldRuleIgnore.add(r.entity_type);
    }

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
        return new Response(JSON.stringify({
          error: "rate_limited",
          last_summary: syncState?.last_delta_summary || null,
          last_check: syncState?.last_delta_check_at || null,
          last_successful_check: syncState?.last_successful_check_at || null,
          drift_reason: syncState?.drift_reason || null,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }

    const fubLeads = rawPeople.map(normalizePerson);
    const fubDeals = rawDeals.map(normalizeDeal);
    const fubTasks = rawTasks.map(normalizeTask);

    const [{ data: localLeads }, { data: localDeals }, { data: localTasks }] = await Promise.all([
      svc.from("leads").select("id, name, source, imported_from, import_run_id, last_modified_at, last_contact_at").eq("assigned_to_user_id", userId),
      svc.from("deals").select("id, title, price, stage, close_date, imported_from, import_run_id, last_modified_at, last_touched_at").eq("assigned_to_user_id", userId),
      svc.from("tasks").select("id, title, type, due_at, imported_from, import_run_id, last_modified_at, completed_at").eq("assigned_to_user_id", userId),
    ]);

    const localLeadsByName = new Map<string, any>();
    (localLeads || []).forEach(l => localLeadsByName.set(l.name?.toLowerCase() || "", l));
    const localDealsByTitle = new Map<string, any>();
    (localDeals || []).forEach(d => localDealsByTitle.set(d.title?.toLowerCase() || "", d));
    const localTasksByTitle = new Map<string, any>();
    (localTasks || []).forEach(t => localTasksByTitle.set(t.title?.toLowerCase() || "", t));

    const deltas: DeltaItem[] = [];

    function isIgnored(entityType: string, fubId: string): boolean {
      return ignoredItemSet.has(`${entityType}:${fubId}`) || ignoredTypeSet.has(entityType);
    }

    // Helper: check if changes are only low-signal formatting diffs
    function isLowSignalOnly(changes: DeltaChange[]): boolean {
      return changes.every(c => {
        if (!c.fub_value || !c.local_value) return false;
        // Normalize: strip formatting, lowercase
        const a = c.fub_value.replace(/[\s\-\(\)\.]/g, "").toLowerCase();
        const b = c.local_value.replace(/[\s\-\(\)\.]/g, "").toLowerCase();
        return a === b;
      });
    }

    // Compare leads
    for (const fl of fubLeads) {
      if (isIgnored("lead", fl.fub_id)) continue;
      const local = localLeadsByName.get(fl.name.toLowerCase());
      if (!local) {
        deltas.push({ entity_type: "lead", fub_id: fl.fub_id, label: fl.name, status: "new", changes: ["New lead in FUB"], field_diffs: [], fub_updated: fl.updated, urgency: 30 });
      } else if (local.imported_from === "fub") {
        const fubTime = new Date(fl.updated).getTime();
        const localModTime = local.last_modified_at ? new Date(local.last_modified_at).getTime() : 0;
        const fieldDiffs: DeltaChange[] = [];
        if (fl.source && fl.source !== local.source) fieldDiffs.push({ field: "source", fub_value: fl.source, local_value: local.source || "", safe: classifyField("source") });
        if (fl.email) fieldDiffs.push({ field: "email", fub_value: fl.email, safe: classifyField("email") });
        if (fl.phone) fieldDiffs.push({ field: "phone", fub_value: fl.phone, safe: classifyField("phone") });

        // Skip field-rule ignored items (low-signal only)
        if (hasFieldRuleIgnore.has("lead") && fieldDiffs.length > 0 && isLowSignalOnly(fieldDiffs)) continue;

        if (fubTime > localModTime && localModTime > 0) {
          deltas.push({ entity_type: "lead", fub_id: fl.fub_id, label: fl.name, status: "conflict", changes: ["Updated in FUB after local edit"], field_diffs: fieldDiffs, fub_updated: fl.updated, local_modified: local.last_modified_at, urgency: 60 });
        } else if (!cursor || fubTime > new Date(cursor).getTime()) {
          const changes = fieldDiffs.map(d => `${d.field}: ${d.fub_value}`);
          if (changes.length > 0) {
            deltas.push({ entity_type: "lead", fub_id: fl.fub_id, label: fl.name, status: "updated", changes, field_diffs: fieldDiffs, fub_updated: fl.updated, urgency: 20 });
          }
        }
      }
    }

    // Compare deals
    for (const fd of fubDeals) {
      if (isIgnored("deal", fd.fub_id)) continue;
      const local = localDealsByTitle.get(fd.title.toLowerCase());
      if (!local) {
        deltas.push({ entity_type: "deal", fub_id: fd.fub_id, label: fd.title, status: "new", changes: ["New deal in FUB"], field_diffs: [], fub_updated: fd.updated, urgency: 40 });
      } else if (local.imported_from === "fub") {
        const fubTime = new Date(fd.updated).getTime();
        const localModTime = local.last_modified_at ? new Date(local.last_modified_at).getTime() : 0;
        const fieldDiffs: DeltaChange[] = [];
        if (fd.price !== Number(local.price)) fieldDiffs.push({ field: "price", fub_value: `$${fd.price.toLocaleString()}`, local_value: `$${Number(local.price).toLocaleString()}`, safe: classifyField("price") });
        if (fd.stage && fd.stage !== local.stage) fieldDiffs.push({ field: "stage", fub_value: fd.stage, local_value: local.stage, safe: classifyField("stage") });
        if (fd.closeDate && fd.closeDate !== local.close_date) fieldDiffs.push({ field: "close_date", fub_value: fd.closeDate, local_value: local.close_date, safe: classifyField("close_date") });

        if (hasFieldRuleIgnore.has("deal") && fieldDiffs.length > 0 && isLowSignalOnly(fieldDiffs)) continue;

        if (fubTime > localModTime && localModTime > 0) {
          deltas.push({ entity_type: "deal", fub_id: fd.fub_id, label: fd.title, status: "conflict", changes: ["Updated in FUB after local edit"], field_diffs: fieldDiffs, fub_updated: fd.updated, local_modified: local.last_modified_at, urgency: 70 });
        } else if (!cursor || fubTime > new Date(cursor).getTime()) {
          const changes = fieldDiffs.map(d => `${d.field}: ${d.fub_value}`);
          if (changes.length > 0) {
            deltas.push({ entity_type: "deal", fub_id: fd.fub_id, label: fd.title, status: "updated", changes, field_diffs: fieldDiffs, fub_updated: fd.updated, urgency: 35 });
          }
        }
      }
    }

    // Compare tasks
    for (const ft of fubTasks) {
      if (isIgnored("task", ft.fub_id)) continue;
      const local = localTasksByTitle.get(ft.title.toLowerCase());
      if (!local) {
        deltas.push({ entity_type: "task", fub_id: ft.fub_id, label: ft.title, status: "new", changes: ["New task in FUB"], field_diffs: [], fub_updated: ft.updated, urgency: 25 });
      } else if (local.imported_from === "fub") {
        const fubTime = new Date(ft.updated).getTime();
        const localModTime = local.last_modified_at ? new Date(local.last_modified_at).getTime() : 0;
        const fieldDiffs: DeltaChange[] = [];
        if (ft.dueDate && ft.dueDate !== local.due_at) fieldDiffs.push({ field: "due_date", fub_value: ft.dueDate, local_value: local.due_at, safe: classifyField("due_date") });
        if (ft.completed && !local.completed_at) fieldDiffs.push({ field: "status", fub_value: "Completed", local_value: "Pending", safe: classifyField("status") });

        if (hasFieldRuleIgnore.has("task") && fieldDiffs.length > 0 && isLowSignalOnly(fieldDiffs)) continue;

        if (fubTime > localModTime && localModTime > 0) {
          deltas.push({ entity_type: "task", fub_id: ft.fub_id, label: ft.title, status: "conflict", changes: ["Updated in FUB after local edit"], field_diffs: fieldDiffs, fub_updated: ft.updated, local_modified: local.last_modified_at, urgency: 50 });
        } else if (!cursor || fubTime > new Date(cursor).getTime()) {
          const changes = fieldDiffs.map(d => `${d.field}: ${d.fub_value}`);
          if (changes.length > 0) {
            deltas.push({ entity_type: "task", fub_id: ft.fub_id, label: ft.title, status: "updated", changes, field_diffs: fieldDiffs, fub_updated: ft.updated, urgency: 20 });
          }
        }
      }
    }

    deltas.sort((a, b) => b.urgency - a.urgency);
    const topItems = deltas.slice(0, 3);

    const counts = {
      new: deltas.filter(d => d.status === "new").length,
      updated: deltas.filter(d => d.status === "updated").length,
      conflict: deltas.filter(d => d.status === "conflict").length,
      total: deltas.length,
    };

    let severity: "quiet" | "moderate" | "attention_needed" = "quiet";
    if (counts.conflict > 0) severity = "attention_needed";
    else if (counts.total > 3) severity = "moderate";
    else if (counts.total > 0) severity = "moderate";

    const drift_reason = computeDriftReason(counts, deltas);
    const checkedAt = new Date().toISOString();
    const summary = { counts, severity, drift_reason, top_items: topItems, checked_at: checkedAt };

    await svc.from("fub_sync_state").upsert({
      user_id: userId,
      last_delta_check_at: checkedAt,
      last_successful_check_at: checkedAt,
      last_delta_summary: summary,
      drift_reason,
      updated_at: checkedAt,
    }, { onConflict: "user_id" });

    await svc.from("admin_audit_events").insert({
      admin_user_id: userId,
      action: "delta_check",
      metadata: { counts, severity, drift_reason },
    });

    return new Response(
      JSON.stringify({ ...summary, all_items: deltas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "rate_limited" ? 429 : 400;

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
