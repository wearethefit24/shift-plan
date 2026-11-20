import {
  assignmentKey,
  createMonthPreferences,
  getMonthDayCount,
  type AssignmentMap,
  type ConditionRule,
  type Employee,
  type EmployeeMonthPreferences,
  type ScheduleAnalysisInput,
  type ScheduleInput,
  type ScheduleWarning,
  type ShiftSlot,
} from "./shift-model";

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function weekdayFor(month: string, day: number): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, day).getDay();
}

function monthPreferences(
  preferences: Record<string, EmployeeMonthPreferences>,
  employeeId: string,
  dayCount: number,
): EmployeeMonthPreferences {
  const value = preferences[employeeId] ?? createMonthPreferences();
  return {
    targetOffDays: Math.min(dayCount, Math.max(0, value.targetOffDays ?? 9)),
    requestedOffDays: value.requestedOffDays ?? [],
    preferredWorkDays: value.preferredWorkDays ?? [],
    preferredShiftByDay: value.preferredShiftByDay ?? {},
  };
}

function coversShift(employee: Employee, shift: ShiftSlot): boolean {
  return (
    employee.basicStartTime <= shift.startTime &&
    employee.basicEndTime >= shift.endTime
  );
}

function staffingRequirement(
  rules: ConditionRule[],
  dayOfWeek: number,
  shiftSlotId: string,
): number {
  const matching = rules.filter(
    (rule): rule is Extract<ConditionRule, { type: "staffing" }> =>
      rule.enabled &&
      rule.type === "staffing" &&
      rule.shiftSlotId === shiftSlotId &&
      (rule.weekday === null || rule.weekday === dayOfWeek),
  );
  const specific = matching.some((rule) => rule.weekday === dayOfWeek);
  const applicable = specific
    ? matching.filter((rule) => rule.weekday === dayOfWeek)
    : matching;
  return applicable.reduce(
    (maximum, rule) =>
      rule.type === "staffing"
        ? Math.max(maximum, Math.max(0, rule.requiredCount))
        : maximum,
    0,
  );
}

function activeMaxConsecutive(rules: ConditionRule[]): number {
  const active = rules.filter(
    (rule): rule is Extract<ConditionRule, { type: "max-consecutive" }> =>
      rule.enabled && rule.type === "max-consecutive",
  );
  return active.length
    ? Math.min(...active.map((rule) => Math.max(1, rule.maxDays)))
    : 7;
}

function dateAssignmentRules(
  rules: ConditionRule[],
  month: string,
  employeeId: string,
  day: number,
): Extract<ConditionRule, { type: "date-assignment" }>[] {
  return rules.filter(
    (rule): rule is Extract<ConditionRule, { type: "date-assignment" }> =>
      rule.enabled &&
      rule.type === "date-assignment" &&
      rule.month === month &&
      rule.employeeId === employeeId &&
      rule.day === day,
  );
}

function isWeekdayBlocked(
  rules: ConditionRule[],
  employeeId: string,
  weekday: number,
): boolean {
  return rules.some(
    (rule) =>
      rule.enabled &&
      rule.type === "weekday-block" &&
      rule.employeeId === employeeId &&
      rule.weekday === weekday,
  );
}

function addWarning(
  warnings: ScheduleWarning[],
  warning: ScheduleWarning,
): void {
  if (!warnings.some((existing) => existing.id === warning.id)) {
    warnings.push(warning);
  }
}

export function analyzeSchedule({
  month,
  employees,
  shiftSlots,
  rules,
  preferences,
  assignments,
}: ScheduleAnalysisInput): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const days = getMonthDayCount(month);
  const slotIds = new Set(shiftSlots.map((slot) => slot.id));

  for (const employee of employees) {
    const employeePreferences = monthPreferences(
      preferences,
      employee.id,
      days,
    );
    let actualOffDays = 0;
    let consecutiveWorkDays = 0;
    let consecutiveWarningAdded = false;

    for (let day = 1; day <= days; day += 1) {
      const value = assignments[assignmentKey(employee.id, day)] ?? null;
      const working = value !== null;
      if (!working) {
        actualOffDays += 1;
        consecutiveWorkDays = 0;
        consecutiveWarningAdded = false;
        for (const dateRule of dateAssignmentRules(
          rules,
          month,
          employee.id,
          day,
        )) {
          if (dateRule.action === "work") {
            addWarning(warnings, {
              id: `date-work-missing-${dateRule.id}`,
              severity: "error",
              title: "出勤指定日に配置されていません",
              reason: `${employee.name}さんの${day}日は条件で出勤に指定されています。`,
              day,
              employeeId: employee.id,
            });
          }
        }
        continue;
      }

      consecutiveWorkDays += 1;
      if (!slotIds.has(value)) {
        addWarning(warnings, {
          id: `unknown-slot-${employee.id}-${day}`,
          severity: "warning",
          title: "未登録のシフト枠です",
          reason: `${employee.name}さんの${day}日に、現在のシフト枠にない値が設定されています。`,
          day,
          employeeId: employee.id,
        });
      } else {
        const assignedSlot = shiftSlots.find((slot) => slot.id === value);
        if (assignedSlot && !coversShift(employee, assignedSlot)) {
          addWarning(warnings, {
            id: `outside-hours-${employee.id}-${day}`,
            severity: "warning",
            title: "基本勤務時間外のシフトです",
            reason: `${employee.name}さんの${day}日の配置は基本勤務時間（${employee.basicStartTime}〜${employee.basicEndTime}）に収まりません。`,
            day,
            employeeId: employee.id,
            shiftSlotId: value,
          });
        }
      }

      if (employeePreferences.requestedOffDays.includes(day)) {
        addWarning(warnings, {
          id: `request-off-${employee.id}-${day}`,
          severity: "error",
          title: "希望休に出勤しています",
          reason: `${employee.name}さんの${day}日は希望休として登録されています。`,
          day,
          employeeId: employee.id,
        });
      }
      const weekday = weekdayFor(month, day);
      if (isWeekdayBlocked(rules, employee.id, weekday)) {
        addWarning(warnings, {
          id: `weekday-block-${employee.id}-${day}`,
          severity: "error",
          title: "出勤不可曜日に配置されています",
          reason: `${employee.name}さんは${WEEKDAY_NAMES[weekday]}曜日の出勤不可に設定されています。`,
          day,
          employeeId: employee.id,
        });
      }
      for (const dateRule of dateAssignmentRules(
        rules,
        month,
        employee.id,
        day,
      )) {
        if (dateRule.action === "off") {
          addWarning(warnings, {
            id: `date-off-${dateRule.id}`,
            severity: "error",
            title: "休み指定日に出勤しています",
            reason: `${employee.name}さんの${day}日は条件で休みに指定されています。`,
            day,
            employeeId: employee.id,
          });
        }
        if (
          dateRule.action === "work" &&
          dateRule.shiftSlotId &&
          dateRule.shiftSlotId !== value
        ) {
          addWarning(warnings, {
            id: `date-shift-${dateRule.id}`,
            severity: "warning",
            title: "指定シフトと異なる配置です",
            reason: `${employee.name}さんの${day}日は指定されたシフト枠と異なります。`,
            day,
            employeeId: employee.id,
          });
        }
      }

      const maximum = activeMaxConsecutive(rules);
      if (
        consecutiveWorkDays > maximum &&
        !consecutiveWarningAdded
      ) {
        addWarning(warnings, {
          id: `consecutive-${employee.id}-${day}`,
          severity: "error",
          title: "連勤上限を超えています",
          reason: `${employee.name}さんは${consecutiveWorkDays}連勤です（上限 ${maximum} 日）。`,
          day,
          employeeId: employee.id,
        });
        consecutiveWarningAdded = true;
      }
    }

    if (actualOffDays !== employeePreferences.targetOffDays) {
      const difference = actualOffDays - employeePreferences.targetOffDays;
      addWarning(warnings, {
        id: `off-target-${employee.id}`,
        severity: "warning",
        title: "公休数に過不足があります",
        reason:
          difference > 0
            ? `${employee.name}さんは設定より${difference}日多く休みです（設定 ${employeePreferences.targetOffDays}日 / 実績 ${actualOffDays}日）。`
            : `${employee.name}さんは設定より${Math.abs(difference)}日多く出勤しています（設定公休 ${employeePreferences.targetOffDays}日 / 実績 ${actualOffDays}日）。`,
        employeeId: employee.id,
      });
    }
  }

  const pairRules = rules.filter(
    (rule): rule is Extract<ConditionRule, { type: "pair" }> =>
      rule.enabled && rule.type === "pair",
  );
  for (const rule of pairRules) {
    const employeeA = employees.find((employee) => employee.id === rule.employeeA);
    const employeeB = employees.find((employee) => employee.id === rule.employeeB);
    if (!employeeA || !employeeB) continue;
    for (let day = 1; day <= days; day += 1) {
      const aWorks = assignments[assignmentKey(employeeA.id, day)] != null;
      const bWorks = assignments[assignmentKey(employeeB.id, day)] != null;
      const violated =
        rule.mode === "together" ? aWorks !== bWorks : aWorks && bWorks;
      if (violated) {
        addWarning(warnings, {
          id: `pair-${rule.id}-${day}`,
          severity: "error",
          title:
            rule.mode === "together"
              ? "ペアの同日勤務条件に違反しています"
              : "同日勤務NGのペアが配置されています",
          reason:
            rule.mode === "together"
              ? `${employeeA.name}さんと${employeeB.name}さんは、同じ日に出勤または休みになる必要があります。`
              : `${employeeA.name}さんと${employeeB.name}さんが同じ日に出勤しています。`,
          day,
        });
      }
    }
  }

  for (let day = 1; day <= days; day += 1) {
    const weekday = weekdayFor(month, day);
    for (const slot of shiftSlots) {
      const required = staffingRequirement(rules, weekday, slot.id);
      if (required === 0) continue;
      const actual = employees.filter(
        (employee) =>
          assignments[assignmentKey(employee.id, day)] === slot.id,
      ).length;
      if (actual < required) {
        addWarning(warnings, {
          id: `staffing-short-${day}-${slot.id}`,
          severity: "error",
          title: "必要人数が不足しています",
          reason: `${day}日（${WEEKDAY_NAMES[weekday]}）の${slot.name}は${required - actual}名不足です（必要 ${required}名 / 配置 ${actual}名）。`,
          day,
          shiftSlotId: slot.id,
        });
      } else if (actual > required) {
        addWarning(warnings, {
          id: `staffing-over-${day}-${slot.id}`,
          severity: "info",
          title: "必要人数より多く配置されています",
          reason: `${day}日（${WEEKDAY_NAMES[weekday]}）の${slot.name}は${actual - required}名多い配置です（必要 ${required}名 / 配置 ${actual}名）。`,
          day,
          shiftSlotId: slot.id,
        });
      }
    }
  }

  return warnings;
}

export function generateSchedule(input: ScheduleInput): {
  assignments: AssignmentMap;
  warnings: ScheduleWarning[];
} {
  const { month, employees, shiftSlots, rules, preferences } = input;
  const days = getMonthDayCount(month);
  const assignments: AssignmentMap = {};
  const warnings: ScheduleWarning[] = [];
  const forcedOff = new Set<string>();
  const forcedWork = new Set<string>();
  const workBudgets = new Map<string, number>();
  const assignedWorkCounts = new Map<string, number>();
  const maxDays = activeMaxConsecutive(rules);

  for (const employee of employees) {
    const prefs = monthPreferences(preferences, employee.id, days);
    workBudgets.set(employee.id, days - prefs.targetOffDays);
    assignedWorkCounts.set(employee.id, 0);
    for (let day = 1; day <= days; day += 1) {
      assignments[assignmentKey(employee.id, day)] = null;
      const key = assignmentKey(employee.id, day);
      const dateRules = dateAssignmentRules(rules, month, employee.id, day);
      const hasOffRule = dateRules.some((rule) => rule.action === "off");
      const hasWorkRule = dateRules.some((rule) => rule.action === "work");
      const weekdayBlocked = isWeekdayBlocked(
        rules,
        employee.id,
        weekdayFor(month, day),
      );
      const requestedOff = prefs.requestedOffDays.includes(day);
      if (hasOffRule || weekdayBlocked || requestedOff) {
        forcedOff.add(key);
        if (hasOffRule && hasWorkRule) {
          addWarning(warnings, {
            id: `date-rule-conflict-${employee.id}-${day}`,
            severity: "warning",
            title: "勤務条件が競合しています",
            reason: `${employee.name}さんの${day}日は「出勤」と「休み」の条件が重なっているため、休みを優先しました。`,
            day,
            employeeId: employee.id,
          });
        }
      } else if (hasWorkRule) {
        forcedWork.add(key);
      }
    }
  }

  function chooseShift(employee: Employee, day: number, preferred?: string): string | null {
    const prefs = monthPreferences(preferences, employee.id, days);
    const preference = preferred ?? prefs.preferredShiftByDay[String(day)];
    const available = shiftSlots.filter((slot) => coversShift(employee, slot));
    if (preference && available.some((slot) => slot.id === preference)) {
      return preference;
    }
    return available[0]?.id ?? shiftSlots[0]?.id ?? null;
  }

  function streakIfAssigned(employeeId: string, day: number): number {
    let streak = 1;
    for (let cursor = day - 1; cursor >= 1; cursor -= 1) {
      if (assignments[assignmentKey(employeeId, cursor)] == null) break;
      streak += 1;
    }
    for (let cursor = day + 1; cursor <= days; cursor += 1) {
      if (assignments[assignmentKey(employeeId, cursor)] == null) break;
      streak += 1;
    }
    return streak;
  }

  function hasSeparatePairConflict(employeeId: string, day: number): boolean {
    return rules.some(
      (rule) =>
        rule.enabled &&
        rule.type === "pair" &&
        rule.mode === "separate" &&
        (rule.employeeA === employeeId || rule.employeeB === employeeId) &&
        assignments[
          assignmentKey(
            rule.employeeA === employeeId ? rule.employeeB : rule.employeeA,
            day,
          )
        ] != null,
    );
  }

  function hasTogetherPairOffConflict(employeeId: string, day: number): boolean {
    return rules.some((rule) => {
      if (!rule.enabled || rule.type !== "pair" || rule.mode !== "together") {
        return false;
      }
      if (rule.employeeA !== employeeId && rule.employeeB !== employeeId) {
        return false;
      }
      const partnerId =
        rule.employeeA === employeeId ? rule.employeeB : rule.employeeA;
      return forcedOff.has(assignmentKey(partnerId, day));
    });
  }

  function canAssign(
    employee: Employee,
    day: number,
    shift: ShiftSlot,
    allowBudgetOverflow = false,
  ): boolean {
    const key = assignmentKey(employee.id, day);
    const assignedCount = assignedWorkCounts.get(employee.id) ?? 0;
    if (
      assignments[key] != null ||
      forcedOff.has(key) ||
      !coversShift(employee, shift) ||
      hasSeparatePairConflict(employee.id, day) ||
      hasTogetherPairOffConflict(employee.id, day) ||
      (!allowBudgetOverflow &&
        assignedCount >= (workBudgets.get(employee.id) ?? 0)) ||
      streakIfAssigned(employee.id, day) > maxDays
    ) {
      return false;
    }
    return true;
  }

  function assign(employee: Employee, day: number, shiftId: string): void {
    const key = assignmentKey(employee.id, day);
    if (assignments[key] != null) return;
    assignments[key] = shiftId;
    assignedWorkCounts.set(
      employee.id,
      (assignedWorkCounts.get(employee.id) ?? 0) + 1,
    );
  }

  function togetherPartners(employeeId: string): string[] {
    return rules
      .filter(
        (rule): rule is Extract<ConditionRule, { type: "pair" }> =>
          rule.enabled &&
          rule.type === "pair" &&
          rule.mode === "together" &&
          (rule.employeeA === employeeId || rule.employeeB === employeeId),
      )
      .map((rule) =>
        rule.employeeA === employeeId ? rule.employeeB : rule.employeeA,
      );
  }

  // Date-specific work rules are placed first. Requested days off and
  // unavailable weekdays take precedence when the two types of rule conflict.
  for (const employee of employees) {
    for (const day of [...Array(days)].map((_, index) => index + 1)) {
      const key = assignmentKey(employee.id, day);
      if (!forcedWork.has(key) || forcedOff.has(key)) continue;
      const dateRule = dateAssignmentRules(
        rules,
        month,
        employee.id,
        day,
      ).find((rule) => rule.action === "work");
      const chosen = chooseShift(employee, day, dateRule?.shiftSlotId);
      if (chosen) {
        assign(employee, day, chosen);
        if (
          !(shiftSlots.find((slot) => slot.id === chosen) &&
            coversShift(employee, shiftSlots.find((slot) => slot.id === chosen)!))
        ) {
          addWarning(warnings, {
            id: `outside-hours-${employee.id}-${day}`,
            severity: "warning",
            title: "基本勤務時間外のシフトです",
            reason: `${employee.name}さんの${day}日は、基本勤務時間で対応できるシフト枠がないため配置を確認してください。`,
            day,
            employeeId: employee.id,
          });
        }
      }
    }
  }

  // A together-pair rule also applies to dates forced by an explicit work rule.
  for (const employee of employees) {
    for (let day = 1; day <= days; day += 1) {
      if (assignments[assignmentKey(employee.id, day)] == null) continue;
      for (const partnerId of togetherPartners(employee.id)) {
        const partnerKey = assignmentKey(partnerId, day);
        if (assignments[partnerKey] != null) continue;
        if (forcedOff.has(partnerKey)) continue;
        const partner = employees.find((item) => item.id === partnerId);
        if (!partner) continue;
        const shift = chooseShift(partner, day);
        if (shift) assign(partner, day, shift);
      }
    }
  }

  function score(employee: Employee, day: number, shift: ShiftSlot): number {
    const prefs = monthPreferences(preferences, employee.id, days);
    const planned = workBudgets.get(employee.id) ?? 0;
    const assignedCount = assignedWorkCounts.get(employee.id) ?? 0;
    const ratio = planned === 0 ? 1 : assignedCount / planned;
    const sameShiftCount = employees.filter(
      (item) => assignments[assignmentKey(item.id, day)] === shift.id,
    ).length;
    let value = -ratio * 100 - sameShiftCount * 5;
    if (prefs.preferredShiftByDay[String(day)] === shift.id) value += 90;
    if (prefs.preferredWorkDays.includes(day)) value += 45;
    const previousStreak = streakIfAssigned(employee.id, day) - 1;
    value -= previousStreak * 4;
    return value;
  }

  function assignCandidateGroup(
    employee: Employee,
    day: number,
    shift: ShiftSlot,
  ): boolean {
    if (!canAssign(employee, day, shift)) return false;
    const partners = togetherPartners(employee.id);
    const toAssign: Array<{ employee: Employee; shiftId: string }> = [
      { employee, shiftId: shift.id },
    ];

    for (const partnerId of partners) {
      const partner = employees.find((item) => item.id === partnerId);
      if (!partner) continue;
      const partnerKey = assignmentKey(partner.id, day);
      if (assignments[partnerKey] != null) continue;
      if (forcedOff.has(partnerKey) || hasSeparatePairConflict(partner.id, day)) {
        return false;
      }
      const preferredId = monthPreferences(
        preferences,
        partner.id,
        days,
      ).preferredShiftByDay[String(day)];
      const partnerShift =
        (preferredId && shiftSlots.find(
          (slot) => slot.id === preferredId && coversShift(partner, slot),
        )) ||
        shiftSlots.find((slot) => coversShift(partner, slot));
      if (
        !partnerShift ||
        (assignedWorkCounts.get(partner.id) ?? 0) >=
          (workBudgets.get(partner.id) ?? 0) ||
        streakIfAssigned(partner.id, day) > maxDays
      ) {
        return false;
      }
      toAssign.push({ employee: partner, shiftId: partnerShift.id });
    }

    for (const item of toAssign) assign(item.employee, day, item.shiftId);
    return true;
  }

  // Fill each minimum staffing requirement first.
  for (let day = 1; day <= days; day += 1) {
    const weekday = weekdayFor(month, day);
    for (const shift of shiftSlots) {
      const required = staffingRequirement(rules, weekday, shift.id);
      let actual = employees.filter(
        (employee) => assignments[assignmentKey(employee.id, day)] === shift.id,
      ).length;
      while (actual < required) {
        const candidates = employees
          .filter((employee) => canAssign(employee, day, shift))
          .sort((a, b) => score(b, day, shift) - score(a, day, shift));
        const placed = candidates.some((candidate) =>
          assignCandidateGroup(candidate, day, shift),
        );
        if (!placed) break;
        actual = employees.filter(
          (employee) =>
            assignments[assignmentKey(employee.id, day)] === shift.id,
        ).length;
      }
    }
  }

  // Meet each employee's monthly work target when demand leaves room. The
  // extra assignments are balanced across days and still respect hard rules.
  const remaining: Array<{ employee: Employee; day: number; shift: ShiftSlot }> =
    [];
  for (const employee of employees) {
    for (let day = 1; day <= days; day += 1) {
      const preferred =
        monthPreferences(preferences, employee.id, days)
          .preferredShiftByDay[String(day)];
      const available = shiftSlots
        .filter(
          (shift) =>
            (!preferred || shift.id === preferred) &&
            canAssign(employee, day, shift),
        )
        .sort((a, b) => {
          const aCount = employees.filter(
            (item) => assignments[assignmentKey(item.id, day)] === a.id,
          ).length;
          const bCount = employees.filter(
            (item) => assignments[assignmentKey(item.id, day)] === b.id,
          ).length;
          return aCount - bCount;
        });
      const fallback = available[0]
        ? available
        : shiftSlots.filter((shift) => canAssign(employee, day, shift));
      if (fallback[0]) remaining.push({ employee, day, shift: fallback[0] });
    }
  }
  remaining.sort((a, b) => {
    const aRatio =
      (assignedWorkCounts.get(a.employee.id) ?? 0) /
      Math.max(1, workBudgets.get(a.employee.id) ?? 0);
    const bRatio =
      (assignedWorkCounts.get(b.employee.id) ?? 0) /
      Math.max(1, workBudgets.get(b.employee.id) ?? 0);
    if (aRatio !== bRatio) return aRatio - bRatio;
    const aPrefs = monthPreferences(preferences, a.employee.id, days);
    const bPrefs = monthPreferences(preferences, b.employee.id, days);
    const aWish = aPrefs.preferredWorkDays.includes(a.day) ? 1 : 0;
    const bWish = bPrefs.preferredWorkDays.includes(b.day) ? 1 : 0;
    return bWish - aWish;
  });
  for (const item of remaining) {
    if ((assignedWorkCounts.get(item.employee.id) ?? 0) >=
      (workBudgets.get(item.employee.id) ?? 0)) {
      continue;
    }
    assignCandidateGroup(item.employee, item.day, item.shift);
  }

  // Report targets that could not be reached because of days off, staffing
  // conflicts, time-window limits, or consecutive-work limits.
  for (const employee of employees) {
    const prefs = monthPreferences(preferences, employee.id, days);
    const scheduled = assignedWorkCounts.get(employee.id) ?? 0;
    const target = days - prefs.targetOffDays;
    if (scheduled < target) {
      addWarning(warnings, {
        id: `work-target-unfilled-${employee.id}`,
        severity: "warning",
        title: "設定公休数を満たせません",
        reason: `${employee.name}さんは希望する${target}出勤日に対して${scheduled}日です。希望休や勤務可能時間、必要人数の条件をご確認ください。`,
        employeeId: employee.id,
      });
    }
  }

  const analyzed = analyzeSchedule({ ...input, assignments });
  for (const warning of analyzed) addWarning(warnings, warning);
  return { assignments, warnings };
}
