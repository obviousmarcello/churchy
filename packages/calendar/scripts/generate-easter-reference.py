# Independent Easter reference generator for packages/calendar tests.
#
# Uses Knuth's epact-based algorithm (TAOCP Vol. 1, §1.3.2, Algorithm E) — a
# different derivation from the anonymous Gregorian (Meeus/Jones/Butcher)
# algorithm implemented in src/easter.ts — and cross-checks every year against
# python-dateutil's easter() when it is installed.
#
# Usage: python3 -I scripts/generate-easter-reference.py src/__fixtures__/easter-1900-2100.json
import json, sys
def knuth(y):
    g = y % 19 + 1                      # golden number
    c = y // 100 + 1                    # century
    x = (3 * c) // 4 - 12               # Gregorian correction
    z = (8 * c + 5) // 25 - 5           # Clavian correction (moon)
    d = (5 * y) // 4 - x - 10           # find Sunday
    e = (11 * g + 20 + z - x) % 30      # epact
    if (e == 25 and g > 11) or e == 24:
        e += 1
    n = 44 - e
    if n < 21:
        n += 30
    n = n + 7 - ((d + n) % 7)
    return (y, 4, n - 31) if n > 31 else (y, 3, n)
table = {}
for y in range(1900, 2101):
    yy, m, dd = knuth(y)
    table[str(y)] = f"{yy:04d}-{m:02d}-{dd:02d}"
try:
    from dateutil.easter import easter, EASTER_WESTERN
    bad = [y for y in range(1900, 2101) if easter(y, EASTER_WESTERN).isoformat() != table[str(y)]]
    print("dateutil cross-check mismatches:", bad, file=sys.stderr)
except ImportError:
    print("dateutil not available", file=sys.stderr)
for y, exp in [(2024,"2024-03-31"),(2025,"2025-04-20"),(2026,"2026-04-05"),(2027,"2027-03-28"),(1900,"1900-04-15"),(2000,"2000-04-23"),(2100,"2100-03-28"),(1954,"1954-04-18"),(1981,"1981-04-19"),(2049,"2049-04-18"),(2077,"2077-04-11"),(2008,"2008-03-23"),(2011,"2011-04-24"),(2038,"2038-04-25"),(2285,"2285-03-22")]:
    yy,m,dd = knuth(y); got=f"{yy:04d}-{m:02d}-{dd:02d}"
    print(y, got, exp, "OK" if got==exp else "MISMATCH", file=sys.stderr)
out = sys.argv[1]
with open(out, "w") as f:
    f.write(json.dumps(table, indent=2) + "\n")
