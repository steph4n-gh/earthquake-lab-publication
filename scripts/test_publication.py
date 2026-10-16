#!/usr/bin/env python3
"""Exercise the publication gate through its actual CLI in temporary repositories."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


CHECKER = Path(__file__).with_name("verify-publication.py")
QUAKEML = b'<?xml version="1.0"?><q:quakeml xmlns:q="urn:test"><eventParameters><event publicID="synthetic"/></eventParameters></q:quakeml>'
PRODUCTS = b'{"type":"Feature","properties":{"products":{"unused":[{"id":"synthetic"}]}}}'


class PublicationControls(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="publication-control-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        self.git("init", "--quiet")
        self.git("config", "user.name", "Publication test")
        self.git("config", "user.email", "publication-test@example.invalid")
        self.write("README.md", b"Narrow factual inputs.\n")
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Clean synthetic root")

    def git(self, *args, data=None):
        return subprocess.run(
            ["git", "-C", str(self.root), *args], input=data,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        ).stdout

    def write(self, path, data):
        destination = self.root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        return destination

    def check(self, expected, reason=None, root=None, env=None):
        result = subprocess.run(
            [sys.executable, str(CHECKER), "--root", str(root or self.root)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
        )
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], expected, report)
        self.assertEqual(result.returncode, 0 if expected == "PASS" else 1, report)
        self.assertEqual(result.stderr, b"")
        if reason:
            self.assertTrue(any(reason in item["reason"] for item in report["failures"]), report)
        return report

    def test_clean_facts_and_ignored_private_capture(self):
        self.write("facts.json", b'{"event":{"magnitude":9.1},"manual_p_picks":[]}')
        self.write(".gitignore", b".cache/\n")
        self.write(".cache/private.xml", QUAKEML)
        report = self.check("PASS")
        self.assertEqual(report["checked"]["working_files"], 3)
        self.assertEqual(report["checked"]["reachable_blobs"], 1)

    def test_forbidden_path_even_with_harmless_content(self):
        self.write("fixtures/observed/usgs-event.geojson", b"{}")
        self.check("FAIL", "excluded original aggregate path")

    def test_renamed_xml_aggregate(self):
        self.write("looks-like-a-model.dat", QUAKEML)
        self.check("FAIL", "QuakeML eventParameters")

    def test_renamed_json_aggregate(self):
        self.write("unrelated-name.txt", PRODUCTS)
        self.check("FAIL", "properties.products")

    def test_utf16_and_nested_aggregate(self):
        self.write("nested.dat", ('{"events":[' + PRODUCTS.decode() + ']}').encode("utf-16"))
        self.check("FAIL", "properties.products")

    def test_removed_aggregate_in_ancestor(self):
        self.write("removed.dat", QUAKEML)
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Synthetic forbidden ancestor")
        self.git("rm", "--quiet", "removed.dat")
        self.git("commit", "--quiet", "-m", "Remove from current tree")
        report = self.check("FAIL", "QuakeML eventParameters")
        self.assertEqual(report["checked"]["working_files"], 1)
        self.assertGreater(report["checked"]["reachable_blobs"], 1)

    def test_forbidden_path_in_ancestor(self):
        path = "fixtures/events/maule-2010/usgs-phase-data.xml"
        self.write(path, b"harmless bytes at excluded path")
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Synthetic forbidden path ancestor")
        self.git("rm", "--quiet", path)
        self.git("commit", "--quiet", "-m", "Remove path")
        self.check("FAIL", "excluded original aggregate path")

    def test_staged_aggregate_with_clean_working_file(self):
        self.write("staged.dat", PRODUCTS)
        self.git("add", "staged.dat")
        self.write("staged.dat", b"clean working contents")
        report = self.check("FAIL", "properties.products")
        self.assertTrue(any(":index=staged.dat" in item["source"] for item in report["failures"]), report)

    def test_aggregate_reachable_only_from_blob_tag(self):
        oid = self.git("hash-object", "-w", "--stdin", data=PRODUCTS).decode().strip()
        self.git("update-ref", "refs/tags/synthetic-aggregate", oid)
        self.check("FAIL", "properties.products")

    def test_aggregate_reachable_only_from_other_branch(self):
        self.write("branch-only.dat", QUAKEML)
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Synthetic aggregate branch")
        self.git("branch", "private-archive")
        self.git("reset", "--hard", "HEAD~1")
        self.check("FAIL", "QuakeML eventParameters")

    def test_replacement_commit_cannot_hide_original_history(self):
        clean = self.git("rev-parse", "HEAD").decode().strip()
        self.write("replaced.dat", QUAKEML)
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Synthetic original commit")
        original = self.git("rev-parse", "HEAD").decode().strip()
        self.git("replace", original, clean)
        self.git("reset", "--hard", "HEAD")
        self.check("FAIL", "QuakeML eventParameters")

    def test_symlink(self):
        (self.root / "link").symlink_to("README.md")
        self.check("FAIL", "symlink content")

    def test_symlinked_parent_directory(self):
        self.write("records/trace.dat", b"synthetic facts")
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Synthetic regular directory")
        external = Path(self.temp.name) / "external"
        (self.root / "records").rename(external)
        (self.root / "records").symlink_to(external, target_is_directory=True)
        self.check("FAIL", "symlink content")

    def test_historical_symlink(self):
        (self.root / "link").symlink_to("README.md")
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Synthetic historical symlink")
        self.git("rm", "--quiet", "link")
        self.git("commit", "--quiet", "-m", "Remove symlink")
        self.check("FAIL", "symlink content")

    def test_git_object_alternates(self):
        clone = Path(self.temp.name) / "shared"
        subprocess.run(
            ["git", "clone", "--quiet", "--shared", str(self.root), str(clone)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        )
        self.check("FAIL", "external Git object alternates", root=clone)

    def test_shallow_clone_cannot_qualify_history(self):
        clone = Path(self.temp.name) / "shallow"
        subprocess.run(
            ["git", "clone", "--quiet", "--depth", "1", self.root.as_uri(), str(clone)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        )
        self.check("FAIL", "shallow history", root=clone)

    def test_environment_object_alternates(self):
        env = dict(os.environ, GIT_ALTERNATE_OBJECT_DIRECTORIES=str(self.root / ".git/objects"))
        self.check("FAIL", "external Git object alternates", env=env)


if __name__ == "__main__":
    unittest.main(verbosity=2)
