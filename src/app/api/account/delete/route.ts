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
      console.error("Delete account: SUPABASE_SERVICE_ROLE_KEY is not set");
      return NextResponse.json(
        {
          error:
            "Account deletion is not configured. Add SUPABASE_SERVICE_ROLE_KEY to your environment: .env.local for local development, or your hosting provider's environment variables (e.g. Vercel) for production. Get the key from Supabase Dashboard → Settings → API.",
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

    const adminClient = createServerSupabaseClient();
    const { error } = await adminClient.auth.admin.deleteUser(user.id);

    if (error) {
      console.error("Delete account error:", error);
      return NextResponse.json(
        { error: error.message ?? "Failed to delete account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Delete account error:", err);
    return NextResponse.json(
      {
        error:
          message.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? "Account deletion is not configured. Add SUPABASE_SERVICE_ROLE_KEY to your environment: .env.local for local development, or your hosting provider's environment variables (e.g. Vercel) for production. Get the key from Supabase Dashboard → Settings → API."
            : message,
      },
      { status: 500 }
    );
  }
}
