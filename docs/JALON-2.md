# ArkoPlex — Jalon 2 : intégration Night Pulse et réglages autonomes

Version de travail : **0.1.0-jalon.2**, 9 novembre 2026.

## Résultat

L’identité validée au jalon 1 est intégrée au code du client web, sur une
branche distincte de la base reproductible : `arkoplex/jalon-2-night-pulse`.

Il s’agit de composants React utilisant le SDK et les données Jellyfin.
Les titres, genres, images, favoris et positions ne sont pas codés en dur.
Le code de Pelagica 4.15.0 et son historique restent la base du projet.

Aucun dépôt créé dans le compte GitHub de l’utilisateur ; aucune modification
sur les HP Z640/Tiny, leurs conteneurs, le DNS, NPM ou Jellyfin. Le travail
reste une version de développement non déployée.

## Interface intégrée

- En-tête ArkoPlex, navigation Accueil/Films/Séries/Favoris, recherche et compte.
- Mise en avant cinématique avec changement manuel du titre, états de
  chargement/erreur/bibliothèque vide et progression réelle lorsqu’elle est
  fournie par Jellyfin.
- Un film lance le parcours de lecture existant ; une série ouvre sa fiche
  pour choisir un épisode. Aucune qualité 4K/HDR n’est inventée.
- Cartes et reprises aux angles découpés ; jaune ambré et cyan ; affiches nettes.
- Fiches films et séries : composition adaptée, visuels plus présents,
  suppressions des flous de chargement concernés et adaptation mobile.
- Commandes du lecteur habillées avec la nouvelle palette ; le moteur
  Video.js/JASSUB et la négociation des flux sont conservés.
- Lumière de souris sur grand écran, reflet ponctuel, léger relief des cartes
  et réponse du favori après confirmation de la requête Jellyfin.
- Pas d’animation de décoration en boucle. Respect du mouvement réduit,
  option globale pour désactiver les effets, arrêt/nettoyage du suivi de souris.
- Favicons et marque ArkoPlex. Polices Manrope et Barlow Condensed incluses
  localement, avec leurs licences OFL : aucun chargement Google Fonts à l’usage.

Le nouveau code est séparé dans `frontend/src/components/arkoplex/` et
`frontend/src/arkoplex.css`. Il remplace certaines compositions et réutilise
les fonctionnalités du socle ; le CSS n’est pas le seul changement.

## Réglages indépendants du plugin

Le client web lit et enregistre ses réglages auprès de son backend Go :

| Route | Usage |
|---|---|
| `GET /api/arkoplex/config` | Lire les réglages publics de l’instance |
| `PUT /api/arkoplex/config` | Enregistrer, avec vérification administrateur |
| `GET /api/arkoplex/branding/logo/light` ou `/dark` | Lire le logo local |
| `PUT /api/arkoplex/branding/logo/light` ou `/dark` | Enregistrer un logo PNG/JPEG/WebP, administrateur requis |
| `GET /api/health` | Vérifier que le backend répond |

Le nouvel onglet Night Pulse donne accès à l’apparence et au mouvement.
Les autres onglets servent à l’accueil, aux fiches, au nom, aux logos et aux
liens. Les réglages ne proposent plus l’installation ou le redémarrage du
plugin Pelagica. Les thèmes externes ont été retirés de ce parcours web.

La configuration est écrite par remplacement atomique, avec des permissions
de fichier `0600`. Les champs JSON supplémentaires sont conservés afin de
ne pas perdre des options lors d’une évolution du schéma. Les écritures
successives de l’interface sont ordonnées ; une erreur de sauvegarde est
signalée et le dernier état enregistré est rétabli quand il n’y a pas de
modification plus récente.

Le connecteur Seerr lit désormais l’URL dans ces réglages locaux. Cette
adaptation retire sa lecture du plugin ; le fonctionnement complet de Seerr
n’a pas été testé avec un service réel dans ce jalon.

Les anciens modules desktop/TV restent présents. Leurs chemins de configuration
partagés sont conservés, mais ces plateformes n’ont pas été compilées ou
validées ici. Le périmètre validé est le client **web**.

## Conditions de configuration pour le futur déploiement

| Variable | Rôle |
|---|---|
| `SERVER_ADDRESS` | Adresse Jellyfin fixe utilisée par l’instance et par la validation administrateur |
| `ARKOPLEX_CONFIG_PATH` | Chemin du JSON ; `/config/arkoplex/config.json` dans l’image préparée |
| `ENABLE_AUTH` | Garder `true` ; les nouvelles routes de réglages et logos imposent toujours l’authentification |
| `COLLECTOR_STATS_CONSENT` | `false` par défaut dans l’image ArkoPlex |

L’adresse Jellyfin doit être accessible depuis le navigateur **et** depuis le
Tiny. Son chemin éventuel, par exemple `/jellyfin`, est conservé pour la
validation. Cette connectivité, le DNS et le reverse proxy seront vérifiés
avant le déploiement, avec autorisation séparée.

Si `SERVER_ADDRESS` n’est pas défini, l’application peut démarrer et présenter
son formulaire de connexion, mais les nouvelles écritures administrateur
sont refusées. Une URL fournie par le navigateur ne peut pas remplacer le
serveur de confiance pour accorder des droits. Les redirections HTTP ne sont
pas suivies lors de cette vérification et un délai de cinq secondes est fixé.

Les comptes, les permissions, les favoris et la progression restent gérés
par Jellyfin. Le backend ArkoPlex n’effectue aucun transcodage et n’a besoin
d’aucun montage des disques de médias.

## Vérifications reproductibles

Avec Node 24.22.1, pnpm 11.25.0, Go 1.25.14, Python 3 et Bash :

```bash
bash scripts/check-jalon2.sh
```

Si le compilateur Go n’est pas dans le PATH :

```bash
GO_BIN=/chemin/vers/go bash scripts/check-jalon2.sh
```

Ce script compile le web et Go avec les fichiers de verrouillage conservés,
exécute les tests Go, `go vet`, ESLint, Prettier, les contrôles d’intégration
HTML, puis les vérifications HTTP. Les états de test sont isolés et aucun
serveur Jellyfin de l’utilisateur n’est contacté. Le test HTTP remplace le
téléchargement facultatif des studios par une réponse locale volontaire.

Les tests Go couvrent quatre familles :

1. Conservation des réglages après redémarrage, extensions JSON, permissions,
   types/URLs invalides, taille maximale et refus d’écraser une configuration valide.
2. Refus des comptes non administrateurs, des jetons invalides et d’un serveur
   d’authentification choisi par le client ; refus si l’instance n’est pas configurée.
3. Refus de transmettre l’authentification à une destination de redirection.
4. Stockage du logo et refus des SVG actifs, des modes invalides et des
   écritures sans droits.

Sept contrôles de rendu HTML utilisent des données de test : catalogue,
reprise, absence de qualité inventée, lien correct d’une série, échappement
d’un titre, état vide et présence de la navigation.

Onze vérifications HTTP contrôlent le démarrage, la transmission au backend,
la configuration sans plugin, la santé et les refus d’écriture attendus.

## Limites de validation

- Le navigateur de contrôle ne peut pas joindre l’aperçu local
  (`ERR_CONNECTION_REFUSED`). Le rendu visuel réel, les interactions tactiles
  et les performances des effets ne sont donc pas déclarés validés.
- Les contrôles HTML sont réalisés côté serveur, pas dans un navigateur.
- Aucune connexion au Jellyfin réel de l’utilisateur, aucune lecture audio/vidéo,
  aucun changement de piste ou transcodage réel n’a été testé.
- Le sélecteur de qualité réel vu en maquette reste un chantier du jalon
  consacré au lecteur ; il n’est pas ajouté comme une commande factice.
- Le signalement amont [Pelagica nº 331](https://github.com/PelagicaApp/pelagica/issues/331)
  concernant la progression à l’enchaînement des épisodes reste à reproduire
  et à traiter au jalon lecteur ; la logique concernée n’a pas été réécrite ici.
- Docker est absent : Dockerfile et santé Nginx préparés, image non construite.
  Le Dockerfile fixe désormais Node/pnpm/Go aux versions utilisées. La route
  Nginx `/health` est dirigée vers Go pour éviter un faux état sain si le backend
  est arrêté ; cette configuration doit encore être vérifiée dans l’image.
- Vite conserve des avertissements de taille de bundles hérités du socle.
- L’interface et les bibliothèques d’origine gardent des fonctionnalités
  plus larges que le périmètre V1 ; il ne s’agit pas d’une publication finale.

## Reprise du code et suite

L’archive fournit les sources complètes, le rapport de vérification et un
Git bundle avec l’historique. Pour retrouver le dépôt de travail :

```bash
git clone --branch arkoplex/jalon-2-night-pulse history/arkoplex.bundle arkoplex
cd arkoplex
git remote rename origin archive
git remote add upstream https://github.com/PelagicaApp/pelagica.git
```

Les workflows de publication hérités de Pelagica devront être adaptés avant
toute publication GitHub ou d’image. Aucun secret GitHub n’est nécessaire pour
conserver ou lire cette version.

Le prochain jalon porte sur le parcours complet et sa validation avec un
Jellyfin de test. Une installation sur le Tiny, un accès au vrai serveur ou
une publication devront être autorisés séparément. Aucun changement de ce
type n’a été effectué dans ce jalon.
