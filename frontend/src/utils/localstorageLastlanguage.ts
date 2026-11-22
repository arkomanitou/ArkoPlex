import { playerStorageKey } from './playerPreferences';

const STORAGE_KEY = 'lastLanguageByItem';

type ItemLanguageState = {
    subtitle?: number;
    audio?: number;
};

type LastLanguageMap = Record<string, ItemLanguageState>;

function getMap(): LastLanguageMap {
    try {
        const value = JSON.parse(localStorage.getItem(playerStorageKey(STORAGE_KEY)) ?? '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function saveMap(map: LastLanguageMap): void {
    try {
        localStorage.setItem(playerStorageKey(STORAGE_KEY), JSON.stringify(map));
    } catch {
        // Preferences are optional when browser storage is unavailable.
    }
}

export function getLastSubtitleLanguage(itemId: string | null): number | null {
    if (!itemId) return null;
    const value = getMap()[itemId]?.subtitle;
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function getLastAudioLanguage(itemId: string | null): number | null {
    if (!itemId) return null;
    const value = getMap()[itemId]?.audio;
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function setLastSubtitleLanguage(itemId: string, language: number): void {
    const map = getMap();
    map[itemId] = {
        ...map[itemId],
        subtitle: language,
    };
    saveMap(map);
}

export function setLastAudioLanguage(itemId: string, language: number): void {
    const map = getMap();
    map[itemId] = {
        ...map[itemId],
        audio: language,
    };
    saveMap(map);
}

export function removeLastSubtitleLanguage(itemId: string): void {
    const map = getMap();
    if (!map[itemId]) return;

    delete map[itemId].subtitle;

    if (Object.keys(map[itemId]).length === 0) {
        delete map[itemId];
    }

    saveMap(map);
}

export function removeLastAudioLanguage(itemId: string): void {
    const map = getMap();
    if (!map[itemId]) return;

    delete map[itemId].audio;

    if (Object.keys(map[itemId]).length === 0) {
        delete map[itemId];
    }

    saveMap(map);
}
