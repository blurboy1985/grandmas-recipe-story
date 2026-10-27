#!/usr/bin/env python3
"""Install two new user profiles without modifying base config or existing profiles."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
NAMES = ("grandma-spark", "grandma-wonder")


def install(destination):
    destination = destination.expanduser().resolve()
    base = destination / "config.toml"
    original = base.read_bytes() if base.exists() else None
    config = tomllib.loads(original.decode()) if original is not None else {}
    sources = {}
    for name in NAMES:
        raw = (ROOT / "config" / "muse" / f"{name}.config.toml").read_bytes()
        profile = tomllib.loads(raw.decode())
        provider = profile["model_providers"]["grandma_meta"]
        inherited = config.get("model_providers", {}).get("grandma_meta")
        if inherited is not None and inherited != provider:
            raise ValueError("Existing grandma_meta provider differs; no files changed.")
        path = destination / f"{name}.config.toml"
        if path.is_symlink():
            raise ValueError(f"Refusing symlink profile: {path}")
        if path.exists() and path.read_bytes() != raw:
            raise ValueError(f"Existing profile differs; refusing to overwrite: {path}")
        sources[path] = raw
    destination.mkdir(parents=True, exist_ok=True)
    created = []
    try:
        for path, raw in sources.items():
            if path.exists():
                print(f"Already installed: {path}")
                continue
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            created.append(path)
            with os.fdopen(fd, "wb") as stream:
                stream.write(raw)
            print(f"Installed: {path}")
        current = base.read_bytes() if base.exists() else None
        if current != original:
            raise ValueError("Base config changed concurrently. Inspect it before launching.")
    except Exception:
        for path in created:
            path.unlink()
        raise
    print("Base config unchanged; default provider and all existing settings preserved.")
    if original is not None:
        print("Base config SHA256:", hashlib.sha256(original).hexdigest())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-dir", type=Path,
                        default=Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))))
    args = parser.parse_args()
    version = subprocess.run(["codex", "--version"], capture_output=True, text=True, check=True)
    match = re.search(r"codex-cli (\d+)\.(\d+)\.(\d+)", version.stdout)
    if not match or tuple(map(int, match.groups())) < (0, 134, 0):
        raise ValueError("Codex CLI 0.134.0 or later is required for separate profile files.")
    install(args.config_dir)


if __name__ == "__main__":
    try:
        main()
    except PermissionError:
        sys.exit("Profile installation denied by filesystem permissions. Run this script in your own local terminal.")
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
