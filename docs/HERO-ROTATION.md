# ArkoPlex — Le choix du soir : défilement et points

Préparation du 9 novembre 2026, branche `arkoplex/hero-auto-rotation`.

## Comportement

- Le titre change automatiquement après huit secondes de disponibilité.
- Les flèches sont remplacées par des points cliquables. Le point actif est
  plus large, légèrement plus haut et jaune ambré.
- Le contrôle pause/reprise est séparé des points.
- Survol à la souris ou au stylet, focus dans le carrousel et onglet masqué
  suspendent le défilement. Les interactions tactiles ne créent pas de survol.
- Après une interruption ou une sélection manuelle, un délai complet de huit
  secondes précède le prochain changement.
- Les préférences système de mouvement réduit et le réglage Night Pulse
  désactivé empêchent le défilement. La navigation manuelle reste disponible.
- Une sélection vide ou un seul titre ne déclenche aucun minuteur ; un seul
  titre n'affiche pas de commandes inutiles.
- Un seul délai ponctuel est actif. Il est annulé à chaque interruption,
  changement de sélection et démontage du composant, sans rattrapage des
  changements manqués lors du retour à l'onglet.
- Les boutons des points restent montés lors du changement de titre pour
  conserver leur focus. Les points ont des libellés incluant le vrai titre et
  sa position ; le point courant utilise `aria-current`.
- Une apparition de l'image de 380 ms est utilisée uniquement lorsque les
  mouvements sont autorisés. Aucun zoom automatique ou glitch en boucle.

## Validation de préparation

Commandes exécutées avec Node 24.22.1 et pnpm 11.25.0 :

```bash
node --test scripts/check-hero-rotation.mjs
node scripts/check-frontend.mjs
pnpm --filter pelagica run lint
pnpm --filter pelagica run format:check
pnpm --filter pelagica run build
```

Résultats : dix contrôles de temporisation/pause avec une horloge contrôlée,
dix contrôles de rendu HTML, compilation TypeScript/Vite, ESLint et Prettier
réussis. Les contrôles de temporisation vérifient notamment l'absence de
changement avant huit secondes, les interruptions et l'annulation au démontage.
Ils sont ajoutés à `scripts/check-jalon2.sh`.

Les tests de temporisation portent sur la politique utilisée par le hook et
son ordonnanceur ; les tests HTML sont rendus côté serveur. Les interactions
React dans un navigateur et le rendu visuel de cette modification restent à
vérifier avant déploiement. Aucun backend ni protocole de lecture n'est modifié.

## Installation actuelle et publication

Cette préparation n'est pas déployée sur le Tiny et n'est pas encore publiée
sur GitHub. L'installation autorisée précédemment reste la base du jalon 2 :

- commit source `d00c66364b77041e61351b3a5ac052d5c90fad17` ;
- image locale construite `arkoplex:jalon2-night-pulse` ;
- image ID `sha256:42a35e241b27aa59a370e5785cb00f97eef73a656db87969eba1eac2a8673c7b` ;
- stack et conteneur `arkoplex-test`, volume `arkoplex-test_config` ;
- accès local sur le port 8800 du Tiny.

L'utilisateur rapporte que lecture, saut d'introduction, épisode suivant et
précédent ainsi que reprise de progression fonctionnent lors de ses premiers
essais. Ces retours ne constituent pas une validation exhaustive du lecteur.

Un futur déploiement devra conserver le volume existant et utiliser un nouveau
tag d'image. Aucun volume ou application existante ne doit être supprimé sans
autorisation explicite. L'accès NPM/DNS n'a pas été configuré pour ArkoPlex.
