# Durcissement bêta — premier lot

Branche de travail `arkoplex/security-hardening`, basée sur
`arkoplex/beta-preparation` (`aadd6588c115bf6ce1d55dd32a499603f5bab253`).
Cette préparation ne modifie pas une installation et ne constitue pas un audit
complet ou une validation pour exposition publique.

## Comportement et compatibilité

- `SERVER_ADDRESS` est requis pour les routes de thèmes/studios et toutes les
  écritures administratives. Les URLs publiques HTTP(S) peuvent contenir un
  sous-chemin Jellyfin. Un paramètre `jellyfin_url` est accepté seulement s'il
  correspond à l'adresse configurée, à la casse du nom d'hôte et au slash final
  près. Le schéma, le port explicite et le sous-chemin doivent correspondre.
- `JELLYFIN_BACKEND_URL` reste une option **d'environnement administrateur** pour
  les studios, par exemple une adresse interne différente de l'adresse publique.
  Son équivalent en paramètre de requête est refusé. La vérification des droits
  administrateur continue à utiliser `SERVER_ADDRESS`.
- Les adresses privées sont admises pour l'auto-hébergement. La configuration
  administrateur, son DNS et l'éventuel proxy HTTP d'environnement restent des
  éléments de confiance ; aucun épinglage d'IP n'est introduit.
- Les lectures de thèmes ne créent plus de dossiers ni de cache permanent par
  adresse. Les thèmes et anciens logos restent dans le dossier de l'hôte
  configuré ; aucune migration ni suppression automatique. Les identifiants de
  thèmes acceptent 1–128 caractères ASCII alphanumériques, tiret et underscore,
  avec premier caractère alphanumérique (UUID et slugs usuels conservés).
  Les autres anciens noms doivent être examinés avant mise à jour ; ils ne sont
  pas chargés ou supprimés automatiquement.
- Toutes les mutations de thèmes, configuration, logos et consentement global
  requièrent un administrateur Jellyfin vérifié. `ENABLE_AUTH=false` ou absent
  ne désactive plus ces protections. Les autorisations métier Seerr restent
  gérées par Seerr, via son cookie, sans exiger d'être administrateur Jellyfin.
- Le consentement global aux statistiques est proposé aux seuls administrateurs
  connectés. Le client envoie son authentification. Le POST renvoie le statut
  effectif `consent` (même enum numérique que le GET) et `storedConsent` booléen.
  `COLLECTOR_STATS_CONSENT=false` conserve sa priorité sur le fichier enregistré.

## Bornes mises en place

| Appel ou ressource | Borne |
| --- | --- |
| Authentification administrateur Jellyfin | 5 s, JSON de 1 Mio |
| Studios Jellyfin | 30 s au total, 100 pages de 300 médias, 8 Mio/page |
| Agrégation studios | 64 studios/média, 10 000 studios, ID 128 octets, nom 512 octets |
| Cache studios | 128 entrées, expiration purgée à l'accès, clés hachées SHA-256 |
| Appel Seerr | 15 s, réponse de 4 Mio |
| Dépôt de thèmes | 15 s/appel, 20 s pour l'installation complète, 1 Mio/JSON |
| Image de studio | 10 s, 8 Mio |
| Connexion et en-têtes des nouveaux clients HTTP | 5 s, en-têtes de 64 Kio |

Les limites de corps s'appliquent aux données décompressées par `net/http`,
indépendamment de Content-Length. Les clients de ce lot réutilisent leurs
transports, refusent les redirections et transmettent le contexte de requête.
Les délais explicites restent nécessaires : Fiber n'assure pas à lui seul une
annulation immédiate sur toute déconnexion navigateur. Les erreurs studios
renvoyées au client ne contiennent plus le corps d'erreur du service distant.
Le téléchargement périodique de la base SQLite studios est distinct et n'est
pas modifié dans ce lot.

Les thèmes sont écrits par fichier temporaire privé puis renommage atomique.
Les données conservées sur disque ne sont relues que pour le serveur configuré.
Le cache studios peut conserver un résultat autorisé jusqu'à son TTL après
révocation d'un jeton ; ce lot ne change pas cette politique de fraîcheur.

## Vérifications reproductibles

```sh
(cd backend && go test -mod=readonly ./...)
(cd backend && go vet -mod=readonly ./...)
(cd backend && CGO_ENABLED=1 go test -race -mod=readonly ./...)
pnpm --filter pelagica run build
pnpm --filter pelagica run lint
pnpm --filter pelagica run format:check
node scripts/check-frontend.mjs
node --test scripts/check-hero-rotation.mjs
```

Les tests Go incluent les refus avant appel réseau, redirections, contexte et
expiration de requête, limites de corps (dont gzip), saturation/expiration du
cache, thèmes à lecture seule et persistance privée, sous-chemins Jellyfin et
dépôt de thèmes, authentification et priorité du consentement d'environnement.
Les serveurs sont des fixtures `httptest`, avec fichiers temporaires ; aucun
service ou jeu de données personnel n'est requis.

## Points restant à valider

- Configuration exacte de l'instance et de ses URLs, puis image Docker isolée.
- Connexion, administration, thèmes, studios et statistiques dans un navigateur.
- Cookies Seerr, politique Origin/CSRF et préfixes derrière un proxy HTTPS.
- Séparation des champs publics/privés de configuration et politique des jetons
  navigateur ; le fichier de configuration public ne doit contenir aucun secret.
- Durcissement de l'image, supervision des processus, en-têtes HTTP et dépendances.
- Limitation du débit et des requêtes simultanées au niveau application/proxy ;
  les bornes par requête et de cache ne constituent pas une protection globale DoS.

Aucune route héritée n'est retirée, aucun lockfile ni moteur de lecture n'est
modifié dans ce lot. La revue privée reste hors du dépôt public.
