import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { ArkoHero } from '../src/components/arkoplex/ArkoHero';
import { ArkoTopBar } from '../src/components/arkoplex/ArkoTopBar';
import '@pelagica/core/i18n';

export function runChecks() {
    const checks: string[] = [];
    const config = { types: ['Movie' as const, 'Series' as const] };
    const movie: BaseItemDto = {
        Id: 'qa-movie',
        Name: 'Film de test',
        Type: 'Movie',
        ProductionYear: 2024,
        RunTimeTicks: 72000000000,
        Overview: '<p>Une histoire de test.</p>',
        UserData: { PlaybackPositionTicks: 1000000000 },
        Genres: ['Science-fiction'],
    };
    const series: BaseItemDto = {
        Id: 'qa-series',
        Name: 'Série de test',
        Type: 'Series',
        Overview: 'Un épisode vous attend.',
    };
    function render(items: BaseItemDto[]) {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        });
        client.setQueryData(['config', 'https://jellyfin.invalid'], {
            serverName: 'ArkoPlex',
            nightPulseEnabled: true,
            nightPulseMotion: 'system',
        });
        client.setQueryData(['mediaBarItems', config], items);
        client.setQueryData(['userLibraryItem', 'qa-movie'], movie);
        const html = renderToStaticMarkup(
            <QueryClientProvider client={client}>
                <MemoryRouter>
                    <ArkoTopBar />
                    <ArkoHero itemsConfig={config} />
                </MemoryRouter>
            </QueryClientProvider>
        );
        client.clear();
        return html;
    }
    function check(name: string, condition: boolean) {
        if (!condition) throw new Error(name);
        checks.push(name);
    }
    const filmHTML = render([movie]);
    check(
        'Accueil rendu avec les données du catalogue',
        filmHTML.includes('Film de test') &&
            filmHTML.includes('Une histoire de test.') &&
            filmHTML.includes('ArkoPlex')
    );
    check(
        'Un film expose sa reprise réelle',
        filmHTML.includes('/play/qa-movie') &&
            filmHTML.includes('Reprendre') &&
            filmHTML.includes('progressbar')
    );
    check(
        'Aucune qualité vidéo inventée dans la mise en avant',
        !filmHTML.includes('>4K<') && !filmHTML.includes('>HDR<')
    );
    const seriesHTML = render([series]);
    check(
        'Une série ouvre sa fiche et ne tente pas de lire son identifiant',
        seriesHTML.includes('Choisir un épisode') &&
            seriesHTML.includes('/item/qa-series') &&
            !seriesHTML.includes('/play/qa-series')
    );
    const escaped = render([{ ...movie, Name: '<script>not-code</script>' }]);
    check(
        'Les titres du catalogue restent du texte',
        escaped.includes('&lt;script&gt;not-code&lt;/script&gt;') &&
            !escaped.includes('<script>not-code</script>')
    );
    check(
        'Une bibliothèque vide affiche un état explicite',
        render([]).includes('Aucun film ou série disponible')
    );
    check(
        'Navigation Films, Séries, Favoris et recherche présente',
        filmHTML.includes('>Films<') &&
            filmHTML.includes('>Séries<') &&
            filmHTML.includes('>Favoris<') &&
            filmHTML.includes('Rechercher un titre')
    );
    return checks;
}
