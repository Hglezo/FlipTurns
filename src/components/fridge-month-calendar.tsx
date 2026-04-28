"use client";

import * as React from "react";
import { format } from "date-fns";
import type { DayButton } from "react-day-picker";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import type { MonthCalendarAssigneeChip } from "@/lib/workouts";
import { cn } from "@/lib/utils";

const FridgePreviewContext = React.createContext<Record<string, MonthCalendarAssigneeChip[]>>({});

const MAX_VISIBLE_CHIPS = 8;

function FridgeDayButton(props: React.ComponentProps<typeof DayButton>) {
  const chipsByDateKey = React.useContext(FridgePreviewContext);
  const { className, day, modifiers, children, ...rest } = props;
  const dateKey = format(day.date, "yyyy-MM-dd");
  const chips = chipsByDateKey[dateKey] ?? [];
  const visible = chips.slice(0, MAX_VISIBLE_CHIPS);
  const extra = chips.length - visible.length;

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      className={cn(
        className,
        "aspect-auto min-h-[2.85rem] flex-col items-stretch justify-start gap-0.5 rounded-md border border-border/90 bg-card/70 p-0.5 pt-0.5 text-left font-normal shadow-none",
        "hover:bg-accent/80 dark:hover:text-foreground",
        "data-[selected-single=true]:border-primary data-[selected-single=true]:bg-primary/15 data-[selected-single=true]:text-foreground dark:data-[selected-single=true]:hover:text-foreground",
        modifiers.outside && "border-border/50 bg-muted/30 opacity-90",
        modifiers.outside && !modifiers.selected && "text-muted-foreground",
      )}
      {...rest}
    >
      <span className="flex w-full shrink-0 justify-start text-[10px] font-medium tabular-nums leading-none">
        {children}
      </span>
      <div className="flex min-h-0 flex-1 flex-wrap content-start justify-start gap-0.5 overflow-hidden">
        {visible.map((chip, i) => (
          <span key={i} className={chip.className}>
            {chip.initials}
          </span>
        ))}
        {extra > 0 ? (
          <span className="inline-flex items-center rounded-[3px] bg-muted px-[3px] py-px text-[8px] font-semibold leading-none text-muted-foreground">
            +{extra}
          </span>
        ) : null}
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
            className="w-full min-w-0 p-1 [--cell-size:1.65rem]"
            classNames={{
              months: "relative mx-auto flex w-full max-w-full flex-col gap-2 md:flex-row",
              month: "flex w-full flex-col gap-1",
              week: "mt-0.5 flex w-full gap-px",
              day: cn(
                "group/day relative aspect-auto h-full min-h-[2.85rem] w-full flex-1 p-0 text-center select-none",
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
