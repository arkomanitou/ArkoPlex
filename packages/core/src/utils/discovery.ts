import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { SeerrMediaStatus, SeerrRequestStatus } from '../api/seerr/types';
import type { SeerrMediaType, SeerrSearchResultItem } from '../api/seerr/types';

export interface DiscoverySeed {
    id: number;
    mediaType: SeerrMediaType;
    title: string;
    source: 'favorite' | 'watched';
}

export interface DiscoverySuggestion extends SeerrSearchResultItem {
    reason?: string;
}

export function discoveryKey(item: { id: number; mediaType: SeerrMediaType }) {
    return `${item.mediaType}:${item.id}`;
}

export function selectDiscoverySeeds(favorites: BaseItemDto[], watched: BaseItemDto[]) {
    const seeds: DiscoverySeed[] = [];
    const seen = new Set<string>();
    const add = (items: BaseItemDto[], source: DiscoverySeed['source'], limit: number) => {
        for (const item of items) {
            const raw = Object.entries(item.ProviderIds ?? {}).find(
                ([key]) => key.toLowerCase() === 'tmdb'
            )?.[1];
            if (!raw || !/^\d+$/.test(raw) || !item.Name) continue;
            if (item.Type !== 'Movie' && item.Type !== 'Series') continue;
            const id = Number(raw);
            if (!Number.isSafeInteger(id) || id <= 0) continue;
            const seed: DiscoverySeed = {
                id,
                mediaType: item.Type === 'Movie' ? 'movie' : 'tv',
                title: item.Name,
                source,
            };
            const key = discoveryKey(seed);
            if (seen.has(key)) continue;
            seen.add(key);
            seeds.push(seed);
            if (--limit === 0) break;
        }
    };
    add(favorites, 'favorite', 3);
    add(watched, 'watched', 6 - seeds.length);
    return seeds;
}

export function unavailableDiscoveries(items: SeerrSearchResultItem[]) {
    const available = new Set(
        items
            .filter(
                (item) =>
                    item.mediaInfo?.status === SeerrMediaStatus.AVAILABLE ||
                    item.mediaInfo?.status === SeerrMediaStatus.BLOCKLISTED
            )
            .map(discoveryKey)
    );
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = discoveryKey(item);
        if (available.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// A deterministic weighted rank, without inventing a confidence percentage.
export function rankDiscoveryRecommendations(
    groups: { seed: DiscoverySeed; items: SeerrSearchResultItem[] }[]
): DiscoverySuggestion[] {
    const seeds = new Set(groups.map(({ seed }) => discoveryKey(seed)));
    const available = new Set(
        groups.flatMap(({ items }) =>
            items
                .filter(
                    (item) =>
                        item.mediaInfo?.status === SeerrMediaStatus.AVAILABLE ||
                        item.mediaInfo?.status === SeerrMediaStatus.BLOCKLISTED
                )
                .map(discoveryKey)
        )
    );
    const candidates = new Map<string, { item: DiscoverySuggestion; score: number }>();
    for (const { seed, items } of groups) {
        const counted = new Set<string>();
        items.forEach((item, index) => {
            const key = discoveryKey(item);
            if (seeds.has(key) || available.has(key) || counted.has(key)) return;
            counted.add(key);
            const score = (seed.source === 'favorite' ? 3 : 2) / (10 + index);
            const existing = candidates.get(key);
            if (existing) {
                existing.score += score;
                return;
            }
            candidates.set(key, {
                score,
                item: {
                    ...item,
                    reason:
                        seed.source === 'favorite'
                            ? `Proche de votre favori « ${seed.title} »`
                            : `Parce que vous avez regardé « ${seed.title} »`,
                },
            });
        });
    }
    return [...candidates.values()]
        .sort(
            (a, b) => b.score - a.score || discoveryKey(a.item).localeCompare(discoveryKey(b.item))
        )
        .slice(0, 40)
        .map(({ item }) => item);
}

export function discoveryStatus(status?: number, requestStatus?: number) {
    if (requestStatus === SeerrRequestStatus.FAILED) return 'Échec de l’ajout';
    if (requestStatus === SeerrRequestStatus.DECLINED) return 'Demande refusée';
    if (status === SeerrMediaStatus.AVAILABLE) return 'Disponible';
    if (status === SeerrMediaStatus.PARTIALLY_AVAILABLE) return 'Disponibilité partielle';
    if (status === SeerrMediaStatus.PROCESSING) return 'En préparation';
    if (status === SeerrMediaStatus.PENDING || requestStatus === SeerrRequestStatus.PENDING)
        return 'En attente de validation';
    if (requestStatus === SeerrRequestStatus.APPROVED) return 'Demande approuvée';
    if (requestStatus === SeerrRequestStatus.COMPLETED) return 'Demande terminée';
    if (status === SeerrMediaStatus.BLOCKLISTED) return 'Indisponible à la demande';
    return 'À demander';
}
