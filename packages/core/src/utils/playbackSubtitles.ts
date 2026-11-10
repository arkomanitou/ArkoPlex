import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models';

const bitmapCodecs = new Set([
    'pgs',
    'pgssub',
    'hdmv_pgs_subtitle',
    'dvdsub',
    'dvd_subtitle',
    'vobsub',
    'dvbsub',
    'dvb_subtitle',
]);

export function isBitmapSubtitle(stream: MediaStream) {
    return bitmapCodecs.has(stream.Codec?.toLowerCase() ?? '');
}

// Text subtitles are rendered by the client. Explicit -1 prevents Jellyfin
// from picking and burning a default embedded bitmap track behind the UI.
export function getServerSubtitleIndex(streams: MediaStream[], selectedIndex: number | null) {
    const track =
        selectedIndex === null
            ? undefined
            : streams.filter((s) => s.Type === 'Subtitle')[selectedIndex];
    return track && isBitmapSubtitle(track) ? (track.Index ?? -1) : -1;
}

export function preferredSubtitleIndex(streams: MediaStream[], language: string) {
    const subtitles = streams.filter((s) => s.Type === 'Subtitle');
    const textIndex = subtitles.findIndex((s) => s.Language === language && !isBitmapSubtitle(s));
    const index = textIndex >= 0 ? textIndex : subtitles.findIndex((s) => s.Language === language);
    return index < 0 ? null : index;
}
