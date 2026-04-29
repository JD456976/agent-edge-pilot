import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  }

  const supabaseUrl = Netlify.env.get("VITE_SUPABASE_URL") || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server not configured — SUPABASE_SERVICE_ROLE_KEY missing from Netlify env vars" }),
      { status: 500, headers: CORS }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { email, name, days } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email required" }), { status: 400, headers: CORS });
    }

    const accessDays = Math.max(1, Math.min(365, parseInt(days) || 30));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + accessDays);

    // 1. Create user (or fetch existing) via admin API
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: name || "",
        beta_access_days: accessDays,
      },
    });

    if (inviteError) {
      // If user already exists, just update their beta access
      if (inviteError.message?.includes("already been registered") || inviteError.code === "email_exists") {
        // Find the user and update access
        const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = listData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!existingUser) {
          return new Response(JSON.stringify({ error: "User exists but could not be found" }), { status: 400, headers: CORS });
        }

        // Update beta access on profile
        const { error: profileError } = await adminClient
          .from("profiles")
          .update({
            beta_access_active: true,
            beta_access_expires_at: expiresAt.toISOString(),
            beta_access_source: "admin_grant",
            full_name: name || undefined,
          })
          .eq("user_id", existingUser.id);

        if (profileError) throw profileError;

        return new Response(
          JSON.stringify({
            ok: true,
            existing_user: true,
            message: `Beta access updated for existing user ${email} — expires ${expiresAt.toLocaleDateString()}`,
          }),
          { status: 200, headers: CORS }
        );
      }
      throw inviteError;
    }

    const userId = inviteData.user?.id;
    if (!userId) throw new Error("No user ID returned from invite");

    // 2. Set beta access on the profile (may need a small delay for profile trigger)
    // Retry up to 3 times since the profile row is created by a DB trigger
    let profileError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 600));
      const { error } = await adminClient
        .from("profiles")
        .upsert({
          user_id: userId,
          email: email.toLowerCase(),
          full_name: name || "",
          beta_access_active: true,
          beta_access_expires_at: expiresAt.toISOString(),
          beta_access_source: "admin_invite",
        }, { onConflict: "user_id" });
      profileError = error;
      if (!error) break;
    }

    // Non-fatal if profile upsert fails — the user was still invited
    // and can redeem a code, or we can grant access from the Users panel
    if (profileError) {
      console.error("Profile upsert failed (non-fatal):", profileError.message);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Invite sent to ${email}. They'll receive an email to set their password. Access: ${accessDays} days.`,
        expires_at: expiresAt.toISOString(),
      }),
      { status: 200, headers: CORS }
    );
  } catch (e: any) {
    console.error("invite-user error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Invite failed" }),
      { status: 500, headers: CORS }
    );
  }
};

export const config: Config = {
  path: "/api/invite-user",
};
