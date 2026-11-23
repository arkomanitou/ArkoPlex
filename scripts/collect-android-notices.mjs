import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const store = path.join(root, 'node_modules/.pnpm');
const packages = [];
for (const entry of await readdir(store)) {
    const modules = path.join(store, entry, 'node_modules');
    let names;
    try { names = await readdir(modules); } catch { continue; }
    for (const name of names) {
        const dirs = name.startsWith('@') ? (await readdir(path.join(modules, name))).map((n) => path.join(name, n)) : [name];
        for (const dir of dirs) {
            const packageDir = path.join(modules, dir);
            let pkg;
            try { pkg = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8')); } catch { continue; }
            const id = `${pkg.name}@${pkg.version}`;
            if (packages.some((p) => p.id === id)) continue;
            const texts = [];
            for (const file of await readdir(packageDir)) {
                if (/^(license|licence|copying|notice)(\..*)?$/i.test(file)) {
                    try { texts.push(await readFile(path.join(packageDir, file), 'utf8')); } catch { /* Directory */ }
                }
            }
            packages.push({ id, text: `${id}\nLicence déclarée : ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license) || 'Voir les sources du paquet'}\n${texts.join('\n')}` });
        }
    }
}
let text = `ArkoPlex Android 0.1.0-android.1\nClient dérivé de Pelagica — GPLv3. Auteurs et contributeurs des dépôts ArkoPlex et Pelagica.\nSources : https://github.com/arkomanitou/ArkoPlex (branche feature/android-libvlc).\nLibVLC Android 3.7.8 — Copyright VLC authors et VideoLAN — LGPL 2.1 ou ultérieure.\nSources JNI : https://code.videolan.org/videolan/libvlcjni (0c32e70aff29b01a67f5c734f9f7fd72070bbe7b).\nSources VLC : https://code.videolan.org/videolan/vlc (84177b2273abc5c4300234e6e18b55a4d2dd5a03).\nAndroidX et Kotlin : Apache 2.0. libc++ : Apache 2.0 avec exception LLVM.\nCapacitor 8.6.2 : MIT, Copyright Drifty Co.\nLes licences et notices des dépendances du workspace installé suivent (y compris certains outils de compilation).\n\n`;
for (const file of (await readdir(path.join(root, 'docs/android/licenses'))).sort()) text += `\n===== ${file} =====\n${await readFile(path.join(root, 'docs/android/licenses', file), 'utf8')}\n`;
for (const pkg of packages.sort((a, b) => a.id.localeCompare(b.id))) text += `\n===== ${pkg.id} =====\n${pkg.text}\n`;
await mkdir(path.join(root, 'frontend/android/app/src/main/assets'), { recursive: true });
await writeFile(path.join(root, 'frontend/android/app/src/main/assets/android-notices.txt'), text);
console.log(`Notices générées : ${packages.length} paquets, ${text.length} caractères.`);
