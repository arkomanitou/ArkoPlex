# ArkoPlex

Client Jellyfin web indépendant, basé sur **Pelagica 4.15.0**. ArkoPlex est un
**bêta 1 de référence**, validée pour les parcours décrits ci-dessous sur une
installation locale. La validation HTTPS derrière un proxy et les essais prolongés
restent à terminer avant de qualifier un accès extérieur. Le périmètre maintenu ici est le frontend web React et
le backend Go ; les applications desktop et TV héritées restent hors périmètre.

## Origine et licence

ArkoPlex reprend [Pelagica](https://github.com/PelagicaApp/pelagica), ses auteurs
et contributeurs, sous [GNU GPL v3.0](LICENSE). L'historique amont et les mentions
de licence sont conservés. La référence amont 4.15.0 est le commit
`fc6e0aa6edd7b63a85fdbb7963b6c724b81364b7` (voir `baseline-spec.json`).
Pelagica indique une inspiration visuelle de
[finetic](https://github.com/AyaanZaveri/finetic), sans reprise de son code.
Merci aux contributeurs Pelagica et aux projets React, Jellyfin et Wails.
ArkoPlex n'est pas affilié au projet Jellyfin. Les illustrations de médias
appartiennent à leurs ayants droit ; ce client ne fournit aucun contenu.

## Bêta 1 de référence

La branche `arkoplex/beta-1` regroupe la direction Night Pulse, les protections
backend, l’intégration Jellyseerr, les découvertes personnalisées et les correctifs
récents du lecteur. Voir [la fiche bêta 1](docs/BETA-1.md).

La référence applicative installée et vérifiée le 10 novembre 2026 est
`655ebc5506e552446a28c8b31797ce13cc732095`. La consolidation ajoute de la
documentation et étend les contrôles Docker à la branche principale ; elle ne
modifie pas ce code applicatif. Les branches de développement et leur historique
sont conservés.

Fonctionnalités de cette référence :

- « Le choix du soir » : rotation à huit secondes, points, pause et cadre stable
  entre les titres ; respect des préférences de mouvement.
- Onglet « À découvrir » séparé de l’accueil, suggestions par compte, recherche,
  demandes de films/saisons et suivi Jellyseerr.
- Négociation du flux avec la source vidéo exacte et choix explicite des
  sous-titres ; utilisation du flux HLS adapté fourni par Jellyfin.
- Arrêt de la conversion ciblé sur l’appareil et la lecture quittée, avec reprise
  du même titre dans une nouvelle session.

Les retours des deux comptes, les demandes jusqu’à disponibilité dans Jellyfin,
le mobile et les derniers essais de lecture sont concluants. Les contrôles
reproductibles sont détaillés ci-dessous ; ils ne remplacent pas des essais
prolongés avec les différents codecs et appareils.

## Construire et vérifier dans un environnement isolé

Pré requis : Git, Python 3, Node **24.22.1** (`.node-version`), pnpm **11.25.0**
(`package.json`), Go **1.25.14** (`.go-version` ; module backend : Go 1.25.0).
Installer ces versions avant les commandes ; aucune mise à jour de lockfile
n'est nécessaire. Depuis un nouveau répertoire :

```sh
git clone --branch arkoplex/beta-1 https://github.com/arkomanitou/ArkoPlex.git
cd ArkoPlex
npm install --global pnpm@11.25.0
bash scripts/baseline-build.sh
```

Le script contrôle les versions, installe avec `--frozen-lockfile`, construit
TypeScript/Vite puis Go (`-mod=readonly`), vérifie les modules et consigne les
résultats dans `.baseline/` (non versionné).

```sh
pnpm --filter pelagica run lint
pnpm --filter pelagica run format:check
node scripts/check-frontend.mjs
node --test scripts/check-hero-rotation.mjs
(cd backend && GOTOOLCHAIN=local go test -mod=readonly ./...)
(cd backend && GOTOOLCHAIN=local go vet -mod=readonly ./...)
```

`check-frontend.mjs` rend du HTML SSR avec des identifiants fictifs : aucune
connexion Jellyfin. Les tests de rotation utilisent une horloge simulée.
La CI utilise aussi un navigateur avec des réponses simulées et des conteneurs
Docker isolés avec de faux services Jellyfin/Seerr. Elle n’accède pas au homelab
et ne publie pas d’image. Les anciens workflows sont conservés dans
`.github/workflows-archive/` où GitHub ne les exécute pas. Ne pas les réactiver
sans revue : ils ciblent les publications Pelagica et des secrets amont.
Aucun réglage global GitHub Actions ni secret n'est requis par ce lot.

## Configuration et limites connues

Le conteneur prévoit `/config` pour l'état persistant, dont
`/config/arkoplex/config.json`, les logos, les données héritées, caches et logs.
`ARKOPLEX_CONFIG_PATH` permet de choisir le fichier. Les écritures de configuration, logos, thèmes et consentement global exigent
toujours un administrateur vérifié sur le serveur défini par `SERVER_ADDRESS`,
même si `ENABLE_AUTH=false` ou absent. Utiliser une URL générique telle
que `https://jellyfin.example.invalid` dans la documentation, jamais de jeton
ou mot de passe. Les champs de configuration lisibles par le client ne sont
pas un coffre à secrets. `COLLECTOR_STATS_CONSENT=false` refuse les statistiques.

Des routes et intégrations Pelagica sont encore actives. La revue statique et
les décisions de durcissement doivent être traitées avant une ouverture réseau.
Les contrôles CI ne certifient ni la sécurité, ni la lecture réelle, ni le
comportement mobile. Le Dockerfile existe, mais un build web/Go réussi ne prouve
pas qu'une image Docker a été construite ou testée. Les images de base du
conteneur et les dépendances nécessitent un suivi séparé.

Le [premier lot de durcissement](docs/SECURITY-HARDENING.md) décrit les bornes,
les changements de compatibilité des URLs et les validations restantes.
Les requêtes ne choisissent plus librement le serveur Jellyfin à contacter.

Le [lot Seerr et Docker](docs/SEERR-HTTPS-DOCKER.md) décrit
`ARKOPLEX_PUBLIC_ORIGIN`, le préfixe de construction, les cookies/CSRF et les
contrôles du conteneur. Une exposition HTTPS derrière proxy exige cette origine
explicite ; [la fiche reverse proxy](docs/REVERSE-PROXY.md) précise la préparation
et les contrôles. Aucun proxy ni DNS existant n’est modifié par le code.

## Mise à jour, sauvegarde et retour arrière

Un point de restauration local de la référence applicative `655ebc5` a été
vérifié le 10 novembre 2026 : archive et empreinte, restauration dans un volume
neuf, comparaison des fichiers/permissions/propriétaires et démarrage isolé de
la copie restaurée. L’instance a été relancée après la copie. Les archives,
configurations et manifestes propres à l’installation restent privés.

Ce point local ne constitue pas une sauvegarde hors machine. Le dépôt cloud et
une politique de rétention doivent être configurés séparément. Les commandes
ci-dessous sont une procédure générique à adapter, pas un script déjà exécuté
mot pour mot sur chaque installation.
Avant toute mise à jour, relever le commit source, le tag **et l'ID exact** de
l'image courante, le fichier de stack/Compose et le nom réel du volume monté
sur `/config`. Conserver l'ancienne image. Ne jamais utiliser `down -v`,
`volume rm` ou un nettoyage automatique pour mettre à jour.

1. Construire et tester le commit retenu dans un environnement isolé, avec un
   nouveau tag explicite (pas `latest`). Examiner les résultats avant transfert.
2. Prévoir un arrêt du seul conteneur concerné pour une copie cohérente de
   `/config`. Aucun arrêt n'est réalisé par cette préparation.
3. Sauvegarder **tout le volume** et le fichier de stack dans un emplacement
   privé, avec une date et une somme SHA-256. Protéger les archives comme des
   données sensibles. Exemple générique de copie du volume arrêté, à adapter :

```sh
# Exemple uniquement : utiliser une image utilitaire déjà approuvée/disponible.
# Remplacer les noms et créer le dossier privé de sauvegarde au préalable.
docker run --rm --network none \
  --mount type=volume,src=example_config,dst=/source,readonly \
  --mount type=bind,src=/absolute/private-backups,dst=/backup \
  alpine:3.22 sh -c 'tar -czf /backup/config-before-update.tgz -C /source .'
sha256sum /absolute/private-backups/config-before-update.tgz
```

4. Lister l'archive et tester son extraction dans un répertoire ou volume neuf,
   jamais par-dessus la configuration active. Vérifier fichiers et permissions.
5. Lors d'une opération ultérieure autorisée, remplacer uniquement l'image en
   conservant le volume existant, puis vérifier connexion, navigation, lecture,
   progression, administration et rotation clavier/survol/mouvement réduit.
6. En cas de régression, remettre l'ancienne image. Si les données ont changé,
   restaurer la copie validée dans un **nouveau volume** et le sélectionner dans
   la stack. Conserver le volume initial et les archives sans suppression.

La sauvegarde de `/config` n'inclut pas les données du serveur Jellyfin.
Aucun accès extérieur, release, publication d'image ou mise à jour automatique
n'est configuré par cette branche.
