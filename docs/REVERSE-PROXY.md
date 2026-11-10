# Préparer ArkoPlex derrière Nginx Proxy Manager

Cette fiche prépare l’accès par domaine. Elle ne crée aucun DNS, certificat,
proxy ou accès extérieur. L’application reste une bêta web privée à valider
avec la terminaison HTTPS réelle.

## Paramètres applicatifs

Définir dans la stack de l’instance destinée au domaine :

```yaml
environment:
  SERVER_ADDRESS: "https://jellyfin.example.invalid"
  ARKOPLEX_PUBLIC_ORIGIN: "https://arkoplex.example.invalid"
```

`ARKOPLEX_PUBLIC_ORIGIN` est l’origine exacte vue dans le navigateur : schéma,
hôte et port éventuel, sans chemin ni barre finale. Ne pas ajouter `/api`.
`BASE_PATH` reste vide pour un sous-domaine à la racine.

Le middleware Seerr compare l’origine des mutations à cette valeur et utilise
un cookie Secure avec HTTPS. Un simple proxy placé devant une instance encore
configurée avec l’origine HTTP locale fera refuser les connexions/demandes
Jellyseerr. Les en-têtes du proxy ne remplacent pas ce réglage.

Une instance admet une seule origine. Après bascule, utiliser le domaine HTTPS
aussi depuis la maison. Pour garder deux origines pleinement fonctionnelles,
préparer deux instances avec des configurations et volumes distincts.

## Fiche NPM

| Champ | Valeur à renseigner |
| --- | --- |
| Domain Names | Le sous-domaine ArkoPlex retenu |
| Scheme | `http` pour le lien NPM → conteneur |
| Forward Hostname / IP | Adresse privée du serveur hébergeant ArkoPlex |
| Forward Port | Port publié de l’instance ArkoPlex |
| SSL Certificate | Certificat valide couvrant ce sous-domaine |
| Force SSL | Activé une fois le certificat en place |

Les connexions utilisateur restent assurées par Jellyfin et Jellyseerr et
leurs permissions. Ne pas activer de CORS permissif pour contourner un refus
Seerr. Ne pas exposer directement le port backend interne 4321 ni les interfaces
d’administration Docker/CasaOS/Portainer pour ce parcours.

Le navigateur lit les médias auprès de Jellyfin : son adresse configurée doit
être joignable en HTTPS depuis l’extérieur aussi. L’ajout du proxy ArkoPlex
n’ouvre pas à lui seul un serveur Jellyfin disponible uniquement sur le LAN.

NPM peut rester sur un serveur distinct du client ArkoPlex, dès lors qu’il peut
joindre son adresse et son port privés. Le DNS et le certificat doivent pointer
vers le point d’entrée NPM existant.

## Validation à effectuer sur le domaine

- Certificat valide et redirection HTTP → HTTPS.
- Connexion Jellyfin, navigation et lecture avec reprise/arrêt.
- Connexion/déconnexion Jellyseerr et demande via le compte approprié.
- Cookie Seerr HttpOnly/SameSite/Secure et refus d’une origine tierce.
- Compte non administrateur : droits de bibliothèque/demande et réglages réservés.
- Essai depuis un réseau extérieur et sur téléphone, puis contrôle de l’arrêt
  de la conversion côté serveur.

Les fichiers publics de configuration ne sont pas un coffre à secrets : vérifier
leur contenu effectif avant l’ouverture. Conserver une sauvegarde et la fiche
Compose précédente pour revenir à la configuration locale si nécessaire.

Références : [guide NPM](https://nginxproxymanager.com/guide/) et
[origine/cookies ArkoPlex](SEERR-HTTPS-DOCKER.md).
