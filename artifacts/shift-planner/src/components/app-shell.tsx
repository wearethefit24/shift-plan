import { useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, ClipboardList, UsersRound, Download, Upload, ChevronDown, CircleAlert, CloudCheck } from 'lucide-react';
import { usePlanner } from '@/hooks/use-planner';
import { downloadBackup, parseBackupJson } from '@/lib/storage';

const navItems = [
  { href: '/master', label: 'スタッフ・希望', icon: UsersRound },
  { href: '/conditions', label: '条件・ルール', icon: ClipboardList },
  { href: '/schedule', label: 'シフト表', icon: CalendarDays },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, setState, storageError } = usePlanner();
  const [location] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const restored = parseBackupJson(text);
      setState(restored);
      if (fileRef.current) fileRef.current.value = '';
      window.alert('バックアップを復元しました。');
    } catch (error) {
      window.alert(`復元できませんでした：${error instanceof Error ? error.message : 'JSON形式を確認してください。'}`);
    }
  };

  const navigation = (compact = false) => navItems.map(({ href, label, icon: Icon }) => (
    <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${href.slice(1)}`}>
      <Icon size={18} strokeWidth={1.8} />
      <span className="nav-label">{label}</span>
    </Link>
  ));

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="flex items-center gap-3 px-3 mb-12">
          <div className="brand-mark"><span>時</span></div>
          <div className="brand-copy">
            <div className="font-display text-[19px] leading-tight tracking-wide">よりみち</div>
            <div className="text-[10px] uppercase tracking-[.2em] text-[#a9b7ac] mt-1">SHIFT NOTE</div>
          </div>
        </div>
        <div className="px-3 mb-3 text-[10px] uppercase tracking-[.18em] text-[#92a59a]">WORKSPACE</div>
        <nav className="flex flex-col gap-1">{navigation()}</nav>
        <div className="mt-auto px-3 pt-8">
          <div className="border-t border-[#ffffff20] pt-5 flex items-center gap-2 text-[11px] text-[#b5c2b9]" data-testid="status-local-storage">
            {storageError ? <CircleAlert size={14} className="text-[#e5a184]" /> : <CloudCheck size={14} className="text-[#9bbcae]" />}
            <span className="side-foot-copy" title={storageError ?? undefined} aria-label={storageError ?? 'この端末に保存中'}>
              {storageError ? '保存を確認してください' : 'この端末に保存中'}
            </span>
          </div>
          <p className="side-foot-copy text-[10px] leading-relaxed text-[#8fa39a] mt-2">データはこのブラウザ内に保管されます。</p>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] text-[#849088] hidden sm:block">SCHEDULE DESK</div>
            <span className="text-[#c5bdb0] hidden sm:block">/</span>
            <label className="flex items-center gap-2">
              <span className="sr-only">対象月</span>
              <input
                type="month"
                className="bg-transparent font-mono text-sm text-[#334b45] outline-none"
                value={state.selectedMonth}
                onChange={(event) => {
                  if (event.target.value) {
                    setState((current) => ({ ...current, selectedMonth: event.target.value }));
                  }
                }}
                data-testid="input-selected-month"
              />
              <ChevronDown size={14} className="text-[#87948b] -ml-1 pointer-events-none" />
            </label>
          </div>
          <div className="top-actions flex items-center gap-2">
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void restore(event.target.files?.[0])} data-testid="input-backup-restore" />
            <button className="btn btn-quiet hide-mobile" onClick={() => fileRef.current?.click()} data-testid="button-restore-backup"><Upload size={15} />復元</button>
            <button className="btn btn-primary" onClick={() => downloadBackup(state)} data-testid="button-download-backup"><Download size={15} /><span className="hide-mobile">バックアップ</span><span className="sm:hidden">保存</span></button>
          </div>
        </header>
        {storageError && (
          <div
            className="mx-4 mt-3 rounded-lg border border-[#e7c8bd] bg-[#fbede8] px-4 py-3 text-xs leading-relaxed text-[#8d493e] md:mx-8"
            role="alert"
            data-testid="alert-storage-error"
          >
            {storageError}
          </div>
        )}
        <div className="min-h-[calc(100dvh-72px)]">{children}</div>
      </main>
      <nav className="mobile-nav">{navigation(true)}</nav>
    </div>
  );
}
