import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import {
    discoveryStatus,
    getSeerrDiscoveryPage,
    rankDiscoveryRecommendations,
    selectDiscoverySeeds,
    unavailableDiscoveries,
    useDiscoveryFeed,
    useOwnDiscoveryRequests,
    usePersonalizedDiscovery,
    useSeerrItemDetails,
    useCurrentUser,
    type DiscoverySeed,
    type SeerrSearchResultItem,
} from '@pelagica/core';
import { DiscoveryCard } from '../src/pages/Discover/DiscoveryCard';
import { SeerrItemDialogContext } from '../src/context/SeerrItemDialogContext';

export async function runChecks() {
    const checks: string[] = [];
    const check = (name: string, fn: () => void) => {
        fn();
        checks.push(name);
    };
    const movie = (id: number, name = `Film ${id}`): BaseItemDto => ({
        Id: `jf-${id}`,
        Type: 'Movie',
        Name: name,
        ProviderIds: { Tmdb: String(id) },
    });
    const candidate = (
        id: number,
        status = 1,
        mediaType: 'movie' | 'tv' = 'movie'
    ): SeerrSearchResultItem => ({
        id,
        title: `Titre ${id}`,
        mediaType,
        mediaInfo: { status: status as 1 },
    });
    const favorite: DiscoverySeed = {
        id: 1,
        title: 'Favori',
        mediaType: 'movie',
        source: 'favorite',
    };
    const watched: DiscoverySeed = { id: 2, title: 'Vu', mediaType: 'movie', source: 'watched' };
    check('Les références personnelles sont limitées à six et dédoublonnées', () => {
        const seeds = selectDiscoverySeeds(
            Array.from({ length: 12 }, (_, i) => movie(i + 1)),
            [movie(1), ...Array.from({ length: 12 }, (_, i) => movie(i + 4))]
        );
        assert.equal(seeds.length, 6);
        assert.equal(seeds.filter((s) => s.source === 'favorite').length, 3);
        assert.equal(new Set(seeds.map((s) => `${s.mediaType}:${s.id}`)).size, 6);
    });
    check(
        'Les identifiants absents, invalides et les épisodes ne deviennent pas des références TMDB',
        () => {
            assert.deepEqual(
                selectDiscoverySeeds(
                    [
                        { Type: 'Episode', Name: 'Épisode', ProviderIds: { Tmdb: '11' } },
                        { Type: 'Movie', Name: 'Invalide', ProviderIds: { Tmdb: '../23' } },
                        { Type: 'Movie', Name: 'Absent' },
                    ],
                    []
                ),
                []
            );
        }
    );
    check('Un film et une série peuvent avoir le même identifiant TMDB', () => {
        assert.equal(
            selectDiscoverySeeds([movie(12), { ...movie(12), Type: 'Series' }], []).length,
            2
        );
    });
    check(
        'Les doublons et titres disponibles sont exclus, les séries partielles restent accessibles',
        () => {
            const items = unavailableDiscoveries([
                candidate(1),
                candidate(1),
                candidate(2, 5),
                candidate(3, 4, 'tv'),
                candidate(4),
                candidate(4, 5),
                candidate(5, 6),
            ]);
            assert.deepEqual(
                items.map((i) => i.id),
                [1, 3]
            );
        }
    );
    check('Le classement favorise les favoris et les correspondances répétées sans doublon', () => {
        const result = rankDiscoveryRecommendations([
            { seed: favorite, items: [candidate(10), candidate(11)] },
            { seed: watched, items: [candidate(11), candidate(12)] },
        ]);
        assert.equal(result[0].id, 11);
        assert.equal(result.length, 3);
        assert.match(result[0].reason!, /favori/);
    });
    check('Un titre regardé fournit une explication honnête sans supposer qu’il a été aimé', () => {
        const result = rankDiscoveryRecommendations([{ seed: watched, items: [candidate(10)] }]);
        assert.match(result[0].reason!, /vous avez regardé/);
        assert(!result[0].reason!.includes('aimé'));
    });
    check('Une disponibilité signalée par une autre source exclut aussi le candidat', () => {
        assert.deepEqual(
            rankDiscoveryRecommendations([
                { seed: favorite, items: [candidate(1), candidate(20), candidate(21, 6)] },
                { seed: watched, items: [candidate(20, 5)] },
            ]),
            []
        );
    });
    check('Un historique vide ne produit aucune fausse recommandation', () => {
        assert.deepEqual(selectDiscoverySeeds([], []), []);
        assert.deepEqual(rankDiscoveryRecommendations([]), []);
    });
    check('Les états de refus, échec, validation et disponibilité restent distincts', () => {
        assert.equal(discoveryStatus(3, 4), 'Échec de l’ajout');
        assert.equal(discoveryStatus(1, 3), 'Demande refusée');
        assert.equal(discoveryStatus(2, 1), 'En attente de validation');
        assert.equal(discoveryStatus(5, 5), 'Disponible');
        assert.equal(discoveryStatus(4, 2), 'Disponibilité partielle');
        assert.equal(discoveryStatus(1, 5), 'Demande terminée');
    });
    const renderCard = (item: SeerrSearchResultItem) =>
        renderToStaticMarkup(
            <MemoryRouter>
                <SeerrItemDialogContext.Provider value={{ openDialog: () => undefined }}>
                    <DiscoveryCard item={item} />
                </SeerrItemDialogContext.Provider>
            </MemoryRouter>
        );
    check('Un titre absent offre une demande, sans lien de lecture', () => {
        const html = renderCard(candidate(20));
        assert(html.includes('Demander'));
        assert(!html.includes('/play/'));
        assert(html.includes('Ouvrir la fiche'));
    });
    check('Les titres et raisons restent du texte et les affiches sont facultatives', () => {
        const html = renderCard({ ...candidate(20), title: '<script>titre</script>' });
        assert(html.includes('&lt;script&gt;'));
        assert(!html.includes('<script>'));
        assert(html.includes('<svg'));
    });
    const previousUser = localStorage.getItem('jf_user')!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const server = localStorage.getItem('jf_server');
    client.setQueryData(['config', server], { seerrUrl: 'https://seerr.invalid' });
    function Probe() {
        const personal = usePersonalizedDiscovery(false);
        useDiscoveryFeed('trending', false);
        useOwnDiscoveryRequests(false);
        useSeerrItemDetails('movie', 77, false);
        useCurrentUser();
        return (
            <output>
                {personal.data?.items[0]?.title ?? 'aucune donnée personnelle en cache'}
            </output>
        );
    }
    try {
        localStorage.setItem('jf_user', 'alice');
        client.setQueryData(['personalizedDiscovery', server, 'alice', 'https://seerr.invalid'], {
            items: [{ title: 'Préférence privée Alice' }],
            seedCount: 1,
            failedSources: 0,
        });
        const render = () =>
            renderToStaticMarkup(
                <QueryClientProvider client={client}>
                    <Probe />
                </QueryClientProvider>
            );
        const alice = render();
        localStorage.setItem('jf_user', 'bob');
        const bob = render();
        check('Changer de compte ne réutilise pas les recommandations du précédent', () => {
            assert(alice.includes('Préférence privée Alice'));
            assert(!bob.includes('Préférence privée Alice'));
        });
        check(
            'Découvertes, demandes, fiches et utilisateur courant ont des caches par compte',
            () => {
                for (const prefix of [
                    'personalizedDiscovery',
                    'discoveryFeed',
                    'discoveryRequests',
                    'seerrItemDetails',
                    'currentUser',
                ]) {
                    const keys = client
                        .getQueryCache()
                        .getAll()
                        .filter((q) => q.queryKey[0] === prefix)
                        .map((q) => q.queryKey);
                    assert(
                        keys.some((k) => k.includes('alice')),
                        prefix
                    );
                    assert(
                        keys.some((k) => k.includes('bob')),
                        prefix
                    );
                }
            }
        );
    } finally {
        localStorage.setItem('jf_user', previousUser);
        client.clear();
    }
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async (input) => {
            assert(String(input).includes('page=2'));
            return new Response(
                JSON.stringify({
                    page: 2,
                    totalPages: 4,
                    results: [{ id: 5, title: 'Film paginé' }],
                }),
                { status: 200 }
            );
        };
        const page = await getSeerrDiscoveryPage('movies', 2);
        check(
            'La pagination conserve le type des films même sans mediaType dans la réponse',
            () => {
                assert.equal(page.page, 2);
                assert.equal(page.totalPages, 4);
                assert.equal(page.results[0].mediaType, 'movie');
            }
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
    return checks;
}
