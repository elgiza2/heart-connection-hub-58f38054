#!/usr/bin/env python3
"""Re-hosts every *.asset.json pointer under this project.

The repo was imported from other Lovable projects, so its asset pointers
reference CDN objects owned by those projects and 404 on this host. This
downloads each object from its owning project host and re-uploads it to the
current project, rewriting the pointer file in place.
"""
import json
import glob
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor

PROJECT_ID = os.environ.get("LOVABLE_PROJECT_ID", "d30cd534-83b2-4ce3-a9ce-002e04b0dd40")
pointers = sorted(glob.glob("src/**/*.asset.json", recursive=True))


def migrate(path):
    d = json.load(open(path))
    if d.get("project_id") == PROJECT_ID:
        return (path, "skip")
    src = f"https://project--{d['project_id']}.lovable.app{d['url']}"
    name = d.get("original_filename") or os.path.basename(d["url"])
    with tempfile.TemporaryDirectory() as tmp:
        local = os.path.join(tmp, name)
        r = subprocess.run(["curl", "-sfL", "-o", local, src], capture_output=True)
        if r.returncode != 0 or not os.path.getsize(local):
            return (path, f"download-failed {src}")
        up = subprocess.run(
            ["lovable-assets", "create", "--file", local, "--filename", name],
            capture_output=True, text=True,
        )
        if up.returncode != 0:
            return (path, f"upload-failed {up.stderr.strip()[:200]}")
        try:
            json.loads(up.stdout)
        except Exception:
            return (path, f"bad-json {up.stdout[:200]}")
        with open(path, "w") as f:
            f.write(up.stdout if up.stdout.endswith("\n") else up.stdout + "\n")
    return (path, "ok")


with ThreadPoolExecutor(max_workers=4) as ex:
    for path, status in ex.map(migrate, pointers):
        print(f"{status:>16}  {path}", flush=True)
