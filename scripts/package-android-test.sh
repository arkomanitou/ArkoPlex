#!/usr/bin/env bash
set -euo pipefail
# Only local build artifacts and public upstream source archives. No server access.
if [ "$#" -ne 1 ]; then
    echo 'Usage: scripts/package-android-test.sh /path/to/delivery-directory' >&2
    exit 2
fi
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
delivery_dir=$1
mkdir -p -- "$delivery_dir"
delivery_dir=$(CDPATH= cd -- "$delivery_dir" && pwd)
cp -- "$repo_dir/frontend/android/app/build/outputs/apk/debug/app-debug.apk" "$delivery_dir/ArkoPlex-0.1.0-android.1-debug.apk"
git -C "$repo_dir" archive --format=tar.gz --prefix=ArkoPlex/ -o "$delivery_dir/ArkoPlex-source.tar.gz" HEAD
curl --fail --location --retry 2 'https://repo1.maven.org/maven2/org/videolan/android/libvlc-all/3.7.8/libvlc-all-3.7.8-sources.jar' -o "$delivery_dir/libvlc-all-3.7.8-sources.jar"
curl --fail --location --retry 2 'https://code.videolan.org/videolan/libvlcjni/-/archive/0c32e70aff29b01a67f5c734f9f7fd72070bbe7b/libvlcjni-0c32e70aff29b01a67f5c734f9f7fd72070bbe7b.tar.gz' -o "$delivery_dir/libvlcjni-source.tar.gz"
curl --fail --location --retry 2 'https://code.videolan.org/videolan/vlc/-/archive/84177b2273abc5c4300234e6e18b55a4d2dd5a03/vlc-84177b2273abc5c4300234e6e18b55a4d2dd5a03.tar.gz' -o "$delivery_dir/vlc-source.tar.gz"
cp -- "$repo_dir/docs/android/README.md" "$delivery_dir/README.md"
cp -- "$repo_dir/docs/android/LICENSES.md" "$delivery_dir/LICENSES.md"
cp -- "$repo_dir/docs/android/VALIDATION.md" "$delivery_dir/VALIDATION.md"
cp -R -- "$repo_dir/docs/android/licenses" "$delivery_dir/licenses"
cp -- "$repo_dir/frontend/android/app/src/main/assets/android-notices.txt" "$delivery_dir/android-notices.txt"
(
    cd -- "$delivery_dir"
    sha256sum -- *.apk *.tar.gz *.jar > SHA256SUMS
)
