#!/bin/zsh
#
# One command to run the live demo: starts FlightGear with the flags the bridge
# needs, waits for it to answer, then starts the bridge.
#
#   ./run-live.sh                      # default aircraft, 6 G capable
#   ./run-live.sh --aircraft f16       # pick another aircraft
#   ./run-live.sh --print              # don't touch the Arduino, just print G
#   ./run-live.sh --smoothing 0.6      # anything else is passed to bridge.py
#
# Ctrl+C once stops both FlightGear and the bridge.
#
# Flags used below are from the FlightGear command-line docs:
#   --httpd=PORT   turns on the built-in web server the bridge reads G from
#   --altitude=FT  starts in the air (it implies --in-air)
#   --vc=KNOTS     initial airspeed, so we don't stall the moment we spawn
#
set -u
setopt null_glob   # an unmatched /Volumes/FlightGear* must expand to nothing, not error
cd "$(dirname "$0")"
mkdir -p logs   # gitignored, so absent on a fresh clone

# ---- settings you might change -------------------------------------------
# The c172p tops out around 4 G, so a 6 G squeeze can never happen in one.
# This needs an aircraft that can actually pull 6+ G.
AIRCRAFT="${AIRCRAFT:-f16}"
AIRPORT="${AIRPORT:-KSFO}"
ALTITUDE="${ALTITUDE:-10000}"     # feet
SPEED="${SPEED:-350}"             # knots
FG_HTTP_PORT="${FG_HTTP_PORT:-5400}"
# --------------------------------------------------------------------------

# Let "--aircraft X" on our own command line override the default, and pass
# everything else straight through to bridge.py.
BRIDGE_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --aircraft) AIRCRAFT="$2"; shift 2 ;;
    --aircraft=*) AIRCRAFT="${1#*=}"; shift ;;
    *) BRIDGE_ARGS+=("$1"); shift ;;
  esac
done

# ---- find FlightGear -----------------------------------------------------
FGFS=""
for candidate in \
  "${FGFS_BIN:-}" \
  /Applications/FlightGear.app/Contents/MacOS/FlightGear \
  /Applications/FlightGear.app/Contents/MacOS/fgfs \
  /Volumes/FlightGear*/FlightGear.app/Contents/MacOS/FlightGear \
  "$(command -v fgfs 2>/dev/null)"
do
  [[ -n "$candidate" && -x "$candidate" ]] && { FGFS="$candidate"; break; }
done

if [[ -z "$FGFS" ]]; then
  echo "Can't find FlightGear."
  echo "Install it to /Applications (don't just run it from the .dmg - the disk"
  echo "image is read-only and unmounts), or set FGFS_BIN to the binary."
  echo
  echo "No sim? The demo does not need one:  .venv/bin/python bridge.py --demo"
  exit 1
fi
echo "FlightGear: $FGFS"

# ---- check the scenery/aircraft data is actually there -------------------
# FlightGear is useless without fgdata, and on this machine the download was
# still unfinished, which looks exactly like "the sim won't start".
FG_ROOT="${FG_ROOT:-}"
if [[ -z "$FG_ROOT" ]]; then
  for d in \
    "$HOME/Library/Application Support/FlightGear"/fgdata* \
    /Applications/FlightGear.app/Contents/Resources/data \
    /usr/share/games/flightgear
  do
    [[ -d "$d" && -d "$d/Aircraft" ]] && { FG_ROOT="$d"; break; }
  done
fi

if [[ -z "$FG_ROOT" ]]; then
  echo
  echo "WARNING: no finished fgdata (aircraft + scenery) found."
  echo "Open the FlightGear launcher once and let the data download finish, then"
  echo "re-run this. Set FG_ROOT if your copy lives somewhere unusual."
  echo "Starting anyway in case FlightGear can find it itself..."
  FG_ARGS=()
else
  echo "fgdata:     $FG_ROOT"
  if [[ ! -d "$FG_ROOT/Aircraft/$AIRCRAFT" ]]; then
    echo
    echo "WARNING: aircraft '$AIRCRAFT' is not installed in $FG_ROOT/Aircraft."
    echo "Install it from the launcher's aircraft list, or pass --aircraft with"
    echo "one you do have. Remember it must be able to pull 6+ G."
  fi
  FG_ARGS=(--fg-root="$FG_ROOT")
fi

# ---- start FlightGear ----------------------------------------------------
echo
echo "Starting FlightGear: $AIRCRAFT at $AIRPORT, ${ALTITUDE} ft, ${SPEED} kt"
"$FGFS" \
  "${FG_ARGS[@]}" \
  --httpd="$FG_HTTP_PORT" \
  --aircraft="$AIRCRAFT" \
  --airport="$AIRPORT" \
  --altitude="$ALTITUDE" \
  --vc="$SPEED" \
  --timeofday=noon \
  >logs/flightgear-launch.log 2>&1 &
FG_PID=$!

# Stop both halves on Ctrl+C, and never leave FlightGear running headless.
CLEANED=0
cleanup() {
  [[ "$CLEANED" == 1 ]] && return      # we trap INT and EXIT; only tidy up once
  CLEANED=1
  echo
  echo "Shutting down..."
  kill "$FG_PID" 2>/dev/null
  for i in 1 2 3 4 5; do
    kill -0 "$FG_PID" 2>/dev/null || break
    sleep 1
  done
  kill -9 "$FG_PID" 2>/dev/null   # still there? insist
  wait "$FG_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# ---- wait for the web server to answer -----------------------------------
echo -n "Waiting for FlightGear's web server on port $FG_HTTP_PORT"
for i in $(seq 1 120); do
  if ! kill -0 "$FG_PID" 2>/dev/null; then
    echo
    echo "FlightGear quit before it was ready. Last lines of its log:"
    tail -20 logs/flightgear-launch.log
    exit 1
  fi
  CODE=$(curl -sS -m 1 -o /dev/null -w "%{http_code}" \
           "http://localhost:$FG_HTTP_PORT/json/sim/time/elapsed-sec" 2>/dev/null || echo 000)
  if [[ "$CODE" != 000 ]]; then        # any HTTP reply means the server is listening
    echo " - up."
    break
  fi
  echo -n "."
  sleep 1
done

# ---- hand over to the bridge ---------------------------------------------
echo
echo "Starting the bridge. Fly, pull some G, and the cuff should squeeze."
echo "(Press ENTER in this terminal for a 6 G spike, Ctrl+C to stop everything.)"
echo
.venv/bin/python -u bridge.py --live --fg-port "$FG_HTTP_PORT" "${BRIDGE_ARGS[@]}"
