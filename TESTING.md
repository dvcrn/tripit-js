# Reservation regression coverage

Based on John P White (@diverdown1964)'s [MCP PR #2](https://github.com/dvcrn/mcp-server-tripit/pull/2), source commit `17530a655da61cfc70d617d0caa2daa0f0a07d44`.

Validated with Bun 1.3.10, TypeScript 5.9.3, Biome 2.3.11 and the committed `bun.lock`.

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

On 2026-10-03, the configured dev-marked profile was authenticated with a fresh
cache and bound by UUID. Live car and hotel creation, read-back, partial edits,
concurrent edits, null/empty semantics, custom names, PDF attachment, document
preservation, auto-detection, selective removal and last-document removal passed.
Both reservations and their parent trip were deleted and verified absent.
Earlier failed fixture runs also completed and verified cleanup. No package was
published. The in-process lock cannot prevent edits from other processes or the
TripIt application; activity/air/transport update preservation is outside this change.

CancellationDateTime preservation is covered with deterministic returned-object fixtures.
The dev API accepted a synthetic cancellation timestamp but did not return it, so
live cancellation round-trip behavior remains unverified. That seed run deleted
and verified both reservations and its trip. Public hotel phone and hotel/car
custom names are asserted against their requested values before preservation checks.
