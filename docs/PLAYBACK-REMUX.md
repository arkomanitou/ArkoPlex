# Lecture : remux et sous-titres explicites

## Problème

Sur un fichier MKV 4K HEVC 10 bits HDR avec son DTS et sous-titres PGS,
le serveur peut lancer une conversion logicielle H.264, une conversion HDR/SDR
et l’incrustation des sous-titres graphiques. Cette combinaison peut saturer
un serveur sans accélération adaptée. Une lecture démarrée n’est pas une
preuve de fluidité, ni d’absence de transcodage vidéo.

Deux problèmes du client sont corrigés :

- `DirectStream` utilisait la route statique du fichier original malgré la
  présence d’un flux HLS adapté dans `TranscodingUrl`. Ce flux doit être utilisé
  pour laisser Jellyfin remuxer et/ou convertir le son en conservant la vidéo.
- Le client ne transmettait pas de choix explicite de sous-titres au serveur.
  Jellyfin pouvait alors sélectionner un PGS par défaut et l’incruster même si
  l’interface du lecteur n’avait pas choisi cette piste.

## Comportement

- Sous-titres désactivés : envoyer explicitement `SubtitleStreamIndex=-1`.
- SRT/VTT/ASS : rendu dans le client, avec `-1` côté serveur pour éviter une
  seconde piste implicite incrustée.
- PGS/VobSub/DVB : l’index réel de flux est envoyé lorsque cette piste est
  sélectionnée ; l’interface indique que cela implique une conversion vidéo.
  Ces pistes ne sont pas demandées en VTT au serveur, car leurs images ne
  constituent pas du texte convertible sans OCR.
- Une préférence de langue privilégie la piste texte si elle existe. Un choix
  déjà enregistré reste respecté.
- Un changement impliquant une incrustation conserve la position de lecture.
- La réponse de négociation est mise en cache par utilisateur et choix de piste.

## Vérification

Les tests du client contrôlent le routage HLS, le maintien de la lecture directe,
les index de sous-titres et les paramètres réellement transmis par le SDK à
un adaptateur HTTP fictif. Ils ne valident pas le décodage des codecs réels.

Avant validation sur un serveur : comparer la commande FFmpeg et la fluidité
avec sous-titres désactivés, avec une piste texte, puis avec une piste graphique
explicitement choisie. Vérifier que l’audio DTS peut être converti sans réencoder
la vidéo lorsque le navigateur accepte le HEVC. Une incompatibilité vidéo réelle
ou une sélection PGS peut toujours nécessiter un transcodage : ce correctif ne
promet pas une lecture directe universelle.

Référence : https://jellyfin.org/docs/general/post-install/transcoding/
