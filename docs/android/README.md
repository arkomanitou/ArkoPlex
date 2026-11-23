# ArkoPlex Android — première APK en ligne

Cette branche part de `main` au commit `1cfb5a64be0222618f00c16186e71fed273c0e37`. Elle ajoute une application Android avec les fichiers React embarqués et un lecteur LibVLC intégré. Aucun serveur ni configuration de production n'a été modifié. Aucune fusion n'est autorisée par ce travail.

## Audit et choix

Aucun `AGENTS.md` n'était présent dans le dépôt. Le projet est sous GPLv3. Le frontend Vite utilise `@pelagica/core` et communique directement avec Jellyfin via le SDK ; les fonctions web `/api/*` nécessitent le backend Go de la même origine.

Capacitor 8.6.2 héberge la compilation locale du frontend. Aucun `server.url` distant n'est configuré. La plateforme `android` est choisie seulement si le mode de compilation ET la plateforme native correspondent ; le navigateur conserve `PlayerPage`, Video.js et son profil existant.

`CapacitorHttp` transporte les requêtes SDK depuis Android, sans dépendre du proxy Vite ou d'un changement CORS de production. Les images sont chargées par la WebView. L'adresse complète Jellyfin, y compris un éventuel préfixe `/jellyfin`, se saisit dans la connexion existante. HTTPS avec certificat reconnu est recommandé ; HTTP est accepté pour un serveur local. Aucun contournement de validation TLS n'est ajouté.

Les chemins relatifs `/api/server-address`, `/api/arkoplex/*`, `/api/seerr/*`, `/api/themes*`, `/api/studios*` et `/api/stats-consent` ont été audités. L'APK n'embarque pas le backend Go et bloque explicitement les appels à son origine locale `/api/*`. Elle ne suppose aucune adresse publique ArkoPlex et n'envoie pas les mots de passe à un proxy web. La configuration ArkoPlex est locale, indexée par serveur et utilisateur. Le consentement aux statistiques est local ; aucun collecteur Android n'est ajouté. Les logos de studios et thèmes distants du backend ne sont pas disponibles.

**Jellyseerr est indisponible dans cette première APK.** Son intégration existante repose sur des cookies et protections de même origine du backend web. Elle reste intacte dans la version web. Une intégration Android avec une adresse explicite de backend et un transport de session adapté reste à concevoir ; aucune protection du serveur n'est affaiblie ici. La page de connexion signale cette limitation.

## Lecture et sessions

`AndroidPlayerPage` réutilise les hooks existants d'authentification, média, préférences Jellyfin, négociation `PlaybackInfo`, segments et épisodes adjacents. Les commandes résident dans une activité Android privée, jamais dans une application VLC externe.

Le profil LibVLC est volontairement limité : SDR, au plus 1080p/8 bits pour la lecture directe déclarée, codecs et conteneurs explicites ; H264/AAC/HLS reste proposé pour le transcodage. Aucun réglage global Jellyfin n'est modifié. Les profils ne garantissent ni la vitesse de décodage ni une compatibilité matérielle universelle. Pas de garantie HDR, Dolby Vision, passthrough, AV1 ou 4K directe.

L'activité propose lecture/pause, déplacement, pistes audio/sous-titres, gestes verticaux gauche/droite, double appui ±10 s, précédent/suivant et passage intro/récapitulatif si Jellyfin fournit les segments. Elle remplit l'écran et suit la rotation ; Retour utilise le dispatcher AndroidX, y compris le geste Retour Android 16. Aucun bouton de plein écran supplémentaire, verrouillage tactile, notification ou visionnage à plusieurs n'est ajouté.

En lecture directe, les pistes sont sélectionnées dans LibVLC. La correspondance avec Jellyfin n'est utilisée que lorsque les nombres de pistes concordent. Sinon le choix natif reste possible mais sa mémorisation n'est pas garantie. Les sous-titres externes texte utilisent les URL Jellyfin authentifiées. Les sous-titres externes bitmap nécessitant un rendu serveur restent une limite à vérifier. Pour un flux transcodé/remuxé, changer de piste ferme la session précédente et renégocie la source avant la reprise. Les préférences reprennent les descripteurs de langue/codec existants, isolés par serveur et utilisateur.

Les chemins et corps de nettoyage sont partagés avec `usePlaybackStop` : signal d'arrêt puis suppression de l'encodage limitée au `deviceId` et `playSessionId`. La progression native a un seul propriétaire et un seul écrivain ordonné : début lorsque LibVLC joue, progression toutes les cinq secondes et sur pause/reprise/déplacement, arrêt à la fin, Retour, changement d'épisode ou passage en arrière-plan. Les pertes de focus audio et le retrait du casque mettent en pause. Le passage en arrière-plan termine la lecture ; aucun service de lecture en arrière-plan n'est prévu.

Une position de reprise est conservée avant le démarrage et pendant les valeurs nulles de prélecture. Les échecs de démarrage ne remplacent donc pas la progression par zéro. Le lecteur libère LibVLC, les vues, le focus audio et les callbacks. Chaque nettoyage est tenté même si un autre échoue, avec délais réseau et tentatives bornés. Les échecs sont signalés dans l'interface. Il n'existe aucune file hors connexion : une coupure réseau durable ou la destruction forcée du processus peut empêcher la confirmation de fin côté serveur. La dernière progression confirmée fait alors foi.

Les identifiants sont saisis à l'exécution, stockés dans l'espace privé de la WebView comme dans le client existant, jamais préchargés dans l'APK. Les sauvegardes et transferts de données sont exclus. Les URL et autorisations de lecture passent en mémoire, sans extras d'Intent ni état Android sauvegardé. Les logs Capacitor, console Android et LibVLC sont désactivés ; le débogage WebView est désactivé. Il ne s'agit pas d'un stockage matériel Keystore des jetons.

## Compilation reproductible

Versions : Node selon `.node-version` (24.22.1), pnpm 11.25.0, Capacitor core/CLI/Android 8.6.2, JDK Temurin 21.0.9+10, SDK Android 36, Build Tools 35.0.0, AGP 8.13.0, Gradle 8.14.3 (SHA-256 dans le wrapper), LibVLC 3.7.8, Android minimum 24 / cible 36. Les dépendances JavaScript utilisent `pnpm-lock.yaml`.

Installer le JDK complet et les outils en ligne de commande Android, puis les paquets SDK :

```sh
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0'
sdkmanager --licenses
pnpm install --frozen-lockfile --filter pelagica...
node scripts/collect-android-notices.mjs
pnpm --filter pelagica run android:sync
cd frontend/android
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

Définir `JAVA_HOME` vers le JDK et `ANDROID_HOME` vers le SDK, ou créer `frontend/android/local.properties` avec `sdk.dir=/chemin/du/sdk`. Ces chemins restent locaux. Gradle crée une clé de développement locale ; aucune clé privée n'est versionnée. Pour un environnement avec proxy d'entreprise, configurer le proxy et le magasin de confiance **localement**, sans affaiblir TLS ni enregistrer ces paramètres dans le dépôt.

APK : `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Elle contient les architectures fournies par LibVLC : arm64-v8a, armeabi-v7a, x86 et x86_64. C'est une APK de développement, volumineuse, sans publication Play Store. Conserver sa clé de développement localement pour des mises à jour compatibles ; une autre clé nécessite une désinstallation, qui efface les données locales. L'APK finale doit être accompagnée de ses sources et notices.

Installation manuelle : transférer l'APK sur le téléphone ou la tablette, autoriser l'installation depuis la source choisie et ouvrir le fichier. Ou :

```sh
adb install -r app-debug.apk
```

## Vérifications

Le bilan effectif de cette livraison est dans `VALIDATION.md`. Pour reproduire les contrôles web du dépôt :

```sh
pnpm --filter pelagica run build
pnpm --filter pelagica run lint
pnpm --filter pelagica run format:check
node scripts/check-frontend.mjs
node --test scripts/check-hero-rotation.mjs scripts/check-player-preferences.mjs scripts/check-android-contract.mjs
```

Les scripts `check-player-browser.mjs` et `check-discovery-browser.mjs` utilisent un Playwright externe fixé par le workflow existant et exclusivement des fixtures ; ils ne contactent pas le serveur de l'utilisateur. Le nouveau workflow Android compile, teste et conserve l'APK de développement, les sources et les notices dans l'artefact `ArkoPlex-Android-debug`. Le script `scripts/package-android-test.sh /chemin/livraison` reproduit ce paquet après compilation. Il ne déploie rien.

## Procédure téléphone et tablette

1. Installer l'APK, saisir l'adresse Jellyfin (tester aussi un préfixe si utilisé), se connecter avec un compte de test. Naviguer dans les bibliothèques et fiches. Changer de compte et vérifier l'isolation des réglages et préférences.
2. Lire un film simple H264/AAC puis un MKV autorisé au compte. Vérifier que la lecture reste dans ArkoPlex. Contrôler le mode de lecture dans le tableau de bord Jellyfin. Tester séparément un fichier nécessitant du transcodage et un fichier incompatible.
3. Mettre en pause, attendre plus de cinq secondes, reprendre, déplacer le curseur et quitter avec Retour. Revenir au film et contrôler la reprise. Tester un échec réseau au démarrage après avoir enregistré une position ; cette position ne doit pas devenir zéro.
4. Lire un épisode, utiliser précédent/suivant et passer une introduction si le serveur fournit les segments. La fin de vidéo doit terminer la session. L'enchaînement automatique et les vignettes de survol du lecteur web ne sont pas repris à cette étape.
5. Choisir une autre piste audio, puis des sous-titres intégrés SRT/ASS et des sous-titres externes texte. Les désactiver. Refaire le test pendant un transcodage et sur l'épisode suivant pour vérifier les préférences.
6. Glisser verticalement à gauche pour la luminosité, à droite pour le volume ; double appui sur chaque moitié pour ±10 s. Tester les bords, les contrôles visibles, les encoches et les deux orientations sur les deux appareils.
7. Tester Retour système, geste Retour, bouton de l'interface, Accueil, écran verrouillé, changement d'application, perte de focus audio et retrait du casque. Le lecteur doit libérer ses ressources et la lecture en arrière-plan doit s'arrêter.
8. Après **chaque** sortie, vérifier la progression et la disparition de la lecture/transcodage dans le tableau de bord Jellyfin. Une autre lecture lancée sur un autre appareil doit continuer. Si le réseau était coupé, vérifier manuellement l'éventuel processus restant côté Jellyfin avant de relancer.

Les téléchargements, lecture hors connexion, synchronisation différée, iOS, Android TV et déploiement web restent hors périmètre.

## Licences et sources

Voir `LICENSES.md`, le répertoire `licenses/`, les notices embarquées `android-notices.txt` et le bouton Licences du lecteur. Un remplacement de LibVLC reconstruit peut être utilisé avec `./gradlew :app:assembleDebug -PlibvlcAar=/chemin/vers/libvlc.aar`, puis resigné avec sa propre clé. Aucune mesure n'empêche ce remplacement.
