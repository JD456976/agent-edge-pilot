import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatICSDate(dateStr: string, addMinutes = 0): string {
  const d = new Date(dateStr);
  if (addMinutes) d.setMinutes(d.getMinutes() + addMinutes);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = token || authHeader?.replace("Bearer ", "");

    if (!bearerToken) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    });

    const { data: { user } } = await client.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    // Fetch appointments
    const { data: appointments } = await client
      .from("fub_appointments")
      .select("*")
      .eq("user_id", user.id)
      .order("start_at", { ascending: true });

    // Fetch tasks
    const { data: tasks } = await client
      .from("tasks")
      .select("*")
      .eq("assigned_to_user_id", user.id)
      .is("completed_at", null)
      .order("due_at", { ascending: true });

    // Fetch deals (active only)
    const { data: deals } = await client
      .from("deals")
      .select("*")
      .eq("assigned_to_user_id", user.id)
      .neq("stage", "closed")
      .order("close_date", { ascending: true });

    const events: string[] = [];

    // Appointments
    for (const a of appointments || []) {
      const dtStart = formatICSDate(a.start_at);
      const dtEnd = a.end_at ? formatICSDate(a.end_at) : formatICSDate(a.start_at, 60);
      events.push([
        "BEGIN:VEVENT",
        `UID:fub-${a.id}@dealpilot`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeICS(a.title || "Appointment")}`,
        a.location ? `LOCATION:${escapeICS(a.location)}` : "",
        a.description ? `DESCRIPTION:${escapeICS(a.description)}` : "",
        "END:VEVENT",
      ].filter(Boolean).join("\r\n"));
    }

    // Tasks
    for (const t of tasks || []) {
      const dtStart = formatICSDate(t.due_at);
      const dtEnd = formatICSDate(t.due_at, 30);
      events.push([
        "BEGIN:VEVENT",
        `UID:task-${t.id}@dealpilot`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeICS(`Task: ${t.title}`)}`,
        `DESCRIPTION:${escapeICS(`Type: ${t.type}`)}`,
        "END:VEVENT",
      ].join("\r\n"));
    }

    // Deal close dates
    for (const d of deals || []) {
      const dtStart = formatICSDate(d.close_date);
      const dtEnd = formatICSDate(d.close_date, 60);
      events.push([
        "BEGIN:VEVENT",
        `UID:deal-${d.id}@dealpilot`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeICS(`Close: ${d.title}`)}`,
        `DESCRIPTION:${escapeICS(`Stage: ${d.stage} | Price: $${d.price}`)}`,
        "END:VEVENT",
      ].join("\r\n"));
    }

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Deal Pilot//Calendar Feed//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Deal Pilot",
      "X-WR-CALDESC:Appointments tasks and deal milestones from Deal Pilot",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    return new Response(ics, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="deal-pilot.ics"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
