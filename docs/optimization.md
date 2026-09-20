# Revisit Calculation

## Designed Constellation mode
Uses a circular orbit model with Earth rotation.

## TLE / SGP4 mode
Uses satellite.js SGP4 propagation for each TLE and each simulation timestamp.

At each timestamp:
1. Propagate TLE to ECI.
2. Convert satellite ECI to ECEF.
3. Compute target ECEF position.
4. Compute line-of-sight.
5. Compute off-nadir angle from the satellite nadir vector.
6. Apply horizon and maximum off-nadir constraints.
7. Merge consecutive visible samples into access windows.

Revisit statistics are computed from the union of all access windows in the constellation.
