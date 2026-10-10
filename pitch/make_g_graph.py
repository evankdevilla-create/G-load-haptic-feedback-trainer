"""Turn a bridge log (bridge/logs/run-*.csv) into a G-vs-time graph for the Devpost.

    python3 pitch/make_g_graph.py bridge/logs/run-XXXX.csv --start 97.8 --length 98.3 --out pitch/g-graph.html \
        --subtitle "What the bridge sent to the cuff during one loop of our cockpit sim's route"

Then turn the HTML into a PNG with Chrome:

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
        --window-size=1200,640 --force-device-scale-factor=2 --screenshot=pitch/g-graph.png pitch/g-graph.html

Plots the g_sent column (the value actually sent to the Arduino). Standard library only.
"""
import argparse
import csv
import html

W, H = 1200, 640
LEFT, RIGHT, TOP, BOTTOM = 72, 40, 112, 84
G_MAX = 6.5

parser = argparse.ArgumentParser()
parser.add_argument("csv")
parser.add_argument("--start", type=float, default=None, help="seconds into the log to start from")
parser.add_argument("--length", type=float, default=None, help="seconds to plot")
parser.add_argument("--out", default="g-graph.html")
parser.add_argument("--title", default="G-load sent to the cuff")
parser.add_argument("--subtitle", default="")
parser.add_argument("--note", default="")
args = parser.parse_args()

rows = [(float(r["time_s"]), float(r["g_sent"])) for r in csv.DictReader(open(args.csv))]
t0 = rows[0][0] if args.start is None else args.start
t1 = rows[-1][0] if args.length is None else t0 + args.length
pts = [(t - t0, g) for t, g in rows if t0 <= t <= t1]
span = t1 - t0

def x(t): return LEFT + t / span * (W - LEFT - RIGHT)
def y(g): return TOP + (1 - g / G_MAX) * (H - TOP - BOTTOM)

# Label each sustained plateau (held >= 3 s at >= 1.9 G) once, at its middle.
labels, run = [], []
for t, g in pts + [(span + 1, 0.0)]:
    if run and abs(g - run[0][1]) < 0.06 and g >= 1.9:
        run.append((t, g))
        continue
    if run and run[-1][0] - run[0][0] >= 3:
        labels.append(((run[0][0] + run[-1][0]) / 2, run[0][1]))
    run = [(t, g)] if g >= 1.9 else []

grid = "".join(
    f'<line x1="{LEFT}" x2="{W - RIGHT}" y1="{y(g):.1f}" y2="{y(g):.1f}" class="{"base" if g == 0 else "grid"}"/>'
    f'<text x="{LEFT - 12}" y="{y(g) + 4:.1f}" class="tick" text-anchor="end">{g} G</text>'
    for g in range(0, 7))
step = 10 if span > 40 else 5
xticks = "".join(
    f'<text x="{x(s):.1f}" y="{H - BOTTOM + 24}" class="tick" text-anchor="middle">{s}</text>'
    for s in range(0, int(span) + 1, step))
path = "M" + " L".join(f"{x(t):.1f},{y(g):.1f}" for t, g in pts)
plateaus = "".join(
    f'<text x="{x(t):.1f}" y="{y(g) - 12:.1f}" class="label" text-anchor="middle">{g:.0f} G</text>'
    for t, g in labels)

page = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{html.escape(args.title)}</title>
<style>
  html, body {{ margin: 0; background: #fcfcfb; }}
  svg {{ display: block; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }}
  .title {{ font-size: 24px; font-weight: 600; fill: #0b0b0b; }}
  .subtitle {{ font-size: 15px; fill: #52514e; }}
  .tick {{ font-size: 13px; fill: #898781; font-variant-numeric: tabular-nums; }}
  .axis-title {{ font-size: 13px; fill: #52514e; }}
  .label {{ font-size: 14px; font-weight: 600; fill: #0b0b0b; }}
  .note {{ font-size: 12px; fill: #898781; }}
  .grid {{ stroke: #e1e0d9; stroke-width: 1; }}
  .base {{ stroke: #c3c2b7; stroke-width: 1; }}
  .series {{ fill: none; stroke: #2a78d6; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }}
</style></head>
<body>
<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{html.escape(args.title)}">
  <text x="{LEFT - 40}" y="42" class="title">{html.escape(args.title)}</text>
  <text x="{LEFT - 40}" y="70" class="subtitle">{html.escape(args.subtitle)}</text>
  {grid}
  {xticks}
  <text x="{(LEFT + W - RIGHT) / 2:.1f}" y="{H - BOTTOM + 50}" class="axis-title" text-anchor="middle">seconds</text>
  <path d="{path}" class="series"/>
  {plateaus}
  <text x="{LEFT - 40}" y="{H - 14}" class="note">{html.escape(args.note)}</text>
</svg>
</body></html>
"""
open(args.out, "w").write(page)
print(f"wrote {args.out}: {len(pts)} points over {span:.1f} s, labelled plateaus {[f'{g:.0f} G' for _, g in labels]}")
