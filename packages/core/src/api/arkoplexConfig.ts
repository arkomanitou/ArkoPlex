import type { AppConfig } from '../hooks/useConfig';
import { withBasePath } from '../utils/basePath';
import { getAuthorizationHeader } from './getApi';

export async function fetchArkoPlexConfig(): Promise<AppConfig> {
    const response = await fetch(withBasePath('/api/arkoplex/config'), { cache: 'no-store' });
    if (!response.ok) throw new Error('Impossible de charger les réglages ArkoPlex');
    return response.json() as Promise<AppConfig>;
}

export async function saveArkoPlexConfig(config: AppConfig): Promise<void> {
    const response = await fetch(withBasePath('/api/arkoplex/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthorizationHeader() },
        body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Impossible d’enregistrer les réglages ArkoPlex');
}

export function getArkoPlexLogoUrl(mode: 'light' | 'dark'): string {
    return withBasePath(`/api/arkoplex/branding/logo/${mode}`);
}

export async function uploadArkoPlexLogo(mode: 'light' | 'dark', file: File): Promise<void> {
    const response = await fetch(getArkoPlexLogoUrl(mode), {
        method: 'PUT',
        headers: { 'Content-Type': file.type, Authorization: getAuthorizationHeader() },
        body: file,
    });
    if (!response.ok) throw new Error('Utilisez une image PNG, JPEG ou WebP de moins de 2 Mo');
}
