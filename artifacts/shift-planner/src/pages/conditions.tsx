import { useState } from 'react';
import { Plus, Trash2, Clock3, ShieldCheck, UsersRound, CalendarClock, Ban, Repeat2, Pencil, X } from 'lucide-react';
import type { ConditionRule } from '@/lib/shift-model';
import { usePlanner } from '@/hooks/use-planner';

const weekdayLabels = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
type RuleKind = 'staffing' | 'max-consecutive' | 'pair' | 'weekday-block' | 'date-assignment';
const newSlot = { name: '', startTime: '09:00', endTime: '17:00' };

function describeRule(rule: ConditionRule, employees: { id: string; name: string }[], slots: { id: string; name: string }[]) {
  const person = (id: string) => employees.find((item) => item.id === id)?.name ?? '削除済みスタッフ';
  const slot = (id: string) => slots.find((item) => item.id === id)?.name ?? '削除済みシフト';
  if ('requiredCount' in rule) return `${rule.weekday === null ? '毎日' : weekdayLabels[rule.weekday]}の「${slot(rule.shiftSlotId)}」を ${rule.requiredCount}名配置`;
  if ('maxDays' in rule) return `連続勤務は最大 ${rule.maxDays}日`;
  if ('employeeA' in rule) return `${person(rule.employeeA)}さんと${person(rule.employeeB)}さんは${rule.mode === 'together' ? '同じ日に勤務' : '同じ日に勤務しない'}`;
  if ('weekday' in rule) return `${person(rule.employeeId)}さんは${weekdayLabels[rule.weekday]}を休み`;
  const action = rule.action === 'off' ? '休み' : '勤務';
  return `${rule.month} / ${rule.day}日：${person(rule.employeeId)}さんを${action}${rule.shiftSlotId ? `（${slot(rule.shiftSlotId)}）` : ''}`;
}

export default function ConditionsPage() {
  const { state, setState } = usePlanner();
  const [kind, setKind] = useState<RuleKind>('staffing');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [slotDraft, setSlotDraft] = useState(newSlot);
  const [staffing, setStaffing] = useState({ weekday: 'any', shiftSlotId: state.shiftSlots[0]?.id ?? '', requiredCount: 2 });
  const [maxDays, setMaxDays] = useState(6);
  const [pair, setPair] = useState({ employeeA: state.employees[0]?.id ?? '', employeeB: state.employees[1]?.id ?? '', mode: 'together' as 'together' | 'separate' });
  const [weekdayBlock, setWeekdayBlock] = useState({ employeeId: state.employees[0]?.id ?? '', weekday: 0 });
  const [dateAssignment, setDateAssignment] = useState({ employeeId: state.employees[0]?.id ?? '', day: 1, action: 'off' as 'off' | 'work', shiftSlotId: '' });

  const addSlot = (event: React.FormEvent) => {
    event.preventDefault();
    if (!slotDraft.name.trim()) return;
    const id = `slot-${Date.now()}`;
    setState((current) => ({ ...current, shiftSlots: [...current.shiftSlots, { ...slotDraft, id }] }));
    setStaffing((current) => ({ ...current, shiftSlotId: current.shiftSlotId || id }));
    setSlotDraft(newSlot);
  };
  const updateSlot = (id: string, key: 'name' | 'startTime' | 'endTime', value: string) => setState((current) => ({
    ...current, shiftSlots: current.shiftSlots.map((slot) => slot.id === id ? { ...slot, [key]: value } : slot),
  }));
  const removeSlot = (id: string) => {
    if (!window.confirm('このシフト枠を削除しますか？関連する条件も削除されます。')) return;
    setState((current) => ({
      ...current,
      shiftSlots: current.shiftSlots.filter((slot) => slot.id !== id),
      rules: current.rules.filter((rule) => !('shiftSlotId' in rule && rule.shiftSlotId === id)),
    }));
  };
  const addRule = () => {
    let rule: ConditionRule;
    if (kind === 'staffing') {
      if (!staffing.shiftSlotId) return;
      rule = { id: `rule-${Date.now()}`, enabled: true, type: 'staffing', weekday: staffing.weekday === 'any' ? null : Number(staffing.weekday), shiftSlotId: staffing.shiftSlotId, requiredCount: Math.max(0, Number(staffing.requiredCount)) };
    } else if (kind === 'max-consecutive') {
      rule = { id: `rule-${Date.now()}`, enabled: true, type: 'max-consecutive', maxDays: Math.max(1, Number(maxDays)) };
    } else if (kind === 'pair') {
      if (!pair.employeeA || !pair.employeeB || pair.employeeA === pair.employeeB) return;
      rule = { id: `rule-${Date.now()}`, enabled: true, type: 'pair', ...pair };
    } else if (kind === 'weekday-block') {
      if (!weekdayBlock.employeeId) return;
      rule = { id: `rule-${Date.now()}`, enabled: true, type: 'weekday-block', ...weekdayBlock };
    } else {
      if (!dateAssignment.employeeId) return;
      rule = { id: `rule-${Date.now()}`, enabled: true, type: 'date-assignment', ...dateAssignment, month: state.selectedMonth, ...(dateAssignment.action === 'work' && dateAssignment.shiftSlotId ? { shiftSlotId: dateAssignment.shiftSlotId } : {}) };
    }
    setState((current) => ({
      ...current,
      rules: editingRuleId
        ? current.rules.map((existing) =>
            existing.id === editingRuleId
              ? { ...rule, id: editingRuleId, enabled: existing.enabled }
              : existing,
          )
        : [...current.rules, rule],
    }));
    setEditingRuleId(null);
  };
  const editRule = (rule: ConditionRule) => {
    setKind(rule.type);
    setEditingRuleId(rule.id);
    if (rule.type === 'staffing') {
      setStaffing({ weekday: rule.weekday === null ? 'any' : String(rule.weekday), shiftSlotId: rule.shiftSlotId, requiredCount: rule.requiredCount });
    } else if (rule.type === 'max-consecutive') {
      setMaxDays(rule.maxDays);
    } else if (rule.type === 'pair') {
      setPair({ employeeA: rule.employeeA, employeeB: rule.employeeB, mode: rule.mode });
    } else if (rule.type === 'weekday-block') {
      setWeekdayBlock({ employeeId: rule.employeeId, weekday: rule.weekday });
    } else {
      setDateAssignment({ employeeId: rule.employeeId, day: rule.day, action: rule.action, shiftSlotId: rule.shiftSlotId ?? '' });
    }
  };
  const cancelEdit = () => setEditingRuleId(null);
  const removeRule = (index: number) => setState((current) => ({ ...current, rules: current.rules.filter((_, itemIndex) => itemIndex !== index) }));
  const toggleRule = (ruleId: string, enabled: boolean) => setState((current) => ({ ...current, rules: current.rules.map((rule) => rule.id === ruleId ? { ...rule, enabled } : rule) }));

  const ruleOptions: { id: RuleKind; name: string; icon: typeof UsersRound }[] = [
    { id: 'staffing', name: '必要人数', icon: UsersRound },
    { id: 'max-consecutive', name: '連続勤務', icon: Repeat2 },
    { id: 'pair', name: 'スタッフの組合せ', icon: ShieldCheck },
    { id: 'weekday-block', name: '曜日固定休', icon: Ban },
    { id: 'date-assignment', name: '日付を指定', icon: CalendarClock },
  ];
  return (
    <div className="page-wrap fade-in">
      <div className="mb-7">
        <div className="text-[11px] uppercase tracking-[.2em] text-[#a16b56] font-bold mb-2">02 / CONDITIONS</div>
        <h1 className="font-display text-[30px] md:text-[36px] text-[#2d4843]">現場の条件を決める</h1>
        <p className="text-sm text-[#7c877f] mt-2">必要な人数と守りたいルールをまとめて、無理のない案をつくります。</p>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="space-y-5">
          <section className="surface overflow-hidden">
            <div className="p-5 border-b border-[#e9e3d8] flex justify-between items-center">
              <div><h2 className="font-display text-[20px] text-[#304944]">シフト枠</h2><p className="text-xs text-[#879188] mt-1">時間帯と呼び名を設定します。</p></div><Clock3 className="text-[#bd8067]" size={20} />
            </div>
            <div className="divide-y divide-[#eee8dc]">
              {state.shiftSlots.map((slot) => <div key={slot.id} className="shift-slot-row grid gap-2 items-center px-4 py-3" data-testid={`row-shift-slot-${slot.id}`}>
                <input className="field shift-slot-name" value={slot.name} aria-label={`${slot.name}の名前`} onChange={(event) => updateSlot(slot.id, 'name', event.target.value)} data-testid={`input-slot-name-${slot.id}`} />
                <input className="field shift-slot-time font-mono text-xs" type="time" value={slot.startTime} aria-label={`${slot.name}開始時刻`} onChange={(event) => updateSlot(slot.id, 'startTime', event.target.value)} data-testid={`input-slot-start-${slot.id}`} />
                <input className="field shift-slot-time font-mono text-xs" type="time" value={slot.endTime} aria-label={`${slot.name}終了時刻`} onChange={(event) => updateSlot(slot.id, 'endTime', event.target.value)} data-testid={`input-slot-end-${slot.id}`} />
                <button className="icon-button text-[#ad6c58]" aria-label={`${slot.name}を削除`} onClick={() => removeSlot(slot.id)} data-testid={`button-delete-slot-${slot.id}`}><Trash2 size={16} /></button>
              </div>)}
              {!state.shiftSlots.length && <div className="p-5 text-sm text-[#879188]" data-testid="empty-shift-slots">シフト枠を追加してください。</div>}
            </div>
            <form onSubmit={addSlot} className="shift-slot-row shift-slot-add grid gap-2 p-4 bg-[#f8f5ed]">
              <input className="field shift-slot-name" placeholder="例：早番" value={slotDraft.name} onChange={(event) => setSlotDraft({ ...slotDraft, name: event.target.value })} aria-label="新しいシフト枠名" data-testid="input-new-slot-name" />
              <input className="field shift-slot-time font-mono text-xs" type="time" value={slotDraft.startTime} onChange={(event) => setSlotDraft({ ...slotDraft, startTime: event.target.value })} aria-label="新しいシフト開始" data-testid="input-new-slot-start" />
              <input className="field shift-slot-time font-mono text-xs" type="time" value={slotDraft.endTime} onChange={(event) => setSlotDraft({ ...slotDraft, endTime: event.target.value })} aria-label="新しいシフト終了" data-testid="input-new-slot-end" />
              <button className="btn btn-primary" type="submit" aria-label="シフト枠を追加" data-testid="button-add-slot"><Plus size={16} /></button>
            </form>
          </section>

          <section className="surface overflow-hidden">
            <div className="p-5 border-b border-[#e9e3d8] flex justify-between items-center">
              <div><h2 className="font-display text-[20px] text-[#304944]">適用中のルール</h2><p className="text-xs text-[#879188] mt-1">有効にした条件をシフト作成時に適用します。</p></div>
              <span className="pill bg-[#e7eee8] text-[#4d7467]" data-testid="text-rule-count">{state.rules.filter((rule) => rule.enabled).length} / {state.rules.length}件</span>
            </div>
            {state.rules.length ? state.rules.map((rule, index) => {
              const option = 'requiredCount' in rule ? ruleOptions[0] : 'maxDays' in rule ? ruleOptions[1] : 'employeeA' in rule ? ruleOptions[2] : 'employeeId' in rule && 'weekday' in rule ? ruleOptions[3] : ruleOptions[4];
              const Icon = option.icon;
              return <div className={`rule-row ${rule.enabled ? '' : 'opacity-55'}`} key={rule.id} data-testid={`row-rule-${rule.id}`}>
                <div className="flex items-center gap-3"><span className="w-8 h-8 rounded-full bg-[#f2e8dd] text-[#ad765f] grid place-items-center"><Icon size={15} /></span><span className="font-semibold text-sm text-[#52645c]">{option.name}</span></div>
                <p className="rule-description text-sm text-[#394f48]" data-testid={`text-rule-description-${rule.id}`}>{describeRule(rule, state.employees, state.shiftSlots)}</p>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-[#849087] flex items-center gap-1.5"><input className="switch" type="checkbox" checked={rule.enabled} onChange={(event) => toggleRule(rule.id, event.target.checked)} aria-label="条件を有効にする" data-testid={`switch-rule-${rule.id}`} /><span>{rule.enabled ? '有効' : '停止'}</span></label>
                  <button className="icon-button" aria-label="ルールを編集" onClick={() => editRule(rule)} data-testid={`button-edit-rule-${rule.id}`}><Pencil size={15} /></button>
                  <button className="icon-button text-[#ad6c58]" aria-label="ルールを削除" onClick={() => removeRule(index)} data-testid={`button-delete-rule-${rule.id}`}><Trash2 size={16} /></button>
                </div>
              </div>;
            }) : <div className="p-8 text-center text-sm text-[#879188]" data-testid="empty-rules">まだルールはありません。右側から必要な条件を追加できます。</div>}
          </section>
        </div>

        <aside className="surface overflow-hidden">
          <div className="p-5 bg-[#315953] text-[#fff9ed]">
            <div className="text-[10px] uppercase tracking-[.18em] text-[#c8d7cc] mb-2">RULE BUILDER</div>
            <h2 className="font-display text-[21px]">条件を追加</h2>
            <p className="text-xs text-[#cfdbd1] mt-1">運用に合わせて組み合わせます。</p>
          </div>
          <div className="p-5">
            <label className="block mb-4"><span className="field-label">条件の種類</span><select className="field" value={kind} onChange={(event) => setKind(event.target.value as RuleKind)} data-testid="select-rule-kind">{ruleOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            {kind === 'staffing' && <div className="space-y-3">
              <label><span className="field-label">曜日</span><select className="field" value={staffing.weekday} onChange={(event) => setStaffing({ ...staffing, weekday: event.target.value })} data-testid="select-staffing-weekday"><option value="any">毎日</option>{weekdayLabels.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>
              <label><span className="field-label">シフト枠</span><select className="field" value={staffing.shiftSlotId} onChange={(event) => setStaffing({ ...staffing, shiftSlotId: event.target.value })} data-testid="select-staffing-slot"><option value="">選択してください</option>{state.shiftSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}（{slot.startTime}–{slot.endTime}）</option>)}</select></label>
              <label><span className="field-label">必要人数</span><input type="number" min="0" max="99" className="field" value={staffing.requiredCount} onChange={(event) => setStaffing({ ...staffing, requiredCount: Number(event.target.value) })} data-testid="input-required-count" /></label>
            </div>}
            {kind === 'max-consecutive' && <label><span className="field-label">連続勤務の上限</span><div className="flex items-center gap-2"><input type="number" min="1" max="31" className="field" value={maxDays} onChange={(event) => setMaxDays(Number(event.target.value))} data-testid="input-max-days" /><span className="text-sm text-[#718078] shrink-0">日まで</span></div></label>}
            {kind === 'pair' && <div className="space-y-3">
              <label><span className="field-label">スタッフ A</span><select className="field" value={pair.employeeA} onChange={(event) => setPair({ ...pair, employeeA: event.target.value })} data-testid="select-pair-a">{state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <label><span className="field-label">スタッフ B</span><select className="field" value={pair.employeeB} onChange={(event) => setPair({ ...pair, employeeB: event.target.value })} data-testid="select-pair-b">{state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <label><span className="field-label">勤務の組合せ</span><select className="field" value={pair.mode} onChange={(event) => setPair({ ...pair, mode: event.target.value as 'together' | 'separate' })} data-testid="select-pair-mode"><option value="together">同じ日に勤務</option><option value="separate">同じ日にしない</option></select></label>
            </div>}
            {kind === 'weekday-block' && <div className="space-y-3">
              <label><span className="field-label">スタッフ</span><select className="field" value={weekdayBlock.employeeId} onChange={(event) => setWeekdayBlock({ ...weekdayBlock, employeeId: event.target.value })} data-testid="select-blocked-employee">{state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <label><span className="field-label">固定休の曜日</span><select className="field" value={weekdayBlock.weekday} onChange={(event) => setWeekdayBlock({ ...weekdayBlock, weekday: Number(event.target.value) })} data-testid="select-blocked-weekday">{weekdayLabels.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            </div>}
            {kind === 'date-assignment' && <div className="space-y-3">
              <div className="text-xs text-[#879188]">対象月：{state.selectedMonth}</div>
              <label><span className="field-label">スタッフ</span><select className="field" value={dateAssignment.employeeId} onChange={(event) => setDateAssignment({ ...dateAssignment, employeeId: event.target.value })} data-testid="select-date-employee">{state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <label><span className="field-label">日付</span><input type="number" min="1" max="31" className="field" value={dateAssignment.day} onChange={(event) => setDateAssignment({ ...dateAssignment, day: Number(event.target.value) })} data-testid="input-assignment-day" /></label>
              <label><span className="field-label">予定</span><select className="field" value={dateAssignment.action} onChange={(event) => setDateAssignment({ ...dateAssignment, action: event.target.value as 'off' | 'work' })} data-testid="select-assignment-action"><option value="off">休み</option><option value="work">勤務</option></select></label>
              {dateAssignment.action === 'work' && <label><span className="field-label">シフト枠（任意）</span><select className="field" value={dateAssignment.shiftSlotId} onChange={(event) => setDateAssignment({ ...dateAssignment, shiftSlotId: event.target.value })} data-testid="select-assignment-slot"><option value="">指定なし</option>{state.shiftSlots.map((slot) => <option value={slot.id} key={slot.id}>{slot.name}</option>)}</select></label>}
            </div>}
            <button className="btn btn-primary w-full mt-5" onClick={addRule} disabled={(kind === 'staffing' && !staffing.shiftSlotId) || (kind === 'pair' && (state.employees.length < 2 || pair.employeeA === pair.employeeB)) || (!state.employees.length && ['pair', 'weekday-block', 'date-assignment'].includes(kind))} data-testid="button-add-rule">{editingRuleId ? <Pencil size={16} /> : <Plus size={16} />}{editingRuleId ? '条件を更新' : 'この条件を追加'}</button>
            {editingRuleId && <button className="btn btn-quiet w-full mt-2" onClick={cancelEdit} data-testid="button-cancel-rule-edit"><X size={15} />編集をやめる</button>}
          </div>
        </aside>
      </div>
    </div>
  );
}
