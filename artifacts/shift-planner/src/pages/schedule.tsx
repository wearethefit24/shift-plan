import { useMemo } from 'react';
import { AlertTriangle, Check, Download, Printer, WandSparkles, CalendarDays, UsersRound, Clock3, Info } from 'lucide-react';
import type { AssignmentMap, ScheduleWarning } from '@/lib/shift-model';
import { usePlanner } from '@/hooks/use-planner';
import { analyzeSchedule, generateSchedule } from '@/lib/shift-engine';

const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
const monthLength = (month: string) => {
  const [year, mm] = month.split('-').map(Number);
  return new Date(year, mm, 0).getDate();
};
const toHours = (start: string, end: string) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = eh * 60 + em - sh * 60 - sm;
  if (diff < 0) diff += 1440;
  return diff / 60;
};

export default function SchedulePage() {
  const { state, setState } = usePlanner();
  const days = useMemo(() => Array.from({ length: monthLength(state.selectedMonth) }, (_, index) => index + 1), [state.selectedMonth]);
  const assignments: AssignmentMap = state.schedulesByMonth[state.selectedMonth] ?? {};
  const hasSchedule = Object.keys(assignments).length > 0;
  const warnings: ScheduleWarning[] = useMemo(() => {
    if (!hasSchedule) return [];
    return analyzeSchedule({ month: state.selectedMonth, employees: state.employees, shiftSlots: state.shiftSlots, rules: state.rules, preferences: state.preferencesByMonth[state.selectedMonth] ?? {}, assignments });
  }, [hasSchedule, state.selectedMonth, state.employees, state.shiftSlots, state.rules, state.preferencesByMonth, assignments]);
  const warningCount = warnings.filter((warning) => warning.severity !== 'info').length;

  const generate = () => {
    const result = generateSchedule({
      month: state.selectedMonth,
      employees: state.employees,
      shiftSlots: state.shiftSlots,
      rules: state.rules,
      preferences: state.preferencesByMonth[state.selectedMonth] ?? {},
    });
    setState((current) => ({ ...current, schedulesByMonth: { ...current.schedulesByMonth, [current.selectedMonth]: result.assignments } }));
  };
  const cycleAssignment = (employeeId: string, day: number) => {
    const key = `${employeeId}:${day}`;
    const current = assignments[key] ?? null;
    const slotIds = state.shiftSlots.map((slot) => slot.id);
    const index = slotIds.indexOf(current ?? '');
    const next = current === null
      ? (slotIds[0] ?? null)
      : index >= 0 && index < slotIds.length - 1
        ? slotIds[index + 1]
        : null;
    const updated = { ...assignments };
    if (next === null) delete updated[key]; else updated[key] = next;
    setState((prev) => ({ ...prev, schedulesByMonth: { ...prev.schedulesByMonth, [prev.selectedMonth]: updated } }));
  };
  const clearSchedule = () => {
    if (!window.confirm('この月のシフト表を空にしますか？')) return;
    setState((current) => ({ ...current, schedulesByMonth: { ...current.schedulesByMonth, [current.selectedMonth]: {} } }));
  };
  const stats = state.employees.map((employee) => {
    let workDays = 0;
    let hours = 0;
    days.forEach((day) => {
      const slotId = assignments[`${employee.id}:${day}`];
      const slot = state.shiftSlots.find((item) => item.id === slotId);
      if (slot) { workDays += 1; hours += toHours(slot.startTime, slot.endTime); }
    });
    const targetOffDays =
      state.preferencesByMonth[state.selectedMonth]?.[employee.id]?.targetOffDays ??
      9;
    return { employee, workDays, offDays: days.length - workDays, targetOffDays, hours };
  });
  const exportCsv = () => {
    const rows = [['氏名', ...days.map((day) => `${day}日`), '設定公休数', '実績公休数', '出勤日数', '総勤務時間']];
    stats.forEach(({ employee, workDays, offDays, targetOffDays, hours }) => rows.push([
      employee.name,
      ...days.map((day) => {
        const slot = state.shiftSlots.find((item) => item.id === assignments[`${employee.id}:${day}`]);
        return slot ? slot.name : '';
      }),
      String(targetOffDays), String(offDays), String(workDays), String(Math.round(hours * 10) / 10),
    ]));
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `シフト表_${state.selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const severityStyle = (warning: ScheduleWarning) => warning.severity === 'error'
    ? { icon: <AlertTriangle size={16} />, color: '#a64d42', bg: '#f7e6e1', label: '要確認' }
    : warning.severity === 'warning'
      ? { icon: <AlertTriangle size={16} />, color: '#a26d37', bg: '#f6edda', label: '注意' }
      : { icon: <Info size={16} />, color: '#567c71', bg: '#e7f0e9', label: 'メモ' };

  return (
    <div className="page-wrap fade-in">
      <div className="flex flex-wrap justify-between items-end gap-4 mb-7">
        <div>
          <div className="text-[11px] uppercase tracking-[.2em] text-[#a16b56] font-bold mb-2">03 / MONTHLY ROSTER</div>
          <h1 className="font-display text-[30px] md:text-[36px] text-[#2d4843]">シフト表</h1>
          <p className="text-sm text-[#7c877f] mt-2">自動作成した案を確認し、必要に応じてセルを押して調整できます。</p>
        </div>
        <div className="flex gap-2 no-print">
          <button className="btn" onClick={exportCsv} disabled={!hasSchedule} data-testid="button-export-csv"><Download size={15} />CSV</button>
          <button className="btn" onClick={() => window.print()} disabled={!hasSchedule} data-testid="button-print-schedule"><Printer size={15} />印刷</button>
          <button className="btn btn-primary" onClick={generate} disabled={!state.employees.length || !state.shiftSlots.length} data-testid="button-generate-schedule"><WandSparkles size={15} />{hasSchedule ? '作り直す' : 'シフトを作成'}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="surface p-4"><div className="flex justify-between text-xs text-[#829087]"><span>対象期間</span><CalendarDays size={15} /></div><div className="font-display text-[20px] text-[#304944] mt-2" data-testid="text-schedule-month">{state.selectedMonth}</div></div>
        <div className="surface p-4"><div className="flex justify-between text-xs text-[#829087]"><span>スタッフ</span><UsersRound size={15} /></div><div className="font-display text-[20px] text-[#304944] mt-2" data-testid="text-schedule-employee-count">{state.employees.length}<span className="text-xs ml-1">名</span></div></div>
        <div className="surface p-4"><div className="flex justify-between text-xs text-[#829087]"><span>確認事項</span><AlertTriangle size={15} /></div><div className={`font-display text-[20px] mt-2 ${warningCount ? 'text-[#a7664f]' : 'text-[#4d786a]'}`} data-testid="text-warning-count">{warningCount}<span className="text-xs ml-1">件</span></div></div>
        <div className="surface p-4"><div className="flex justify-between text-xs text-[#829087]"><span>状態</span><Check size={15} /></div><div className="font-display text-[20px] text-[#304944] mt-2" data-testid="status-schedule">{hasSchedule ? '作成済み' : '未作成'}</div></div>
      </div>

      {!hasSchedule ? <div className="surface text-center px-6 py-16 mb-5" data-testid="empty-schedule">
        <div className="w-14 h-14 rounded-full bg-[#e6eee8] text-[#467267] grid place-items-center mx-auto mb-4"><CalendarDays size={24} /></div>
        <h2 className="font-display text-[23px] text-[#304944]">まだシフト表がありません</h2>
        <p className="text-sm text-[#829087] mt-2 max-w-lg mx-auto">スタッフ、希望、必要人数を確認してから自動作成してください。作成後もセルを押して編集できます。</p>
        <button className="btn btn-primary mt-5" onClick={generate} disabled={!state.employees.length || !state.shiftSlots.length} data-testid="button-generate-empty"><WandSparkles size={15} />シフトを作成</button>
      </div> : <div className="surface overflow-hidden mb-5">
        <div className="flex flex-wrap justify-between items-center gap-3 px-5 py-4 border-b border-[#e9e3d8]">
          <div><h2 className="font-display text-[19px] text-[#304944]">月間配置</h2><p className="text-[11px] text-[#89938a] mt-1">セルを押すと「未配置 → {state.shiftSlots.map((slot) => slot.name).join(' → ') || '未配置'} → 未配置」の順で切り替わります。</p></div>
          <button className="btn btn-quiet no-print text-[#a36c58]" onClick={clearSchedule} data-testid="button-clear-schedule">表をクリア</button>
        </div>
        <div className="overflow-auto max-h-[65vh]">
          <table className="schedule-table" data-testid="table-schedule">
            <thead><tr><th>スタッフ</th>{days.map((day) => {
              const weekday = new Date(Number(state.selectedMonth.slice(0, 4)), Number(state.selectedMonth.slice(5, 7)) - 1, day).getDay();
              return <th key={day}><span className={weekday === 0 ? 'text-[#b27661]' : weekday === 6 ? 'text-[#658c9a]' : ''}>{day}</span><span className="block text-[9px]">{weekdayLabels[weekday]}</span></th>;
            })}<th>公休目標</th><th>実績公休</th><th>出勤日数</th><th>総勤務時間</th></tr></thead>
            <tbody>{state.employees.map((employee) => {
              const stat = stats.find((item) => item.employee.id === employee.id)!;
              return <tr key={employee.id} data-testid={`row-schedule-employee-${employee.id}`}>
                <td><div className="font-semibold text-sm text-[#344e48]">{employee.name}</div><div className="text-[10px] text-[#879188]">{employee.role}</div></td>
                {days.map((day) => {
                  const slot = state.shiftSlots.find((item) => item.id === assignments[`${employee.id}:${day}`]);
                  const dow = new Date(Number(state.selectedMonth.slice(0, 4)), Number(state.selectedMonth.slice(5, 7)) - 1, day).getDay();
                  return <td key={day} data-testid={`cell-schedule-${employee.id}-${day}`}><button className={`shift-cell ${slot ? '' : 'empty'}`} onClick={() => cycleAssignment(employee.id, day)} aria-label={`${employee.name} ${day}日 ${slot?.name ?? '未配置'}`} data-testid={`button-shift-cell-${employee.id}-${day}`} title="押すとシフトを切り替え">{slot?.name ?? (dow === 0 || dow === 6 ? '休' : '·')}</button></td>;
                })}
                <td className="font-mono text-xs text-[#89938a]" data-testid={`text-target-offdays-${employee.id}`}>{stat.targetOffDays}</td>
                <td className="font-mono text-xs text-[#89938a]" data-testid={`text-offdays-${employee.id}`}>{stat.offDays}</td>
                <td className="font-mono text-xs text-[#466c60]" data-testid={`text-workdays-${employee.id}`}>{stat.workDays}</td>
                <td className="font-mono text-xs text-[#466c60]" data-testid={`text-hours-${employee.id}`}>{Math.round(stat.hours * 10) / 10}h</td>
              </tr>;
            })}</tbody>
            <tfoot><tr className="bg-[#f5f0e5]"><td className="font-semibold text-xs text-[#55665e]">配置人数</td>{days.map((day) => {
              const count = state.employees.reduce((sum, employee) => sum + (assignments[`${employee.id}:${day}`] ? 1 : 0), 0);
              return <td key={day} className="font-mono text-xs text-[#60756b]" data-testid={`text-daily-count-${day}`}>{count}</td>;
            })}<td colSpan={4} className="text-[10px] text-[#8b948b]">各日の配置数</td></tr></tfoot>
          </table>
        </div>
      </div>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <section className="surface overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e9e3d8] flex justify-between items-center">
            <div><h2 className="font-display text-[19px] text-[#304944]">日別の配置数</h2><p className="text-[11px] text-[#89938a] mt-1">登録された必要人数と実際の配置を照合します。</p></div>
            <span className="pill bg-[#e7eee8] text-[#4d7467]">{state.rules.filter((rule) => 'requiredCount' in rule && rule.enabled).length}件の人数条件</span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-max">
              {days.map((day) => {
                const coverage = state.shiftSlots.map((slot) => {
                  const actual = state.employees.filter((employee) => assignments[`${employee.id}:${day}`] === slot.id).length;
                  const weekday = new Date(Number(state.selectedMonth.slice(0, 4)), Number(state.selectedMonth.slice(5, 7)) - 1, day).getDay();
                  const required = state.rules.filter((rule): rule is Extract<typeof rule, { type: 'staffing' }> => rule.type === 'staffing' && rule.enabled && rule.shiftSlotId === slot.id && (rule.weekday === null || rule.weekday === weekday)).reduce((max, rule) => Math.max(max, rule.requiredCount), 0);
                  return { slot, actual, required };
                });
                const short = coverage.some((row) => row.actual < row.required);
                return <div key={day} className={`w-[72px] border-r border-[#eee8dc] px-2 py-3 text-center ${short ? 'bg-[#fbf0e9]' : ''}`} data-testid={`column-daily-summary-${day}`}>
                  <div className="font-mono text-xs text-[#586b62]">{day}</div>
                  {coverage.map(({ slot, actual, required }) => <div key={slot.id} className="mt-2" title={`${slot.name} ${actual}/${required || '—'}`}>
                    <div className={`font-mono text-[11px] font-bold ${required && actual < required ? 'text-[#aa614b]' : 'text-[#426c60]'}`}>{actual}{required ? <span className="text-[#a5a398]">/{required}</span> : ''}</div>
                    <div className="text-[9px] text-[#92988e] truncate">{slot.name}</div>
                  </div>)}
                </div>;
              })}
            </div>
          </div>
        </section>
        <section className="surface overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e9e3d8]">
            <div className="flex items-center justify-between"><h2 className="font-display text-[19px] text-[#304944]">確認事項</h2><span className={`pill ${warningCount ? 'bg-[#f7e6e1] text-[#a64d42]' : 'bg-[#e7f0e9] text-[#567c71]'}`} data-testid="status-warning-summary">{warningCount ? `${warningCount}件` : '良好'}</span></div>
            <p className="text-[11px] text-[#89938a] mt-1">人数不足やルールとの衝突を表示します。</p>
          </div>
          {!hasSchedule ? <div className="p-6 text-sm text-[#879188]" data-testid="empty-warnings">シフト作成後に確認事項を表示します。</div> : warnings.length === 0 ? <div className="p-6 flex gap-3 text-sm text-[#55766b]" data-testid="empty-warnings"><Check size={17} />確認が必要な項目はありません。</div> : <div>{warnings.map((warning) => {
            const style = severityStyle(warning);
            const employeeName = state.employees.find((employee) => employee.id === warning.employeeId)?.name;
            return <div key={warning.id} className="warning-item" data-testid={`warning-item-${warning.id}`}>
              <span className="w-7 h-7 rounded-full grid place-items-center shrink-0" style={{ background: style.bg, color: style.color }}>{style.icon}</span>
              <div className="min-w-0"><div className="flex flex-wrap gap-2 items-center"><span className="font-semibold text-xs text-[#40564e]">{warning.title}</span><span className="text-[9px] uppercase tracking-wide" style={{ color: style.color }}>{style.label}</span></div><p className="text-[11px] leading-relaxed text-[#818b82] mt-1">{warning.reason}{warning.day ? `（${warning.day}日）` : ''}{employeeName ? ` · ${employeeName}さん` : ''}</p></div>
            </div>;
          })}</div>}
        </section>
      </div>
      {hasSchedule && <div className="mt-5 surface p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="schedule-summary">
        {stats.map(({ employee, workDays, offDays, targetOffDays, hours }) => <div key={employee.id} className="flex items-center justify-between gap-2 px-3 py-2 border-r border-[#eee8dc] last:border-0"><span className="text-sm font-semibold text-[#52645c]">{employee.name}</span><span className="text-[11px] text-[#829087]">公休 {targetOffDays}/{offDays} · {workDays}勤務 · {Math.round(hours * 10) / 10}時間</span></div>)}
      </div>}
    </div>
  );
}
