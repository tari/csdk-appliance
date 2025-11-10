#!/bin/sh

DAEMON="buildserver"
PIDFILE="/var/run/$DAEMON.pid"

COMMS=/dev/ttyS1
ARGS="$COMMS /9pfs --logfile /dev/console"

# shellcheck source=/dev/null
[ -r "/etc/default/$DAEMON" ] && . "/etc/default/$DAEMON"

start() {
        printf 'Starting %s: ' "$DAEMON"
        stty -F "$COMMS" raw -echo 115200
        # shellcheck disable=SC2086 # we need the word splitting
        start-stop-daemon --start --background --make-pidfile \
                --pidfile "$PIDFILE" --exec "/usr/bin/$DAEMON" \
                -- $ARGS
        status=$?
        if [ "$status" -eq 0 ]; then
                echo "OK"
        else
                echo "FAIL"
        fi
        return "$status"
}

stop() {
        printf 'Stopping %s: ' "$DAEMON"
        start-stop-daemon --stop --pidfile "$PIDFILE" --exec "/usr/bin/$DAEMON"
        status=$?
        if [ "$status" -eq 0 ]; then
                echo "OK"
        else
                echo "FAIL"
                return "$status"
        fi
        while start-stop-daemon --stop --test --quiet --pidfile "$PIDFILE" \
                --exec "/usr/bin/$DAEMON"; do
                sleep 0.1
        done
        rm -f "$PIDFILE"
        return "$status"
}

restart() {
        stop
        start
}

case "$1" in
        start|stop|restart)
                "$1";;
        reload)
                # Restart, since there is no true "reload" feature.
                restart;;
        *)
                echo "Usage: $0 {start|stop|restart|reload}"
                exit 1
esac