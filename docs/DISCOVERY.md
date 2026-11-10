# Jalon 3 — À découvrir (candidat bêta)

L’onglet `/discover` réunit les titres à demander et les recommandations externes.
L’accueil reste consacré à la bibliothèque : les anciennes sections `seerrDiscover`
sont conservées dans la configuration pour compatibilité, mais ne sont plus rendues.

## Parcours

- Navigation : Tout, Pour vous, Films, Séries, Mes demandes.
- Les listes tendances et populaires sont paginées. Les titres entièrement disponibles
  ou bloqués par Seerr sont masqués ; une série partiellement disponible peut être
  ouverte pour choisir ses saisons manquantes.
- Les fiches et demandes réutilisent le dialogue Seerr existant : pas de lecture d’un
  titre absent, pas de téléchargement déclenché par le simple affichage d’une carte.
- Les saisons déjà demandées ou disponibles sont exclues des saisons demandables.
- Les refus et échecs apparaissent explicitement dans le suivi. Les opérations de
  gestion avancées (approbation, nouvelle tentative, annulation) restent dans Seerr.
- Une demande utilise les permissions du compte Seerr connecté. Les profils qualité,
  dossiers, validations et recherches Radarr/Sonarr restent gérés dans Seerr.
- Le lien de bibliothèque utilise l’identifiant Jellyfin fourni par Seerr. La
  disponibilité suppose les scans/imports habituels ; aucun délai n’est promis.

## Personnalisation sans service supplémentaire

1. Lire au maximum 24 favoris et 24 films/épisodes regardés avec l’authentification
   du compte Jellyfin courant, en demandant les identifiants externes.
2. Résoudre au maximum trois séries depuis leurs épisodes regardés, afin de ne pas
   exiger qu’une série entière soit terminée.
3. Retenir au maximum six références TMDB uniques : jusqu’à trois favoris, puis
   des titres regardés. Les éléments sans identifiant TMDB valide sont ignorés.
4. Récupérer les recommandations de ces références via Seerr, par lots de trois.
   Les favoris pèsent davantage ; une correspondance à plusieurs références remonte.
5. Écarter références elles-mêmes, doublons, titres disponibles et titres bloqués.
   Afficher jusqu’à 40 propositions avec une explication réelle, sans pourcentage
   de confiance ni assimilation d’un visionnage à un avis positif.

Un compte sans historique exploitable conserve les tendances. Les erreurs de sources
sont signalées et les résultats récupérés restent utilisables. Aucun modèle IA,
abonnement, tâche permanente ou index global de l’historique n’est ajouté. Seuls
les identifiants des références sont transmis aux routes de recommandation Seerr ;
les noms/raisons sont construits côté client. Seerr utilise ensuite ses fournisseurs
habituels. Les restrictions du catalogue et des demandes restent celles de Seerr ;
cela ne constitue pas un nouveau moteur de contrôle parental Jellyfin.

## Comptes et suivi

Les caches de découverte, personnalisation, demandes, fiches et informations
utilisateur sont séparés par serveur et identifiant Jellyfin. Une déconnexion
annule les lectures en cours et vide le cache. La personnalisation vérifie que la
session n’a pas changé entre ses appels. Favoris et marquage lu/non lu invalident
les recommandations ; une demande invalide les disponibilités et le suivi.

`GET /api/seerr/requests?skip=0` vérifie d’abord `/api/v1/auth/me` avec la session
Seerr du navigateur, puis impose `requestedBy=<id vérifié>`, y compris pour un
administrateur. Une valeur `requestedBy` envoyée par le navigateur est ignorée.
Chaque propriétaire est revérifié dans la réponse. Seuls les champs de suivi
nécessaires sont retournés, sans profils ou adresses e-mail. Réponse `no-store`,
20 demandes par page ; les fiches sont affichées par lots de six. Le suivi demande
une actualisation toutes les 60 secondes uniquement tant que sa vue est montée,
sans interrogation en arrière-plan lorsque la fenêtre est masquée.

Références de compatibilité :
- https://docs.seerr.dev/api/get-all-requests/
- https://docs.seerr.dev/using-seerr/settings/services/
- https://github.com/seerr-team/seerr/blob/develop/server/constants/media.ts

## Validation et limites avant installation

- Compilation TypeScript/Vite, ESLint et formatage.
- Contrôles SSR et logique : sources, pondération, exclusions, explications,
  historique vide, pagination et caches distincts pour deux comptes.
- Tests Go : identité, propriétaire incorrect, réduction des champs, session
  expirée, offsets et pagination ; suite existante et détection de concurrence.
- Tests navigateur avec comptes et médias fictifs : filtres, demande de saison,
  suivi, changement de compte, panne, connexion et largeurs 320 à 1440 px.
- Tests Docker avec services fictifs, chemins racine et `/arkoplex` ; pas de
  publication d’image ni de connexion à un serveur personnel depuis les tests.

Les résultats d’une CI doivent être vérifiés sur le commit candidat ; ce document
énumère les contrôles prévus, sans les déclarer réussis à l’avance. Restent à
valider sur la bêta réelle : synchronisation Seerr/Jellyfin, historique des deux
comptes, permissions, profils et destinations Radarr/Sonarr, contenu disponible
et lecture après import. Aucun déploiement serveur n’est effectué par ce jalon.
