#!/usr/bin/env python3
"""Test a locally built image on an ephemeral internal Docker network.

Only names created by this invocation are cleaned up. No persistent volumes,
no external services, no image push, no deployment and no Docker pruning.
"""
import argparse
import base64
import email.message
import http.cookies
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = 'https://demo.example.invalid'
PROBE_CONTAINER = ''


def docker(*args, check=True):
    return subprocess.run(['docker', *args], check=check, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def inspect(name):
    return json.loads(docker('inspect', name).stdout)[0]


PROBE_SCRIPT = r'''
import base64, json, sys, urllib.request, urllib.error
url, method, headers, body, has_body = sys.argv[1:]
req = urllib.request.Request(url, method=method, headers=json.loads(headers),
    data=base64.b64decode(body) if has_body == '1' else None)
try:
    response = urllib.request.urlopen(req, timeout=5)
except urllib.error.HTTPError as error:
    response = error
with response:
    print(json.dumps({'status': response.status,
        'body': base64.b64encode(response.read()).decode(),
        'headers': list(response.headers.items())}))
'''


def request(url, *, data=None, headers=None, method='GET'):
    # Probe from inside the internal network; no host ports or Docker socket
    # need to be exposed to any test container.
    result = docker('exec', PROBE_CONTAINER, 'python', '-c', PROBE_SCRIPT,
                    url, method, json.dumps(headers or {}),
                    base64.b64encode(data or b'').decode(),
                    '1' if data is not None else '0', check=False)
    if result.returncode:
        raise OSError(result.stderr)
    payload = json.loads(result.stdout)
    response_headers = email.message.Message()
    for key, value in payload['headers']:
        response_headers[key] = value
    return payload['status'], base64.b64decode(payload['body']), response_headers


def ready(url, name):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if not inspect(name)['State']['Running']:
            raise RuntimeError('Container exited during startup: ' + name)
        try:
            if request(url)[0] == 200:
                return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.25)
    raise TimeoutError('Container not ready: ' + name)


def session_cookies(headers):
    result = {}
    for value in headers.get_all('Set-Cookie', []):
        cookie = http.cookies.SimpleCookie(value)
        morsel = cookie.get('seer_session')
        if morsel:
            result[morsel['path']] = morsel
    return result


def main():
    global PROBE_CONTAINER
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--base-path', default='')
    options = parser.parse_args()
    base = options.base_path
    label = 'arkoplex-ci-' + uuid.uuid4().hex[:12]
    network = label + '-network'
    fixture = label + '-fixture'
    containers = []
    created_network = False
    checks = []

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        checks.append(name)
        print('PASS ' + name, flush=True)

    try:
        # Pull before isolating the test network; fixture never needs Internet.
        docker('pull', 'python:3.13-alpine')
        docker('network', 'create', '--internal', '--label', 'arkoplex.ci=' + label, network)
        created_network = True
        with tempfile.TemporaryDirectory(prefix='arkoplex-ci-config-') as tmp:
            config = Path(tmp, 'config.json')
            config.write_text(json.dumps({'seerrUrl': 'http://fixture:8080/seerr'}))
            config.chmod(0o644)
            docker('run', '-d', '--name', fixture, '--label', 'arkoplex.ci=' + label,
                   '--network', network, '--network-alias', 'fixture',
                   '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                   '--mount',
                   'type=bind,src=' + str(ROOT / 'scripts/docker-fixture.py') + ',dst=/fixture.py,readonly',
                   'python:3.13-alpine', 'python', '-B', '/fixture.py')
            containers.append(fixture)
            PROBE_CONTAINER = fixture
            fixture_url = 'http://fixture:8080'
            ready(fixture_url + '/calls', fixture)

            def start_app(suffix, origin):
                name = label + '-' + suffix
                args = ['run', '-d', '--name', name, '--label', 'arkoplex.ci=' + label,
                        '--network', network, '--tmpfs', '/config:rw,size=64m',
                        '--mount', 'type=bind,src=' + str(config) + ',dst=/tmp/fixture-config.json,readonly',
                        '-e', 'ARKOPLEX_CONFIG_PATH=/tmp/fixture-config.json',
                        '-e', 'SERVER_ADDRESS=http://fixture:8080/jellyfin',
                        '-e', 'STUDIOS_DB_RELEASES_URL=http://fixture:8080/studios-disabled',
                        '-e', 'COLLECTOR_STATS_CONSENT=false',
                        '-e', 'ARKOPLEX_PUBLIC_ORIGIN=' + origin, options.image]
                docker(*args)
                containers.append(name)
                url = 'http://' + name + ':80'
                ready(url + '/health', name)
                return name, url

            app, url = start_app('https', ORIGIN)
            check('Internal test network publishes no host ports', not inspect(app)['HostConfig'].get('PortBindings') and not inspect(fixture)['HostConfig'].get('PortBindings'))
            status, body, headers = request(url + base + '/login')
            check('Production SPA serves login under configured prefix', status == 200 and b'id="root"' in body)
            for path in [base + '/login', base + '/api/health', base + '/missing.js', base + '/api/missing.css']:
                status, _, headers = request(url + path)
                check('Security headers on ' + path,
                      headers.get('X-Content-Type-Options') == 'nosniff'
                      and headers.get('X-Frame-Options') == 'SAMEORIGIN'
                      and headers.get('Referrer-Policy') == 'strict-origin-when-cross-origin')
                if path.endswith('/api/missing.css'):
                    check('API routes with static extensions bypass immutable asset caching',
                          status == 404 and headers.get('Cache-Control') == 'no-store')
            if base:
                check('Prefixed build does not serve its SPA at root', request(url + '/')[0] != 200)
            status, _, headers = request(url + base + '/api/health')
            check('API responses disable caching', status == 200 and headers.get('Cache-Control') == 'no-store')
            health_deadline = time.monotonic() + 35
            while time.monotonic() < health_deadline and inspect(app)['State']['Health']['Status'] != 'healthy':
                time.sleep(0.5)
            check('Docker healthcheck succeeds', inspect(app)['State']['Health']['Status'] == 'healthy')
            ip = inspect(app)['NetworkSettings']['Networks'][network]['IPAddress']
            probe = docker('exec', app, 'wget', '-q', '-T', '2', '-O', '-', 'http://' + ip + ':4321/api/health', check=False)
            check('Backend listens only on container loopback', probe.returncode != 0)
            license_text = docker('exec', app, 'cat', '/usr/share/licenses/arkoplex/LICENSE').stdout
            check('Distributed image contains GPL license', 'GNU GENERAL PUBLIC LICENSE' in license_text)
            cookie_path = base + '/api/seerr'
            login_url = url + base + '/api/seerr/login'
            payload = b'{"username":"fixture","password":"fixture"}'
            good_headers = {'Origin': ORIGIN, 'Content-Type': 'application/json', 'X-ArkoPlex-Request': '1'}
            before_calls = request(fixture_url + '/calls')[1]
            for scenario, extra, expected in [
                ('other-origin', {'Origin': 'https://evil.example.invalid'}, 403),
                ('null-origin', {'Origin': 'null'}, 403),
                ('missing-custom-header', {'X-ArkoPlex-Request': ''}, 403),
                ('cross-site', {'Sec-Fetch-Site': 'cross-site'}, 403),
                ('forwarded-spoof', {'Origin': 'https://evil.example.invalid',
                                     'X-Forwarded-Host': 'evil.example.invalid', 'X-Forwarded-Proto': 'https',
                                     'Forwarded': 'host=evil.example.invalid;proto=https'}, 403),
                ('simple-form', {'Content-Type': 'application/x-www-form-urlencoded'}, 415),
            ]:
                status, _, _ = request(login_url, method='POST', data=payload, headers=good_headers | extra)
                check('Seerr rejects ' + scenario, status == expected)
            check('Refused mutations never contact Seerr', request(fixture_url + '/calls')[1] == before_calls)
            status, _, headers = request(login_url, method='POST', data=payload, headers=good_headers)
            cookies = session_cookies(headers)
            cookie = cookies.get(cookie_path)
            check('HTTPS Seerr login sets scoped host-only Secure HttpOnly SameSite cookie',
                  status == 200 and cookie is not None and cookie.value == 'fixture-session'
                  and cookie['secure'] and cookie['httponly'] and cookie['samesite'].lower() == 'lax'
                  and not cookie['domain'])
            with_session = good_headers | {'Cookie': 'seer_session=fixture-session'}
            status, body, _ = request(url + base + '/api/seerr/status', headers=with_session)
            check('Seerr session is relayed using connect.sid', status == 200 and json.loads(body)['loggedIn'])
            status, body, headers = request(url + base + '/api/seerr/requests?requestedBy=999', headers=with_session)
            check('Own requests are scoped by verified Seerr identity through nginx', status == 200 and json.loads(body)['results'] == [] and headers.get('Cache-Control') == 'no-store')
            status, _, _ = request(url + base + '/api/seerr/requests')
            check('Own requests require a Seerr session', status == 401)
            status, _, _ = request(url + base + '/discover')
            check('Discovery route serves the application shell', status == 200)
            status, _, _ = request(url + base + '/api/seerr/request', method='POST', data=b'{"mediaType":"movie","mediaId":1}', headers=with_session)
            check('Same-origin Seerr requests retain downstream session permissions', status == 201)
            status, _, headers = request(url + base + '/api/seerr/logout', method='POST', headers=with_session)
            cookies = session_cookies(headers)
            check('Logout expires current and legacy cookie paths', status == 204 and cookie_path in cookies and '/api/seerr' in cookies
                  and all(m['max-age'] == '0' and m['secure'] for m in cookies.values()))
            status, _, headers = request(url + base + '/api/seerr/quickconnect/authenticate', method='POST', data=b'{"secret":"fixture-secret"}', headers=good_headers)
            check('Quick Connect uses the same HTTPS cookie policy', status == 200 and session_cookies(headers)[cookie_path]['secure'])
            status, _, headers = request(login_url, method='OPTIONS', headers={
                'Origin': 'https://evil.example.invalid', 'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'X-ArkoPlex-Request'})
            check('Cross-origin preflight gets no CORS grant', not headers.get('Access-Control-Allow-Origin') and not headers.get('Access-Control-Allow-Headers'))
            # The image must also preserve local HTTP behavior without trusting proxy headers.
            http_app, http_url = start_app('http', '')
            status, _, headers = request(http_url + base + '/api/seerr/login', method='POST', data=payload,
                                         headers=good_headers | {'Origin': 'http://localhost:8800', 'Host': 'localhost:8800', 'X-Forwarded-Proto': 'https'})
            cookie = session_cookies(headers).get(cookie_path)
            check('Local HTTP login retains port and ignores forwarded HTTPS', status == 200 and cookie is not None and not cookie['secure'])
            # Exercise lifecycle only on containers created by this test.
            docker('exec', app, 'sh', '-c', 'kill -TERM "$(pidof server)"')
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline and inspect(app)['State']['Running']:
                time.sleep(0.25)
            check('Backend failure stops the entire app container', not inspect(app)['State']['Running'] and inspect(app)['State']['ExitCode'] == 1)
            docker('stop', '--time', '10', http_app)
            check('SIGTERM stops both processes without forced kill', inspect(http_app)['State']['ExitCode'] == 0)
            print(json.dumps({'image': options.image, 'base_path': base, 'checks_passed': len(checks)}, indent=2))
    finally:
        for name in reversed(containers):
            metadata = inspect(name)
            if metadata['Config'].get('Labels', {}).get('arkoplex.ci') == label:
                logs = docker('logs', '--tail', '25', name, check=False)
                print('Container logs for ' + name + ':\n' + logs.stdout + logs.stderr)
                docker('rm', '-f', name, check=False)
        if created_network:
            docker('network', 'rm', network, check=False)


if __name__ == '__main__':
    main()
