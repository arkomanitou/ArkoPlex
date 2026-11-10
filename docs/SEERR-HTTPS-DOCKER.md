# Seerr, HTTPS et validation Docker isolée

Deuxième lot, sur `arkoplex/seerr-https-docker`, basé sur
`arkoplex/security-hardening` (`0e92ca53df83871f6a515c13829a5541c2a67881`).
Aucune commande de ce document n'est une installation sur un serveur existant.

## Adresse publique et préfixe

| Réglage | Usage |
| --- | --- |
| `ARKOPLEX_PUBLIC_ORIGIN` | Origine visible par le navigateur, par exemple `https://demo.example.invalid`, sans chemin, paramètres ni identifiants |
| `BASE_PATH` | Préfixe de l'application, par exemple `/arkoplex`, ou vide pour la racine |
| `HOST` | Adresse d'écoute du backend ; l'image fixe `127.0.0.1`, derrière son Nginx interne |

Derrière une terminaison HTTPS, définir **explicitement**
`ARKOPLEX_PUBLIC_ORIGIN=https://demo.example.invalid`. Cette valeur détermine
la comparaison Origin et l'attribut Secure du cookie. Les en-têtes
`Forwarded`, `X-Forwarded-Host` et `X-Forwarded-Proto` ne sélectionnent pas
l'origine de confiance. Ne pas utiliser `https://.../arkoplex` dans ce réglage :
le chemin appartient à `BASE_PATH`. Une configuration invalide empêche le
backend de démarrer et ferme aussi le middleware de sécurité.

Sans origine explicite, les mutations HTTP locales comparent Origin à
l'adresse HTTP directe (Host et port conservés). Le HTTPS direct est reconnu
uniquement par la connexion TLS du backend. Le HTTPS terminé par un proxy
nécessite le réglage explicite ; un en-tête client ne peut pas l'activer.
Une seule origine est admise par instance. Pour tester l'HTTP local et le
HTTPS public en même temps, utiliser deux instances distinctes.

`BASE_PATH` est un **argument de construction** du Dockerfile, qui est repris
dans l'environnement du backend. Le frontend, Nginx et le chemin du cookie
utilisent ainsi le même préfixe. Reconstruire l'image pour changer de préfixe ;
ne pas remplacer seulement la variable au démarrage.

## Requêtes et cookies Seerr

Toutes les mutations Seerr, y compris login, logout et Quick Connect, exigent
`X-ArkoPlex-Request: 1`. Le frontend fournit cet en-tête. Une origine fournie
doit correspondre à l'origine attendue ; `Origin: null`, un autre schéma,
port ou site sont refusés. `Sec-Fetch-Site: cross-site` est refusé également.
Les corps non vides doivent être JSON et ne pas dépasser 64 Kio.

Les clients non navigateurs peuvent omettre Origin, mais doivent fournir
l'en-tête personnalisé. Cet en-tête est une protection CSRF et **pas** un
identifiant ou un secret. ArkoPlex ne fournit aucune autorisation CORS pour
ces routes. Ne pas ajouter de règle CORS permissive dans un proxy : la défense
par en-tête s'appuie sur le refus des prévols provenant d'autres origines.
Les permissions métier restent vérifiées par Seerr via sa session.

Le cookie est host-only (sans Domain), HttpOnly et SameSite=Lax, avec Secure
pour une origine HTTPS. Son chemin est `${BASE_PATH}/api/seerr`. Logout
expire ce chemin et l'ancien `/api/seerr` ; un login sous préfixe expire aussi
l'ancien chemin. Les champs Set-Cookie restent distincts. Un changement de
préfixe peut demander une nouvelle connexion Seerr.

## Image et Nginx

- Nginx conserve le port dans Host pour les appels locaux.
- Les routes API sont prioritaires sur le cache des fichiers statiques.
- Les en-têtes nosniff, SAMEORIGIN et Referrer-Policy sont présents aussi dans
  les emplacements qui définissent leur propre cache, y compris leurs erreurs.
- Le backend écoute sur loopback dans l'image ; seul le port HTTP de Nginx est
  prévu pour l'accès applicatif.
- Le contrôle Docker `/health` traverse Nginx jusqu'au backend.
- Un superviseur arrête les deux processus sur SIGTERM et termine le conteneur
  si l'un des deux meurt. La politique de redémarrage reste un choix externe.
- Le collecteur ne reçoit plus de jeton à la construction ; un éventuel secret
  reste une configuration runtime. Les statistiques restent désactivées par
  défaut. La licence GPL est incluse dans l'image.

Ce lot ne transforme pas l'image en image rootless et ne fige pas encore son
image Nginx par digest. CSP, HSTS au point de terminaison TLS, suivi des
vulnérabilités et séparation des champs publics/privés restent à traiter.

## Exécution des contrôles isolés

Le workflow `docker-checks.yml` est déclenché par la proposition vers la
branche du premier lot ou manuellement. Il construit localement deux images :
racine et `/arkoplex`. Il ne publie aucune image et n'utilise aucun secret.

Exemple à exécuter uniquement dans un environnement Docker de test disponible :

```sh
docker build --build-arg BASE_PATH=/arkoplex --tag arkoplex-ci:prefix .
python3 scripts/check-docker.py --image arkoplex-ci:prefix --base-path /arkoplex
```

Le script crée un réseau Docker interne et des conteneurs à noms aléatoires,
sans aucun port publié. Les requêtes HTTP partent de la fixture via
`docker exec`, sans socket Docker monté dans les conteneurs. Jellyfin/Seerr
sont simulés ; la
mise à jour de base studios est remplacée par une réponse locale. L'état de
l'application est en tmpfs et la configuration de fixture est temporaire.
Aucun volume persistant n'est créé, aucun `prune` n'est utilisé. Le nettoyage
vise uniquement les noms créés et étiquetés par cette exécution.

Les contrôles couvrent la SPA et son préfixe, les vrais en-têtes Nginx, le
healthcheck, le confinement réseau du backend, la licence, les refus CSRF avant
appel Seerr, login et Quick Connect, cookies HTTPS et logout, session relayée,
HTTP local avec port et refus d'en-têtes proxy falsifiés, arrêt et panne de
processus. Ils ne constituent pas une navigation dans un navigateur ni un test
avec un vrai Seerr ou une vraie terminaison TLS/NPM. L'HTTPS public reste à
vérifier ultérieurement avant exposition.
