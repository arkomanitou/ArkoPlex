# ArkoPlex

Client Jellyfin web indépendant, basé sur **Pelagica 4.15.0**. ArkoPlex est un
prototype : **bêta en préparation**, pas encore une version stable ou validée pour
une exposition publique. Le périmètre maintenu ici est le frontend web React et
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

## État des versions

État de référence au 10 novembre 2026 ; les branches peuvent évoluer.

| Référence | État |
| --- | --- |
| `main`, `arkoplex/jalon-2-night-pulse` | Jalon 2, référence GitHub `f648a693670846345c7b5ab304ea15ea47ba5722` |
| `arkoplex:jalon2-night-pulse` | Tag local signalé comme installé ; aucune image publique ArkoPlex annoncée |
| `arkoplex/hero-auto-rotation` | `464111760aec4e145ab251684f0ea1c751592079`, rotation préparée, non déployée |
| `arkoplex/beta-preparation` | Documentation et CI préparées à partir de la branche de rotation ; aucun déploiement |

« Le choix du soir » comprend déjà une rotation à huit secondes, des points
cliquables, pause/reprise et suspension au survol, au focus et lorsque l'onglet
est masqué, avec respect des préférences de mouvement. Voir
[la note de rotation](docs/HERO-ROTATION.md). Les tests de temporisation et HTML
SSR ne constituent pas des tests d'interactions dans un navigateur.

Des essais préliminaires rapportés par l'utilisateur couvrent lecture, saut
d'introduction, épisodes suivant/précédent et reprise de progression. Ils ne
constituent pas une validation exhaustive des appareils, codecs ou permissions.
Voir aussi [Jalon 0](docs/JALON-0.md) et [Jalon 2](docs/JALON-2.md) pour les
résultats historiques, distincts des futurs résultats CI.

## Construire et vérifier dans un environnement isolé

Pré requis : Git, Python 3, Node **24.22.1** (`.node-version`), pnpm **11.25.0**
(`package.json`), Go **1.25.14** (`.go-version` ; module backend : Go 1.25.0).
Installer ces versions avant les commandes ; aucune mise à jour de lockfile
n'est nécessaire. Depuis un nouveau répertoire :

```sh
git clone --branch arkoplex/beta-preparation https://github.com/arkomanitou/ArkoPlex.git
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
La CI ne lance pas de service, n'accède pas à une installation réelle et ne
publie rien. Les anciens workflows sont conservés dans
`.github/workflows-archive/` où GitHub ne les exécute pas. Ne pas les réactiver
sans revue : ils ciblent les publications Pelagica et des secrets amont.
Aucun réglage global GitHub Actions ni secret n'est requis par ce lot.

## Configuration et limites connues

Le conteneur prévoit `/config` pour l'état persistant, dont
`/config/arkoplex/config.json`, les logos, les données héritées, caches et logs.
`ARKOPLEX_CONFIG_PATH` permet de choisir le fichier. Conserver
`ENABLE_AUTH=true` ; les écritures ArkoPlex exigent un administrateur vérifié
sur le serveur défini par `SERVER_ADDRESS`. Utiliser une URL générique telle
que `https://jellyfin.example.invalid` dans la documentation, jamais de jeton
ou mot de passe. Les champs de configuration lisibles par le client ne sont
pas un coffre à secrets. `COLLECTOR_STATS_CONSENT=false` refuse les statistiques.

Des routes et intégrations Pelagica sont encore actives. La revue statique et
les décisions de durcissement doivent être traitées avant une ouverture réseau.
Les contrôles CI ne certifient ni la sécurité, ni la lecture réelle, ni le
comportement mobile. Le Dockerfile existe, mais un build web/Go réussi ne prouve
pas qu'une image Docker a été construite ou testée. Les images de base du
conteneur et les dépendances nécessitent un suivi séparé.

## Mise à jour et sauvegarde : procédure à exécuter ultérieurement

Aucune commande de cette section n'a été exécutée sur une installation réelle.
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
