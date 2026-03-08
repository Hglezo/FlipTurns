"use client";

import { useState, useEffect } from "react";
import { analyzeWorkout } from "@/lib/workout-analyzer";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, MessageSquare } from "lucide-react";

interface Feedback {
  id: string;
  feedback_text: string | null;
  muscle_intensity: number | null;
  cardio_intensity: number | null;
  user_id?: string | null;
  anonymous?: boolean;
}

interface WorkoutAnalysisProps {
  content: string;
  date?: string;
  workoutId?: string;
  refreshKey?: number;
  className?: string;
  readOnly?: boolean;
  onFeedbackChange?: () => void;
}

export function WorkoutAnalysis({ content, date, workoutId, refreshKey, className = "", readOnly, onFeedbackChange }: WorkoutAnalysisProps) {
  const { user } = useAuth();
  const analysis = analyzeWorkout(content);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editMuscle, setEditMuscle] = useState<number | null>(null);
  const [editCardio, setEditCardio] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addText, setAddText] = useState("");
  const [addMuscle, setAddMuscle] = useState<number | null>(null);
  const [addCardio, setAddCardio] = useState<number | null>(null);
  const [addAnonymous, setAddAnonymous] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!date) return;
    if (!workoutId) {
      setFeedback([]);
      return;
    }
    async function fetchFeedback() {
      const selectCols = readOnly
        ? "id, feedback_text, muscle_intensity, cardio_intensity, user_id"
        : "id, feedback_text, muscle_intensity, cardio_intensity";
      let query = supabase
        .from("feedback")
        .select(selectCols)
        .eq("date", date)
        .or(`workout_id.eq.${workoutId},workout_id.is.null`);
      if (!readOnly && user?.id) query = query.eq("user_id", user.id);
      const { data } = await query.order("created_at", { ascending: false });
      setFeedback(data ?? []);
      if (readOnly && data?.length) {
        const userIds = [...new Set(data.map((d) => d.user_id).filter(Boolean))] as string[];
        if (userIds.length) {
          const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
          const map: Record<string, string> = {};
          for (const p of profiles ?? []) map[p.id] = p.full_name ?? "Unknown";
          setUserNames(map);
        } else setUserNames({});
      } else setUserNames({});
    }
    fetchFeedback();
  }, [date, workoutId, refreshKey, readOnly, user?.id]);

  const startEdit = (fb: Feedback) => {
    setError(null);
    setEditingId(fb.id);
    setEditText(fb.feedback_text ?? "");
    setEditMuscle(fb.muscle_intensity ?? null);
    setEditCardio(fb.cardio_intensity ?? null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditMuscle(null);
    setEditCardio(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const { error } = await supabase
      .from("feedback")
      .update({
        feedback_text: editText || null,
        muscle_intensity: editMuscle ?? null,
        cardio_intensity: editCardio ?? null,
      })
      .eq("id", editingId);
    setSaving(false);
    if (error) {
      console.error("Failed to update feedback:", error);
      setError(error.message || "Update failed. Run the feedback policies migration in Supabase SQL Editor.");
      return;
    }
    setError(null);
    setFeedback((prev) =>
      prev?.map((fb) =>
        fb.id === editingId
          ? { ...fb, feedback_text: editText || null, muscle_intensity: editMuscle, cardio_intensity: editCardio }
          : fb
      ) ?? []
    );
    cancelEdit();
    onFeedbackChange?.();
  };

  const deleteFeedback = async (id: string) => {
    if (!confirm("Delete this feedback?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("feedback").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      console.error("Failed to delete feedback:", error);
      setError(error.message || "Delete failed. Run the feedback policies migration in Supabase SQL Editor.");
      return;
    }
    setError(null);
    setFeedback((prev) => prev?.filter((fb) => fb.id !== id) ?? []);
    onFeedbackChange?.();
  };

  const submitAdd = async () => {
    if (!date || !user?.id) return;
    setAddSaving(true);
    const payload = { date, workout_id: workoutId || null, user_id: user.id, feedback_text: addText || null, muscle_intensity: addMuscle ?? null, cardio_intensity: addCardio ?? null };
    let { error } = await supabase.from("feedback").insert(addAnonymous ? { ...payload, anonymous: true } : payload);
    if (error?.message?.includes("anonymous")) {
      ({ error } = await supabase.from("feedback").insert(payload));
    }
    setAddSaving(false);
    if (error) {
      console.error("Failed to save feedback:", error.message || error.code || error);
      return;
    }
    setAddText("");
    setAddMuscle(null);
    setAddCardio(null);
    setAddAnonymous(false);
    setShowAddForm(false);
    let q = supabase
      .from("feedback")
      .select("id, feedback_text, muscle_intensity, cardio_intensity")
      .eq("date", date)
      .eq("user_id", user.id);
    if (workoutId) q = q.eq("workout_id", workoutId);
    else q = q.is("workout_id", null);
    const { data } = await q.order("created_at", { ascending: false });
    setFeedback(data ?? []);
    onFeedbackChange?.();
  };

  const hasAnalysis = analysis.totalMeters > 0;
  const hasFeedback = feedback && feedback.length > 0;
  const hasLoadedFeedback = feedback !== null;
  const showFeedbackSection = date && (hasFeedback || hasLoadedFeedback || !readOnly) && (!readOnly || !!workoutId);

  const IntensityScale = ({
    value,
    onChange,
    label,
  }: {
    value: number | null;
    onChange: (n: number) => void;
    label: string;
  }) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            type="button"
            variant={value === n ? "default" : "outline"}
            size="icon"
            className="size-8 shrink-0 text-xs"
            onClick={() => onChange(n)}
          >
            {n}
          </Button>
        ))}
      </div>
    </div>
  );

  if (!hasAnalysis && !showFeedbackSection) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {hasAnalysis && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Volume
          </p>
          <p className="mb-2 font-medium text-foreground">
            Total: {analysis.totalMeters.toLocaleString()} m
          </p>
          {analysis.sets.length > 0 && (
            <div className="space-y-1">
              {analysis.sets.map((set) => (
                <div
                  key={set.name}
                  className="flex justify-between text-muted-foreground"
                >
                  <span className="capitalize">{set.name}</span>
                  <span>{set.meters.toLocaleString()} m</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {showFeedbackSection && (
        <div className="space-y-2">
        {(hasFeedback || !hasLoadedFeedback || readOnly) && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-3">
          {hasFeedback && <p className="text-xs font-semibold uppercase tracking-wide text-accent-blue">Feedback</p>}
          {hasFeedback ? (
            feedback!.map((fb) => (
              <div key={fb.id} className="space-y-2 rounded-md border border-border/50 p-3">
                {readOnly && (fb.anonymous ? (
                  <p className="text-xs font-medium text-muted-foreground">Anonymous</p>
                ) : fb.user_id && userNames[fb.user_id] ? (
                  <p className="text-xs font-medium text-muted-foreground">{userNames[fb.user_id]}</p>
                ) : null)}
                {editingId === fb.id ? (
                  <div className="space-y-3">
                    <Textarea
                      placeholder="Your feedback (optional)"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="min-h-[80px] resize-none text-sm"
                    />
                    <IntensityScale label="Muscle intensity (1–5, optional)" value={editMuscle} onChange={setEditMuscle} />
                    <IntensityScale label="Cardio intensity (1–5, optional)" value={editCardio} onChange={setEditCardio} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {fb.feedback_text && (
                          <p className="text-muted-foreground whitespace-pre-wrap">{fb.feedback_text}</p>
                        )}
                        {(fb.muscle_intensity != null || fb.cardio_intensity != null) && (
                          <div className="mt-1 flex gap-4 text-muted-foreground text-xs">
                            {fb.muscle_intensity != null && <span>Muscle: {fb.muscle_intensity}/5</span>}
                            {fb.cardio_intensity != null && <span>Cardio: {fb.cardio_intensity}/5</span>}
                          </div>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => startEdit(fb)} aria-label="Edit feedback">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => deleteFeedback(fb.id)}
                            disabled={deletingId === fb.id}
                            aria-label="Delete feedback"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          ) : !hasLoadedFeedback ? (
            <p className="text-muted-foreground text-sm">Loading feedback…</p>
          ) : readOnly ? (
            <p className="text-muted-foreground text-sm">No feedback yet.</p>
          ) : null}
          {error && (
            <div className="space-y-1">
              <p className="text-sm text-destructive">{error}</p>
              <a href="/setup" className="text-sm text-primary underline">Fix in Database setup →</a>
            </div>
          )}
        </div>
        )}
        {!readOnly && user?.id && !showAddForm && !hasFeedback && (
          <Button variant="outline" size="sm" className="gap-2 mt-2" onClick={() => { setError(null); setShowAddForm(true); }}>
            <MessageSquare className="size-4" />
            Feedback
          </Button>
        )}
        {!readOnly && showAddForm && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-3 mt-2">
            <Textarea
              placeholder="Your feedback (optional)"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              className="min-h-[80px] resize-none text-sm"
            />
            <IntensityScale label="Muscle intensity (1–5, optional)" value={addMuscle} onChange={setAddMuscle} />
            <IntensityScale label="Cardio intensity (1–5, optional)" value={addCardio} onChange={setAddCardio} />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={addAnonymous} onChange={(e) => setAddAnonymous(e.target.checked)} className="rounded border-input" />
              <span className="text-muted-foreground">Submit anonymously (coach won&apos;t see your name)</span>
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitAdd} disabled={addSaving || !user?.id}>
                {addSaving ? "Saving…" : "Submit"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)} disabled={addSaving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
