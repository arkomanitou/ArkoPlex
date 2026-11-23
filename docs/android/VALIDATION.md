# Bilan de validation — 23 novembre 2026

## Vérifié automatiquement dans l'environnement de travail

- Installation des dépendances JavaScript depuis le lockfile ; ajouts Capacitor fixés à 8.6.2.
- Compilation TypeScript/Vite web et Android réussie.
- ESLint et Prettier frontend réussis. Le répertoire Android et ses fichiers générés sont exclus des outils de formatage web, sans exclusion des sources React.
- 37 contrôles SSR existants : apparence, découverte, négociation des pistes et nettoyage du transcodage.
- 21 tests Node : rotation du bandeau, préférences, sélection explicite web/LibVLC, profil Android et requêtes de nettoyage ciblées.
- 17 contrôles Chromium existants du lecteur web : plein écran, vidéo de fixture, recherche, gestes, préférences, changement d'épisode et arrêt de session.
- 85 contrôles Chromium existants de découverte et navigation, avec fixtures de comptes et médias. Aucun serveur de l'utilisateur n'a été contacté.
- Compilation Android `:app:assembleDebug`, six tests JVM `:app:testDebugUnitTest` et analyse `:app:lintDebug` réussis. Les tests vérifient notamment l'ordre début/progression/arrêt, l'arrêt avant démarrage, la poursuite du nettoyage après erreur, la protection de la reprise et l'unicité de fermeture.
- APK de développement produite ; signature Android Debug vérifiée avec `apksigner`. Bibliothèques natives LibVLC et fichiers React locaux présents ; aucun site distant configuré en `server.url`.
- Licences GPLv3, LGPL, MIT, Apache, LLVM et OFL conservées ; notices des paquets rassemblées dans un asset Android accessible depuis le lecteur.

L'analyse Android garde des avertissements non bloquants : mises à jour de versions disponibles, accessibilité de la surface gestuelle et textes natifs actuellement en français. Aucun avertissement de ce type n'a été masqué. Les versions sont fixées intentionnellement. Les contrôles GitHub existants ne sont pas désactivés et leur résultat distant reste distinct des vérifications locales ci-dessus.

## Émulateur

Aucun test validé sur émulateur. Un AVD Android 30 x86_64 a été préparé mais son démarrage a été refusé faute d'espace disque. L'environnement ne fournit pas d'accélération KVM exploitable et ADB ne pouvait pas créer son répertoire privé par défaut dans le dossier personnel protégé. Ces contraintes ne bloquent pas la compilation ni les tests JVM. Aucune lecture native n'a été déduite d'une simple compilation.

## Téléphone et tablette : à effectuer

L'APK n'a pas été installée sur les appareils de l'utilisateur. Restent à vérifier : connexion et navigation réelles avec le certificat et le préfixe utilisés, CORS/transport natif et images, lecture directe et transcodage Jellyfin, performances et décodage matériel, reprise réelle HLS, sélection effective et mémorisation des pistes, ASS et sous-titres bitmap, gestes, rotation, gestion des encoches et Retour système, interruption audio, arrière-plan et disparition du transcodage côté serveur. La procédure complète figure dans `README.md`.

## Limites fonctionnelles de cette livraison

Jellyseerr et les services dépendant du backend web ne sont pas disponibles dans l'APK. Les réglages ArkoPlex sont locaux au compte. Pas de téléchargement, de lecture hors connexion, de file de synchronisation différée, de notification, de service de lecture en arrière-plan, de verrouillage tactile, d'iOS ou d'Android TV. Pas d'enchaînement automatique des épisodes ni de vignettes de survol dans le lecteur natif. Les contrôles précédent/suivant et les segments intro/récapitulatif sont adaptés lorsque le serveur les fournit.

Une panne réseau ou une destruction forcée du processus peut empêcher le dernier message de session d'atteindre Jellyfin. Les tentatives sont bornées et ne persistent aucun jeton. Vérifier le tableau de bord Jellyfin après le test d'une panne. Les capacités annoncées sont prudentes mais ne constituent pas une garantie de compatibilité universelle.
