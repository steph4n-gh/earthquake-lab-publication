#!/usr/bin/env python3

import json
import math
import unittest

from display_quantization import display_samples, geographic_degrees


class DisplayQuantizationControls(unittest.TestCase):
    def test_count_half_even_in_both_directions(self):
        self.assertEqual(
            display_samples([1.25, 1.35, 2.45, 2.55, -1.25, -1.35, -2.45, -2.55]),
            [1.2, 1.4, 2.4, 2.6, -1.2, -1.4, -2.4, -2.6],
        )

    def test_counts_away_from_ties(self):
        self.assertEqual(display_samples([1.249, 1.251, -1.249, -1.251]), [1.2, 1.3, -1.2, -1.3])

    def test_geographic_half_even_in_both_directions(self):
        for value, expected in (
            (1.00000000005, 1.0), (1.00000000015, 1.0000000002),
            (-1.00000000005, -1.0), (-1.00000000015, -1.0000000002),
            (82.9537792700987, 82.9537792701),
        ):
            with self.subTest(value=value):
                self.assertEqual(geographic_degrees(value), expected)

    def test_signed_zero_has_one_json_representation(self):
        self.assertEqual(display_samples([-0.0, -0.01, 0.01]), [0.0, 0.0, 0.0])
        self.assertEqual(json.dumps(display_samples([-0.0, -0.01])), "[0.0, 0.0]")
        self.assertEqual(json.dumps(geographic_degrees(-0.00000000001)), "0.0")
        for value in (*display_samples([-0.0, -0.01]), geographic_degrees(-0.00000000001)):
            self.assertEqual(math.copysign(1, value), 1.0)

    def test_nonfinite_inputs_rejected(self):
        for value in (math.inf, -math.inf, math.nan):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "finite"):
                display_samples([1.2, value])
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "finite"):
                geographic_degrees(value)


if __name__ == "__main__":
    unittest.main()
