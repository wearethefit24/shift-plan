import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Pencil, UserRound, CalendarDays, Clock3 } from 'lucide-react';
import type { Employee, EmployeeMonthPreferences } from '@/lib/shift-model';
import { usePlanner } from '@/hooks/use-planner';

const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
const blankPreference: EmployeeMonthPreferences = { targetOffDays: 9, requestedOffDays: [], preferredWorkDays: [], preferredShiftByDay: {} };

function monthDays(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  return { count: new Date(year, monthIndex, 0).getDate(), firstDay: new Date(year, monthIndex - 1, 1).getDay() };
}

export default function MasterPage() {
  const { state, setState } = usePlanner();
  const [selectedId, setSelectedId] = useState(state.employees[0]?.id ?? '');
  const [mode, setMode] = useState<'off' | 'work'>('off');
  const [draft, setDraft] = useState({ name: '', role: '販売', basicStartTime: '09:00', basicEndTime: '17:00' });
  const [editing, setEditing] = useState<string | null>(null);
  const selected = state.employees.find((employee) => employee.id === selectedId) ?? state.employees[0];
  const preferences = selected ? (state.preferencesByMonth[state.selectedMonth]?.[selected.id] ?? blankPreference) : blankPreference;
  const { count, firstDay } = monthDays(state.selectedMonth);
  const slots = state.shiftSlots;

  const saveEmployee = (employee: Employee) => {
    setState((current) => ({ ...current, employees: current.employees.map((item) => item.id === employee.id ? employee : item) }));
    setEditing(null);
  };
  const addEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    const employee: Employee = { ...draft, id: `emp-${Date.now()}` };
    setState((current) => ({ ...current, employees: [...current.employees, employee] }));
    setSelectedId(employee.id);
    setDraft({ name: '', role: '販売', basicStartTime: '09:00', basicEndTime: '17:00' });
  };
  const updatePreferences = (patch: Partial<EmployeeMonthPreferences>) => {
    if (!selected) return;
    setState((current) => ({
      ...current,
      preferencesByMonth: {
        ...current.preferencesByMonth,
        [current.selectedMonth]: {
          ...current.preferencesByMonth[current.selectedMonth],
          [selected.id]: { ...blankPreference, ...current.preferencesByMonth[current.selectedMonth]?.[selected.id], ...patch },
        },
      },
    }));
  };
  const toggleDay = (day: number) => {
    if (mode === 'off') {
      const days = preferences.requestedOffDays.includes(day) ? preferences.requestedOffDays.filter((value) => value !== day) : [...preferences.requestedOffDays, day].sort((a, b) => a - b);
      updatePreferences({
        requestedOffDays: days,
        preferredWorkDays: days.includes(day)
          ? preferences.preferredWorkDays.filter((value) => value !== day)
          : preferences.preferredWorkDays,
      });
    } else {
      const days = preferences.preferredWorkDays.includes(day) ? preferences.preferredWorkDays.filter((value) => value !== day) : [...preferences.preferredWorkDays, day].sort((a, b) => a - b);
      updatePreferences({
        preferredWorkDays: days,
        requestedOffDays: days.includes(day)
          ? preferences.requestedOffDays.filter((value) => value !== day)
          : preferences.requestedOffDays,
      });
    }
  };
  const monthLabel = useMemo(() => new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(new Date(`${state.selectedMonth}-01T00:00:00`)), [state.selectedMonth]);
  const moveEmployee = (index: number, direction: -1 | 1) => {
    setState((current) => {
      const next = [...current.employees];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, employees: next };
    });
  };
  const removeEmployee = (employee: Employee) => {
    if (!window.confirm(`${employee.name}さんを削除しますか？`)) return;
    setState((current) => ({
      ...current,
      employees: current.employees.filter((item) => item.id !== employee.id),
      rules: current.rules.filter((rule) => {
        if ('employeeId' in rule) return rule.employeeId !== employee.id;
        if ('employeeA' in rule) return rule.employeeA !== employee.id && rule.employeeB !== employee.id;
        return true;
      }),
      preferencesByMonth: Object.fromEntries(Object.entries(current.preferencesByMonth).map(([month, employees]) => {
        const nextEmployees = { ...employees };
        delete nextEmployees[employee.id];
        return [month, nextEmployees];
      })),
      schedulesByMonth: Object.fromEntries(Object.entries(current.schedulesByMonth).map(([month, assignments]) => [
        month,
        Object.fromEntries(Object.entries(assignments).filter(([key]) => !key.startsWith(`${employee.id}:`))),
      ])),
    }));
    if (selectedId === employee.id) setSelectedId(state.employees.find((item) => item.id !== employee.id)?.id ?? '');
  };

  return (
    <div className="page-wrap fade-in">
      <div className="flex flex-wrap justify-between items-end gap-4 mb-7">
        <div>
          <div className="text-[11px] uppercase tracking-[.2em] text-[#a16b56] font-bold mb-2">01 / PEOPLE & AVAILABILITY</div>
          <h1 className="font-display text-[30px] md:text-[36px] text-[#2d4843]">スタッフと希望を整える</h1>
          <p className="text-sm text-[#7c877f] mt-2">先に人と希望を整理すると、月末の調整がぐっと軽くなります。</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#6e7d74]"><CalendarDays size={16} /><span data-testid="text-month-label">{monthLabel}</span></div>
      </div>

      <div className="grid xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
        <section className="surface overflow-hidden">
          <div className="p-5 border-b border-[#e9e3d8] flex items-center justify-between">
            <div><h2 className="font-display text-[19px] text-[#314b45]">チーム</h2><p className="text-xs text-[#879188] mt-1">{state.employees.length}名のメンバー</p></div>
            <span className="rounded-full bg-[#e8eee8] text-[#476d62] p-2"><UserRound size={17} /></span>
          </div>
          <div className="p-2">
            {state.employees.map((employee, index) => (
              <div key={employee.id} className={`group flex items-center gap-2 p-2 rounded-lg ${selected?.id === employee.id ? 'bg-[#edf1e9]' : 'hover:bg-[#f7f4ec]'}`} data-testid={`row-employee-${employee.id}`}>
                <button className="flex items-center gap-3 flex-1 min-w-0 text-left px-2 py-1" onClick={() => setSelectedId(employee.id)} data-testid={`button-select-employee-${employee.id}`}>
                  <span className="w-9 h-9 rounded-full bg-[#dce8df] text-[#315953] grid place-items-center font-display">{employee.name.slice(0, 1)}</span>
                  <span className="min-w-0"><span className="block truncate font-semibold text-sm text-[#304944]">{employee.name}</span><span className="block text-[11px] text-[#89938b] mt-0.5">{employee.role} · {employee.basicStartTime}–{employee.basicEndTime}</span></span>
                </button>
                <div className="flex opacity-65 group-hover:opacity-100">
                  <button className="icon-button" aria-label={`${employee.name}を上へ`} onClick={() => moveEmployee(index, -1)} data-testid={`button-move-up-${employee.id}`}><ArrowUp size={14} /></button>
                  <button className="icon-button" aria-label={`${employee.name}を下へ`} onClick={() => moveEmployee(index, 1)} data-testid={`button-move-down-${employee.id}`}><ArrowDown size={14} /></button>
                  <button className="icon-button text-[#aa6a57]" aria-label={`${employee.name}を削除`} onClick={() => removeEmployee(employee)} data-testid={`button-delete-employee-${employee.id}`}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {state.employees.length === 0 && <div className="p-7 text-center text-sm text-[#879188]" data-testid="empty-employees">まずはスタッフを追加してください。</div>}
          </div>
          <form onSubmit={addEmployee} className="border-t border-[#e9e3d8] p-4 bg-[#f8f5ed]">
            <div className="text-[11px] uppercase tracking-[.12em] font-bold text-[#8b7869] mb-3">メンバーを追加</div>
            <input className="field mb-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="名前" aria-label="スタッフ名" data-testid="input-employee-name" />
             <div className="grid grid-cols-2 gap-2 mb-2">
               <input className="field" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="役職・区分" aria-label="役職・区分" data-testid="input-employee-role" />
              <div className="flex items-center justify-center gap-1 text-xs text-[#738077]"><Clock3 size={14} />勤務時間</div>
              <input type="time" className="field" value={draft.basicStartTime} onChange={(event) => setDraft({ ...draft, basicStartTime: event.target.value })} aria-label="基本開始時刻" data-testid="input-employee-start" />
              <input type="time" className="field" value={draft.basicEndTime} onChange={(event) => setDraft({ ...draft, basicEndTime: event.target.value })} aria-label="基本終了時刻" data-testid="input-employee-end" />
            </div>
            <button type="submit" className="btn btn-primary w-full" data-testid="button-add-employee"><Plus size={15} />スタッフを追加</button>
          </form>
        </section>

        <section className="surface overflow-hidden">
          {selected ? <>
            <div className="p-5 md:p-6 border-b border-[#e9e3d8] flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#dce8df] text-[#315953] grid place-items-center font-display text-lg">{selected.name.slice(0, 1)}</div>
                <div><h2 className="font-display text-[21px] text-[#304944]">{selected.name}さんの希望</h2><div className="text-xs text-[#8b948b]">{selected.role} · 基本 {selected.basicStartTime}–{selected.basicEndTime}</div></div>
              </div>
              <button className="btn btn-quiet" onClick={() => setEditing(editing === selected.id ? null : selected.id)} data-testid={`button-edit-employee-${selected.id}`}><Pencil size={14} />プロフィール編集</button>
            </div>
            {editing === selected.id && <div className="grid sm:grid-cols-4 gap-3 px-5 py-4 bg-[#f7f3e9] border-b border-[#e9e3d8]">
              <label><span className="field-label">名前</span><input className="field" value={selected.name} onChange={(event) => setState((current) => ({ ...current, employees: current.employees.map((item) => item.id === selected.id ? { ...item, name: event.target.value } : item) }))} data-testid="input-edit-employee-name" /></label>
               <label><span className="field-label">役職・区分</span><input className="field" value={selected.role} onChange={(event) => setState((current) => ({ ...current, employees: current.employees.map((item) => item.id === selected.id ? { ...item, role: event.target.value } : item) }))} data-testid="input-edit-employee-role" /></label>
              <label><span className="field-label">開始</span><input className="field" type="time" value={selected.basicStartTime} onChange={(event) => setState((current) => ({ ...current, employees: current.employees.map((item) => item.id === selected.id ? { ...item, basicStartTime: event.target.value } : item) }))} data-testid="input-edit-employee-start" /></label>
              <label><span className="field-label">終了</span><input className="field" type="time" value={selected.basicEndTime} onChange={(event) => setState((current) => ({ ...current, employees: current.employees.map((item) => item.id === selected.id ? { ...item, basicEndTime: event.target.value } : item) }))} data-testid="input-edit-employee-end" /></label>
              <div className="sm:col-span-4 flex justify-end"><button className="btn btn-primary" onClick={() => saveEmployee(selected)} data-testid="button-save-employee">編集を完了</button></div>
            </div>}
            <div className="p-5 md:p-6">
              <div className="grid sm:grid-cols-[1fr_210px] gap-4 mb-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div><div className="font-semibold text-sm text-[#344e48]">{monthLabel}</div><div className="text-xs text-[#8b948b] mt-1">日付を押して勤務希望を登録</div></div>
                    <div className="flex gap-1">
                      <button className={`btn ${mode === 'off' ? 'btn-primary' : ''}`} onClick={() => setMode('off')} data-testid="button-mode-off">休み希望</button>
                      <button className={`btn ${mode === 'work' ? 'btn-primary' : ''}`} onClick={() => setMode('work')} data-testid="button-mode-work">出勤希望</button>
                    </div>
                  </div>
                  <div className="calendar-grid border-l border-[#e9e3d8] rounded-lg overflow-hidden">
                    {weekdays.map((day, index) => <div key={day} className={`text-center py-2 text-[11px] font-bold bg-[#f4efe4] border-r border-[#e9e3d8] ${index === 0 ? 'text-[#b27661]' : ''} ${index === 6 ? 'text-[#658c9a]' : ''}`}>{day}</div>)}
                    {Array.from({ length: firstDay }, (_, index) => <div key={`blank-${index}`} className="calendar-cell bg-[#f9f6ef]" />)}
                    {Array.from({ length: count }, (_, index) => {
                      const day = index + 1;
                      const isOff = preferences.requestedOffDays.includes(day);
                      const isWork = preferences.preferredWorkDays.includes(day);
                      const weekday = new Date(Number(state.selectedMonth.slice(0, 4)), Number(state.selectedMonth.slice(5, 7)) - 1, day).getDay();
                      return <button key={day} className={`calendar-cell ${isOff ? 'off-request' : isWork ? 'selected' : ''}`} onClick={() => toggleDay(day)} data-testid={`button-calendar-day-${day}`} aria-label={`${day}日${isOff ? '休み希望' : isWork ? '出勤希望' : ''}`}>
                        <span className={`${weekday === 0 ? 'text-[#b27661]' : weekday === 6 ? 'text-[#658c9a]' : 'text-[#53655d]'}`}>{day}</span>
                        {(isOff || isWork) && <span className={`block text-[9px] mt-2 font-bold ${isOff ? 'text-[#a96451]' : 'text-[#4c7669]'}`}>{isOff ? '休み' : '出勤'}</span>}
                      </button>;
                    })}
                  </div>
                  <div className="flex gap-4 text-[11px] text-[#839087] mt-3"><span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-[#f2e0d9] mr-1.5" />休み希望</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-[#f7e7de] mr-1.5" />出勤希望</span></div>
                </div>
                <aside className="rounded-lg bg-[#f4f0e6] p-4 h-fit">
                  <div className="text-[11px] uppercase tracking-[.1em] text-[#8b7869] font-bold mb-2">月間の希望</div>
                  <label><span className="field-label">休み目標（日）</span><input type="number" min="0" max="31" className="field font-mono" value={preferences.targetOffDays} onChange={(event) => updatePreferences({ targetOffDays: Number(event.target.value) })} data-testid="input-target-off-days" /></label>
                  <div className="mt-4 pt-4 border-t border-[#e2dbce]">
                    <div className="field-label">出勤希望日のシフト</div>
                    {preferences.preferredWorkDays.length ? preferences.preferredWorkDays.map((day) => (
                      <label key={day} className="block mb-2"><span className="text-xs text-[#66766e]">{day}日</span><select className="field mt-1 text-xs" value={preferences.preferredShiftByDay[String(day)] ?? ''} onChange={(event) => updatePreferences({ preferredShiftByDay: { ...preferences.preferredShiftByDay, [String(day)]: event.target.value } })} data-testid={`select-preferred-shift-${day}`}><option value="">指定なし</option>{slots.map((slot) => <option value={slot.id} key={slot.id}>{slot.name}（{slot.startTime}–{slot.endTime}）</option>)}</select></label>
                    )) : <p className="text-xs leading-relaxed text-[#92988e]">カレンダーで「出勤希望」を選ぶと、希望シフトを指定できます。</p>}
                  </div>
                  <div className="mt-4 text-[11px] text-[#879188]">休み希望 {preferences.requestedOffDays.length}日 ・ 出勤希望 {preferences.preferredWorkDays.length}日</div>
                </aside>
              </div>
            </div>
          </> : <div className="p-14 text-center text-[#849087]" data-testid="empty-selected-employee">スタッフを追加すると月間の希望を編集できます。</div>}
        </section>
      </div>
    </div>
  );
}
