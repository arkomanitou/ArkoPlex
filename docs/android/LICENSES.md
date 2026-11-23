# Licences et code source Android

ArkoPlex et ses modifications : GPL version 3, texte à la racine et dans `licenses/GPL-3.0.txt`. Les mentions Pelagica existantes sont conservées. Capacitor 8.6.2 : MIT, Drifty Co. LibVLC Android 3.7.8 : licence déclarée par son POM LGPL 2.1 ; les fichiers JNI indiquent LGPL 2.1 ou ultérieure, Copyright VLC authors et VideoLAN. Le moteur et ses contributions gardent leurs licences propres ; l'ensemble ArkoPlex est distribué sous GPLv3. AndroidX et Kotlin : Apache 2.0 ; libc++ : Apache 2.0 avec exception LLVM. Les licences des polices Manrope et Barlow Condensed (OFL) restent à côté des polices dans les assets.

`scripts/collect-android-notices.mjs` rassemble les textes LICENSE/COPYING/NOTICE des paquets JavaScript installés et les textes du présent répertoire dans `frontend/android/app/src/main/assets/android-notices.txt`. Le fichier est embarqué et accessible depuis le lecteur. Le script inclut aussi des outils de compilation, afin de conserver toutes les mentions collectées.

Références exactes auditées :

- AAR : `org.videolan.android:libvlc-all:3.7.8`, depuis Maven Central ; JAR de sources Java au même emplacement avec suffixe `-sources.jar`.
- Tag de publication Android : `https://github.com/videolan/vlc-android/tree/libvlc-3.7.8`, commit `2ddfc41b3fbb07c29a79d08db0f14f73f663e18e`.
- JNI : `https://code.videolan.org/videolan/libvlcjni`, commit `0c32e70aff29b01a67f5c734f9f7fd72070bbe7b`, fixé par `buildsystem/compile.sh` de ce tag.
- Moteur VLC : `https://code.videolan.org/videolan/vlc`, commit `84177b2273abc5c4300234e6e18b55a4d2dd5a03`, fixé par `buildsystem/get-vlc.sh` des sources JNI.

Les archives de sources ArkoPlex, JNI et VLC ainsi que le JAR de sources LibVLC accompagnent la livraison de test. Les recettes des contributions, versions et scripts de compilation sont dans ces archives ; leurs téléchargements restent nécessaires pour reconstruire le moteur et ses dépendances. Ne pas présenter le seul JAR Java comme les sources complètes du moteur natif. Les sources des dépendances JavaScript et Android sont obtenues par les gestionnaires depuis les coordonnées fixées dans le dépôt. Pour redistribuer l'APK, conserver l'accès aux sources correspondantes et à leurs licences, aux recettes de reconstruction et à la possibilité de remplacer/recompiler les bibliothèques. Ne distribuer aucune clé privée de signature.
