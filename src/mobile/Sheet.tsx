import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, a[href]') || []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="mobile-scrim" onClick={onClose}><section ref={ref} role="dialog" aria-modal="true" aria-label={title} className="mobile-sheet glass-panel" onClick={e => e.stopPropagation()}>
    <div className="mobile-sheet-heading"><h2>{title}</h2><button aria-label={`Close ${title === 'Sources & settings' ? 'settings' : title.toLowerCase()}`} onClick={onClose}><X size={22} /></button></div>
    {children}
  </section></div>;
}
