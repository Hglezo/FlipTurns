import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Anthropic limit is 5 MB for base64; base64 adds ~33% overhead, so target ~3.5 MB raw
const TARGET_BUFFER_BYTES = Math.floor(3.5 * 1024 * 1024);

function parseDataUrlImage(imageData: string): { base64: string; mime: string } {
  if (!imageData.startsWith("data:")) {
    return { base64: imageData, mime: "image/jpeg" };
  }
  const comma = imageData.indexOf(",");
  if (comma === -1) {
    return { base64: "", mime: "image/jpeg" };
  }
  const meta = imageData.slice(5, comma).trim();
  const payload = imageData.slice(comma + 1);
  const mimePart = meta.split(";")[0]?.trim() ?? "image/jpeg";
  return {
    base64: payload,
    mime: mimePart.startsWith("image/") ? mimePart : "image/jpeg",
  };
}

async function compressImage(base64: string, mime: string): Promise<{ base64: string; mime: string }> {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length <= TARGET_BUFFER_BYTES) return { base64, mime };

  let quality = 85;
  let result: Buffer;
  do {
    result = await sharp(buffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    quality -= 15;
  } while (result.length > TARGET_BUFFER_BYTES && quality >= 40);
  return { base64: result.toString("base64"), mime: "image/jpeg" };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

async function verifyAuth(request: Request) {
  const accessToken =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-auth-token") ??
    "";
  if (!accessToken) return { error: "Unauthorized" as const };

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "Unauthorized" as const };

  const adminClient = createServerSupabaseClient();
  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role?.toLowerCase();
  if (!role || !["coach", "swimmer"].includes(role)) return { error: "Forbidden" as const };

  return { user };
}

const WORKOUT_FORMAT_EXAMPLE = `warm up
2x400 (100 swim 50 drill 100 swim 50 drill 100 kick)

pre set
2x50 swim on 50"
2x50 drill on 60"
*fins on
2x50 swim on 45"

200 social kick w/fins

main set
6x50 Pull (2: on 50", 1: on 45")
6x100 swim on 1:25 (3rd and 6th one IM on 1:40)
2x150 swim on 2:10
2x150 pull&pads on 2:05
2x150 w/fins 2'

cool down
3x
100 w/fins (kick faster than pull)
50 (25 stroke 25 easy)`;

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === "Forbidden" ? 403 : 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Image-to-workout is not configured. Add ANTHROPIC_API_KEY to your environment." },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const imageData = typeof body.image === "string" ? body.image : null;
    if (!imageData) {
      return NextResponse.json({ error: "Missing image data" }, { status: 400 });
    }

    const { base64, mime } = parseDataUrlImage(imageData);
    if (!base64.trim()) {
      return NextResponse.json({ error: "Missing image data" }, { status: 400 });
    }

    const { base64: compressedBase64, mime: compressedMime } = await compressImage(base64, mime);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: "You are a swim workout transcriber. Extract the swim workout from the image (whiteboard, paper, screen, handwritten, or printed) and output ONLY the workout text. No preamble, no explanation. Use the exact format shown in the example.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: compressedMime, data: compressedBase64 },
              },
              {
                type: "text",
                text: `Format the workout exactly like this example. Use lowercase section headers (warm up, pre set, main set, cool down, etc.)—no capitals. Use sets like "Nx distance (description)" or "Nx distance on interval". Use * for equipment notes like *fins on. Preserve all reps, distances, intervals, and stroke types from the image.\n\nExample format:\n${WORKOUT_FORMAT_EXAMPLE}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", response.status, err);
      return NextResponse.json(
        { error: "Failed to analyze image" },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const content = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";

    if (!content) {
      return NextResponse.json(
        { error: "Could not extract workout from image" },
        { status: 422 },
      );
    }

    return NextResponse.json({ content });
  } catch (err) {
    console.error("Workout from-image error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process image" },
      { status: 500 },
    );
  }
}
