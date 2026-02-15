import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURRENT_MAPPING_VERSION = 1;
const MAX_SCOPED_PER_TYPE = 50;

async function fetchFub(apiKey: string, endpoint: string, limit = 50) {
  const res = await fetch(
    `https://api.followupboss.com/v1/${endpoint}?limit=${limit}&sort=-created`,
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

async function fetchFubById(apiKey: string, endpoint: string, id: string) {
  const res = await fetch(
    `https://api.followupboss.com/v1/${endpoint}/${id}`,
    {
      headers: {
        Authorization: `Basic ${btoa(apiKey + ":")}`,
        Accept: "application/json",
      },
    }
  );
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.json();
}

function normalizeLead(p: any) {
  return {
    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown",
    email: p.emails?.[0]?.value || "",
    phone: p.phones?.[0]?.value || "",
    source: p.source || "",
    engagementScore: 0,
    lastContactAt: p.lastActivity || p.updated || p.created || null,
    createdAt: p.created || null,
  };
}

function normalizeDeal(d: any) {
  return {
    title: d.name || d.title || d.address || "Untitled Deal",
    price: d.price || d.value || 0,
    stage: "offer",
    closeDate: d.closingDate || d.closeDate || null,
    address: d.address || "",
  };
}

function normalizeTask(t: any) {
  return {
    title: t.name || t.subject || t.text || "Untitled Task",
    type: mapTaskType(t.type),
    dueAt: t.dueDate || t.due || null,
    completedAt: t.isCompleted ? (t.completedDate || new Date().toISOString()) : null,
    relatedFubPersonId: t.personId || null,
    relatedFubDealId: t.dealId || null,
  };
}

function mapTaskType(fubType: string | undefined): string {
  const map: Record<string, string> = {
    call: "call", phone: "call", text: "text", sms: "text",
    email: "email", showing: "showing", "open house": "open_house",
  };
  return map[(fubType || "").toLowerCase()] || "follow_up";
}

function fuzzyNameMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.length > 3 && nb.length > 3) {
    return na.includes(nb) || nb.includes(na);
  }
  return false;
}

interface DedupRules {
  lead_email_match: boolean;
  lead_phone_match: boolean;
  lead_name_fuzzy: boolean;
  deal_title_close_date: boolean;
  deal_address_match: boolean;
  task_title_due_date: boolean;
  task_title_only: boolean;
}

const DEFAULT_RULES: DedupRules = {
  lead_email_match: true,
  lead_phone_match: false,
  lead_name_fuzzy: false,
  deal_title_close_date: true,
  deal_address_match: false,
  task_title_due_date: true,
  task_title_only: false,
};

// ---- Matching helpers ----
function matchLead(norm: any, existingLeads: any[], rules: DedupRules) {
  let match_status = "new";
  let matched_lead_id: string | null = null;

  if (!existingLeads) return { match_status, matched_lead_id };

  if (rules.lead_email_match && norm.email) {
    const emailMatch = existingLeads.find((l: any) =>
      l.name?.toLowerCase() === norm.name.toLowerCase()
    );
    if (emailMatch) { match_status = "matched"; matched_lead_id = emailMatch.id; }
  }

  if (match_status === "new" && rules.lead_phone_match && norm.phone) {
    const phoneNameMatch = existingLeads.find((l: any) =>
      l.name?.toLowerCase() === norm.name.toLowerCase()
    );
    if (phoneNameMatch) { match_status = "matched"; matched_lead_id = phoneNameMatch.id; }
  }

  if (match_status === "new" && rules.lead_name_fuzzy) {
    const fuzzyMatch = existingLeads.find((l: any) =>
      fuzzyNameMatch(l.name || "", norm.name)
    );
    if (fuzzyMatch) { match_status = "conflict"; matched_lead_id = fuzzyMatch.id; }
  }

  if (match_status === "new") {
    const nameMatch = existingLeads.find((l: any) => {
      if (l.name?.toLowerCase() !== norm.name.toLowerCase()) return false;
      if (norm.source && l.source !== norm.source) return false;
      const created = new Date(l.created_at);
      const diff = Math.abs(Date.now() - created.getTime());
      return diff < 30 * 24 * 60 * 60 * 1000;
    });
    if (nameMatch) { match_status = "conflict"; matched_lead_id = nameMatch.id; }
  }

  return { match_status, matched_lead_id };
}

function matchDeal(norm: any, existingDeals: any[], rules: DedupRules) {
  let match_status = "new";
  let matched_deal_id: string | null = null;

  if (!existingDeals) return { match_status, matched_deal_id };

  if (rules.deal_title_close_date) {
    const titleMatch = existingDeals.find((ed: any) =>
      ed.title?.toLowerCase() === norm.title.toLowerCase()
    );
    if (titleMatch) {
      if (norm.closeDate && titleMatch.close_date) {
        const diff = Math.abs(new Date(norm.closeDate).getTime() - new Date(titleMatch.close_date).getTime());
        match_status = diff < 30 * 24 * 60 * 60 * 1000 ? "matched" : "conflict";
      } else {
        match_status = "conflict";
      }
      matched_deal_id = titleMatch.id;
    }
  }

  if (match_status === "new" && rules.deal_address_match && norm.address) {
    const addrMatch = existingDeals.find((ed: any) =>
      ed.title?.toLowerCase().includes(norm.address.toLowerCase())
    );
    if (addrMatch) { match_status = "conflict"; matched_deal_id = addrMatch.id; }
  }

  return { match_status, matched_deal_id };
}

function matchTask(norm: any, existingTasks: any[], rules: DedupRules) {
  let match_status = "new";
  let matched_task_id: string | null = null;

  if (!existingTasks) return { match_status, matched_task_id };

  if (rules.task_title_due_date) {
    const titleMatch = existingTasks.find((et: any) =>
      et.title?.toLowerCase() === norm.title.toLowerCase() &&
      norm.dueAt && et.due_at &&
      Math.abs(new Date(norm.dueAt).getTime() - new Date(et.due_at).getTime()) < 24 * 60 * 60 * 1000
    );
    if (titleMatch) { match_status = "matched"; matched_task_id = titleMatch.id; }
  }

  if (match_status === "new" && rules.task_title_only) {
    const titleOnly = existingTasks.find((et: any) =>
      et.title?.toLowerCase() === norm.title.toLowerCase()
    );
    if (titleOnly) { match_status = "conflict"; matched_task_id = titleOnly.id; }
  }

  return { match_status, matched_task_id };
}

// ---- Scoped fetch: fetch individual items by FUB ID ----
async function fetchScopedItems(apiKey: string, selectedLeadIds: string[], selectedDealIds: string[], selectedTaskIds: string[]) {
  const notFound: { type: string; fub_id: string }[] = [];

  const fetchAll = async (ids: string[], endpoint: string, type: string) => {
    const results: any[] = [];
    for (const id of ids) {
      const item = await fetchFubById(apiKey, endpoint, id);
      if (item) {
        results.push(item);
      } else {
        notFound.push({ type, fub_id: id });
      }
    }
    return results;
  };

  const [rawPeople, rawDeals, rawTasks] = await Promise.all([
    fetchAll(selectedLeadIds, "people", "lead"),
    fetchAll(selectedDealIds, "deals", "deal"),
    fetchAll(selectedTaskIds, "tasks", "task"),
  ]);

  return { rawPeople, rawDeals, rawTasks, notFound };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
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

    // Check integration connected
    const { data: integ } = await svc.from("crm_integrations").select("status").eq("user_id", userId).single();
    if (integ?.status !== "connected") throw new Error("Integration not connected. Validate first.");

    // Decrypt
    const { data: apiKey } = await svc.rpc("get_decrypted_api_key", {
      p_user_id: userId, p_encryption_key: encryptionKey,
    });
    if (!apiKey) throw new Error("No API key found");

    // Load user dedup rules
    const { data: userRules } = await svc.from("import_dedup_rules")
      .select("*").eq("user_id", userId).maybeSingle();
    const rules: DedupRules = userRules || DEFAULT_RULES;

    let body: { limit?: number; since?: string; scope?: string; selected?: { leads?: string[]; deals?: string[]; tasks?: string[] } } = {};
    try { body = await req.json(); } catch { /* defaults */ }

    const isScoped = body.scope === "selected" && body.selected;
    const limit = Math.min(body.limit || 50, 200);

    let rawPeople: any[] = [];
    let rawDeals: any[] = [];
    let rawTasks: any[] = [];
    let notFound: { type: string; fub_id: string }[] = [];

    if (isScoped && body.selected) {
      const selectedLeads = (body.selected.leads || []).slice(0, MAX_SCOPED_PER_TYPE);
      const selectedDeals = (body.selected.deals || []).slice(0, MAX_SCOPED_PER_TYPE);
      const selectedTasks = (body.selected.tasks || []).slice(0, MAX_SCOPED_PER_TYPE);

      const result = await fetchScopedItems(apiKey, selectedLeads, selectedDeals, selectedTasks);
      rawPeople = result.rawPeople;
      rawDeals = result.rawDeals;
      rawTasks = result.rawTasks;
      notFound = result.notFound;
    } else {
      // Full mode (existing behavior)
      [rawPeople, rawDeals, rawTasks] = await Promise.all([
        fetchFub(apiKey, "people", limit),
        fetchFub(apiKey, "deals", limit),
        fetchFub(apiKey, "tasks", limit),
      ]);
    }

    // Create import run
    const { data: run, error: runErr } = await svc.from("fub_import_runs").insert({
      user_id: userId,
      status: "staged",
      source_counts: {
        leads: rawPeople.length,
        deals: rawDeals.length,
        tasks: rawTasks.length,
        ...(isScoped ? { scoped: true, not_found: notFound.length } : {}),
      },
      mapping_version: CURRENT_MAPPING_VERSION,
      notes: isScoped ? "Scoped import from drift review" : null,
    }).select("id").single();
    if (runErr || !run) throw new Error("Failed to create import run");

    // ---- MATCHING: fetch existing data for dedup ----
    const { data: existingLeads } = await svc.from("leads")
      .select("id, name, source, created_at")
      .eq("assigned_to_user_id", userId);

    const { data: existingDeals } = await svc.from("deals")
      .select("id, title, close_date")
      .eq("assigned_to_user_id", userId);

    const { data: existingTasks } = await svc.from("tasks")
      .select("id, title, due_at")
      .eq("assigned_to_user_id", userId);

    // Stage leads
    const stagedLeads = rawPeople.map((p: any) => {
      const norm = normalizeLead(p);
      const { match_status, matched_lead_id } = matchLead(norm, existingLeads || [], rules);
      return {
        user_id: userId, import_run_id: run.id, fub_id: String(p.id),
        payload: p, normalized: norm, match_status, matched_lead_id,
        mapping_version: CURRENT_MAPPING_VERSION,
      };
    });

    // Stage deals
    const stagedDeals = rawDeals.map((d: any) => {
      const norm = normalizeDeal(d);
      const { match_status, matched_deal_id } = matchDeal(norm, existingDeals || [], rules);
      return {
        user_id: userId, import_run_id: run.id, fub_id: String(d.id),
        payload: d, normalized: norm, match_status, matched_deal_id,
        mapping_version: CURRENT_MAPPING_VERSION,
      };
    });

    // Stage tasks
    const stagedTasks = rawTasks.map((t: any) => {
      const norm = normalizeTask(t);
      const { match_status, matched_task_id } = matchTask(norm, existingTasks || [], rules);
      return {
        user_id: userId, import_run_id: run.id, fub_id: String(t.id),
        payload: t, normalized: norm, match_status, matched_task_id,
        mapping_version: CURRENT_MAPPING_VERSION,
      };
    });

    // Insert staged data in parallel
    const insertPromises: Promise<any>[] = [];
    if (stagedLeads.length) insertPromises.push(svc.from("fub_staged_leads").insert(stagedLeads));
    if (stagedDeals.length) insertPromises.push(svc.from("fub_staged_deals").insert(stagedDeals));
    if (stagedTasks.length) insertPromises.push(svc.from("fub_staged_tasks").insert(stagedTasks));
    await Promise.all(insertPromises);

    // Audit log
    await svc.from("admin_audit_events").insert({
      admin_user_id: userId,
      action: isScoped ? "drift_stage_selected" : "import_staged",
      metadata: {
        import_run_id: run.id,
        leads: stagedLeads.length,
        deals: stagedDeals.length,
        tasks: stagedTasks.length,
        mapping_version: CURRENT_MAPPING_VERSION,
        ...(isScoped ? { scoped: true, requested: body.selected } : {}),
      },
    });

    // Log not-found items separately if any
    if (notFound.length > 0) {
      await svc.from("admin_audit_events").insert({
        admin_user_id: userId,
        action: "stage_selected_not_found",
        metadata: { import_run_id: run.id, not_found: notFound },
      });
    }

    // Update sync state
    await svc.from("fub_sync_state").upsert({
      user_id: userId,
      last_stage_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    const countsByStatus = (items: any[]) => ({
      total: items.length,
      new: items.filter(i => i.match_status === "new").length,
      matched: items.filter(i => i.match_status === "matched").length,
      conflict: items.filter(i => i.match_status === "conflict").length,
    });

    return new Response(
      JSON.stringify({
        import_run_id: run.id,
        mapping_version: CURRENT_MAPPING_VERSION,
        scoped: !!isScoped,
        counts: {
          leads: countsByStatus(stagedLeads),
          deals: countsByStatus(stagedDeals),
          tasks: countsByStatus(stagedTasks),
        },
        not_found: notFound.length > 0 ? notFound : undefined,
        requested: isScoped ? {
          leads: (body.selected?.leads || []).length,
          deals: (body.selected?.deals || []).length,
          tasks: (body.selected?.tasks || []).length,
        } : undefined,
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
