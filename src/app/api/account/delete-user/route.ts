import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
 "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function POST(request: Request) {
  try {
    if (!supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          error:
            "Account deletion is not configured. Add SUPABASE_SERVICE_ROLE_KEY to your environment.",
        },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : null;
    if (!targetUserId) {
      return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });
    }

    const adminClient = createServerSupabaseClient();
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "coach") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (error) {
      console.error("Delete user error:", error);
      return NextResponse.json(
        { error: error.message ?? "Failed to delete account" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete account" },
      { status: 500 }
    );
  }
}
