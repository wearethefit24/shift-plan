export interface Employee {
  id: string;
  name: string;
  role: string;
  basicStartTime: string;
  basicEndTime: string;
}

export interface ShiftSlot {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface RuleBase {
  id: string;
  enabled: boolean;
}

export type ConditionRule =
  | (RuleBase & {
      type: "staffing";
      weekday: number | null;
      shiftSlotId: string;
      requiredCount: number;
    })
  | (RuleBase & {
      type: "max-consecutive";
      maxDays: number;
    })
  | (RuleBase & {
      type: "pair";
      employeeA: string;
      employeeB: string;
      mode: "together" | "separate";
    })
  | (RuleBase & {
      type: "weekday-block";
      employeeId: string;
      weekday: number;
    })
  | (RuleBase & {
      type: "date-assignment";
      employeeId: string;
      month: string;
      day: number;
      action: "off" | "work";
      shiftSlotId?: string;
    });

export interface EmployeeMonthPreferences {
  targetOffDays: number;
  requestedOffDays: number[];
  preferredWorkDays: number[];
  preferredShiftByDay: Record<string, string>;
}

export type AssignmentMap = Record<string, string | null>;

export interface ScheduleWarning {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  reason: string;
  day?: number;
  employeeId?: string;
  shiftSlotId?: string;
}

export interface AppState {
  version: 1;
  selectedMonth: string;
  employees: Employee[];
  shiftSlots: ShiftSlot[];
  rules: ConditionRule[];
  preferencesByMonth: Record<
    string,
    Record<string, EmployeeMonthPreferences>
  >;
  schedulesByMonth: Record<string, AssignmentMap>;
}

export interface ScheduleInput {
  month: string;
  employees: Employee[];
  shiftSlots: ShiftSlot[];
  rules: ConditionRule[];
  preferences: Record<string, EmployeeMonthPreferences>;
}

export interface ScheduleAnalysisInput extends ScheduleInput {
  assignments: AssignmentMap;
}

export const DEFAULT_MONTH = "2026-12";

export function createMonthPreferences(
  targetOffDays = 9,
): EmployeeMonthPreferences {
  return {
    targetOffDays,
    requestedOffDays: [],
    preferredWorkDays: [],
    preferredShiftByDay: {},
  };
}

export function createInitialState(): AppState {
  const employees: Employee[] = [
    {
      id: "employee-1",
      name: "佐藤 花",
      role: "リーダー",
      basicStartTime: "09:00",
      basicEndTime: "17:00",
    },
    {
      id: "employee-2",
      name: "高橋 陸",
      role: "社員",
      basicStartTime: "09:00",
      basicEndTime: "17:00",
    },
    {
      id: "employee-3",
      name: "田中 美咲",
      role: "アルバイト",
      basicStartTime: "09:00",
      basicEndTime: "17:00",
    },
    {
      id: "employee-4",
      name: "伊藤 蓮",
      role: "社員",
      basicStartTime: "13:00",
      basicEndTime: "21:00",
    },
    {
      id: "employee-5",
      name: "渡辺 葵",
      role: "アルバイト",
      basicStartTime: "13:00",
      basicEndTime: "21:00",
    },
    {
      id: "employee-6",
      name: "山本 悠真",
      role: "アルバイト",
      basicStartTime: "13:00",
      basicEndTime: "21:00",
    },
  ];
  const shiftSlots: ShiftSlot[] = [
    { id: "morning", name: "早番", startTime: "09:00", endTime: "17:00" },
    { id: "evening", name: "遅番", startTime: "13:00", endTime: "21:00" },
  ];
  const rules: ConditionRule[] = [
    {
      id: "staffing-morning",
      enabled: true,
      type: "staffing",
      weekday: null,
      shiftSlotId: "morning",
      requiredCount: 2,
    },
    {
      id: "staffing-evening",
      enabled: true,
      type: "staffing",
      weekday: null,
      shiftSlotId: "evening",
      requiredCount: 2,
    },
    {
      id: "max-consecutive",
      enabled: true,
      type: "max-consecutive",
      maxDays: 5,
    },
  ];
  const preferences: Record<string, EmployeeMonthPreferences> = {};
  employees.forEach((employee, index) => {
    preferences[employee.id] = {
      ...createMonthPreferences(9),
      requestedOffDays: [3 + index, 17 + index],
      preferredWorkDays: [8 + index, 23 - index],
      preferredShiftByDay: {
        ...Object.fromEntries(
          [8 + index, 23 - index].map((day) => [
            String(day),
            index < 3 ? "morning" : "evening",
          ]),
        ),
      },
    };
  });

  return {
    version: 1,
    selectedMonth: DEFAULT_MONTH,
    employees,
    shiftSlots,
    rules,
    preferencesByMonth: {
      [DEFAULT_MONTH]: preferences,
    },
    schedulesByMonth: {},
  };
}

export function assignmentKey(employeeId: string, day: number): string {
  return `${employeeId}:${day}`;
}

export function getMonthDayCount(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    return 31;
  }
  return new Date(year, monthNumber, 0).getDate();
}
