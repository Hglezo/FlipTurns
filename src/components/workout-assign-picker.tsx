"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import { GROUP_KEYS } from "@/lib/i18n";
import type { SwimmerProfile, SwimmerGroup } from "@/lib/types";
import { PERSONAL_ASSIGNMENT, SWIMMER_GROUPS } from "@/lib/types";

function triggerLabel(
  mode: "coach" | "swimmer",
  value: string,
  t: (k: TranslationKey) => string,
  swimmers: SwimmerProfile[],
  selfLabel: string | undefined,
  legacySwimmerName: string | undefined,
): string {
  if (value === "") return t("main.assignTo");
  if (mode === "swimmer" && value === "personal") return t("group.personal");
  if (value === `group:${PERSONAL_ASSIGNMENT}`) return t("group.personal");
  if (value.startsWith("group:")) {
    const g = value.slice(6) as SwimmerGroup;
    const key = GROUP_KEYS[g];
    return key ? t(key) : g;
  }
  if (value.startsWith("swimmer:")) {
    const id = value.slice(8);
    const s = swimmers.find((x) => x.id === id);
    return s?.full_name ?? legacySwimmerName ?? id.slice(0, 8);
  }
  return t("main.assignTo");
}

export type WorkoutAssignPickerProps = {
  mode: "coach" | "swimmer";
  /** Same values as the former &lt;select&gt;: "", "personal", `group:…`, `swimmer:uuid` */
  value: string;
  onValueChange: (next: string) => void;
  swimmers: SwimmerProfile[];
  t: (k: TranslationKey) => string;
  /** Swimmer mode: logged-in user id for the self row */
  userId?: string | null;
  /** Swimmer mode: display name for self row */
  selfLabel?: string | null;
  /** Coach mode: show legacy single-swimmer row when set */
  legacySwimmerId?: string | null;
  legacySwimmerName?: string | null;
  className?: string;
};

export function WorkoutAssignPicker({
  mode,
  value,
  onValueChange,
  swimmers,
  t,
  userId,
  selfLabel,
  legacySwimmerId,
  legacySwimmerName,
  className,
}: WorkoutAssignPickerProps) {
  const label = triggerLabel(mode, value, t, swimmers, selfLabel ?? undefined, legacySwimmerName ?? undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          "flex h-9 min-w-[10rem] max-w-full shrink-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm outline-none ring-offset-background",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem] max-w-[min(100vw-2rem,20rem)]">
        {mode === "swimmer" ? (
          <>
            <DropdownMenuItem className="font-semibold" onSelect={() => onValueChange("personal")}>
              {t("group.personal")}
            </DropdownMenuItem>
            {userId && (
              <DropdownMenuItem className="font-normal" onSelect={() => onValueChange(`swimmer:${userId}`)}>
                {selfLabel ?? swimmers.find((s) => s.id === userId)?.full_name ?? t("login.swimmer")}
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuLabel className="px-2 py-1.5 text-sm font-semibold text-foreground">
              {t("coach.group")}
            </DropdownMenuLabel>
            {SWIMMER_GROUPS.map((g) => (
              <DropdownMenuItem key={g} className="font-normal pl-3" onSelect={() => onValueChange(`group:${g}`)}>
                {t(GROUP_KEYS[g])}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="font-semibold" onSelect={() => onValueChange(`group:${PERSONAL_ASSIGNMENT}`)}>
              {t("group.personal")}
            </DropdownMenuItem>
            {legacySwimmerId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-2 py-1.5 text-sm font-semibold text-foreground">
                  {t("main.oneSwimmerAssignee")}
                </DropdownMenuLabel>
                <DropdownMenuItem className="font-normal pl-3" onSelect={() => onValueChange(`swimmer:${legacySwimmerId}`)}>
                  {legacySwimmerName ?? swimmers.find((s) => s.id === legacySwimmerId)?.full_name ?? legacySwimmerId.slice(0, 8)}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
