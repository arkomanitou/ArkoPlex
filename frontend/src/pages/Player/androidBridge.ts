import { registerPlugin } from '@capacitor/core';

export interface NativePlaybackResult {
    reason: 'back' | 'ended' | 'next' | 'previous' | 'interrupted' | 'error' | 'audio' | 'subtitle';
    positionMs: number;
    selectedServerIndex?: number;
    volume: number;
    brightness: number;
    audioOrdinal?: number;
    subtitleOrdinal?: number;
    cleanupFailed?: boolean;
}

export interface NativePlaybackOptions {
    url: string;
    title: string;
    authorization: string;
    startMs: number;
    volume: number;
    brightness: number;
    audioOrdinal: number;
    subtitleOrdinal: number;
    serverTrackSelection: boolean;
    sourceAudio: { index: number; name: string }[];
    sourceSubtitles: { index: number; name: string }[];
    audioIndices: number[];
    subtitleIndices: number[];
    embeddedSubtitles: number[];
    externalSubtitles: { url: string; name: string; ordinal: number }[];
    segments: { startMs: number; endMs: number; name: string }[];
    hasNext: boolean;
    hasPrevious: boolean;
    session: {
        startUrl: string;
        progressUrl: string;
        body: Record<string, unknown>;
        cleanup: { method: string; url: string; body?: Record<string, unknown> }[];
    };
}

export const LibVLC = registerPlugin<{
    play(options: NativePlaybackOptions): Promise<NativePlaybackResult>;
    stop(): Promise<void>;
}>('ArkoLibVLC');
