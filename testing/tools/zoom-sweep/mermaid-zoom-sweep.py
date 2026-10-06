#!/usr/bin/env python3
"""Zoom sweep: render Mermaid diagram families in WebKitGTK and report any
geometry that stops scaling uniformly under webview page zoom.

Read-only diagnostic for the app's zoom pipeline — see README.md next to this
script for how to interpret the output and what the known engine quirks are.
"""

import json
import os
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MERMAID_JS = os.path.join(REPO_ROOT, "node_modules", "mermaid", "dist", "mermaid.min.js")
OUT_DIR = "/tmp/mermaid-zoom-sweep"
ZOOMS = [1.0, 1.5, 2.0, 3.0]
DRIFT_TOLERANCE = 2.0

DIAGRAMS = {
    "flowchart": "flowchart TD\n  A[Start here] --> B{Decision point}\n  B -->|Yes path| C[End now]\n  B -->|No path| D[Retry loop]",
    "sequence": "sequenceDiagram\n  Alice->>Bob: Hello Bob\n  Note over Alice,Bob: A shared note\n  activate Alice\n  loop every minute\n    Alice->>Bob: Ping\n  end\n  deactivate Alice\n  Bob-->>Alice: Hi",
    "class": "classDiagram\n  class Animal {\n    +String name\n    +makeSound()\n  }\n  Animal <|-- Dog",
    "state": "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: work\n  Busy --> [*]: done",
    "journey": "journey\n  title My day\n  section Work\n    Write code: 5: Me\n    Review: 3: Me, Team",
    "pie": "pie title Pets\n  \"Dogs\": 10\n  \"Cats\": 5",
    "gantt": "gantt\n  title Plan\n  section A\n  Task one :a1, 2024-01-01, 30d\n  Task two :a2, after a1, 20d",
    "er": "erDiagram\n  CUSTOMER ||--o{ ORDER : places",
    "timeline": "timeline\n  title Our history\n  2020 : Founded\n  2022 : Launched product",
    "c4": "C4Context\n  title Our system\n  Person(user, \"User\")\n  System(sys, \"Our System\")\n  Rel(user, sys, \"Uses\")",
    "mindmap": "mindmap\n  root((mindmap))\n    Origins\n      Long history\n    Research\n      On effectiveness",
    "quadrant": "quadrantChart\n  title Reach\n  x-axis Low --> High\n  y-axis Bad --> Good\n  \"A\": [0.3, 0.6]",
    "xychart": "xychart-beta\n  title \"Sales\"\n  x-axis [Q1, Q2, Q3]\n  y-axis \"Revenue\" 0 --> 100\n  bar [20, 55, 80]",
    "sankey": "sankey-beta\n  A,B,20\n  A,C,30\n  B,D,15",
    "gitgraph": "gitGraph\n  commit\n  branch dev\n  commit",
    "block": "block-beta\n  columns 2\n  a b",
}

PROBE_JS = r"""
const out = { errors: window.errors };
for (const name of Object.keys(window.diagrams)) {
  const wrap = document.getElementById("wrap_" + name);
  if (!wrap) continue;
  const svg = wrap.querySelector("svg");
  const sr = svg.getBoundingClientRect();
  // Reference shape that certainly scales with the content.
  const ref = [...svg.querySelectorAll("rect")].find((el) => +el.getAttribute("width") > 50)
    || svg.querySelector("line, path");
  const items = [];
  svg.querySelectorAll("text, foreignObject").forEach((el) => {
    // <switch> fallback texts after a foreignObject are never painted.
    if (el.tagName === "text" && el.closest("switch") && el.closest("switch").querySelector("foreignObject")) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const isFo = el.tagName === "foreignObject";
    const div = isFo ? el.querySelector("div") : null;
    const dr = div ? div.getBoundingClientRect() : r;
    items.push({
      k: isFo ? "fo" : "tx",
      t: (div ? div.textContent : el.textContent).trim().slice(0, 7),
      top: +(r.top - sr.top).toFixed(1),
      wR: isFo ? +(dr.width / r.width).toFixed(3) : null,
      hR: isFo ? +(dr.height / r.height).toFixed(3) : null,
    });
  });
  let emDy = 0;
  svg.querySelectorAll("text, tspan").forEach((el) => {
    for (const a of ["dy", "dx"]) {
      const v = el.getAttribute(a);
      if (v && v.trim().endsWith("em")) emDy++;
    }
  });
  out[name] = {
    svgW: +sr.width.toFixed(1),
    refTop: ref ? +(ref.getBoundingClientRect().top - sr.top).toFixed(1) : 0,
    emDy, items,
  };
}
return JSON.stringify(out);
"""


def build_html() -> str:
    with open(MERMAID_JS, encoding="utf-8") as f:
        mermaid = f.read()
    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>html,body{{margin:0;padding:10px;font-size:14px}}</style>
<script>{mermaid}</script></head><body><div id="host"></div><script>
window.diagrams = {json.dumps(DIAGRAMS)};
window.errors = {{}};
mermaid.initialize({{startOnLoad: false}});
window.done = false;
(async () => {{
  let i = 0;
  for (const [name, code] of Object.entries(window.diagrams)) {{
    try {{
      const r = await mermaid.render("d" + (i++), code);
      const d = document.createElement("div");
      d.id = "wrap_" + name;
      d.style.cssText = "margin:20px 0";
      d.innerHTML = r.svg;
      document.getElementById("host").appendChild(d);
    }} catch (e) {{ window.errors[name] = String(e).slice(0, 100); }}
  }}
  window.done = true;
}})();
window.probe = function () {{ {PROBE_JS} }};
</script></body></html>"""


def main() -> int:
    if not os.path.exists(MERMAID_JS):
        print(f"error: {MERMAID_JS} not found — run npm install first", file=sys.stderr)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)

    results = {}
    state = {"pending": list(ZOOMS), "cur": None}

    win = Gtk.Window(title="mermaid-zoom-sweep")
    win.set_default_size(1100, 1400)
    view = WebKit2.WebView()
    win.add(view)
    win.show_all()

    def next_zoom(*_a):
        if not state["pending"]:
            Gtk.main_quit()
            return
        state["cur"] = state["pending"].pop(0)
        view.set_zoom_level(state["cur"])

        def after(_v, r, _u):
            results[str(state["cur"])] = json.loads(
                view.run_javascript_finish(r).get_js_value().to_string()
            )
            view.get_snapshot(
                WebKit2.SnapshotRegion.FULL_DOCUMENT,
                WebKit2.SnapshotOptions.NONE,
                None,
                lambda v, r2, _u2: save_snapshot(v, r2),
                None,
            )

        GLib.timeout_add(
            300, lambda: (view.run_javascript("probe()", None, after, None), False)[1]
        )

    def save_snapshot(view_, res):
        try:
            view_.get_snapshot_finish(res).write_to_png(
                f"{OUT_DIR}/zoom-{state['cur']}.png"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"snapshot failed at zoom {state['cur']}: {exc}", file=sys.stderr)
        next_zoom()

    def loaded(_v, event):
        if event != WebKit2.LoadEvent.FINISHED:
            return

        # Poll for render completion: run_javascript resolves a returned
        # Promise immediately (WebKit "unsupported result type"), so waiting
        # on window.ready.then() would race the render loop.
        def check(*_a):
            def got(view_, res, _u):
                try:
                    done = (
                        view_.run_javascript_finish(res).get_js_value().to_string()
                        == "true"
                    )
                except Exception:  # noqa: BLE001
                    done = False
                if done:
                    next_zoom()
                else:
                    GLib.timeout_add(200, check)

            view.run_javascript("String(window.done === true)", None, got, None)
            return False

        GLib.timeout_add(200, check)

    win.connect("destroy", Gtk.main_quit)
    view.connect("load-changed", loaded)
    view.load_html(build_html(), f"file://{REPO_ROOT}/")
    GLib.timeout_add_seconds(180, Gtk.main_quit)
    Gtk.main()

    base = results.get("1.0", {})
    print("render errors:", base.get("errors") or "none")
    print(f"\n{'diagram':<10} {'emDy':>5} {'fo':>3}  {'zoom':>5}  verdict")
    issues = 0
    for name in DIAGRAMS:
        d0 = base.get(name)
        if not d0:
            print(f"{name:<10}  no data")
            continue
        fo0 = [i for i in d0["items"] if i["k"] == "fo"]
        worst = "uniform"
        for z in [str(z) for z in ZOOMS[1:]]:
            dz = results.get(z, {}).get(name)
            if not dz:
                continue
            s = dz["refTop"] / d0["refTop"] if d0["refTop"] else 1
            bad = []
            for i0, iz in zip(d0["items"], dz["items"]):
                drift = iz["top"] - i0["top"] * s
                if abs(drift) > DRIFT_TOLERANCE:
                    bad.append(f"{iz['k']} '{iz['t']}' {drift:+.0f}@{z}")
                if iz["k"] == "fo" and i0["wR"] and (
                    abs(iz["wR"] / i0["wR"] - 1) > 0.15 or abs(iz["hR"] / i0["hR"] - 1) > 0.15
                ):
                    bad.append(f"fo-ratio '{iz['t']}' x{iz['hR']/i0['hR']:.2f}@{z}")
            if bad:
                worst = "; ".join(sorted(set(bad))[:4])
                issues += len(bad)
        print(f"{name:<10} {d0['emDy']:>5} {len(fo0):>3}  {'all':>5}  {worst}")
    print(f"\nscreenshots: {OUT_DIR}/")
    print(
        "note: emDy > 0 is expected (handled by text-offsets.ts in the app); "
        "this sweep shows RAW pre-fix drift."
    )
    return 0 if issues == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
