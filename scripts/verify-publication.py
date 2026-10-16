#!/usr/bin/env python3
"""Reject excluded aggregate material in publication files and Git history."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET


EXCLUDED = {
    "fixtures/events/maule-2010/usgs-event.geojson": "6df47ba7621d98701be78b05f443eb62eec8ff4d25713026eacfc676bbbaad4d",
    "fixtures/events/maule-2010/usgs-phase-data.xml": "9145f9dd8d7d60fef6a1d41c43d833efb450c7ce102f5c5770d84d2d45577e6f",
    "fixtures/events/okhotsk-2013/usgs-event.geojson": "06bd3cb9b670bb3c82ab5842481d392777b76150751fb34e99d0fefeec762bb0",
    "fixtures/events/okhotsk-2013/usgs-phase-data.xml": "0f11f9fe38010e4cd78eb9bfdc1ccd9af03a95c9abd47ad046ecc7f227e30edc",
    "fixtures/investigation/usgs-event.geojson": "d984e0a0518f703165f53e9052aa624e6ad8d68b8628e6e2be7468b2ac62c8fd",
    "fixtures/investigation/usgs-phase-data.xml": "e10901e19876d6b6d3acfe1ad10dd37343dc9e6c3b7804c395970b2ab0f2a79b",
    "fixtures/observed/usgs-event.geojson": "d984e0a0518f703165f53e9052aa624e6ad8d68b8628e6e2be7468b2ac62c8fd",
}
EXCLUDED_HASHES = set(EXCLUDED.values())


def git(root, *args, data=None):
    return subprocess.run(
        ["git", "--no-optional-locks", "--no-replace-objects", "-C", str(root), *args],
        input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
    ).stdout


def content_failure(data):
    if hashlib.sha256(data).hexdigest() in EXCLUDED_HASHES:
        return "excluded original aggregate SHA256"
    try:
        document = json.loads(data)
    except (ValueError, UnicodeError, RecursionError):
        document = None
    pending = [document]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            if isinstance(value.get("properties"), dict) and "products" in value["properties"]:
                return "USGS event aggregate properties.products"
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
    try:
        document = ET.fromstring(data)
    except (ET.ParseError, ValueError, LookupError):
        return None
    if any(element.tag.rsplit("}", 1)[-1] == "eventParameters" for element in document.iter()):
        return "QuakeML eventParameters aggregate"
    return None


def scan(root):
    failures = []
    counts = {"working_files": 0, "index_blobs": 0, "reachable_blobs": 0, "reachable_trees": 0}

    def fail(source, reason):
        item = {"source": source, "reason": reason}
        if item not in failures:
            failures.append(item)

    def check_entry(source, path, mode):
        if path in EXCLUDED:
            fail(source, "excluded original aggregate path")
        if mode == "120000":
            fail(source, "symlink content is outside the publication scan")
        if mode == "160000":
            fail(source, "submodule content is outside the publication scan")

    def check_content(source, data):
        reason = content_failure(data)
        if reason:
            fail(source, reason)

    actual_root = Path(os.fsdecode(git(root, "rev-parse", "--show-toplevel").strip())).resolve()
    if actual_root != root:
        fail(str(root), "--root must name the repository root")
        return counts, failures
    if git(root, "rev-parse", "--is-shallow-repository").strip() == b"true":
        fail(str(root), "shallow history cannot qualify all ancestors")
    alternate_path = Path(os.fsdecode(git(root, "rev-parse", "--git-path", "objects/info/alternates").strip()))
    if not alternate_path.is_absolute():
        alternate_path = root / alternate_path
    if alternate_path.exists() and alternate_path.read_bytes().strip():
        fail(str(alternate_path), "external Git object alternates")
    if os.environ.get("GIT_ALTERNATE_OBJECT_DIRECTORIES"):
        fail("GIT_ALTERNATE_OBJECT_DIRECTORIES", "external Git object alternates")
    if failures:
        return counts, failures

    index = {}
    for entry in git(root, "ls-files", "--stage", "-z").split(b"\0"):
        if not entry:
            continue
        info, path = entry.split(b"\t", 1)
        mode, oid, _stage = info.decode("ascii").split()
        path = os.fsdecode(path)
        check_entry(f"index:{path}", path, mode)
        if mode not in {"120000", "160000"}:
            index.setdefault(oid, []).append(path)

    paths = set(git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0")) - {b""}
    for raw_path in sorted(paths):
        path = os.fsdecode(raw_path)
        target = root / path
        symlink = target.is_symlink() or any((root / parent).is_symlink() for parent in Path(path).parents)
        check_entry(f"working:{path}", path, "120000" if symlink else "100644")
        if symlink or not target.exists():
            continue
        if not target.is_file():
            fail(f"working:{path}", "working entry is not a regular file")
            continue
        counts["working_files"] += 1
        check_content(f"working:{path}", target.read_bytes())

    objects = git(root, "rev-list", "--objects", "--all", "--no-object-names").splitlines()
    typed = git(root, "cat-file", "--batch-check=%(objectname) %(objecttype)", data=b"\n".join(objects) + b"\n") if objects else b""
    history_blobs = set()
    for line in typed.splitlines():
        oid, kind = line.decode("ascii").split()
        if kind == "blob":
            history_blobs.add(oid)
        elif kind == "tree":
            counts["reachable_trees"] += 1
            for entry in git(root, "ls-tree", "-r", "-z", oid).split(b"\0"):
                if not entry:
                    continue
                info, path = entry.split(b"\t", 1)
                mode, _kind, _child = info.decode("ascii").split()
                path = os.fsdecode(path)
                check_entry(f"tree:{oid}:{path}", path, mode)

    counts["index_blobs"] = len(index)
    counts["reachable_blobs"] = len(history_blobs)
    with subprocess.Popen(
        ["git", "--no-optional-locks", "--no-replace-objects", "-C", str(root), "cat-file", "--batch"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ) as process:
        for oid in sorted(set(index) | history_blobs):
            process.stdin.write(oid.encode("ascii") + b"\n")
            process.stdin.flush()
            header = process.stdout.readline().split()
            if len(header) != 3 or header[1] != b"blob":
                raise ValueError(f"Git could not read blob {oid}")
            size = int(header[2])
            data = process.stdout.read(size)
            if len(data) != size or process.stdout.read(1) != b"\n":
                raise ValueError(f"Incomplete Git blob {oid}")
            source = f"blob:{oid}"
            if oid in index:
                source += ":index=" + ",".join(index[oid])
            check_content(source, data)
        process.stdin.close()
        if process.wait() != 0:
            raise ValueError("Git object reader failed")
    return counts, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    root = args.root.resolve()
    try:
        counts, failures = scan(root)
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        counts, failures = {}, [{"source": str(root), "reason": str(error)}]
    report = {
        "status": "FAIL" if failures else "PASS",
        "root": str(root), "checked": counts, "failures": failures,
        "scope": "Known excluded paths and hashes, parsable uncompressed USGS JSON and QuakeML XML, working files, index and all ref-reachable Git objects. No legal ownership determination or compressed, encoded or external-content inspection.",
    }
    print(json.dumps(report, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
