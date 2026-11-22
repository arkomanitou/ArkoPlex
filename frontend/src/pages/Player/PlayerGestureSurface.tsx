import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Sun, Volume2, RotateCcw, RotateCw } from 'lucide-react';

interface Props {
    volume: number;
    brightness: number;
    onVolumeChange: (value: number) => number;
    onBrightnessChange: (value: number) => void;
    onSeek: (seconds: number) => void;
    onTap: () => void;
    onMouseMove: () => void;
    onMouseLeave: () => void;
    showControls: boolean;
}

const DOUBLE_TAP_MS = 300;
const GESTURE_THRESHOLD = 12;

export default function PlayerGestureSurface({
    volume,
    brightness,
    onVolumeChange,
    onBrightnessChange,
    onSeek,
    onTap,
    onMouseMove,
    onMouseLeave,
    showControls,
}: Props) {
    const gesture = useRef<{
        id: number;
        x: number;
        y: number;
        height: number;
        left: boolean;
        value: number;
        started: number;
        moved: boolean;
        vertical: boolean;
    } | null>(null);
    const pendingTap = useRef<{
        timer: ReturnType<typeof setTimeout>;
        x: number;
        y: number;
        left: boolean;
    } | null>(null);
    const activePointers = useRef(new Set<number>());
    const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [feedback, setFeedback] = useState<{
        kind: 'brightness' | 'volume' | 'volumeUnavailable' | 'seek';
        value: number;
    }>();

    const clearTap = () => {
        if (pendingTap.current) clearTimeout(pendingTap.current.timer);
        pendingTap.current = null;
    };

    useEffect(
        () => () => {
            if (pendingTap.current) clearTimeout(pendingTap.current.timer);
            clearTimeout(feedbackTimer.current);
        },
        []
    );

    const showFeedback = (
        kind: 'brightness' | 'volume' | 'volumeUnavailable' | 'seek',
        value: number
    ) => {
        setFeedback({ kind, value });
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setFeedback(undefined), 800);
    };

    const start = (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse') return;
        activePointers.current.add(event.pointerId);
        if (activePointers.current.size !== 1) {
            gesture.current = null;
            clearTap();
            return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const left = event.clientX < bounds.left + bounds.width / 2;
        gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            height: bounds.height,
            left,
            value: left ? brightness : volume,
            started: event.timeStamp,
            moved: false,
            vertical: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const move = (event: PointerEvent<HTMLDivElement>) => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = current.y - event.clientY;
        if (!current.moved) {
            if (Math.hypot(dx, dy) < GESTURE_THRESHOLD) return;
            current.moved = true;
            current.vertical = Math.abs(dy) > Math.abs(dx) * 1.2;
            clearTap();
        }
        if (!current.vertical) return;
        const delta = dy / Math.max(100, current.height * 0.7);
        const value = Math.max(
            current.left ? 0.3 : 0,
            Math.min(current.left ? 1.5 : 1, current.value + delta)
        );
        if (current.left) {
            onBrightnessChange(value);
            showFeedback('brightness', Math.round(value * 100));
        } else {
            const actual = onVolumeChange(value);
            showFeedback(
                Math.abs(actual - value) > 0.02 ? 'volumeUnavailable' : 'volume',
                Math.round(actual * 100)
            );
        }
    };

    const finish = (event: PointerEvent<HTMLDivElement>) => {
        activePointers.current.delete(event.pointerId);
        const current = gesture.current;
        gesture.current = null;
        if (!current || current.id !== event.pointerId || current.moved) return;
        if (event.timeStamp - current.started > DOUBLE_TAP_MS) return;
        const previous = pendingTap.current;
        if (
            previous &&
            previous.left === current.left &&
            Math.hypot(previous.x - event.clientX, previous.y - event.clientY) < 64
        ) {
            clearTap();
            const seconds = current.left ? -10 : 10;
            onSeek(seconds);
            showFeedback('seek', seconds);
        } else {
            // Two unrelated taps remain two taps, rather than a seek.
            if (previous) {
                clearTap();
                onTap();
            }
            pendingTap.current = {
                x: event.clientX,
                y: event.clientY,
                left: current.left,
                timer: setTimeout(() => {
                    pendingTap.current = null;
                    onTap();
                }, DOUBLE_TAP_MS),
            };
        }
    };

    const cancel = (event: PointerEvent<HTMLDivElement>) => {
        activePointers.current.delete(event.pointerId);
        gesture.current = null;
        clearTap();
    };

    return (
        <>
            <div
                data-testid="player-gesture-surface"
                className={`absolute inset-0 z-10 p-4 ${showControls ? '' : 'cursor-none'}`}
                style={{ touchAction: 'none' }}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={finish}
                onPointerCancel={cancel}
                onLostPointerCapture={(event) => {
                    if (gesture.current?.id === event.pointerId) cancel(event);
                }}
                onClick={(event) => {
                    // Touch clicks are handled on pointerup so double taps never pause playback.
                    if (
                        event.detail === 0 ||
                        !('pointerType' in event.nativeEvent) ||
                        event.nativeEvent.pointerType === 'mouse'
                    )
                        onTap();
                }}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
            />
            {feedback && (
                <div
                    role="status"
                    aria-live="polite"
                    data-testid="player-gesture-feedback"
                    className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
                >
                    <div className="flex items-center gap-3 rounded-xl bg-black/75 px-5 py-3 text-white">
                        {feedback.kind === 'brightness' ? (
                            <Sun aria-label="Luminosité" />
                        ) : feedback.kind === 'volume' || feedback.kind === 'volumeUnavailable' ? (
                            <Volume2 aria-label="Volume" />
                        ) : feedback.value < 0 ? (
                            <RotateCcw />
                        ) : (
                            <RotateCw />
                        )}
                        <span>
                            {feedback.kind === 'volumeUnavailable'
                                ? 'Réglez le volume avec les boutons de l’appareil'
                                : feedback.kind === 'seek'
                                  ? `${feedback.value > 0 ? '+' : ''}${feedback.value} s`
                                  : `${feedback.value} %`}
                        </span>
                    </div>
                </div>
            )}
        </>
    );
}
