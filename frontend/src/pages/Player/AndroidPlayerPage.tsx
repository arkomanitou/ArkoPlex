import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
    getApi,
    getUserId,
    getPlaybackStreamUrl,
    getSubtitleUrl,
    usePlayerItem,
    useUserConfiguration,
    usePlaybackInfo,
    useMediaSegments,
    useAdjacentItems,
} from '@pelagica/core';
import type { BaseItemDto, UserConfiguration } from '@jellyfin/sdk/lib/generated-client/models';
import { stopSessionRequests } from '../../../../packages/core/src/utils/playbackSessionRequests';
import { stopPlaybackSession } from '../../../../packages/core/src/hooks/usePlaybackStop';
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import {
    describeTrack,
    matchPreferredTrack,
    readPlayerPreferences,
    savePlayerPreferences,
} from '@/utils/playerPreferences';
import { useMusicPlayback } from '@/hooks/useMusicPlayback';
import { buildPlayerUrl } from '@/utils/playerUrl';
import PlayerLoading from './PlayerLoading';
import { LibVLC } from './androidBridge';

export default function AndroidPlayerPage() {
    const { itemId } = useParams();
    const item = usePlayerItem(itemId, true);
    const configuration = useUserConfiguration(getUserId());
    if (item.isLoading || configuration.isLoading) return <PlayerLoading />;
    if (!item.data || item.error || configuration.error)
        return (
            <p role="alert">Impossible de charger ce média. Vérifiez votre connexion Jellyfin.</p>
        );
    return <NativePlayer key={itemId} item={item.data} configuration={configuration.data} />;
}

function NativePlayer({
    item,
    configuration,
}: {
    item: BaseItemDto;
    configuration?: UserConfiguration;
}) {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const backUrl = params.get('backUrl');
    const queryClient = useQueryClient();
    const { clearPlayback } = useMusicPlayback();
    const [error, setError] = useState('');
    const [cleanupFailed, setCleanupFailed] = useState(false);
    const launched = useRef(false);
    const [preferences] = useState(readPlayerPreferences);
    const audio = item.MediaStreams?.filter((s) => s.Type === 'Audio') || [];
    const subtitles = item.MediaStreams?.filter((s) => s.Type === 'Subtitle') || [];
    const preferredAudio =
        matchPreferredTrack(audio, preferences.audio) ||
        audio.find((s) => s.Language === configuration?.AudioLanguagePreference) ||
        audio[0];
    const preferredSubtitle =
        preferences.subtitle === 'off'
            ? undefined
            : matchPreferredTrack(subtitles, preferences.subtitle) ||
              subtitles.find(
                  (s) =>
                      !!configuration?.SubtitleLanguagePreference &&
                      s.Language === configuration.SubtitleLanguagePreference
              );
    const [selectedAudio, setSelectedAudio] = useState(preferredAudio?.Index);
    const [selectedSubtitle, setSelectedSubtitle] = useState(preferredSubtitle?.Index ?? -1);
    const [resumeMs, setResumeMs] = useState(
        Math.floor((item.UserData?.PlaybackPositionTicks || 0) / 10_000)
    );
    const playback = usePlaybackInfo(
        item.Id,
        getUserId() || undefined,
        selectedAudio,
        false,
        selectedSubtitle
    );
    const adjacent = useAdjacentItems(item, getUserId());
    const segments = useMediaSegments(item.Id);

    useEffect(() => {
        if (!playback.data || adjacent.isLoading || segments.isLoading || launched.current) return;
        launched.current = true;
        let cancelled = false;
        const decision = playback.data;
        const api = getApi();
        const source = decision.mediaSource;
        const streams = source.MediaStreams || item.MediaStreams || [];
        const sourceAudio = streams.filter((s) => s.Type === 'Audio');
        const sourceSubtitles = streams.filter((s) => s.Type === 'Subtitle');
        const startMs = resumeMs;
        const startTicks = startMs * 10_000;
        clearPlayback();
        const url = getPlaybackStreamUrl(item.Id!, decision.playMethod, {
            playSessionId: decision.playSessionId,
            mediaSourceId: source.Id || undefined,
            audioStreamIndex: selectedAudio,
            container: source.Container?.split(',')[0],
            transcodingUrl: source.TranscodingUrl,
        }).url;
        const sourceAudioChoice = sourceAudio.find((s) => s.Index === selectedAudio);
        const sourceSubtitleChoice = sourceSubtitles.find((s) => s.Index === selectedSubtitle);
        const direct = decision.playMethod === 'DirectPlay';
        const externalSubtitles = direct
            ? sourceSubtitles
                  .filter(
                      (s) => s.IsExternal && ['srt', 'ass', 'ssa', 'vtt'].includes(s.Codec || '')
                  )
                  .map((s) => ({
                      url: getSubtitleUrl(
                          item.Id!,
                          source.Id!,
                          s.Index!,
                          s.Codec === 'ass' || s.Codec === 'ssa' || s.Codec === 'srt'
                              ? s.Codec
                              : 'vtt'
                      ),
                      name: s.DisplayTitle || s.Language || 'Sous-titres',
                      ordinal: sourceSubtitles.indexOf(s),
                  }))
            : [];
        const cleanup = stopSessionRequests({
            itemId: item.Id!,
            positionTicks: startTicks,
            playSessionId: decision.playSessionId,
            deviceId: api.deviceInfo.id,
        }).map(({ path, params, ...request }) => ({
            ...request,
            url: api.getUri(path) + (params ? `?${new URLSearchParams(params)}` : ''),
        }));
        if (decision.liveStreamId)
            cleanup.push({
                method: 'POST',
                url: api.getUri(
                    `LiveStreams/Close?liveStreamId=${encodeURIComponent(decision.liveStreamId)}`
                ),
            });
        void LibVLC.play({
            url,
            title: item.Name || 'ArkoPlex',
            authorization: api.authorizationHeader,
            startMs,
            volume: readPlayerPreferences().muted ? 0 : readPlayerPreferences().volume,
            brightness: Math.min(1, readPlayerPreferences().brightness),
            audioOrdinal: direct ? sourceAudio.indexOf(sourceAudioChoice!) : 0,
            subtitleOrdinal: direct ? sourceSubtitles.indexOf(sourceSubtitleChoice!) : -1,
            externalSubtitles,
            serverTrackSelection: !direct,
            sourceAudio: sourceAudio.map((s) => ({
                index: s.Index ?? -1,
                name: s.DisplayTitle || s.Language || 'Audio',
            })),
            sourceSubtitles: sourceSubtitles.map((s) => ({
                index: s.Index ?? -1,
                name: s.DisplayTitle || s.Language || 'Sous-titres',
            })),
            audioIndices: direct ? sourceAudio.map((s) => s.Index ?? -1) : [],
            subtitleIndices: direct ? sourceSubtitles.map((s) => s.Index ?? -1) : [],
            embeddedSubtitles: direct
                ? sourceSubtitles.map((s, i) => (s.IsExternal ? -1 : i)).filter((i) => i >= 0)
                : [],
            hasNext: !!adjacent.data?.nextItem?.Id,
            hasPrevious: !!adjacent.data?.previousItem?.Id,
            segments: (segments.data || [])
                .filter((s) => s.Type === 'Intro' || s.Type === 'Recap')
                .map((s) => ({
                    startMs: (s.StartTicks || 0) / 10_000,
                    endMs: (s.EndTicks || 0) / 10_000,
                    name: s.Type === 'Intro' ? 'Passer l’introduction' : 'Passer le récapitulatif',
                })),
            session: {
                startUrl: api.getUri('Sessions/Playing'),
                progressUrl: api.getUri('Sessions/Playing/Progress'),
                body: {
                    ItemId: item.Id,
                    MediaSourceId: source.Id,
                    PlaySessionId: decision.playSessionId,
                    PlayMethod: decision.playMethod,
                    CanSeek: true,
                    AudioStreamIndex: sourceAudioChoice?.Index,
                    SubtitleStreamIndex: sourceSubtitleChoice?.Index ?? -1,
                },
                cleanup,
            },
        }).then(
            async (result) => {
                if (cancelled) return;
                // Persist only against this mounted account; no shared native preference store.
                savePlayerPreferences({
                    volume: result.volume,
                    muted: result.volume === 0,
                    brightness: result.brightness,
                });
                if (direct && result.audioOrdinal != null && sourceAudio[result.audioOrdinal])
                    savePlayerPreferences({
                        audio: describeTrack(sourceAudio[result.audioOrdinal]),
                    });
                if (direct && result.subtitleOrdinal != null)
                    savePlayerPreferences({
                        subtitle:
                            result.subtitleOrdinal < 0
                                ? 'off'
                                : sourceSubtitles[result.subtitleOrdinal]
                                  ? describeTrack(sourceSubtitles[result.subtitleOrdinal])
                                  : preferences.subtitle,
                    });
                await queryClient.invalidateQueries({ refetchType: 'none' });
                if (cancelled) return;
                if (result.reason === 'error' || result.cleanupFailed) {
                    setCleanupFailed(!!result.cleanupFailed);
                    setError(
                        result.reason === 'error'
                            ? 'Lecture LibVLC impossible. Vérifiez le réseau, les droits du média et les capacités de l’appareil.'
                            : 'Le lecteur est fermé mais Jellyfin n’a pas confirmé tous les messages de fin de session.'
                    );
                    return;
                }
                if (
                    (result.reason === 'audio' || result.reason === 'subtitle') &&
                    result.selectedServerIndex != null
                ) {
                    setResumeMs(result.positionMs);
                    launched.current = false;
                    if (result.reason === 'audio') {
                        const track = sourceAudio.find(
                            (s) => s.Index === result.selectedServerIndex
                        );
                        if (track) savePlayerPreferences({ audio: describeTrack(track) });
                        setSelectedAudio(result.selectedServerIndex);
                    } else {
                        const track = sourceSubtitles.find(
                            (s) => s.Index === result.selectedServerIndex
                        );
                        savePlayerPreferences({ subtitle: track ? describeTrack(track) : 'off' });
                        setSelectedSubtitle(result.selectedServerIndex);
                    }
                    return;
                }
                const next =
                    result.reason === 'next'
                        ? adjacent.data?.nextItem
                        : result.reason === 'previous'
                          ? adjacent.data?.previousItem
                          : null;
                if (next?.Id)
                    navigate(buildPlayerUrl(next.Id, backUrl || undefined), { replace: true });
                else if (backUrl?.startsWith('/') && !backUrl.startsWith('//'))
                    navigate(backUrl, { replace: true });
                else navigate(-1);
            },
            async () => {
                // Bridge/startup failures still close the negotiated server resources.
                await Promise.allSettled([
                    stopPlaybackSession({
                        itemId: item.Id!,
                        positionTicks: startTicks,
                        playSessionId: decision.playSessionId,
                    }),
                    ...(decision.liveStreamId
                        ? [
                              getMediaInfoApi(api).closeLiveStream({
                                  liveStreamId: decision.liveStreamId,
                              }),
                          ]
                        : []),
                ]);
                if (!cancelled) setError('Impossible de démarrer le lecteur natif LibVLC.');
            }
        );
        return () => {
            cancelled = true;
            void LibVLC.stop();
        };
        // One native session owns this decision until it resolves. Preference changes must not relaunch it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playback.data, adjacent.isLoading, segments.isLoading]);

    if (error || playback.error)
        return (
            <div className="p-6 space-y-4">
                <p role="alert">{error || 'Jellyfin ne propose aucune source lisible.'}</p>
                {cleanupFailed && (
                    <p>Vérifiez l’arrêt du transcodage dans le tableau de bord Jellyfin.</p>
                )}
                <button onClick={() => navigate(-1)}>Retour</button>
            </div>
        );
    return <PlayerLoading />;
}
