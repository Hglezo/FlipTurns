import { NextResponse } from "next/server";
import { Pool } from "pg";

/**
 * Saves workouts via direct PostgreSQL connection.
 * Bypasses PostgREST schema cache issues (e.g. "Could not find column in schema cache").
 *
 * Requires DATABASE_URL in .env.local - get it from Supabase Dashboard:
 * Project Settings → Database → Connection string (URI) → Use "Transaction" mode (port 6543)
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(request: Request) {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) {
      return NextResponse.json(
        { error: "DATABASE_URL not configured. Add it to .env.local from Supabase Dashboard → Database → Connection string." },
        { status: 500 }
      );
    }

    let body: {
      dateKey: string;
      toUpdate: { id: string; content: string; workout_type: string | null; workout_category: string | null }[];
      toInsert: { content: string; workout_type: string | null; workout_category: string | null }[];
      toDelete: string[];
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { dateKey, toUpdate, toInsert, toDelete } = body;
    if (!dateKey || !Array.isArray(toUpdate) || !Array.isArray(toInsert) || !Array.isArray(toDelete)) {
      return NextResponse.json({ error: "Missing dateKey, toUpdate, toInsert, or toDelete" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
    for (const id of toDelete) {
      await client.query("DELETE FROM public.workouts WHERE id = $1", [id]);
    }

    for (const w of toUpdate) {
      await client.query(
        `UPDATE public.workouts SET content = $1, workout_type = $2, workout_category = $3, updated_at = $4 WHERE id = $5`,
        [w.content, w.workout_type || null, w.workout_category || null, new Date().toISOString(), w.id]
      );
    }

    for (const w of toInsert) {
      await client.query(
        `INSERT INTO public.workouts (date, content, workout_type, workout_category) VALUES ($1, $2, $3, $4)`,
        [dateKey, w.content, w.workout_type || null, w.workout_category || null]
      );
    }

    const { rows } = await client.query(
      "SELECT * FROM public.workouts WHERE date = $1 ORDER BY created_at ASC",
      [dateKey]
    );

    return NextResponse.json(rows);
    } catch (err) {
      console.error("Workouts save error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to save workouts" },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Workouts save error (connection etc):", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save workouts" },
      { status: 500 }
    );
  }
}
