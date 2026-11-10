import { withBasePath } from '../../utils/basePath';
import type { SeerrSearchResponse, SeerrSearchResultItem } from './types';

export type SeerrDiscoveryKind = 'trending' | 'movies' | 'tv';

export async function getSeerrDiscoveryPage(
    kind: SeerrDiscoveryKind,
    page = 1,
    signal?: AbortSignal
): Promise<{
    results: SeerrSearchResultItem[];
    page: number;
    totalPages: number;
}> {
    const response = await fetch(withBasePath(`/api/seerr/discover/${kind}?page=${page}`), {
        signal,
    });
    if (!response.ok)
        throw new Error(`Impossible de charger les découvertes (${response.status}).`);
    const data: SeerrSearchResponse = await response.json();
    return {
        page: data.page,
        totalPages: data.totalPages,
        results: data.results.flatMap((result) => {
            const mediaType = kind === 'movies' ? 'movie' : kind === 'tv' ? 'tv' : result.mediaType;
            if (mediaType !== 'movie' && mediaType !== 'tv') return [];
            return [
                {
                    id: result.id,
                    mediaType,
                    title: mediaType === 'movie' ? result.title || '' : result.name || '',
                    posterPath: result.posterPath,
                    releaseDate: mediaType === 'movie' ? result.releaseDate : result.firstAirDate,
                    mediaInfo: result.mediaInfo,
                },
            ];
        }),
    };
}

export async function getSeerrTrending() {
    return (await getSeerrDiscoveryPage('trending')).results;
}
export async function getSeerrPopularMovies() {
    return (await getSeerrDiscoveryPage('movies')).results;
}
export async function getSeerrPopularSeries() {
    return (await getSeerrDiscoveryPage('tv')).results;
}
