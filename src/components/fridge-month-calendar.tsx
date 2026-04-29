"use client";

import * as React from "react";
import { format } from "date-fns";
import type { DayButton } from "react-day-picker";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import type { MonthCalendarAssigneeChip } from "@/lib/workouts";
import { cn } from "@/lib/utils";

const FridgePreviewContext = React.createContext<Record<string, MonthCalendarAssigneeChip[]>>({});

const MAX_COL_CHIPS = 4;

const DAY_CELL_BOX = "h-[7rem]";

function ChipStack({ list }: { list: MonthCalendarAssigneeChip[] }) {
  const visible = list.slice(0, MAX_COL_CHIPS);
  const extra = list.length - visible.length;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-wrap content-start justify-start gap-0.5 overflow-hidden">
      {visible.map((chip, i) => (
        <span key={i} className={chip.className}>
          {chip.initials}
        </span>
      ))}
      {extra > 0 ? (
        <span className="inline-flex items-center rounded-[3px] bg-muted px-1 py-px text-[10px] font-semibold leading-none text-muted-foreground">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function FridgeDayButton(props: React.ComponentProps<typeof DayButton>) {
  const chipsByDateKey = React.useContext(FridgePreviewContext);
  const { className, day, modifiers, children, ...rest } = props;
  const dateKey = format(day.date, "yyyy-MM-dd");
  const chips = chipsByDateKey[dateKey] ?? [];
  const am = chips.filter((c) => c.column === "am");
  const pm = chips.filter((c) => c.column === "pm");

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      className={cn(
        className,
        "aspect-auto h-full max-h-full min-h-0 flex-col items-stretch justify-start gap-1 rounded-md border border-border/90 bg-card/70 p-1 pt-1 text-left font-normal shadow-none",
        "hover:bg-accent/80 dark:hover:text-foreground",
        "data-[selected-single=true]:border-primary data-[selected-single=true]:bg-primary/15 data-[selected-single=true]:text-foreground dark:data-[selected-single=true]:hover:text-foreground",
        modifiers.outside && "border-border/50 bg-muted/30 opacity-90",
        modifiers.outside && !modifiers.selected && "text-muted-foreground",
      )}
      {...rest}
    >
      <span className="flex w-full shrink-0 justify-start text-xs font-medium tabular-nums leading-tight">
        {children}
      </span>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-1 overflow-hidden">
        <ChipStack list={am} />
        <ChipStack list={pm} />
      </div>
    </CalendarDayButton>
  );
}

export type FridgeMonthCalendarProps = {
  selectedDate: Date;
  weekStartsOn: 0 | 1;
  chipsByDateKey: Record<string, MonthCalendarAssigneeChip[]>;
  onSelect: (d: Date) => void;
  onMonthChange: (d: Date) => void;
};

export function FridgeMonthCalendar({
  selectedDate,
  weekStartsOn,
  chipsByDateKey,
  onSelect,
  onMonthChange,
}: FridgeMonthCalendarProps) {
  return (
    <FridgePreviewContext.Provider value={chipsByDateKey}>
      <Card className="w-full shrink-0 overflow-hidden">
        <CardContent className="w-full p-0">
          <Calendar
            className="w-full min-w-0 p-1.5 [--cell-size:2rem]"
            classNames={{
              months: "relative mx-auto flex w-full max-w-full flex-col gap-2 md:flex-row",
              month: "flex w-full flex-col gap-1",
              week: "mt-0.5 flex w-full items-stretch gap-px",
              day: cn(
                "group/day relative aspect-auto w-full flex-1 p-0 text-center select-none",
                DAY_CELL_BOX,
                "[&:last-child[data-selected=true]_button]:rounded-md data-[selected=true]:rounded-md [&:first-child[data-selected=true]_button]:rounded-md",
              ),
              today: "rounded-md data-[selected=true]:rounded-md",
            }}
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && onSelect(d)}
            month={selectedDate}
            weekStartsOn={weekStartsOn}
            onMonthChange={onMonthChange}
            components={{
              DayButton: FridgeDayButton,
            }}
          />
        </CardContent>
      </Card>
    </FridgePreviewContext.Provider>
  );
}
