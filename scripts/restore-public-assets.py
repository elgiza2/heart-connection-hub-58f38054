#!/usr/bin/env python3
"""Restores the project's static public/ files from the live site.

The imported repo shipped without public/ assets, so every reference to
/showcase/*, /model-logos/*, /videos/*, etc. 404s. This mirrors them.
"""
import os
import re
import subprocess
import glob
from concurrent.futures import ThreadPoolExecutor

ORIGIN = "https://www.megsyai.com"
PAT = re.compile(r'"(/[A-Za-z0-9._/-]+\.(?:png|jpg|jpeg|webp|svg|mp4|webm|ico|txt|json))"')

paths = set()
for f in glob.glob("src/**/*.*", recursive=True) + ["index.html"]:
    if f.endswith((".asset.json", ".map")):
        continue
    try:
        txt = open(f, encoding="utf-8", errors="ignore").read()
    except OSError:
        continue
    for m in PAT.findall(txt):
        if m.startswith("/__l5e") or m.startswith("/src/"):
            continue
        paths.add(m)


def fetch(p):
    dest = "public" + p
    if os.path.exists(dest):
        return (p, "exists")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    r = subprocess.run(["curl", "-sfL", "-o", dest, ORIGIN + p], capture_output=True)
    if r.returncode != 0 or not os.path.exists(dest) or os.path.getsize(dest) == 0:
        if os.path.exists(dest):
            os.remove(dest)
        return (p, "MISSING")
    return (p, "ok")


with ThreadPoolExecutor(max_workers=8) as ex:
    for p, s in sorted(ex.map(fetch, sorted(paths))):
        print(f"{s:>8}  {p}", flush=True)
