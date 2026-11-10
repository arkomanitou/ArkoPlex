# ArkoPlex — bêta 1 de référence

Date : 10 novembre 2026. Périmètre : client web et backend Go, sur installation
privée. Les clients TV et desktop hérités ne font pas partie de cette validation.

## Référence reproductible

- Code applicatif : `655ebc5506e552446a28c8b31797ce13cc732095`.
- Branche consolidée : `arkoplex/beta-1`, avec ce code, sa documentation et la CI.
- Image locale construite depuis le code : `arkoplex:playback-655ebc5`.
- Aucun registre d’images public ni mécanisme de mise à jour automatique.

Un nom de branche peut évoluer : consigner le SHA Git et l’ID réel de l’image
avec le fichier Compose et le volume à chaque installation. La référence bêta
n’implique pas une certification de sécurité ni une compatibilité universelle.

## Lots regroupés

| Lot | Résultat |
| --- | --- |
| Direction Nocturne / Night Pulse | Interface web autonome et réglages ArkoPlex |
| Durcissement backend | Origines autorisées, droits administrateur, délais et limites, caches bornés |
| Seerr / Docker | Session Jellyseerr, protections des mutations, origine HTTPS explicite, supervision et healthcheck |
| À découvrir | Section dédiée, personnalisation par compte, recherche et demandes de films/saisons |
| En-tête | Rotation accessible et place réservée au plus grand contenu de la sélection |
| Lecture | Source exacte, sous-titres explicites, remux et conversion audio selon capacités |
| Arrêt | Rapport ciblé et arrêt de l’encodage de la session quittée, sans arrêt global |

L’historique des branches de travail est conservé. Les notes historiques des
jalons décrivent leur état au moment où ils ont été écrits ; cette fiche décrit
la référence actuelle.

## Vérifications effectuées

- Compilation TypeScript/Vite, ESLint, Prettier : réussis sur le code de référence.
- 37 contrôles SSR/logiques et 10 tests de rotation à horloge simulée : réussis.
- Scénario navigateur isolé : 85 vérifications, avec deux comptes fictifs,
  demandes simulées et largeurs de 320 à 1440 px.
- Backend : compilation, tests, vet et détection de courses via GitHub Actions.
- Les contrôles Docker isolés couvrent racine/préfixe, cookies HTTPS simulés,
  refus CSRF, Nginx et arrêt des processus. Leur état est visible dans Actions.
- Essais réels rapportés : deux comptes, recherche/demandes, approbation puis
  disponibilité dans Jellyfin et affichage sur téléphone.
- Essais réels observés : en-tête de hauteur stable ; vidéo HEVC conservée avec
  conversion du son ; deux sorties du lecteur avec disparition de FFmpeg en
  environ deux secondes ; relance du même titre.

Le mot « Transcoded » dans le panneau du lecteur peut couvrir une conversion
audio seule. La commande FFmpeg permet de distinguer `-codec:v:0 copy` d’un
réencodage vidéo. Un navigateur incompatible ou des sous-titres graphiques
explicitement choisis peuvent encore nécessiter une conversion vidéo.

## Point de restauration

Un arrêt court de l’instance a permis une copie cohérente du volume `/config`
et du fichier Compose, accompagnés du SHA source et de l’ID d’image relevé.
L’archive a été contrôlée par SHA-256, extraite dans un volume neuf puis comparée
aux fichiers sources, permissions et propriétaires. La copie restaurée a passé
le healthcheck après démarrage dans un conteneur sans accès réseau extérieur.
L’instance normale a ensuite été relancée. Aucune application ni aucun volume
préexistant n’a été supprimé.

Ce test vérifie la configuration et le démarrage ; il ne rejoue pas tout le
parcours Jellyfin/Jellyseerr dans la copie isolée. Le point est sur la même
machine : une copie chiffrée hors machine reste à organiser. Les films et les
données propres aux serveurs Jellyfin/Jellyseerr ne sont pas inclus.

## Suite de validation

1. Usage normal prolongé sur les deux comptes : reprise, épisodes, langues,
   sous-titres texte et téléphone.
2. Dépôt de sauvegarde hors machine et vérification d’une récupération depuis
   ce dépôt lorsqu’il sera configuré.
3. Profil HTTPS explicite, certificat, proxy et contrôle des parcours depuis
   le domaine retenu, puis test depuis un réseau extérieur.
4. Vérifications avant ouverture : champs publics de configuration sans secret,
   droits des comptes, sessions/cookies et suivi des dépendances/images.

Voir [la préparation du reverse proxy](REVERSE-PROXY.md). Les retours d’usage
peuvent continuer pendant les travaux de documentation et sauvegarde.
