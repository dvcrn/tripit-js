# tripit

JavaScript client and CLI for the [TripIt](https://www.tripit.com/) API.

```bash
npm install tripit          # library
npm install -g tripit       # CLI
```

Authenticate with `TRIPIT_USERNAME` and `TRIPIT_PASSWORD`. `clientId` is optional and defaults to the public TripIt mobile app client ID.

## SDK

```ts
import TripIt from "tripit";

const client = new TripIt({
  username: process.env.TRIPIT_USERNAME!,
  password: process.env.TRIPIT_PASSWORD!,
});

await client.authenticate();

const trips = await client.listTrips();

const trip = await client.createTrip({
  displayName: "Tokyo",
  startDate: "2026-04-01",
  endDate: "2026-04-04",
  primaryLocation: "Tokyo",
});
const tripId = trip.Trip.uuid;
```

Add reservations to that trip:

```ts
const hotel = await client.createHotel({
  tripId,
  hotelName: "Example Hotel",
  checkInDate: "2026-04-01",
  checkInTime: "15:00",
  checkOutDate: "2026-04-04",
  checkOutTime: "11:00",
  timezone: "Asia/Tokyo",
  street: "1-1 Example",
  city: "Tokyo",
  country: "JP",
});

await client.createFlight({
  tripId,
  displayName: "SFO to HND",
  supplierName: "Example Air",
  segments: [
    {
      startDate: "2026-04-01",
      startTime: "11:00",
      startTimezone: "America/Los_Angeles",
      endDate: "2026-04-02",
      endTime: "15:00",
      endTimezone: "Asia/Tokyo",
      startCityName: "San Francisco",
      startCountryCode: "US",
      endCityName: "Tokyo",
      endCountryCode: "JP",
      marketingAirline: "EA",
      marketingFlightNumber: "123",
    },
  ],
});

await client.createCar({
  tripId,
  supplierName: "Example Rentals",
  pickupDate: "2026-04-01",
  dropoffDate: "2026-04-04",
  timezone: "Asia/Tokyo",
});
```

Hotel and car updates keep omitted fields, including custom names and documents. `undefined` and `""` leave a value unchanged; `null` clears it. `tripId: null` is rejected.

```ts
await client.updateHotel({
  uuid: hotel.LodgingObject.uuid,
  displayName: "Updated Hotel",
  notes: null,
});

await client.attachDocument({
  objectId: hotel.LodgingObject.uuid,
  filePath: "./confirmation.pdf",
  caption: "Booking confirmation",
});
```

The same `get` / `create` / `update` / `delete` pattern covers trips, hotels, flights, transport, activities, and cars. `objectType` on document calls is optional. Types are exported from the package.

## CLI

```bash
tripit login
tripit trips create --name "Tokyo" --start 2026-04-01 --end 2026-04-04 --location Tokyo
tripit trips list
tripit --help
```

Use `-o json` when you need machine-readable output.
