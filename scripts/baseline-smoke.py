#!/usr/bin/env python3
"""Start built artifacts locally, verify HTTP/API, and stop all child processes.

No Jellyfin connection. The optional studios download is replaced with a local
503 response. Consent is denied; all runtime state is in a temporary directory.
This uses Vite preview, NOT the production Nginx/Docker configuration.
"""
import contextlib
import http.server
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
API = 'http://127.0.0.1:4321'
WEB = 'http://127.0.0.1:3410'


class Fixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_error(503, 'Optional studios database intentionally unavailable')

    def log_message(self, *args):
        pass


def request(url, *, method='GET', data=None):
    req = urllib.request.Request(url, method=method, data=data)
    try:
        with urllib.request.urlopen(req, timeout=4) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


def ready(url, process):
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f'Process exited with {process.returncode}: {url}')
        try:
            if request(url)[0] == 200:
                return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.2)
    raise TimeoutError(f'Service not ready: {url}')


def main():
    os.chdir(ROOT)
    if not Path('.baseline/server').is_file() or not Path('frontend/dist/index.html').is_file():
        raise SystemExit('Run scripts/baseline-build.sh first')
    # Fail safely instead of testing an unrelated service on the fixed ports.
    import socket
    for port in (4321, 3410):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    processes = []
    results = []
    Path('.baseline').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='arkoplex-baseline-') as tmp, contextlib.ExitStack() as stack:
        fixture = stack.enter_context(http.server.ThreadingHTTPServer(('127.0.0.1', 0), Fixture))
        threading.Thread(target=fixture.serve_forever, daemon=True).start()
        env = dict(os.environ)
        env.update({
            'PORT': '4321', 'ENABLE_AUTH': 'true', 'SERVER_ADDRESS': '',
            'APP_VERSION': '4.15.0', 'COLLECTOR_STATS_CONSENT': 'false',
            'COLLECTOR_PING_TOKEN': '', 'COLLECTOR_PING_BASE_URL': f'http://127.0.0.1:{fixture.server_port}',
            'COLLECTOR_INSTANCE_ID_FILE': f'{tmp}/instance-id',
            'COLLECTOR_STATS_CONSENT_FILE': f'{tmp}/stats-consent',
            'STUDIOS_DB_RELEASES_URL': f'http://127.0.0.1:{fixture.server_port}/studios-disabled',
            'STUDIOS_DB_DIR': f'{tmp}/studios', 'SERVERS_DIR': f'{tmp}/servers',
            'DEFAULT_THEME_PATH': str(ROOT / 'backend/default.theme.json'),
            'LOG_FILE': f'{tmp}/backend.log', 'LOG_LEVEL': 'info',
        })
        try:
            backend_log = stack.enter_context(open('.baseline/backend-smoke.log', 'w'))
            web_log = stack.enter_context(open('.baseline/frontend-smoke.log', 'w'))
            backend = subprocess.Popen([str(ROOT / '.baseline/server')], cwd=ROOT, env=env,
                                       stdout=backend_log, stderr=subprocess.STDOUT, start_new_session=True)
            processes.append(backend)
            ready(API + '/api/server-address', backend)
            web = subprocess.Popen([os.environ.get('PNPM_BIN', 'pnpm'), '--filter', 'pelagica',
                                    'exec', 'vite', 'preview', '--host', '127.0.0.1',
                                    '--port', '3410', '--strictPort'], cwd=ROOT,
                                   stdout=web_log, stderr=subprocess.STDOUT, start_new_session=True)
            processes.append(web)
            ready(WEB + '/login', web)

            def check(name, condition):
                if not condition:
                    raise AssertionError(name)
                results.append({'name': name, 'status': 'PASS'})
                print('PASS', name, flush=True)

            status, body, _ = request(WEB + '/login')
            check('Built SPA served on /login', status == 200 and b'id="root"' in body)
            check('Built SPA fallback on /library', request(WEB + '/library')[0] == 200)
            status, body, _ = request(API + '/api/server-address')
            check('Go backend responds without configured Jellyfin', status == 200 and json.loads(body) == {'serverAddress': ''})
            status, body, _ = request(WEB + '/api/server-address')
            check('Vite preview forwards /api to Go', status == 200 and json.loads(body) == {'serverAddress': ''})
            status, body, _ = request(WEB + '/api/config')
            check('Legacy config endpoint responds', status == 200 and isinstance(json.loads(body), dict))
            status, body, _ = request(WEB + '/api/stats-consent')
            check('Statistics consent is denied', status == 200 and json.loads(body) == {'consent': 2})
            status, body, _ = request(WEB + '/api/themes?jellyfin_url=https%3A%2F%2Fbaseline.invalid')
            check('Themes API initializes isolated local storage', status == 200 and isinstance(json.loads(body), list))
            status, body, _ = request(WEB + '/api/themes', method='POST', data=b'{}')
            check('Unauthenticated theme mutation is rejected', status == 403)

            Path('.baseline/smoke-results.json').write_text(json.dumps(results, indent=2) + '\n')
            # Optional real-browser checks, run only when Playwright is available.
            if os.environ.get('BASELINE_BROWSER_CHECK') == '1':
                subprocess.run(['node', 'scripts/baseline-browser.cjs', WEB], cwd=ROOT, check=True)
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    with contextlib.suppress(ProcessLookupError):
                        os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        with contextlib.suppress(ProcessLookupError):
                            os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
            fixture.shutdown()


if __name__ == '__main__':
    main()
