import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

async function verifyAuth(request: Request) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return { error: "Unauthorized" as const };

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "Unauthorized" as const };
  return { user };
}

export async function POST(request: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Account deletion is not configured. Add SUPABASE_SERVICE_ROLE_KEY to your environment." },
        { status: 500 },
      );
    }

    const auth = await verifyAuth(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : null;

    const adminClient = createServerSupabaseClient();

    if (targetUserId) {
      const { data: profile } = await adminClient.from("profiles").select("role").eq("id", auth.user.id).single();
      if (profile?.role !== "coach") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const deleteId = targetUserId || auth.user.id;
    const { error } = await adminClient.auth.admin.deleteUser(deleteId);
    if (error) {
      console.error("Delete account error:", error);
      return NextResponse.json({ error: error.message ?? "Failed to delete account" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete account" },
      { status: 500 },
    );
  }
}
