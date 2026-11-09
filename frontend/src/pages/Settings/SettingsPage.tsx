import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import Page from '../Page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAutoSaveConfig } from './useAutoSaveConfig';
import { SettingsSkeleton } from './components/SettingsSkeleton';
import { GeneralTab } from './tabs/GeneralTab';
import { HomeSectionsTab } from './tabs/HomeSectionsTab';
import { ItemPageTab } from './tabs/ItemPageTab';
import { BrandingTab } from './tabs/BrandingTab';
import { NightPulseTab } from './tabs/NightPulseTab';
import { LinksTab } from './tabs/LinksTab';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getServerUrl } from '@pelagica/core';

const SettingsPage = () => {
    const { t } = useTranslation('settings');
    const { config, loading, error, saveConfig } = useAutoSaveConfig();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'nightpulse';
    const queryClient = useQueryClient();

    useEffect(() => {
        queryClient.invalidateQueries({ queryKey: ['config', getServerUrl()] });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) {
        return (
            <Page title={t('title')} requiresAuth>
                <SettingsSkeleton />
            </Page>
        );
    }

    if (error || !config) {
        return (
            <Page title={t('title')} requiresAuth>
                Error loading settings.
            </Page>
        );
    }

    return (
        <Page title={t('title')} className="flex-1 flex flex-col" requireAdmin requiresAuth>
            <Tabs defaultValue={activeTab} onValueChange={(val) => setSearchParams({ tab: val })}>
                <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="nightpulse">Night Pulse</TabsTrigger>
                    <TabsTrigger value="general">{t('category_general')}</TabsTrigger>
                    <TabsTrigger value="homesections">{t('category_homesections')}</TabsTrigger>
                    <TabsTrigger value="itempage">{t('category_itempage')}</TabsTrigger>
                    <TabsTrigger value="branding">{t('category_branding')}</TabsTrigger>
                    <TabsTrigger value="links">{t('category_links')}</TabsTrigger>
                </TabsList>
                <TabsContent value="nightpulse">
                    <NightPulseTab config={config} saveConfig={saveConfig} />
                </TabsContent>
                <TabsContent value="general">
                    <GeneralTab config={config} saveConfig={saveConfig} />
                </TabsContent>
                <TabsContent value="homesections">
                    <HomeSectionsTab config={config} saveConfig={saveConfig} />
                </TabsContent>
                <TabsContent value="itempage">
                    <ItemPageTab config={config} saveConfig={saveConfig} />
                </TabsContent>
                <TabsContent value="branding">
                    <BrandingTab config={config} saveConfig={saveConfig} />
                </TabsContent>
                <TabsContent value="links">
                    <LinksTab config={config} saveConfig={saveConfig} />
                </TabsContent>
            </Tabs>
        </Page>
    );
};

export default SettingsPage;
