# Native artifact signing status

Formal Marketplace publication is intentionally blocked.

The Dinotty host does not yet have an accepted Native Artifact Signing RFC that
defines the Ed25519/JCS descriptor, marketplace-root-authorized publisher keys,
revocation, minimum-safe-version, and downgrade policy. A registry SHA-256 alone
is not a sufficient trust root.

Development builds may be dev-linked or installed manually. They must not be
listed as formally trusted Marketplace artifacts. Once the host RFC is accepted,
this repository must add signed descriptors binding at least:

`pluginId`, `version`, `target`, `sha256`, compressed size, extraction limits,
`minAppVersion`, selected entry, and `publisherKeyId`.

Windows Authenticode and macOS signing/notarization remain additional platform
requirements; they do not replace the Marketplace signature.
