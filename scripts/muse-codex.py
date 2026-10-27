#!/usr/bin/env python3
"""Start a Muse session without inherited third-party tool schemas."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
PROFILES = ("grandma-spark", "grandma-wonder")


def launch_arguments(profile, prompt, config_dir):
    """Read only configuration, never auth files; return separate argv values."""
    profile_path = config_dir / f"{profile}.config.toml"
    if not profile_path.is_file():
        raise ValueError("Muse profile missing. Run scripts/install-muse-profiles.py in your terminal first.")
    servers = set()
    # Include project layers so a future project MCP server is excluded too.
    paths = [config_dir / "config.toml", profile_path]
    paths.append(ROOT / ".codex/config.toml")
    for path in paths:
        if path.is_file():
            config = tomllib.loads(path.read_text())
            servers.update(config.get("mcp_servers", {}))
    args = ["codex", "--no-daemon", "--profile", profile,
            "--disable", "apps", "--disable", "plugins"]
    for name in sorted(servers):
        # Codex splits CLI paths on dots; it does not parse TOML quoted keys.
        # Literal quotes would create another server without a transport.
        if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
            raise ValueError("MCP server name cannot be safely overridden by this launcher.")
        args.extend(["-c", f"mcp_servers.{name}.enabled=false"])
    if prompt is not None:
        args.append(prompt)
    return args, len(servers)


def validate_launch(command, has_prompt):
    """Have the real CLI parse the overrides, without starting tools or inference."""
    check = [arg for arg in (command[:-1] if has_prompt else command) if arg != "--no-daemon"]
    result = subprocess.run([*check, "mcp", "list", "--json"],
                            cwd=ROOT, capture_output=True, text=True, timeout=20)
    if result.returncode:
        # Raw MCP output may contain headers/env credentials. Never echo it.
        raise ValueError("Codex rejected the launch configuration; no key requested or inference attempted.")
    servers = json.loads(result.stdout)
    if not isinstance(servers, list) or any(server.get("enabled", True) for server in servers):
        raise ValueError("Codex still has enabled MCP servers; no key requested or inference attempted.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", choices=PROFILES)
    parser.add_argument("prompt", nargs="?")
    parser.add_argument("--check", action="store_true", help="Validate configuration without a key or model request")
    args = parser.parse_args()
    config_dir = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).expanduser()
    command, count = launch_arguments(args.profile, args.prompt, config_dir)
    validate_launch(command, args.prompt is not None)
    print(f"Muse compatibility launch: apps/plugins off; {count} configured MCP servers off. "
          "Base configuration, approval and sandbox settings preserved.", flush=True)
    if args.check:
        return
    os.chdir(ROOT)
    # The existing helper accepts an inherited key or prompts privately. No key in argv.
    os.execvp("zsh", ["zsh", str(ROOT / "scripts/with-meta-key.zsh"), *command])


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError):
        # Do not echo config parser fragments, which could contain private values.
        sys.exit("Cannot prepare Muse launch. Check profile installation and TOML syntax locally.")
