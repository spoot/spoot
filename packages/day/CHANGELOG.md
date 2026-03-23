# Changelog

## [1.0.1] - 2026-03-23

- Corrected `DaySelector` to accurately check month and day boundaries, preventing overlaps that occurred with the previous `month * 31 + day` formula. This ensures correct matching for wrap-around ranges and respects actual month lengths, including leap years.
- Replaced the verbose `jest.config.ts` with a minimal `jest.config.js`, removing the `ts-node` dependency for parsing test configurations.

## [1.0.0] - 2026-02-28

- Initial release.
