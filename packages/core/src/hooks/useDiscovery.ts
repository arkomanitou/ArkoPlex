import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getApi } from '../api/getApi';
import { getSeerrDiscoveryPage, type SeerrDiscoveryKind } from '../api/seerr/discover';
import { getSeerrRecommendations } from '../api/seerr/recommendations';
import { getSeerrOwnRequests } from '../api/seerr/requests';
import { getAccessToken, getServerUrl, getUserId } from '../utils/localstorageCredentials';
import { rankDiscoveryRecommendations, selectDiscoverySeeds } from '../utils/discovery';
import { useConfig } from './useConfig';

const options = {
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
} as const;

export function useDiscoveryFeed(kind: SeerrDiscoveryKind, enabled: boolean) {
    const { config } = useConfig();
    return useInfiniteQuery({
        queryKey: ['discoveryFeed', getServerUrl(), getUserId(), config.seerrUrl, kind],
        queryFn: ({ pageParam, signal }) => getSeerrDiscoveryPage(kind, pageParam, signal),
        initialPageParam: 1,
        getNextPageParam: (last) =>
            last.page < Math.min(last.totalPages, 500) ? last.page + 1 : undefined,
        enabled: enabled && !!getAccessToken() && !!getUserId(),
        ...options,
    });
}

export function usePersonalizedDiscovery(enabled: boolean) {
    const server = getServerUrl();
    const userId = getUserId();
    const { config } = useConfig();
    return useQuery({
        queryKey: ['personalizedDiscovery', server, userId, config.seerrUrl],
        enabled: enabled && !!userId && !!getAccessToken(),
        queryFn: async ({ signal }) => {
            const token = getAccessToken();
            const assertSession = () => {
                if (
                    signal.aborted ||
                    getServerUrl() !== server ||
                    getUserId() !== userId ||
                    getAccessToken() !== token
                )
                    throw new Error('La session a changé.');
            };
            assertSession();
            const library = getLibraryApi(getApi());
            const common = {
                userId: userId!,
                recursive: true,
                fields: ['ProviderIds' as const],
                enableUserData: true,
                limit: 24,
                sortOrder: ['Descending' as const],
            };
            const [favoriteResponse, historyResponse] = await Promise.all([
                library.getItems(
                    {
                        ...common,
                        includeItemTypes: ['Movie', 'Series'],
                        isFavorite: true,
                        sortBy: ['DateCreated'],
                    },
                    { signal }
                ),
                library.getItems(
                    {
                        ...common,
                        includeItemTypes: ['Movie', 'Episode'],
                        filters: ['IsPlayed'],
                        sortBy: ['DatePlayed'],
                    },
                    { signal }
                ),
            ]);
            assertSession();
            const favorites = favoriteResponse.data.Items ?? [];
            const history = historyResponse.data.Items ?? [];
            // Resolve at most three series from watched episodes, rather than
            // requiring every episode of a series to have been marked played.
            const seriesIds = [
                ...new Set(
                    history
                        .filter((item) => item.Type === 'Episode')
                        .map((item) => item.SeriesId)
                        .filter((id): id is string => !!id)
                ),
            ].slice(0, 3);
            const seriesResults = await Promise.allSettled(
                seriesIds.map((itemId) => library.getItem({ itemId, userId: userId! }, { signal }))
            );
            assertSession();
            const series = new Map<string, BaseItemDto>();
            seriesResults.forEach((result, index) => {
                if (result.status === 'fulfilled') series.set(seriesIds[index], result.value.data);
            });
            const watched = history.flatMap((item) =>
                item.Type === 'Movie'
                    ? [item]
                    : item.SeriesId && series.has(item.SeriesId)
                      ? [series.get(item.SeriesId)!]
                      : []
            );
            const seeds = selectDiscoverySeeds(favorites, watched);
            const groups = [];
            let failedSources = seriesResults.filter(
                (result) => result.status === 'rejected'
            ).length;
            // Keep upstream work bounded on small homelab machines.
            for (let offset = 0; offset < seeds.length; offset += 3) {
                assertSession();
                const batch = seeds.slice(offset, offset + 3);
                const results = await Promise.allSettled(
                    batch.map(async (seed) => ({
                        seed,
                        items: (
                            await getSeerrRecommendations(seed.mediaType, String(seed.id), signal)
                        ).map((item) => ({ ...item, mediaType: seed.mediaType })),
                    }))
                );
                assertSession();
                for (const result of results) {
                    if (result.status === 'fulfilled') groups.push(result.value);
                    else failedSources++;
                }
            }
            return {
                items: rankDiscoveryRecommendations(groups),
                seedCount: seeds.length,
                failedSources,
            };
        },
        ...options,
    });
}

export function useOwnDiscoveryRequests(enabled: boolean) {
    const { config } = useConfig();
    return useInfiniteQuery({
        queryKey: ['discoveryRequests', getServerUrl(), getUserId(), config.seerrUrl],
        queryFn: ({ pageParam, signal }) => getSeerrOwnRequests(pageParam, signal),
        initialPageParam: 0,
        getNextPageParam: (last) =>
            last.skip + last.take < Math.min(last.total, 100000)
                ? last.skip + last.take
                : undefined,
        enabled: enabled && !!getAccessToken() && !!getUserId(),
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        retry: false,
        refetchInterval: enabled ? 60_000 : false,
        refetchIntervalInBackground: false,
    });
}
