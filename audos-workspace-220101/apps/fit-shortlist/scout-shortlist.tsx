// Scout — right column: Shortlist sub-section.
// Four resizable, drag-and-drop columns (Saved / Safe / Target / Dream), plus a
// program modal with a move dropdown (Saved / Safe / Target / Dream / Skip).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, Shield, Sparkles, Star, Target, X } from 'lucide-react';
import { cn, typography } from '../../lib/colors';
import { ProgramDetailBody, ProgramTile } from './scout-recommendations';
import { useScout } from './scout-store';
import {
  BOARD_COLUMNS,
  BoardStatus,
  ProgramRow,
  ProgramStatus,
  STATUS_LABELS,
  relativeStamp,
} from './scout-types';

const COLUMN_ICONS: Record<BoardStatus, any> = {
  saved: Star,
  safe: Shield,
  target: Target,
  dream: Sparkles,
};

const WIDTHS_KEY = 'scout_shortlist_widths';
const MIN_FRACTION = 0.14;

function loadWidths(): number[] {
  try {
    const raw = localStorage.getItem(WIDTHS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((n) => typeof n === 'number' && n > 0)) {
        const sum = parsed.reduce((a, b) => a + b, 0);
        return parsed.map((n) => n / sum);
      }
    }
  } catch {
    // fall through to defaults
  }
  return [0.25, 0.25, 0.25, 0.25];
}

// ---------------------------------------------------------------------------
// Program modal with the 5-option move dropdown

function ShortlistProgramModal({ program, onClose }: { program: ProgramRow; onClose: () => void }) {
  const { setStatus } = useScout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const move = async (next: ProgramStatus) => {
    if (busy) return;
    setMenuOpen(false);
    if (next === program.status) return;
    setBusy(true);
    try {
      await setStatus(program.id, next);
      // Skipping removes it from the board entirely — close so the user isn't
      // left staring at a program that no longer lives here.
      if (next === 'skipped') onClose();
    } finally {
      setBusy(false);
    }
  };

  const options: { value: ProgramStatus; label: string }[] = [
    { value: 'saved', label: 'Saved' },
    { value: 'safe', label: 'Safe' },
    { value: 'target', label: 'Target' },
    { value: 'dream', label: 'Dream' },
    { value: 'skipped', label: 'Skip' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-8">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-full flex flex-col rounded-2xl bg-[var(--space-surface-page)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 pt-4">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={busy}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white border border-[var(--space-border-default)] hover:border-[var(--space-border-strong)] transition-colors',
                typography.color.primary,
                busy && 'opacity-60 cursor-wait'
              )}
              aria-expanded={menuOpen}
            >
              {STATUS_LABELS[program.status]}
              <ChevronDown className="w-4 h-4 text-[var(--space-text-muted)]" />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-20 py-1 overflow-hidden">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => move(opt.value)}
                    className={cn(
                      'w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--space-surface-muted)] transition-colors',
                      opt.value === program.status ? 'font-semibold text-[var(--space-text-primary)]' : 'text-[var(--space-text-secondary)]',
                      opt.value === 'skipped' && 'text-[var(--space-semantic-danger)] border-t border-[var(--space-border-default)] mt-1'
                    )}
                  >
                    {opt.label}
                    {opt.value === program.status ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-[var(--space-border-default)] flex items-center justify-center hover:bg-[var(--space-surface-muted)] transition-colors"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px] text-[var(--space-text-primary)]" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7 pt-4">
          <ProgramDetailBody program={program} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board card

function BoardCard({ program, onOpen }: { program: ProgramRow; onOpen: () => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(program.id));
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className={cn(
        'rounded-xl border border-[var(--space-border-default)] bg-white shadow-sm hover:shadow-md cursor-pointer transition-all select-none',
        dragging && 'opacity-40 ring-2 ring-[var(--space-brand-primary)]'
      )}
    >
      <div className="flex items-start gap-2.5 p-3">
        <ProgramTile university={program.university} website={program.website} size="sm" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-snug line-clamp-2 ${typography.color.primary}`}>{program.program_name}</p>
          <p className={`text-xs mt-0.5 truncate ${typography.color.muted}`}>{program.university}</p>
        </div>
      </div>
      <div className={`flex items-center gap-1.5 px-3 py-2 border-t border-[var(--space-border-default)] text-xs ${typography.color.muted}`}>
        <Calendar className="w-3.5 h-3.5" />
        {relativeStamp(program.shortlisted_at || program.updated_at)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sub-section

export default function ScoutShortlist() {
  const { board, setStatus, modalProgramId, setModalProgramId, programs } = useScout();
  const [widths, setWidths] = useState<number[]>(loadWidths);
  const [dragOver, setDragOver] = useState<BoardStatus | null>(null);
  const dragCounters = useRef<Record<string, number>>({});
  const boardRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ divider: number; startX: number; startWidths: number[] } | null>(null);

  const modalProgram = useMemo(
    () => (modalProgramId != null ? programs.find((p) => p.id === modalProgramId) || null : null),
    [modalProgramId, programs]
  );

  const onDividerDown = (divider: number, e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { divider, startX: e.clientX, startWidths: [...widths] };
    const onMove = (ev: MouseEvent) => {
      const ctx = resizing.current;
      const container = boardRef.current;
      if (!ctx || !container) return;
      const total = container.getBoundingClientRect().width || 1;
      const delta = (ev.clientX - ctx.startX) / total;
      const next = [...ctx.startWidths];
      const left = ctx.divider;
      const right = ctx.divider + 1;
      const proposedLeft = ctx.startWidths[left] + delta;
      const proposedRight = ctx.startWidths[right] - delta;
      if (proposedLeft < MIN_FRACTION || proposedRight < MIN_FRACTION) return;
      next[left] = proposedLeft;
      next[right] = proposedRight;
      setWidths(next);
    };
    const onUp = () => {
      if (resizing.current) {
        setWidths((current) => {
          try {
            localStorage.setItem(WIDTHS_KEY, JSON.stringify(current));
          } catch {
            // ignore
          }
          return current;
        });
      }
      resizing.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onDrop = async (column: BoardStatus, e: React.DragEvent) => {
    e.preventDefault();
    dragCounters.current[column] = 0;
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    const program = programs.find((p) => p.id === id);
    if (!program || program.status === column) return;
    await setStatus(id, column);
  };

  const onDragEnter = (column: BoardStatus, e: React.DragEvent) => {
    e.preventDefault();
    dragCounters.current[column] = (dragCounters.current[column] || 0) + 1;
    setDragOver(column);
  };

  const onDragLeave = (column: BoardStatus) => {
    dragCounters.current[column] = Math.max(0, (dragCounters.current[column] || 0) - 1);
    if (dragCounters.current[column] === 0) setDragOver((prev) => (prev === column ? null : prev));
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--space-border-default)]">
        <h1 className={`text-lg font-semibold ${typography.color.primary}`}>Shortlist</h1>
        <p className={`text-xs hidden sm:block ${typography.color.muted}`}>Drag programs between columns, or drag the dividers to resize</p>
      </div>

      {/* Horizontal scroll keeps all four columns reachable at any panel width. */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden bg-[var(--space-surface-page)]/50">
        <div ref={boardRef} className="h-full flex min-w-[760px] p-3 gap-0">
          {BOARD_COLUMNS.map((col, i) => {
            const Icon = COLUMN_ICONS[col.key];
            const items = board[col.key];
            const isOver = dragOver === col.key;
            return (
              <div key={col.key} className="h-full flex" style={{ width: `${widths[i] * 100}%`, minWidth: 180 }}>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDragEnter={(e) => onDragEnter(col.key, e)}
                  onDragLeave={() => onDragLeave(col.key)}
                  onDrop={(e) => onDrop(col.key, e)}
                  className={cn(
                    'flex-1 min-w-0 h-full flex flex-col rounded-2xl border bg-[var(--space-surface-muted)]/70 transition-colors',
                    isOver ? 'border-[var(--space-brand-primary)] ring-2 ring-[var(--space-brand-primary-200)] bg-[var(--space-brand-primary-50)]' : 'border-[var(--space-border-default)]'
                  )}
                >
                  <div className="flex-shrink-0 flex items-center gap-2 px-3.5 py-3">
                    <Icon className={cn('w-4 h-4', col.accentClass)} />
                    <span className={`text-sm font-semibold ${typography.color.primary}`}>{col.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full bg-white border border-[var(--space-border-default)] text-[11px] font-medium ${typography.color.muted}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5 space-y-2.5">
                    {items.length === 0 ? (
                      <div className={`h-full min-h-[160px] flex items-center justify-center text-sm ${typography.color.muted}`}>
                        Drop programs here
                      </div>
                    ) : (
                      items.map((p) => <BoardCard key={p.id} program={p} onOpen={() => setModalProgramId(p.id)} />)
                    )}
                  </div>
                </div>
                {i < BOARD_COLUMNS.length - 1 && (
                  <div
                    onMouseDown={(e) => onDividerDown(i, e)}
                    className="w-2 h-full flex-shrink-0 cursor-col-resize group flex items-center justify-center"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${col.label} column`}
                  >
                    <div className="w-[3px] h-16 rounded-full bg-[var(--space-border-default)] group-hover:bg-[var(--space-brand-primary)] transition-colors" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modalProgram && <ShortlistProgramModal program={modalProgram} onClose={() => setModalProgramId(null)} />}
    </div>
  );
}
