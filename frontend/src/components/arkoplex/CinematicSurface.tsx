import { useCallback, useEffect, useRef, type PropsWithChildren, type PointerEvent } from 'react';
import { useNightPulseMotion } from './useNightPulseMotion';

export function CinematicSurface({
    children,
    className = '',
}: PropsWithChildren<{ className?: string }>) {
    const ref = useRef<HTMLDivElement>(null);
    const frame = useRef(0);
    const sample = useRef<{ x: number; y: number } | null>(null);
    const motion = useNightPulseMotion();
    const reset = useCallback(() => {
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = 0;
        sample.current = null;
        const node = ref.current;
        if (!node) return;
        node.classList.remove('arko-pointer-active');
        for (const name of ['--arko-drift-x', '--arko-drift-y']) node.style.removeProperty(name);
    }, []);
    useEffect(() => {
        reset();
        const onVisibility = () => {
            if (document.hidden) reset();
        };
        const media = window.matchMedia('(hover: hover) and (pointer: fine)');
        media.addEventListener('change', reset);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            reset();
            media.removeEventListener('change', reset);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [motion, reset]);

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!motion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        sample.current = { x: event.clientX, y: event.clientY };
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            const node = ref.current,
                point = sample.current;
            if (!node || !point) return;
            const rect = node.getBoundingClientRect();
            if (rect.width < 700 || !rect.height) return;
            const x = Math.max(0, Math.min(rect.width, point.x - rect.left));
            const y = Math.max(0, Math.min(rect.height, point.y - rect.top));
            node.style.setProperty('--arko-light-x', `${x}px`);
            node.style.setProperty('--arko-light-y', `${y}px`);
            node.style.setProperty('--arko-drift-x', `${(x / rect.width - 0.5) * 5}px`);
            node.style.setProperty('--arko-drift-y', `${(y / rect.height - 0.5) * 4}px`);
            node.classList.add('arko-pointer-active');
        });
    };
    return (
        <div
            ref={ref}
            className={`arko-cinematic ${motion ? 'arko-motion' : ''} ${className}`}
            onPointerMove={onPointerMove}
            onPointerLeave={reset}
        >
            <span className="arko-ambient" aria-hidden="true" />
            <span className="arko-light-trace" aria-hidden="true" />
            {children}
        </div>
    );
}
