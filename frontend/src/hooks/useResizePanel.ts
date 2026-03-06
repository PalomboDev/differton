import { useRef, useCallback } from 'react';

const MIN = 160;
const MAX = 520;

export function useResizePanel(width: number, onChange: (w: number) => void) {
  const startX = useRef(0);
  const startWidth = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX.current;
      const next = Math.min(MAX, Math.max(MIN, startWidth.current + delta));
      onChange(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, onChange]);

  return onMouseDown;
}
