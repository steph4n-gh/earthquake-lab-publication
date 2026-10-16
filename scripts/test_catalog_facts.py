#!/usr/bin/env python3
"""Exercise compact catalog boundaries and source-selection rejection controls."""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest

from obspy import Catalog, UTCDateTime
from obspy.core.event import Event

from catalog_facts import ROOT, SPECS, as_picks, dependency_hashes, extract_facts, load_facts, validate, verify_dependencies


class CatalogFactsControls(unittest.TestCase):
    def facts(self, case="tohoku-2011"):
        return load_facts(ROOT / SPECS[case][0] / "catalog-facts.json")

    def test_real_facts_preserve_observations_and_absence(self):
        for case, expected in (("tohoku-2011", 8), ("maule-2010", 3), ("okhotsk-2013", 5)):
            facts = self.facts(case)
            picks = as_picks(facts)
            self.assertEqual(len(picks), expected)
            for pick in picks:
                self.assertEqual(pick.waveform_id.network_code, "IR")
                self.assertIsNone(pick.waveform_id.channel_code)
                self.assertIsNone(pick.waveform_id.location_code)
                self.assertIsNone(pick.time_errors.uncertainty)
                self.assertIsNone(pick.creation_info)
        self.assertIsNone(self.facts("maule-2010")["manual_p_picks"]["LVC"])
        self.assertIsNone(self.facts("okhotsk-2013")["manual_p_picks"]["LVC"])

    def test_unknown_archive_material_rejected(self):
        for scope in ("event", "phase", "pick", "receipt", "top"):
            facts = self.facts()
            target = {"event": facts["event"], "phase": facts["phase"], "pick": facts["manual_p_picks"]["TATO"], "receipt": facts["source_aggregates"]["usgs-event.geojson"], "top": facts}[scope]
            target["unreviewed_archive_content"] = "must not pass through"
            with self.subTest(scope=scope), self.assertRaisesRegex(ValueError, "allowlist"):
                validate(facts)

    def test_identity_uncertainty_and_membership_changes_rejected(self):
        mutations = [
            lambda f: f["manual_p_picks"]["TATO"].update(reported_network="IU"),
            lambda f: f["manual_p_picks"]["TATO"].update(channel_code="BHZ"),
            lambda f: f["manual_p_picks"]["TATO"].update(uncertainty_s=0),
            lambda f: f["manual_p_picks"].update(TATO=None),
            lambda f: f["phase"].update(configured_phase_url_present_in_event=False),
            lambda f: f["event"].update(depth_km=30),
            lambda f: f["phase"].update(source_manual_p_count=1),
            lambda f: f["manual_p_picks"]["GUMO"].update(resource_id=f["manual_p_picks"]["TATO"]["resource_id"]),
        ]
        for index, mutate in enumerate(mutations):
            facts = self.facts()
            mutate(facts)
            with self.subTest(control=index), self.assertRaises(ValueError):
                validate(facts)

    def test_dependencies_pin_producer_shared_module_and_facts(self):
        producer = ROOT / "scripts/prepare-events.py"
        facts_path = ROOT / "fixtures/events/maule-2010/catalog-facts.json"
        dependencies = dependency_hashes(producer, facts_path)
        self.assertEqual(set(dependencies), {"scripts/prepare-events.py", "scripts/catalog_facts.py", "fixtures/events/maule-2010/catalog-facts.json"})
        verify_dependencies({"producer_dependencies": dependencies}, producer, facts_path)
        for name in dependencies:
            changed = {**dependencies, name: "0" * 64}
            with self.subTest(input=name), self.assertRaisesRegex(ValueError, "dependency"):
                verify_dependencies({"producer_dependencies": changed}, producer, facts_path)

    def extract_control(self, case, extra_mode=None, duplicate=False, membership=True):
        facts = self.facts(case)
        picks = as_picks(facts)
        if extra_mode or duplicate:
            extra = deepcopy(picks[0])
            extra.resource_id = "smi:local/test-only-extra-pick"
            extra.evaluation_mode = extra_mode or "manual"
            picks.append(extra)
        event = facts["event"]
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            Catalog(events=[Event(resource_id=facts["phase"]["event_resource_id"], picks=picks)]).write(directory / "usgs-phase-data.xml", format="QUAKEML")
            raw = {"id": event["id"], "geometry": {"coordinates": [event["longitude_deg"], event["latitude_deg"], event["depth_km"]]}, "properties": {
                "time": int(round(UTCDateTime(event["origin_time_utc"]).timestamp * 1000)), "mag": event["magnitude"], "magType": event["magnitude_type"], "place": event["place"], "url": event["event_page_url"],
                "products": {"phase-data": [{"contents": {"quakeml.xml": {"url": facts["phase"]["source_url"] if membership else "https://example.invalid/other.xml"}}}]}}}
            (directory / "usgs-event.geojson").write_text(json.dumps(raw))
            receipts = deepcopy(facts["source_aggregates"])
            for name, receipt in receipts.items():
                data = (directory / name).read_bytes()
                receipt.update(sha256=sha256(data).hexdigest(), bytes=len(data))
            return extract_facts(directory, case, receipts)

    def test_tohoku_all_p_uniqueness_precedes_manual_filter(self):
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            self.extract_control("tohoku-2011", extra_mode="automatic")

    def test_other_events_keep_manual_p_selection(self):
        facts = self.extract_control("maule-2010", extra_mode="automatic")
        self.assertEqual(sum(p is not None for p in facts["manual_p_picks"].values()), 3)
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            self.extract_control("maule-2010", duplicate=True)

    def test_source_membership_rejected(self):
        with self.assertRaisesRegex(ValueError, "not a member"):
            self.extract_control("tohoku-2011", membership=False)

    def test_changed_private_source_bytes_rejected_before_parsing(self):
        facts = self.facts()
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "usgs-event.geojson").write_text("changed private response")
            with self.assertRaisesRegex(ValueError, "Source bytes changed"):
                extract_facts(directory, "tohoku-2011", facts["source_aggregates"])


if __name__ == "__main__":
    unittest.main()
