#!/bin/bash
# LLM Wiki Server Manager
# Usage: ./llm-wiki-server.sh {start|stop|status|restart}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
PORT=1420
HOST=127.0.0.1
PID_FILE="/tmp/llm-wiki-server.pid"

get_pid() {
    if [ -f "$PID_FILE" ]; then
        cat "$PID_FILE" 2>/dev/null
    fi
}

is_running() {
    local pid=$(get_pid)
    if [ -n "$pid" ]; then
        ps -p "$pid" > /dev/null 2>&1
        return $?
    fi
    return 1
}

start_server() {
    if is_running; then
        echo "LLM Wiki server is already running at http://$HOST:$PORT"
        echo "PID: $(get_pid)"
        return 0
    fi

    if [ ! -d "$DIST_DIR" ]; then
        echo "Error: dist directory not found at $DIST_DIR"
        echo "Please build the project first: npm run build"
        exit 1
    fi

    # Check if port is in use
    if lsof -i :$PORT > /dev/null 2>&1; then
        echo "Port $PORT is already in use. Stopping existing process..."
        stop_server
        sleep 2
    fi

    echo "Starting LLM Wiki server..."
    cd "$DIST_DIR" || exit 1
    python3 -m http.server $PORT --bind $HOST > /tmp/llm-wiki-server.log 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"

    sleep 2

    if is_running; then
        echo "✓ LLM Wiki server started successfully!"
        echo "  URL: http://$HOST:$PORT"
        echo "  PID: $pid"
        echo "  Log: /tmp/llm-wiki-server.log"
    else
        echo "✗ Failed to start server"
        rm -f "$PID_FILE"
        exit 1
    fi
}

stop_server() {
    if ! is_running; then
        echo "LLM Wiki server is not running"
        rm -f "$PID_FILE"
        return 0
    fi

    local pid=$(get_pid)
    echo "Stopping LLM Wiki server (PID: $pid)..."
    kill "$pid" 2>/dev/null

    # Wait for process to stop
    for i in {1..10}; do
        if ! ps -p "$pid" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    # Force kill if still running
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "Force killing process..."
        kill -9 "$pid" 2>/dev/null
    fi

    rm -f "$PID_FILE"
    echo "✓ LLM Wiki server stopped"
}

status_server() {
    if is_running; then
        local pid=$(get_pid)
        echo "✓ LLM Wiki server is running"
        echo "  URL: http://$HOST:$PORT"
        echo "  PID: $pid"
        echo "  Uptime: $(ps -p "$pid" -o etime= 2>/dev/null)"
        echo "  Log: /tmp/llm-wiki-server.log"
    else
        echo "✗ LLM Wiki server is not running"
        rm -f "$PID_FILE" 2>/dev/null
    fi
}

restart_server() {
    stop_server
    sleep 2
    start_server
}

case "${1:-status}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    status)
        status_server
        ;;
    restart)
        restart_server
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac
