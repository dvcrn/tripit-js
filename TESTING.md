# Reservation regression coverage

Based on John P White (@diverdown1964)'s [MCP PR #2](https://github.com/dvcrn/mcp-server-tripit/pull/2), source commit `17530a655da61cfc70d617d0caa2daa0f0a07d44`.

Use Bun 1.3.10 and the committed `bun.lock`; `mise run build` uses Biome 2.3.11.

```sh
bun install --frozen-lockfile
bun test
bun run check
mise run build
bun run build
```

The offline suite covers XSD ordering, read-only stripping, unknown-field rejection,
custom names with boolean/string false flags, nested partial updates, explicit null
clearing, empty/undefined preservation, image replacement, all document selectors,
concurrent attachments/edits, canonical numeric-ID/UUID locking, failed-lock recovery,
car endpoint routing and propagation of authentication/server errors.

The opt-in live harness uses configured credentials and checks
`TRIPIT_DEV_IDENTITY` against the authenticated profile before mutations. Set it
to the independently confirmed dev account email, screen name or UUID. Launch
with a fresh `HOME` so another account's token cannot be reused. Credentials and
identity must be supplied through the configured secret mechanism, never committed.

```sh
tripit_test_home=$(mktemp -d)
fnox x -- env HOME="$tripit_test_home" TRIPIT_LIVE_TEST=1 bun test/live/reservations.ts
```

Remove that temporary HOME after the run. The harness creates only synthetic
objects in a dedicated trip and exits unsuccessfully on any assertion or cleanup
failure. It uses a valid generated PDF for document uploads.

The live suite covers car/hotel creation, partial and concurrent edits, Agency
metadata, custom names, clearing semantics, and document attachment/removal.
Cancellation timestamp preservation has offline coverage only.
