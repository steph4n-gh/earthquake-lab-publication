from decimal import Decimal, ROUND_HALF_EVEN
import math


COUNT_QUANTUM = Decimal("0.1")
DEGREE_QUANTUM = Decimal("0.0000000001")


def _quantize(value, quantum):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("Display values must be finite")
    result = float(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_EVEN))
    return 0.0 if result == 0 else result


def display_samples(values):
    return [_quantize(value, COUNT_QUANTUM) for value in values]


def geographic_degrees(value):
    return _quantize(value, DEGREE_QUANTUM)
