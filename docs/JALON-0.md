# ArkoPlex — Jalon 0 : base reproductible

Date : 9 novembre 2026.

## Résultat et périmètre

Le frontend web et le backend Go de Pelagica 4.15.0 se construisent sur
Linux amd64. Leur démarrage et leurs échanges HTTP sont vérifiés dans un
environnement de travail isolé, sans connexion à un serveur Jellyfin.

Le code applicatif de Pelagica est conservé : aucune refonte visuelle,
aucun renommage fonctionnel, aucune modification du lecteur ni des accès
Jellyfin. Aucune opération sur les serveurs HP Z640 et Tiny, leurs conteneurs,
leurs configurations, le DNS ou Nginx Proxy Manager. Aucun dépôt créé ou publié
sur le compte GitHub de l'utilisateur.

La base reste celle de Pelagica. Elle utilise encore son plugin pour certains
réglages. La configuration autonome sur le Tiny est un chantier ultérieur.

## Références

- Dépôt : https://github.com/PelagicaApp/pelagica
- Référence analysée et récupérée : `fc6e0aa6edd7b63a85fdbb7963b6c724b81364b7`.
- Version applicative d'origine : `4.15.0`.
- Branche locale : `arkoplex/baseline-0`.
- Licence GPLv3 et historique d'origine conservés.

## Versions utilisées

| Outil | Version exacte |
|---|---|
| Node.js | 24.22.1 |
| pnpm | 11.25.0 |
| Go | 1.25.14 |
| Plateforme testée | Linux amd64 |

La version de pnpm est fixée par `packageManager` dans le `package.json`
racine ; Node et Go sont indiqués dans `.node-version` et `.go-version`.
Le script refuse une version différente. Les fichiers de verrouillage
`pnpm-lock.yaml`, `backend/go.mod` et `backend/go.sum` sont conservés.

Go a été récupéré depuis `go.dev` et son archive Linux amd64 vérifiée avec
le SHA-256 officiel consigné dans `baseline-spec.json`. Le programme
`/usr/bin/go` initialement présent n'était pas le compilateur Go ; un outil
séparé a donc été installé dans l'environnement de travail, sans toucher aux
serveurs de l'utilisateur.

## Reconstruire

Prérequis : Git, Bash, Python 3, et les trois outils aux versions ci-dessus.
Ces commandes ciblent Linux ; une construction native Windows n'a pas été
testée. WSL pourra servir pour une reproduction sur un PC Windows.

Depuis la racine du dépôt :

```bash
bash scripts/baseline-build.sh
```

Si le compilateur Go ou pnpm ne sont pas dans le PATH, leurs chemins peuvent
être indiqués explicitement :

```bash
GO_BIN=/chemin/vers/go PNPM_BIN=/chemin/vers/pnpm bash scripts/baseline-build.sh
```

Le script installe les seules dépendances nécessaires au client web avec
`--frozen-lockfile`, compile le frontend, vérifie les modules Go, puis compile
le backend avec `CGO_ENABLED=0`, `GOTOOLCHAIN=local`, `-mod=readonly`,
`-trimpath` et `-buildvcs=false`.

Le dernier paramètre évite que l'état temporaire de Git modifie le binaire.
La provenance reste enregistrée séparément dans `baseline-spec.json` et dans
l'historique Git. Le script ne provisionne pas les compilateurs lui-même.

Sorties locales exclues de Git et du contexte Docker :

- `frontend/dist/` : frontend compilé ;
- `.baseline/server` : backend Linux amd64 compilé ;
- `.baseline/*-build.log` et `install.log` : journaux ;
- `.baseline/artifact-sha256.json` : empreintes SHA-256.

La reproduction nécessite l'accès aux registres npm et Go. Les dépendances
ne sont pas vendoriées : il ne s'agit pas d'une construction hors ligne ou
hermétique. L'identité des artefacts a été contrôlée dans cet environnement ;
elle n'est pas garantie entre systèmes différents.

## Vérifier le démarrage

```bash
python3 scripts/baseline-smoke.py
```

Les ports locaux 4321 et 3410 doivent être libres. Le script refuse sinon de
continuer. Il lance le binaire Go et Vite preview, vérifie les réponses, puis
arrête les processus qu'il a lancés et supprime les données de test.

Le téléchargement facultatif des logos de studios est remplacé par une réponse
HTTP 503 locale volontaire. Le message de journal correspondant est attendu.
Le consentement aux statistiques est désactivé dans le seul environnement du
test. Aucune adresse Jellyfin réelle ni aucun identifiant n'est utilisé.

Vérifications HTTP :

1. Le frontend compilé est servi sur `/login`.
2. Le serveur frontend fournit la page SPA sur `/library`.
3. L'API Go répond sans adresse Jellyfin configurée.
4. Vite preview transmet `/api/server-address` au backend.
5. L'ancien endpoint `/api/config` répond en JSON.
6. Le consentement aux statistiques indique un refus.
7. L'API de thèmes initialise son stockage dans un dossier temporaire.
8. Une écriture de thème sans authentification est refusée en HTTP 403.

Ce contrôle utilise **Vite preview**, pas Nginx. Il ne constitue pas un test
de l'image Docker de production, des règles de cache ou du reverse proxy.
Le backend amont écoute sur toutes les interfaces du port choisi ; ce script
est destiné à un environnement de développement isolé, pas à un déploiement.

## Contrôles de code

```bash
pnpm --filter pelagica run lint
pnpm --filter pelagica run format:check
cd backend
go vet ./...
```

Tous ces contrôles ont réussi sur la référence d'origine.
Ils ne remplacent pas des tests fonctionnels de lecture vidéo.

## Vérification navigateur facultative

Un contrôle Playwright est fourni sans ajout de dépendance à l'application :

```bash
BASELINE_BROWSER_CHECK=1 python3 scripts/baseline-smoke.py
```

Il exige une installation Playwright existante et un navigateur utilisable.
`PLAYWRIGHT_MODULE` accepte un chemin vers le module, et `CHROMIUM_PATH` un
chemin vers Chromium. Le test vise les formats 1440×900 et 390×844, bloque les
requêtes externes, vérifie l'affichage du champ d'adresse serveur et recherche
les erreurs JavaScript/HTTP ainsi que le débordement horizontal.

**Cette vérification n'a pas pu être exécutée jusqu'au rendu dans cet
environnement.** Le navigateur fourni manque ; son téléchargement a échoué.
Le Chromium système est présent, mais son démarrage est refusé par
l'environnement (`socket(): Operation not permitted`). Aucun résultat visuel
PC/mobile, ni absence d'erreur JavaScript à l'exécution, n'est donc affirmé.

## Limites et points reportés

- Docker et Podman sont absents : aucune image Docker construite ou lancée.
- Le Dockerfile amont utilise `node:20-alpine` et installe pnpm sans version.
  Le pnpm utilisé ici exige Node >=22.13. La chaîne Docker doit donc être
  adaptée et vérifiée séparément avant le déploiement. Le Dockerfile n'a pas
  été modifié dans ce jalon.
- Vite signale certains bundles au-dessus de 500 kB : avertissement de taille,
  sans échec de compilation. Optimisation reportée.
- Ni connexion Jellyfin, ni lecture, ni transcodage, ni sous-titres testés.
- Ni accès distant, CORS, HTTPS, NPM, profils multiples ou TV validés.
- Les modifications sont limitées au verrouillage des outils, aux exclusions
  d'artefacts locaux, aux scripts de construction/contrôle et à ce dossier.

## Reprendre depuis l'archive

L'archive contient une copie lisible des sources et un fichier Git bundle
conservant l'historique et les ajouts de ce jalon. Pour retrouver un dépôt Git :

```bash
git clone --branch arkoplex/baseline-0 history/arkoplex.bundle arkoplex
cd arkoplex
git remote rename origin archive
git remote add upstream https://github.com/PelagicaApp/pelagica.git
```

Aucune commande de publication ou de déploiement n'est nécessaire pour lire
les sources. Le futur fork GitHub dans le compte de l'utilisateur pourra
être créé séparément, avec un accompagnement pas à pas.

## Prochaine étape

Le jalon 1 consiste à proposer la direction artistique de l'accueil, d'une
fiche et du lecteur, avec adaptation mobile. Il ne commence qu'après validation
du périmètre suivant. L'installation sur le Tiny demandera également une
autorisation distincte.
