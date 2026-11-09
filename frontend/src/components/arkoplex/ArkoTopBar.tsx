import { Link, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Search, Settings, UserRound } from 'lucide-react';
import { getUserProfileImageUrl, logout, useConfig, useCurrentUser } from '@pelagica/core';
import { ArkoBrand } from './ArkoBrand';
import { buildSectionItemsLink } from '@/utils/sectionItemsLink';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';

const entries = [
    { label: 'Accueil', to: '/' },
    { label: 'Films', to: buildSectionItemsLink('Films', { types: ['Movie'] }) },
    { label: 'Séries', to: buildSectionItemsLink('Séries', { types: ['Series'] }) },
    {
        label: 'Favoris',
        to: buildSectionItemsLink('Favoris', { types: ['Movie', 'Series'], isFavorite: true }),
    },
];

export function ArkoTopBar() {
    const location = useLocation();
    const navigate = useNavigate();
    const client = useQueryClient();
    const { data: user } = useCurrentUser();
    const { config } = useConfig();
    const current = location.pathname + location.search;
    return (
        <header className="arko-topbar">
            <Link to="/" className="arko-home-link" aria-label="ArkoPlex, accueil">
                {config.logoDarkUrl ? (
                    <img
                        className="arko-custom-logo"
                        src={config.logoDarkUrl}
                        alt={config.serverName || 'ArkoPlex'}
                    />
                ) : (
                    <ArkoBrand />
                )}
            </Link>
            <nav className="arko-nav" aria-label="Navigation principale">
                {entries.map((entry) => (
                    <Link
                        key={entry.to}
                        to={entry.to}
                        aria-current={current === entry.to ? 'page' : undefined}
                    >
                        {entry.label}
                    </Link>
                ))}
            </nav>
            <div className="arko-topbar-actions">
                <Link to="/search" className="arko-icon-link" aria-label="Rechercher un titre">
                    <Search size={20} />
                </Link>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Profil ${user?.Name || ''}`}
                        >
                            <Avatar className="h-8 w-8 rounded-sm">
                                <AvatarImage
                                    src={
                                        user?.Id
                                            ? getUserProfileImageUrl(user.Id, user.PrimaryImageTag)
                                            : undefined
                                    }
                                    alt=""
                                />
                                <AvatarFallback>
                                    {user?.Name?.slice(0, 1).toUpperCase() || (
                                        <UserRound size={17} />
                                    )}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                        <DropdownMenuLabel>{user?.Name || 'Votre compte'}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <ChangePasswordDialog
                            trigger={
                                <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                                    <UserRound />
                                    Mot de passe
                                </DropdownMenuItem>
                            }
                        />
                        {user?.Policy?.IsAdministrator && (
                            <DropdownMenuItem asChild>
                                <Link to="/settings">
                                    <Settings />
                                    Réglages ArkoPlex
                                </Link>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() =>
                                void logout(client).then(() =>
                                    navigate('/login', { replace: true })
                                )
                            }
                        >
                            <LogOut />
                            Se déconnecter
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
