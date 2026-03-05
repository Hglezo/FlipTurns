import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
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

    if (toDelete.length > 0) {
      const { error } = await supabase.from("workouts").delete().in("id", toDelete);
      if (error) throw error;
    }

    for (const w of toUpdate) {
      const { error } = await supabase
        .from("workouts")
        .update({
          content: w.content,
          workout_type: w.workout_type,
          workout_category: w.workout_category,
          updated_at: new Date().toISOString(),
        })
        .eq("id", w.id);
      if (error) throw error;
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("workouts").insert(
        toInsert.map((w) => ({
          date: dateKey,
          content: w.content,
          workout_type: w.workout_type,
          workout_category: w.workout_category,
        }))
      );
      if (error) throw error;
    }

    const { data: rows, error } = await supabase
      .from("workouts")
      .select("*")
      .eq("date", dateKey)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json(rows ?? []);
  } catch (err) {
    console.error("Workouts save error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save workouts" },
      { status: 500 }
    );
  }
}
