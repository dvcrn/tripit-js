# tripit-cli (and library) for JS

`tripit` works as both:

- a CLI (`tripit ...`)
- a JavaScript package (`import TripIt from "tripit"`)

## Install

Library:

```bash
npm install tripit
```

CLI:

```bash
npm install -g tripit
```

## CLI

Show available commands:

```bash
tripit --help
```

### Agent Skill Installation

Install with `npx skills`:

```bash
npx skills add dvcrn/tripit
npx skills add dvcrn/tripit --full-depth --list
```

Install with Claude plugin marketplace CLI:

```bash
claude plugin marketplace add dvcrn/tripit
claude plugin install tripit@dvcrn-tripit --scope user
```

If the marketplace is already configured, update before reinstall tests:

```bash
claude plugin marketplace update dvcrn-tripit
claude plugin install tripit@dvcrn-tripit --scope user
```

Claude UI flow:

1. Open Claude plugin marketplace UI.
2. Add or select `dvcrn/tripit`.
3. Install plugin `tripit` from marketplace `dvcrn-tripit`.

### Common Workflow

1. Authenticate:

```bash
tripit login
```

2. Create a trip:

```bash
tripit trips create --name "Test Trip" --start 2026-03-20 --end 2026-03-23 --location "Tokyo" -o json
```

3. List and inspect the trip:

```bash
tripit trips list
tripit trips get <TRIP_UUID>
```

4. Add reservations/activities:

```bash
tripit hotels create --trip <TRIP_UUID> --name "Test Hotel" --checkin 2026-03-20 --checkout 2026-03-23 --checkin-time 15:00 --checkout-time 11:00 --timezone UTC --address "1 Market St" --city "San Francisco" --country US -o json

tripit flights create --trip <TRIP_UUID> --name "Test Flight" --airline "Example Air" --from "San Francisco" --from-code US --to "Seattle" --to-code US --airline-code EA --flight-num 123 --depart-date 2026-03-20 --depart-time 10:00 --depart-tz UTC --arrive-date 2026-03-20 --arrive-time 14:00 --arrive-tz UTC -o json

tripit transport create --trip <TRIP_UUID> --from "1 Market St" --to "SFO Airport" --depart-date 2026-03-20 --depart-time 08:00 --arrive-date 2026-03-20 --arrive-time 09:00 --timezone UTC --name "Hotel to Airport" -o json

tripit activities create --trip <TRIP_UUID> --name "Dinner" --start-date 2026-03-20 --start-time 19:00 --end-date 2026-03-20 --end-time 21:00 --timezone UTC --address "200 Example St" --location-name "Downtown" -o json
```

5. Update resources:

```bash
tripit trips update <TRIP_UUID> --name "Updated Test Trip"
tripit hotels update <HOTEL_UUID> --name "Updated Hotel"
tripit flights update <FLIGHT_UUID> --name "Updated Flight"
tripit transport update <TRANSPORT_UUID> --name "Updated Transport"
tripit activities update <ACTIVITY_UUID> --name "Updated Activity"
```

6. Attach and remove documents (images/PDFs):

```bash
tripit documents attach <HOTEL_UUID> --file ./confirmation.pdf --caption "Booking Confirmation"
tripit documents attach <HOTEL_UUID> --file ./photo.png --type lodging
tripit documents remove <HOTEL_UUID> --caption "Booking Confirmation"
tripit documents remove <HOTEL_UUID> --index 1
tripit documents remove <HOTEL_UUID> --all
```

The `--type` flag (lodging, activity, air, transport) is auto-detected from the UUID when omitted.

7. Delete resources:

```bash
tripit activities delete <ACTIVITY_UUID>
tripit transport delete <TRANSPORT_UUID>
tripit flights delete <FLIGHT_UUID>
tripit hotels delete <HOTEL_UUID>
tripit trips delete <TRIP_UUID>
```

## Library Usage

```ts
import TripIt from "tripit";

const client = new TripIt({
  username: process.env.TRIPIT_USERNAME!,
  password: process.env.TRIPIT_PASSWORD!,
});

await client.authenticate();

const list = await client.listTrips(20, 1, false);
console.log(list.Trip);

const created = await client.createTrip({
  displayName: "SDK Trip Example",
  startDate: "2026-04-01",
  endDate: "2026-04-04",
  primaryLocation: "New York",
});

console.log(created.Trip.uuid);
```

`clientId` is optional. If omitted, the library uses the public TripIt mobile app client ID by default.

The package also exports types from `src/types.ts`.

### Car rentals and partial reservation updates

`TripIt` supports `getCar(id)`, `createCar(params)`, `updateCar(params)` and
`deleteCar(id)`. `createCar` requires `tripId`, `supplierName`, `pickupDate` and
`dropoffDate`; optional pickup/dropoff times, timezones, addresses, location
names, `displayName`, `supplierConfNum`, `carType`, `carDescription`, `notes` and
`totalCost` describe the reservation.

Hotel and car updates preserve omitted fields, including custom display names
and documents. `undefined` and empty strings leave values unchanged; `null`
explicitly clears a field. `tripId: null` is rejected; a reservation must remain associated with a trip. Clearing required fields may be rejected by TripIt.
`updateHotel` also accepts `phone` and `displayName`. Unknown returned fields
abort an update rather than risk losing data.

`attachDocument` and `removeDocument` accept `objectType: "car"`, or detect the
object type when omitted. Hotel/car edits and document changes serialize within
one process. Concurrent edits in other processes or the TripIt app remain subject
to TripIt's whole-object replacement behavior. Other reservation types retain
their existing update behavior.

Adapted from [John P White (@diverdown1964)'s contribution](https://github.com/dvcrn/mcp-server-tripit/pull/2).

### Development checks

Use Bun 1.3.10 and the committed lockfile:

```sh
bun install --frozen-lockfile
bun test
bun run check
mise run build
```

Live tests require configured credentials and `TRIPIT_DEV_IDENTITY` set to the
confirmed dev profile email, screen name or UUID. Use a fresh token cache:

```sh
tripit_test_home=$(mktemp -d)
fnox x -- env HOME="$tripit_test_home" TRIPIT_LIVE_TEST=1 bun test/live/reservations.ts
```

The harness creates synthetic reservations and verifies their deletion. Assertion
or cleanup failures fail the run. Remove the temporary HOME afterward; never
commit credentials, token caches, or raw responses. Cancellation timestamp
preservation has offline coverage only.
