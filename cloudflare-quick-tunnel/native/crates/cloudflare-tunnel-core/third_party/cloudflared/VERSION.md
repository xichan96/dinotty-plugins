# cloudflared protocol assets

- Release: `2026.7.2`
- Commit: `8679787525edc8575b2948a7c4a50b6292c6d426`
- License: Apache-2.0 (`LICENSE-APACHE`)
- Retrieved from the repository-local audited checkout at `../cloudflared` on 2026-07-16.

## Files and hashes

| Local file | Upstream source | SHA-256 |
|---|---|---|
| `schemas/tunnelrpc.capnp` | `tunnelrpc/proto/tunnelrpc.capnp` | `448AA30F4E251DC8810ABA1A16C60EBEAAA5E000F88C46A8A28BA29F73E3BC3C` |
| `schemas/go.capnp` | `tunnelrpc/proto/go.capnp` | `E6723446565E5D8CBBC97FBB6123E0E3283ADE1E3EC5884D879A0F78DF16F8C1` |
| `cf-edge-roots.pem` | certificate PEM blocks from `tlsconfig/cloudflare_ca.go` | `02D22CCD469A66DCE563FDA77084593CCD5016E47468B873E073D58B033D5FCE` |
| `LICENSE-APACHE` | `LICENSE` | `49BBE9114E49214DF2CCC324CB3AC8D1D1AA1C3A0947F94C286765E86647B32E` |

The schema texts match the pinned checkout after normalizing CRLF/LF. The certificate file contains exactly the three PEM blocks from `cloudflareRootCA`, without surrounding Go source.
