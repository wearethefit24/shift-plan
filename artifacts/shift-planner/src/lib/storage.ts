import {
  createInitialState,
  type AppState,
  type ConditionRule,
  type Employee,
  type EmployeeMonthPreferences,
  type ShiftSlot,
} from "./shift-model";

const STORAGE_KEY = "shift-planner.app-state.v1";
const BACKUP_FORMAT = "shift-planner-backup";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmployee(value: unknown): value is Employee {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.role === "string" &&
    typeof value.basicStartTime === "string" &&
    typeof value.basicEndTime === "string"
  );
}

function isShiftSlot(value: unknown): value is ShiftSlot {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string"
  );
}

function isPreferences(value: unknown): value is EmployeeMonthPreferences {
  if (!isRecord(value)) return false;
  return (
    typeof value.targetOffDays === "number" &&
    Array.isArray(value.requestedOffDays) &&
    value.requestedOffDays.every((day) => typeof day === "number") &&
    Array.isArray(value.preferredWorkDays) &&
    value.preferredWorkDays.every((day) => typeof day === "number") &&
    isRecord(value.preferredShiftByDay) &&
    Object.values(value.preferredShiftByDay).every(
      (shiftId) => typeof shiftId === "string",
    )
  );
}

function isRule(value: unknown): value is ConditionRule {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.enabled !== "boolean") {
    return false;
  }
  switch (value.type) {
    case "staffing":
      return (
        (typeof value.weekday === "number" || value.weekday === null) &&
        typeof value.shiftSlotId === "string" &&
        typeof value.requiredCount === "number"
      );
    case "max-consecutive":
      return typeof value.maxDays === "number";
    case "pair":
      return (
        typeof value.employeeA === "string" &&
        typeof value.employeeB === "string" &&
        (value.mode === "together" || value.mode === "separate")
      );
    case "weekday-block":
      return typeof value.employeeId === "string" && typeof value.weekday === "number";
    case "date-assignment":
      return (
        typeof value.employeeId === "string" &&
        typeof value.month === "string" &&
        typeof value.day === "number" &&
        (value.action === "off" || value.action === "work") &&
        (value.shiftSlotId === undefined || typeof value.shiftSlotId === "string")
      );
    default:
      return false;
  }
}

function validateAppState(value: unknown): AppState {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("対応していないバックアップ形式です。");
  }
  if (
    typeof value.selectedMonth !== "string" ||
    !/^\d{4}-\d{2}$/.test(value.selectedMonth) ||
    !Array.isArray(value.employees) ||
    !value.employees.every(isEmployee) ||
    !Array.isArray(value.shiftSlots) ||
    !value.shiftSlots.every(isShiftSlot) ||
    !Array.isArray(value.rules) ||
    !value.rules.every(isRule) ||
    !isRecord(value.preferencesByMonth) ||
    !isRecord(value.schedulesByMonth)
  ) {
    throw new Error("バックアップのデータ構造が正しくありません。");
  }

  const preferencesByMonth: AppState["preferencesByMonth"] = {};
  for (const [month, monthPreferences] of Object.entries(value.preferencesByMonth)) {
    if (!isRecord(monthPreferences)) {
      throw new Error(`${month}の希望データを読み取れません。`);
    }
    const parsedPreferences: Record<string, EmployeeMonthPreferences> = {};
    for (const [employeeId, preferences] of Object.entries(monthPreferences)) {
      if (!isPreferences(preferences)) {
        throw new Error(`${month}の社員希望データを読み取れません。`);
      }
      parsedPreferences[employeeId] = preferences;
    }
    preferencesByMonth[month] = parsedPreferences;
  }

  const schedulesByMonth: AppState["schedulesByMonth"] = {};
  for (const [month, assignments] of Object.entries(value.schedulesByMonth)) {
    if (
      !isRecord(assignments) ||
      !Object.values(assignments).every(
        (assignment) =>
          assignment === null || typeof assignment === "string",
      )
    ) {
      throw new Error(`${month}のシフト表を読み取れません。`);
    }
    schedulesByMonth[month] = assignments as Record<string, string | null>;
  }

  return {
    version: 1,
    selectedMonth: value.selectedMonth,
    employees: value.employees,
    shiftSlots: value.shiftSlots,
    rules: value.rules,
    preferencesByMonth,
    schedulesByMonth,
  };
}

export function loadAppState(): { state: AppState; error?: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: createInitialState() };
    return { state: validateAppState(JSON.parse(raw)) };
  } catch (error) {
    return {
      state: createInitialState(),
      error:
        error instanceof Error
          ? `保存データを読み込めませんでした: ${error.message}`
          : "保存データを読み込めませんでした。",
    };
  }
}

export function saveAppState(state: AppState): string | null {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch (error) {
    return error instanceof Error
      ? `ブラウザへの保存に失敗しました: ${error.message}`
      : "ブラウザへの保存に失敗しました。空き容量を確認してください。";
  }
}

export function parseBackupJson(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSONファイルを読み取れません。内容をご確認ください。");
  }
  if (
    isRecord(parsed) &&
    parsed.format === BACKUP_FORMAT &&
    parsed.version === 1
  ) {
    return validateAppState(parsed.state);
  }
  return validateAppState(parsed);
}

export function downloadBackup(state: AppState): void {
  const payload = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shift-planner-${state.selectedMonth}-backup.json`;
  link.click();
  URL.revokeObjectURL(url);
}
