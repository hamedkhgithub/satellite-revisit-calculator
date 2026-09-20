# Optimization model

The optimizer can minimize one of:
- Maximum revisit
- Average revisit
- Revisit standard deviation (uniformity)

Parameters searched:
- Number of orbital planes
- Phase offset between adjacent planes, in degrees
- RAAN start, in degrees

The phase offset is now a direct geometric parameter:

`phase of plane j = j * phase_offset`

This is easier to interpret than Walker F.
