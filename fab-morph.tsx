'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Bookmark, Focus, Minus, Plus, Share2 } from 'lucide-react';

type FabAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
};

export type FabMorphProps = {
  onShare?: () => void;
  onSave?: () => void;
  onFocusMode?: () => void;
  onDecreaseSize?: () => void;
  onIncreaseSize?: () => void;
  className?: string;
};

const closedSize = 44;

export function FabMorph({
  onShare,
  onSave,
  onFocusMode,
  onDecreaseSize,
  onIncreaseSize,
  className = '',
}: FabMorphProps) {
  const [open, setOpen] = useState(false);
  const [surfaceHeight, setSurfaceHeight] = useState(closedSize);
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceId = 'fab-morph-surface';
  const fontStyle = { fontFamily: 'var(--font-family, IRANSans, Vazirmatn, sans-serif)' };

  const actions: FabAction[] = [
    { label: 'اشتراک شعر', icon: <Share2 aria-hidden="true" />, onSelect: onShare ?? (() => {}) },
    { label: 'ذخیره شعر', icon: <Bookmark aria-hidden="true" />, onSelect: onSave ?? (() => {}) },
    { label: 'حالت تمرکز', icon: <Focus aria-hidden="true" />, onSelect: onFocusMode ?? (() => {}) },
  ];

  useEffect(() => {
    if (!open) {
      setSurfaceHeight(closedSize);
      return;
    }

    const frame = requestAnimationFrame(() => {
      const measured = surfaceRef.current?.scrollHeight ?? closedSize;
      setSurfaceHeight(Math.max(closedSize, measured));
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (open && rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const buttons = [...(surfaceRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(current + step + buttons.length) % buttons.length]?.focus();
  };

  const selectAction = (action: FabAction) => {
    action.onSelect();
    setOpen(false);
  };

  const rootStyle = {
    ...fontStyle,
    width: open ? '14rem' : `${closedSize}px`,
    height: `${open ? surfaceHeight : closedSize}px`,
    '--sx': '-12px',
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      dir="rtl"
      className={`fixed end-4 bottom-20 z-50 text-foreground transition-[width,height] ${
        open
          ? 'duration-[300ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]'
          : 'duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
      } motion-reduce:transition-none ${className}`}
      data-open={open}
      style={rootStyle}
    >
      <div
        ref={surfaceRef}
        id={surfaceId}
        role="menu"
        aria-label="ابزارهای شعر"
        onKeyDown={handleMenuKeyDown}
        className={`absolute end-0 bottom-0 flex flex-col gap-1 overflow-hidden border border-border bg-background p-3 pb-14 shadow-lg transition-[width,height,border-radius] ${
          open
            ? 'rounded-2xl duration-[300ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]'
            : 'rounded-[22px] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
        } motion-reduce:transition-none`}
        data-open={open}
        style={{ width: open ? '14rem' : `${closedSize}px`, height: `${open ? surfaceHeight : closedSize}px` }}
      >
        {actions.map((action, index) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => selectAction(action)}
            className={`flex items-center gap-2 rounded-lg bg-transparent px-2 py-2 text-start text-sm text-foreground outline-none transition-[opacity,transform,filter] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
              open ? 'translate-x-0 opacity-100 blur-0' : 'pointer-events-none translate-x-[var(--sx)] opacity-0 blur-[2px]'
            }`}
            style={{ transitionDelay: open ? `${index * 40}ms` : '0ms' }}
          >
            <span className="grid size-4 shrink-0 place-items-center [&>svg]:size-4">{action.icon}</span>
            {action.label}
          </button>
        ))}
        <div
          role="group"
          aria-label="اندازهٔ شعر"
          className={`mt-1 flex items-center justify-between border-border pt-1 text-xs text-muted-foreground transition-[opacity,transform,filter] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            open ? 'translate-x-0 opacity-100 blur-0' : 'pointer-events-none translate-x-[var(--sx)] opacity-0 blur-[2px]'
          }`}
          style={{ transitionDelay: open ? `${actions.length * 40}ms` : '0ms' }}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            aria-label="کوچک‌تر کردن اندازهٔ شعر"
            onClick={() => { onDecreaseSize?.(); setOpen(false); }}
            className="grid size-8 place-items-center rounded-lg text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <span>اندازه</span>
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            aria-label="بزرگ‌تر کردن اندازهٔ شعر"
            onClick={() => { onIncreaseSize?.(); setOpen(false); }}
            className="grid size-8 place-items-center rounded-lg text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={surfaceId}
        aria-label={open ? 'بستن ابزارهای شعر' : 'بازکردن ابزارهای شعر'}
        onClick={() => setOpen(value => !value)}
        className={`absolute end-0 bottom-0 z-10 grid size-11 place-items-center rounded-[22px] bg-primary text-primary-foreground outline-none transition-[transform,border-radius] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${open ? 'rotate-[135deg] rounded-2xl duration-[300ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]' : ''}`}
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}

// Usage example:
export function FabMorphExample() {
  return (
    <FabMorph
      onShare={() => navigator.share?.({ title: 'جریان', text: 'بیت شعر' })}
      onSave={() => console.log('شعر ذخیره شد')}
      onFocusMode={() => console.log('حالت تمرکز')}
      onDecreaseSize={() => console.log('اندازه کمتر')}
      onIncreaseSize={() => console.log('اندازه بیشتر')}
    />
  );
}
