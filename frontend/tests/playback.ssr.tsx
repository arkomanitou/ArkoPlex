import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { stopPlaybackSession } from '../../packages/core/src/hooks/usePlaybackStop';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models';
import {
    getPlaybackStreamUrl,
    getServerSubtitleIndex,
    preferredSubtitleIndex,
    usePlaybackInfo,
    clearCodecCache,
} from '@pelagica/core';

export async function runChecks() {
    const checks: string[] = [];
    const check = (name: string, fn: () => void) => {
        fn();
        checks.push(name);
    };
    const streams: MediaStream[] = [
        { Type: 'Video', Index: 0, Codec: 'hevc' },
        { Type: 'Audio', Index: 1, Codec: 'dts' },
        { Type: 'Subtitle', Index: 4, Codec: 'pgssub', Language: 'fre', IsDefault: true },
        { Type: 'Subtitle', Index: 7, Codec: 'subrip', Language: 'fre' },
        { Type: 'Subtitle', Index: 8, Codec: 'ass', Language: 'eng' },
    ];
    check('Sous-titres désactivés : aucun choix graphique implicite du serveur', () => {
        assert.equal(getServerSubtitleIndex(streams, null), -1);
    });
    check('Les sous-titres texte restent rendus côté client', () => {
        assert.equal(getServerSubtitleIndex(streams, 1), -1);
        assert.equal(getServerSubtitleIndex(streams, 2), -1);
    });
    check('Une sélection PGS explicite transmet son véritable index de flux', () => {
        assert.equal(getServerSubtitleIndex(streams, 0), 4);
    });
    check('La préférence de langue privilégie SRT aux sous-titres graphiques', () => {
        assert.equal(preferredSubtitleIndex(streams, 'fre'), 1);
        assert.equal(preferredSubtitleIndex(streams, 'eng'), 2);
        assert.equal(preferredSubtitleIndex(streams, 'ita'), null);
    });
    check('Une sélection périmée ne déclenche pas de sous-titres automatiques', () => {
        assert.equal(getServerSubtitleIndex(streams, 99), -1);
    });
    check('DirectStream utilise le flux HLS adapté fourni par Jellyfin', () => {
        const result = getPlaybackStreamUrl('fixture', 'DirectStream', {
            container: 'mkv',
            transcodingUrl: '/Videos/fixture/master.m3u8?VideoCodec=copy&AudioCodec=aac',
            audioStreamIndex: 2,
        });
        assert.equal(result.mimeType, 'application/x-mpegURL');
        assert(result.url.includes('master.m3u8'));
        assert(!result.url.includes('Static=true'));
        assert.equal(new URL(result.url).searchParams.get('VideoCodec'), 'copy');
    });
    check('La lecture directe compatible reste un fichier statique', () => {
        const result = getPlaybackStreamUrl('fixture', 'DirectPlay', { container: 'mp4' });
        assert.equal(result.mimeType, 'video/mp4');
        assert.equal(new URL(result.url).searchParams.get('Static'), 'true');
    });
    const originalAdapter = axios.defaults.adapter;
    const previousDocument = globalThis.document;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const captured: { url: string; body: Record<string, unknown> }[] = [];
    try {
        globalThis.document = {
            createElement: () => ({ canPlayType: () => 'probably' }),
        } as unknown as Document;
        clearCodecCache();
        axios.defaults.adapter = async (config) => {
            captured.push({
                url: config.url ?? '',
                body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
            });
            return {
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
                data: {
                    MediaSources: [
                        {
                            Id: 'fixture-source-not-item',
                            DefaultSubtitleStreamIndex: new URL(
                                config.url!,
                                'https://jellyfin.invalid'
                            ).searchParams.get('mediaSourceId')
                                ? (typeof config.data === 'string'
                                      ? JSON.parse(config.data)
                                      : config.data
                                  ).SubtitleStreamIndex
                                : 4,
                            SupportsDirectStream: true,
                            Container: 'mkv',
                            TranscodingUrl: '/Videos/fixture/master.m3u8',
                        },
                    ],
                    PlaySessionId: 'fixture-session',
                },
            };
        };
        function Probe({ bitmap }: { bitmap: boolean }) {
            usePlaybackInfo(
                bitmap ? 'bitmap-fixture' : 'off-fixture',
                'qa-user',
                2,
                false,
                bitmap ? 4 : undefined
            );
            return null;
        }
        for (const bitmap of [false, true]) {
            renderToStaticMarkup(
                <QueryClientProvider client={client}>
                    <Probe bitmap={bitmap} />
                </QueryClientProvider>
            );
            const query = client
                .getQueryCache()
                .getAll()
                .find((q) => q.queryKey[1] === (bitmap ? 'bitmap-fixture' : 'off-fixture'))!;
            const result = await client.fetchQuery(query.options);
            assert.equal(result.mediaSource.DefaultSubtitleStreamIndex, bitmap ? 4 : -1);
        }
        check(
            'Le SDK transmet explicitement -1 et conserve la copie vidéo lorsque les sous-titres sont désactivés',
            () => {
                const req = captured[1];
                const u = new URL(req.url, 'https://jellyfin.invalid');
                assert.equal(u.searchParams.get('subtitleStreamIndex'), '-1');
                assert.equal(req.body.SubtitleStreamIndex, -1);
                assert.equal(u.searchParams.get('allowVideoStreamCopy'), 'true');
            }
        );
        check(
            'Le choix de piste est renégocié avec le véritable identifiant de source, distinct du titre',
            () => {
                assert.equal(captured.length, 4);
                for (const req of [captured[1], captured[3]]) {
                    assert.equal(
                        new URL(req.url, 'https://jellyfin.invalid').searchParams.get(
                            'mediaSourceId'
                        ),
                        'fixture-source-not-item'
                    );
                    assert.equal(req.body.MediaSourceId, 'fixture-source-not-item');
                }
            }
        );
        check('Le SDK transmet aussi la sélection explicite PGS au serveur', () => {
            assert.equal(captured[3].body.SubtitleStreamIndex, 4);
        });
        const stops: {
            url: string;
            method?: string;
            data?: Record<string, unknown>;
            params?: Record<string, unknown>;
        }[] = [];
        let rejectReport = false;
        axios.defaults.adapter = async (config) => {
            stops.push({
                url: config.url ?? '',
                method: config.method,
                data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
                params: config.params,
            });
            if (rejectReport && config.method === 'post')
                throw new Error('fixture report unavailable');
            return { status: 204, statusText: 'No Content', headers: {}, config, data: undefined };
        };
        await stopPlaybackSession({
            itemId: 'off-fixture',
            positionTicks: 123000000,
            playSessionId: 'only-this-play-session',
        });
        check('Quitter la vidéo signale la bonne session et coupe uniquement son encodage', () => {
            const report = stops.find((r) => r.method === 'post')!;
            const stop = stops.find((r) => r.method === 'delete')!;
            assert.equal(report.data?.PlaySessionId, 'only-this-play-session');
            assert.equal(report.data?.PositionTicks, 123000000);
            assert.equal(report.data?.SessionId, undefined);
            assert.equal(new URL(stop.url).pathname, '/Videos/ActiveEncodings');
            assert.equal(stop.params?.playSessionId, 'only-this-play-session');
            assert.ok(stop.params?.deviceId);
            assert.equal(stops.length, 2);
        });
        stops.length = 0;
        rejectReport = true;
        await assert.rejects(
            stopPlaybackSession({
                itemId: 'off-fixture',
                positionTicks: 0,
                playSessionId: 'stop-even-on-report-error',
            })
        );
        check('Une erreur de suivi ne laisse pas tourner la conversion', () => {
            assert.equal(stops.filter((r) => r.method === 'delete').length, 1);
        });
        stops.length = 0;
        rejectReport = false;
        await stopPlaybackSession({ itemId: 'music-fixture', positionTicks: 0 });
        check('Sans identifiant de lecture aucun arrêt global des conversions n’est envoyé', () => {
            assert.equal(stops.length, 1);
            assert.equal(stops[0].method, 'post');
        });
    } finally {
        axios.defaults.adapter = originalAdapter;
        globalThis.document = previousDocument;
        clearCodecCache();
        client.clear();
    }
    return checks;
}
