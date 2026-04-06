import { useEffect, useMemo, useRef, useState } from 'react';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

type WhiteSpaceMode = 'normal' | 'pre-wrap';

type PretextTextProps = {
  text: string;
  font: string;
  lineHeight: number;
  className?: string;
  whiteSpace?: WhiteSpaceMode;
};

export function PretextText({
  text,
  font,
  lineHeight,
  className,
  whiteSpace = 'normal',
}: PretextTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layoutState, setLayoutState] = useState({
    lines: [] as string[],
    height: 0,
  });

  const prepared = useMemo(() => {
    if (!text) return null;
    return prepareWithSegments(text, font, { whiteSpace });
  }, [text, font, whiteSpace]);

  useEffect(() => {
    if (!prepared || !containerRef.current) return;

    let frame = 0;
    const element = containerRef.current;

    const recalculate = () => {
      const nextWidth = Math.floor(element.clientWidth);
      if (nextWidth <= 0) return;

      const measured = layoutWithLines(prepared, nextWidth, lineHeight);
      const nextState = {
        lines: measured.lines.map((line) => line.text),
        height: measured.height,
      };

      setLayoutState((prev) => {
        const sameHeight = prev.height === nextState.height;
        const sameLines =
          prev.lines.length === nextState.lines.length &&
          prev.lines.every((line, idx) => line === nextState.lines[idx]);

        if (sameHeight && sameLines) {
          return prev;
        }
        return nextState;
      });
    };

    recalculate();

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recalculate);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [prepared, lineHeight]);

  const lines = layoutState.lines.length > 0 ? layoutState.lines : [text];

  return (
    <div ref={containerRef} className={className} style={{ whiteSpace: whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal' }}>
      <div style={{ minHeight: layoutState.height ? `${layoutState.height}px` : undefined, lineHeight: `${lineHeight}px`, font }}>
        {lines.map((line, index) => (
          <div key={`${index}-${line}`}>{line || '\u00a0'}</div>
        ))}
      </div>
    </div>
  );
}
