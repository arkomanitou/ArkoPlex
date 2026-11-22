import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models';

export interface TrackPreference {
    language?: string;
    title?: string;
    codec?: string;
    channels?: number;
    forced?: boolean;
    hearingImpaired?: boolean;
}

export interface PlayerPreferences {
    volume: number;
    muted: boolean;
    brightness: number;
    audio?: TrackPreference;
    subtitle?: TrackPreference | 'off';
}

export function playerStorageKey(name: string): string {
    return `${name}:${JSON.stringify([
        localStorage.getItem('jf_server'),
        localStorage.getItem('jf_user'),
    ])}`;
}

function bounded(value: unknown, minimum: number, maximum: number, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(minimum, Math.min(maximum, value))
        : fallback;
}

function validTrack(value: unknown): TrackPreference | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const track = value as TrackPreference;
    if (typeof track.language !== 'string' && typeof track.title !== 'string') return undefined;
    return {
        language: typeof track.language === 'string' ? track.language : undefined,
        title: typeof track.title === 'string' ? track.title : undefined,
        codec: typeof track.codec === 'string' ? track.codec : undefined,
        channels: typeof track.channels === 'number' ? track.channels : undefined,
        forced: typeof track.forced === 'boolean' ? track.forced : undefined,
        hearingImpaired:
            typeof track.hearingImpaired === 'boolean' ? track.hearingImpaired : undefined,
    };
}

export function readPlayerPreferences(): PlayerPreferences {
    const defaults = { volume: 1, muted: false, brightness: 1 };
    try {
        const saved = JSON.parse(localStorage.getItem(playerStorageKey('arko-player-v1')) ?? '{}');
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
        const legacyVolume = localStorage.getItem('playerVolume');
        return {
            volume: bounded(
                saved.volume ?? (legacyVolume === null ? undefined : Number(legacyVolume)),
                0,
                1,
                1
            ),
            muted: saved.muted === true,
            brightness: bounded(saved.brightness, 0.3, 1.5, 1),
            audio: validTrack(saved.audio),
            subtitle: saved.subtitle === 'off' ? 'off' : validTrack(saved.subtitle),
        };
    } catch {
        return defaults;
    }
}

export function savePlayerPreferences(update: Partial<PlayerPreferences>): void {
    try {
        localStorage.setItem(
            playerStorageKey('arko-player-v1'),
            JSON.stringify({ ...readPlayerPreferences(), ...update })
        );
    } catch {
        // Playback remains available when storage is full or disabled.
    }
}

export function describeTrack(track: MediaStream): TrackPreference {
    return {
        language: track.Language || undefined,
        title: track.Title || track.DisplayTitle || undefined,
        codec: track.Codec || undefined,
        channels: track.Channels ?? undefined,
        forced: track.IsForced ?? undefined,
        hearingImpaired: track.IsHearingImpaired ?? undefined,
    };
}

export function matchPreferredTrack(
    tracks: MediaStream[],
    preference?: TrackPreference
): MediaStream | undefined {
    if (!preference) return undefined;
    const candidates = tracks.filter((track) =>
        preference.language
            ? track.Language?.toLowerCase() === preference.language.toLowerCase()
            : !!preference.title &&
              (track.Title === preference.title || track.DisplayTitle === preference.title)
    );
    const score = (track: MediaStream) =>
        Number(track.IsForced === preference.forced) * 4 +
        Number(track.IsHearingImpaired === preference.hearingImpaired) * 3 +
        Number(track.Codec === preference.codec) * 2 +
        Number(track.Channels === preference.channels) +
        Number(track.Title === preference.title || track.DisplayTitle === preference.title);
    return candidates.sort((a, b) => score(b) - score(a))[0];
}
