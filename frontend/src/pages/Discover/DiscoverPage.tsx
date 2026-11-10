import { useSearchParams } from 'react-router';
import { ArrowRight, Compass, Plus, RefreshCw } from 'lucide-react';
import {
    discoveryKey,
    unavailableDiscoveries,
    useConfig,
    useCurrentUser,
    useDiscoveryFeed,
    usePersonalizedDiscovery,
    useSeerrItemDetails,
    useSeerrLoginStatus,
    type DiscoverySuggestion,
} from '@pelagica/core';
import Page from '../Page';
import { Button } from '@/components/ui/button';
import { SeerrLoginDialog } from '@/components/SeerrLoginDialog';
import { useSeerrItemClick } from '@/hooks/useSeerrItemClick';
import { getSeerrItemBackdropUrl } from '@/utils/seerUrls';
import { DiscoveryCard } from './DiscoveryCard';
import { DiscoveryRequests } from './DiscoveryRequests';
import './discovery.css';

const views = [
    { id: 'all', label: 'Tout' },
    { id: 'personal', label: 'Pour vous' },
    { id: 'movies', label: 'Films' },
    { id: 'tv', label: 'Séries' },
    { id: 'requests', label: 'Mes demandes' },
] as const;

export function DiscoveryFeature({ item }: { item: DiscoverySuggestion }) {
    const handleClick = useSeerrItemClick();
    const { data: details } = useSeerrItemDetails(item.mediaType, item.id, true);
    return (
        <section className="arko-discover-feature" aria-label="À la une des découvertes">
            {details?.backdropPath && (
                <img
                    className="arko-discover-backdrop"
                    src={getSeerrItemBackdropUrl(details.backdropPath)}
                    alt=""
                />
            )}
            <div className="arko-discover-feature-content">
                <p className="arko-discover-eyebrow">
                    {item.reason ? 'Une piste pour vous' : 'À la une des découvertes'} ·{' '}
                    {item.mediaType === 'movie' ? 'Film' : 'Série'}
                </p>
                <h2>{item.title}</h2>
                <p className="arko-discover-feature-reason">
                    {item.reason || 'Une nouvelle idée pour votre prochaine soirée.'}
                </p>
                {details?.overview && <p className="arko-discover-overview">{details.overview}</p>}
                <Button className="arko-primary-action" onClick={() => handleClick(item)}>
                    {!item.mediaInfo || item.mediaInfo.status === 1 ? (
                        <>
                            <Plus />
                            {item.mediaType === 'movie'
                                ? 'Demander ce film'
                                : 'Choisir les saisons'}
                        </>
                    ) : (
                        <>
                            <ArrowRight />
                            Voir la fiche
                        </>
                    )}
                </Button>
            </div>
        </section>
    );
}

function ConnectedDiscovery() {
    const [params, setParams] = useSearchParams();
    const view = views.find((entry) => entry.id === params.get('vue'))?.id ?? 'all';
    const personal = usePersonalizedDiscovery(view === 'all' || view === 'personal');
    const kind = view === 'movies' ? 'movies' : view === 'tv' ? 'tv' : 'trending';
    const feed = useDiscoveryFeed(kind, view !== 'requests');
    const feedItems = unavailableDiscoveries(
        feed.data?.pages.flatMap((page) => page.results) ?? []
    );
    const personalItems = personal.data?.items ?? [];
    const personalKeys = new Set(personalItems.map(discoveryKey));
    const generalItems =
        view === 'all'
            ? feedItems.filter((item) => !personalKeys.has(discoveryKey(item)))
            : feedItems;
    const featured =
        view === 'all'
            ? (personalItems[0] ?? feedItems[0])
            : view === 'personal'
              ? personalItems[0]
              : feedItems[0];
    return (
        <>
            {view !== 'requests' && featured && (
                <DiscoveryFeature key={discoveryKey(featured)} item={featured} />
            )}
            <div className="arko-discover-filters" aria-label="Explorer les découvertes">
                {views.map((entry) => (
                    <button
                        key={entry.id}
                        aria-pressed={view === entry.id}
                        onClick={() => setParams(entry.id === 'all' ? {} : { vue: entry.id })}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>
            {view === 'requests' ? (
                <DiscoveryRequests />
            ) : (
                <>
                    {(view === 'all' || view === 'personal') && (
                        <section
                            aria-labelledby="arko-personal-title"
                            className="arko-discover-section"
                        >
                            <div className="arko-discover-section-title">
                                <div>
                                    <h2 id="arko-personal-title">Pour vous</h2>
                                    <p>
                                        Des œuvres proches de vos favoris et des titres regardés sur
                                        ce compte Jellyfin.
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={personal.isFetching}
                                    onClick={() => void personal.refetch()}
                                    aria-label="Actualiser vos recommandations"
                                >
                                    <RefreshCw size={16} />
                                </Button>
                            </div>
                            {personal.isPending && (
                                <p role="status">Recherche de nouvelles idées pour vous…</p>
                            )}
                            {personal.isError && (
                                <p role="alert" className="arko-discover-notice">
                                    Vos recommandations personnelles sont indisponibles. Vous pouvez
                                    toujours explorer les tendances ci-dessous.
                                </p>
                            )}
                            {personal.data && personal.data.items.length === 0 && (
                                <p className="arko-discover-empty">
                                    {personal.data.seedCount === 0
                                        ? 'Ajoutez des films ou séries à vos favoris, ou regardez quelques titres : les suggestions se construiront à partir de votre compte.'
                                        : 'Aucune suggestion supplémentaire disponible à partir de ces titres. Retrouvez d’autres idées dans les tendances.'}
                                </p>
                            )}
                            {!!personal.data?.failedSources && (
                                <p className="arko-discover-notice">
                                    Certaines suggestions n’ont pas pu être récupérées. Les
                                    résultats disponibles restent affichés.
                                </p>
                            )}
                            <div className="arko-discover-grid">
                                {personalItems.map((item) => (
                                    <DiscoveryCard key={discoveryKey(item)} item={item} />
                                ))}
                            </div>
                        </section>
                    )}
                    <section
                        aria-labelledby="arko-trending-title"
                        className="arko-discover-section"
                    >
                        <div className="arko-discover-section-title">
                            <div>
                                <h2 id="arko-trending-title">
                                    {view === 'movies'
                                        ? 'Films populaires'
                                        : view === 'tv'
                                          ? 'Séries populaires'
                                          : 'À explorer aussi'}
                                </h2>
                                <p>
                                    {view === 'all' || view === 'personal'
                                        ? 'Les tendances du catalogue Jellyseerr, en complément de vos suggestions.'
                                        : 'Des titres à découvrir ou des saisons à compléter.'}{' '}
                                    Les titres entièrement disponibles sont masqués.
                                </p>
                            </div>
                        </div>
                        {feed.isPending && <p role="status">Chargement des découvertes…</p>}
                        {feed.isError && (
                            <div role="alert" className="arko-discover-notice">
                                <p>Impossible de charger les découvertes pour le moment.</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void feed.refetch()}
                                >
                                    Réessayer
                                </Button>
                            </div>
                        )}
                        {!feed.isPending && !feed.isError && generalItems.length === 0 && (
                            <p className="arko-discover-empty">
                                Aucun titre supplémentaire sur les pages chargées.
                                {feed.hasNextPage ? ' Explorez la suite du catalogue.' : ''}
                            </p>
                        )}
                        <div className="arko-discover-grid">
                            {generalItems.map((item) => (
                                <DiscoveryCard key={discoveryKey(item)} item={item} />
                            ))}
                        </div>
                        {feed.hasNextPage && (
                            <div className="arko-discover-more">
                                <Button
                                    variant="outline"
                                    disabled={feed.isFetching}
                                    onClick={() => void feed.fetchNextPage()}
                                >
                                    {feed.isFetchingNextPage ? 'Chargement…' : 'Explorer davantage'}
                                </Button>
                            </div>
                        )}
                    </section>
                </>
            )}
            <footer className="arko-discover-footer">
                Les demandes suivent les permissions et la validation de Jellyseerr. L’ajout dépend
                de vos services configurés ; aucun délai n’est garanti.
            </footer>
        </>
    );
}

export default function DiscoverPage() {
    const { config } = useConfig();
    const { data: user } = useCurrentUser();
    const login = useSeerrLoginStatus();
    return (
        <Page title="À découvrir · ArkoPlex" requiresAuth pagePadding={false}>
            <div className="arko-discover-page">
                <header className="arko-discover-heading">
                    <div>
                        <p className="arko-discover-eyebrow">
                            <Compass size={14} aria-hidden="true" />
                            Au-delà de votre bibliothèque
                        </p>
                        <h1>Et si on regardait autre chose ?</h1>
                    </div>
                    <span>À découvrir</span>
                </header>
                {!config.seerrUrl ? (
                    <section className="arko-discover-empty">
                        <h2>Connecter Jellyseerr</h2>
                        <p>
                            La découverte et les demandes seront disponibles lorsque Jellyseerr sera
                            configuré dans les réglages ArkoPlex.
                        </p>
                    </section>
                ) : login.isPending ? (
                    <p role="status">Vérification de la connexion à Jellyseerr…</p>
                ) : !login.data ? (
                    <section className="arko-discover-empty">
                        <h2>Retrouvez de nouvelles idées</h2>
                        <p>
                            Connectez votre compte Jellyfin à Jellyseerr pour explorer le catalogue
                            et retrouver vos demandes.
                        </p>
                        <SeerrLoginDialog trigger={<Button>Se connecter à Jellyseerr</Button>} />
                    </section>
                ) : (
                    <ConnectedDiscovery key={`${user?.Id}:${config.seerrUrl}`} />
                )}
            </div>
        </Page>
    );
}
