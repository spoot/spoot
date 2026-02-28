# Changelog

## [1.0.2] - 2026-02-28

- Removed the import and usage of `isProdUrl` from `@spoot/next-url`.
- Updated the `secure` cookie flag to be determined by `this.currentUrl.protocol === "https:"` for more accurate and flexible behavior.

## [1.0.1] - 2026-02-28

- Removed reliance on 'isProdUrl()' from '@spoot/next-url' for determining secure cookie flag.
- Updated the secure cookie flag to be set based on 'url.protocol === "https:"' for better accuracy and flexibility.

## [1.0.0] - 2026-02-28

- Initial release.
