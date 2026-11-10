#!/usr/bin/env python3
"""Ephemeral Jellyfin/Seerr fixture, used only on the CI's internal network."""
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading

calls = Counter()
lock = threading.Lock()


class Fixture(BaseHTTPRequestHandler):
    def reply(self, status, value=None, *, session=False):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        if session:
            self.send_header('Set-Cookie', 'connect.sid=fixture-session; Path=/; HttpOnly; SameSite=Lax')
        self.end_headers()
        if value is not None:
            self.wfile.write(json.dumps(value).encode())

    def do_GET(self):
        if self.path == '/calls':
            with lock:
                self.reply(200, dict(calls))
            return
        if self.path == '/studios-disabled':
            self.reply(503, {})
        elif self.path == '/jellyfin/Users/Me':
            self.reply(200, {'Id': 'fixture-user', 'Policy': {'IsAdministrator': False}})
        elif self.path == '/seerr/api/v1/auth/me':
            valid = self.headers.get('Cookie') == 'connect.sid=fixture-session'
            self.reply(200 if valid else 401, {'id': 1} if valid else {})
        else:
            self.reply(404, {})

    def do_POST(self):
        with lock:
            calls[self.path] += 1
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        data = json.loads(body) if body else {}
        if self.path == '/seerr/api/v1/auth/jellyfin':
            valid = data == {'username': 'fixture', 'password': 'fixture'}
            self.reply(200 if valid else 401, {'id': 1} if valid else {}, session=valid)
        elif self.path == '/seerr/api/v1/auth/jellyfin/quickconnect/initiate':
            self.reply(200, {'code': 'FIXTURE', 'secret': 'fixture-secret'})
        elif self.path == '/seerr/api/v1/auth/jellyfin/quickconnect/authenticate':
            valid = data == {'secret': 'fixture-secret'}
            self.reply(200 if valid else 401, {'id': 1} if valid else {}, session=valid)
        elif self.path == '/seerr/api/v1/request':
            valid = self.headers.get('Cookie') == 'connect.sid=fixture-session'
            self.reply(201 if valid else 401, {'id': 1} if valid else {})
        elif self.path == '/seerr/api/v1/auth/logout':
            self.reply(204)
        else:
            self.reply(404, {})

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), Fixture).serve_forever()
