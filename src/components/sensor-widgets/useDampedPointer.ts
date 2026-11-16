import { useEffect, useRef, useState } from 'react';

/** A small, damped mechanical response shared by dial and linear pointers.
 *  Works in normalized scale coordinates; readings and calibration are untouched.
 */
export function useDampedPointer(target: number, enabled = true): number {
    const bounded = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
    const [position, setPosition] = useState(bounded);
    const motion = useRef({ position: bounded, velocity: 0 });
    const frame = useRef<number | null>(null);
    const previousTime = useRef<number | null>(null);

    useEffect(() => {
        const reducedMotion = typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!enabled || reducedMotion || typeof requestAnimationFrame !== 'function') {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            previousTime.current = null;
            motion.current = { position: bounded, velocity: 0 };
            return;
        }
        // Second-order spring: slight overshoot for substantial changes, then settle.
        // Near-identical readings do not generate visible jitter.
        const stiffness = 125;
        const damping = 15;
        const animate = (now: number) => {
            const elapsed = previousTime.current === null ? 1 / 60 :
                Math.min((now - previousTime.current) / 1000, 0.032);
            previousTime.current = now;
            const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
            const dt = elapsed / steps;
            for (let i = 0; i < steps; i++) {
                const acceleration = stiffness * (bounded - motion.current.position) - damping * motion.current.velocity;
                motion.current.velocity += acceleration * dt;
                motion.current.position += motion.current.velocity * dt;
            }
            const settled = Math.abs(bounded - motion.current.position) < 0.00015 &&
                Math.abs(motion.current.velocity) < 0.001;
            if (settled) {
                motion.current = { position: bounded, velocity: 0 };
                setPosition(bounded);
                frame.current = null;
                previousTime.current = null;
            } else {
                setPosition(motion.current.position);
                frame.current = requestAnimationFrame(animate);
            }
        };
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        previousTime.current = null;
        frame.current = requestAnimationFrame(animate);
        return () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            previousTime.current = null;
        };
    }, [bounded, enabled]);
    return enabled ? position : bounded;
}
