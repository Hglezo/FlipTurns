"use client";

import { analyzeWorkout } from "@/lib/workout-analyzer";

interface WorkoutAnalysisProps {
  content: string;
  className?: string;
}

export function WorkoutAnalysis({ content, className = "" }: WorkoutAnalysisProps) {
  const analysis = analyzeWorkout(content);

  if (analysis.totalMeters === 0) return null;

  return (
    <div className={`rounded-lg border bg-muted/50 p-3 text-sm ${className}`}>
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
  );
}
