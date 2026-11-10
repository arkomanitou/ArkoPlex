#!/bin/sh
set -eu

/server &
backend_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

stop_children() {
    kill -TERM "$backend_pid" 2>/dev/null || true
    kill -QUIT "$nginx_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
    wait "$nginx_pid" 2>/dev/null || true
}
trap 'stop_children; exit 0' TERM INT QUIT

# Exit if either service dies, so a restart policy can recover the whole app.
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
    sleep 1 &
    wait $! || true
done
stop_children
exit 1
