# Satellite Revisit Calculator v0.6

Changes in v0.5:
- Replaced Walker Phase with **Phase Offset Between Planes (deg)**.
- Added auto-derived:
  - Satellites per plane
  - RAAN spacing
- Optimizer now searches directly over phase offset in degrees.
- Optimization target remains selectable before optimization.
- Version number is visible in the UI.
- Radio button sizing fixed explicitly.

This is a client-side GitHub Pages application.


## v0.6
- Each access window now shows which satellite(s) saw the target.
- Satellite IDs are assigned in constellation order: `SAT-01`, `SAT-02`, ...
- Plane/slot is also shown, e.g. `SAT-05 (P2-1)`.
- CSV export includes the satellite identifier(s) for each access window.
- Revisit metrics still use the union of all constellation access windows.
