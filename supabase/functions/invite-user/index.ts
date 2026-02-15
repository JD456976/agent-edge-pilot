import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the calling user is an admin
    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, name, role, organizationId, teamIds } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ error: "User with this email already exists" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create invitation record
    const { data: invitation, error: invErr } = await adminClient
      .from("user_invitations")
      .insert({
        email,
        name: name || null,
        role: role || "agent",
        organization_id: organizationId || null,
        team_ids: teamIds || [],
        invited_by: user.id,
      })
      .select()
      .single();

    if (invErr) {
      return new Response(JSON.stringify({ error: invErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Supabase Auth admin invite
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || supabaseUrl;
    const { data: inviteData, error: authErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/login?invite=${invitation.id}`,
      data: {
        name: name || "",
        invitation_id: invitation.id,
      },
    });

    if (authErr) {
      // Clean up invitation if auth invite fails
      await adminClient.from("user_invitations").delete().eq("id", invitation.id);
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If the auth invite auto-created the user, set up their profile
    if (inviteData?.user) {
      const newUserId = inviteData.user.id;

      // Update profile with org
      if (organizationId) {
        await adminClient
          .from("profiles")
          .update({ organization_id: organizationId })
          .eq("user_id", newUserId);
      }

      // Set role
      if (role && role !== "agent") {
        await adminClient.from("user_roles").delete().eq("user_id", newUserId);
        await adminClient.from("user_roles").insert({ user_id: newUserId, role });
      }

      // Add to teams
      if (teamIds && teamIds.length > 0) {
        const teamInserts = teamIds.map((tid: string) => ({
          team_id: tid,
          user_id: newUserId,
          role: "agent",
        }));
        await adminClient.from("team_members").insert(teamInserts);
      }

      // Update invitation status
      await adminClient
        .from("user_invitations")
        .update({ status: "sent" })
        .eq("id", invitation.id);
    }

    // Audit log
    await adminClient.from("admin_audit_events").insert({
      admin_user_id: user.id,
      action: "user_invited",
      metadata: { email, role, organizationId, teamIds, invitationId: invitation.id },
    });

    // Generate a copy-able invite link
    const inviteLink = `${origin}/login?invite=${invitation.id}`;

    return new Response(JSON.stringify({
      success: true,
      invitationId: invitation.id,
      inviteLink,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
