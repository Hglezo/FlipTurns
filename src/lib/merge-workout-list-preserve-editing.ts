type RowWithId = { id: string };

export function mergeWorkoutListPreserveEditingRow<T extends RowWithId>(
  incoming: T[],
  prev: T[],
  editingIndex: number | null,
): T[] {
  if (editingIndex == null || editingIndex >= prev.length) {
    return incoming.slice();
  }

  const draft = prev[editingIndex];
  const out = incoming.slice();

  if (!draft.id) {
    if (editingIndex > out.length) {
      return [...out, draft];
    }
    out.splice(editingIndex, 0, draft);
    return out;
  }

  const serverIdx = out.findIndex((w) => w.id === draft.id);
  if (serverIdx >= 0) {
    out[serverIdx] = draft;
    return out;
  }

  return [...out, draft];
}
