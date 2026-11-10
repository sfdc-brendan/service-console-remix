import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface WaveOptions {
  lines?: number;
  step?: number;
}

/** Draws faint white wave lines, a few in the canvas's CSS `color`. Pauses off screen; one still frame under reduced motion. */
function startHeaderWaves(
  canvas: HTMLCanvasElement,
  { lines = 26, step = 14 }: WaveOptions = {}
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return () => undefined;
  }
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const accent = getComputedStyle(canvas).color;
  let w = 0;
  let h = 0;
  let raf = 0;
  let visible = true;
  let last = 0;

  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const s = t / 1000;
    for (let i = 0; i < lines; i++) {
      const f = i / (lines - 1);
      const base = h * (0.18 + f * 0.95);
      const amp = (10 + 26 * Math.sin(Math.PI * f)) * Math.min(1, h / 220);
      const hot = i % 6 === 3;
      ctx.beginPath();
      for (let x = -step; x <= w + step; x += step) {
        const u = x / Math.max(1, w);
        const y =
          base +
          amp * Math.sin(u * 5.2 + s * 0.45 + f * 2.4) +
          amp * 0.55 * Math.sin(u * 11.5 - s * 0.32 + f * 5.1) -
          u * h * 0.22;
        if (x === -step) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = hot ? accent : '#fff';
      ctx.globalAlpha = hot
        ? 0.2 + 0.1 * Math.sin(s * 0.6 + i)
        : 0.035 + 0.035 * Math.sin(Math.PI * f);
      ctx.lineWidth = hot ? 1.2 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const frame = (t: number) => {
    raf = 0;
    if (!visible || still.matches) {
      return;
    }
    if (t - last > 33) {
      draw(t);
      last = t;
    }
    raf = requestAnimationFrame(frame);
  };

  const play = () => {
    if (still.matches) {
      draw(0);
    } else if (!raf) {
      raf = requestAnimationFrame(frame);
    }
  };

  const resize = new ResizeObserver(() => {
    size();
    draw(still.matches ? 0 : performance.now());
  });
  const intersect = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      play();
    }
  });
  resize.observe(canvas);
  intersect.observe(canvas);
  still.addEventListener('change', play);
  size();
  play();

  return () => {
    cancelAnimationFrame(raf);
    resize.disconnect();
    intersect.disconnect();
    still.removeEventListener('change', play);
  };
}

/** Subtle animated line-wave field for dark command headers. The accent is the CSS text color. */
export function HeaderWaves({
  className,
  lines,
  step,
}: WaveOptions & { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    return canvas ? startHeaderWaves(canvas, { lines, step }) : undefined;
  }, [lines, step]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 size-full text-voice [mask-image:linear-gradient(90deg,transparent_0%,#000_18%,#000_82%,transparent_100%)]',
        className
      )}
    />
  );
}
