# Satellite Revisit Calculator v0.7

GitHub Pages compatible, client-side application.

## Modes

### Designed Constellation
- Circular orbit model
- Altitude / inclination
- Satellite count / orbital planes
- Phase offset between planes
- RAAN start
- Constellation optimizer

### TLE / SGP4
- Upload a `.tle` / `.txt` file or paste TLE text
- TLE parsing and validation
- SGP4 propagation using `satellite.js`
- User-selected UTC start time
- Target latitude / longitude / altitude
- Maximum off-nadir constraint
- Access windows with satellite name
- Best time and minimum off-nadir per access window
- Max / mean / median / standard-deviation revisit
- CSV export
- TLE epoch range display

## Important limitation

A TLE describes the orbit, not the actual camera pointing direction.
The off-nadir limit is treated as a geometric field-of-regard constraint.

## Dependency

`satellite.js` v5 is loaded from jsDelivr in `index.html`.
Internet access is therefore required when the page is first loaded.
