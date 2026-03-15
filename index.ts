import { Command, program } from "commander";
import { TripIt } from "./src/tripit";

function requiredEnv(name: string): string {
	const val = process.env[name];
	if (!val) throw new Error(`Missing required env var: ${name}`);
	return val;
}

function createClient(): TripIt {
	return new TripIt({
		clientId: requiredEnv("TRIPIT_CLIENT_ID"),
		clientSecret: requiredEnv("TRIPIT_CLIENT_SECRET"),
		username: requiredEnv("TRIPIT_USERNAME"),
		password: requiredEnv("TRIPIT_PASSWORD"),
	});
}

function output(data: any, format: string, textFn: (data: any) => string) {
	if (format === "json") {
		console.log(JSON.stringify(data, null, 2));
	} else {
		console.log(textFn(data));
	}
}

function normalizeArray(node: any): any[] {
	if (!node) return [];
	if (Array.isArray(node)) return node;
	return [node];
}

function formatDeleteResult(resource: string, id: string, data: any): string {
	const lines = [`Deleted ${resource}: ${id}`];
	if (data?.timestamp) lines.push(`Timestamp: ${data.timestamp}`);
	return lines.join("\n");
}

function configureHelpOnError(cmd: Command): Command {
	cmd.showHelpAfterError(true);
	cmd.configureOutput({
		outputError: (str, write) => {
			write(`\n${str}`);
		},
	});
	return cmd;
}

program
	.name("tripit")
	.description("CLI for managing TripIt trips")
	.version("0.1.0");

program
	.command("login")
	.description("Authenticate with TripIt and cache the token")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (options) => {
		const client = createClient();
		await client.authenticate();
		output(
			{ message: "Authenticated successfully. Token cached." },
			options.output,
			(data) => data.message,
		);
	});

// === Trips ===

const trips = configureHelpOnError(
	new Command("trips").description("Manage trips"),
);

trips
	.command("list")
	.description("List all trips")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.option("--page-size <size>", "Page size", "100")
	.option("--page-num <num>", "Page number", "1")
	.option("--past", "Show past trips instead of current/future", false)
	.action(async (options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.listTrips(
			Number.parseInt(options.pageSize, 10),
			Number.parseInt(options.pageNum, 10),
			options.past,
		);
		output(result, options.output, (data) => {
			const trips = normalizeArray(data.Trip);
			if (!trips.length) return "No trips found.";
			const lines = trips.map((t, i) => {
				const name = t.display_name || "Unnamed";
				const loc = t.primary_location || "";
				const start = t.start_date || "?";
				const end = t.end_date || "?";
				return `${i + 1}. ${name}  ${start} - ${end}  ${loc}\n   UUID: ${t.uuid}`;
			});
			return lines.join("\n\n");
		});
	});

trips
	.command("get")
	.description("Get trip by ID")
	.argument("<id>", "Trip ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.getTrip(id);
		output(result, options.output, (data) => {
			const trip = data.Trip;
			const lines: string[] = [];
			lines.push(`${trip.display_name}`);
			lines.push(
				`${trip.start_date} - ${trip.end_date}  ${trip.primary_location || ""}`,
			);
			lines.push(`UUID: ${trip.uuid}`);

			const flights = normalizeArray(data.AirObject);
			if (flights.length) {
				lines.push("");
				lines.push("Flights:");
				for (const flight of flights) {
					const segments = normalizeArray(flight.Segment);
					for (const seg of segments) {
						const from = `${seg.start_city_name} (${seg.start_airport_code})`;
						const to = `${seg.end_city_name} (${seg.end_airport_code})`;
						const airline = seg.marketing_airline_code || "";
						const num = seg.marketing_flight_number || "";
						const date = seg.StartDateTime?.date || "";
						const dep = seg.StartDateTime?.time?.slice(0, 5) || "";
						const arr = seg.EndDateTime?.time?.slice(0, 5) || "";
						const dur = seg.duration || "";
						lines.push(
							`  ${airline}${num}  ${from} -> ${to}  ${date} ${dep}-${arr}  ${dur}`,
						);
					}
				}
			}

			const hotels = normalizeArray(data.LodgingObject);
			if (hotels.length) {
				lines.push("");
				lines.push("Hotels:");
				for (const h of hotels) {
					const checkin = h.StartDateTime?.date || "";
					const checkout = h.EndDateTime?.date || "";
					lines.push(
						`  ${h.display_name || h.supplier_name}  ${checkin} - ${checkout}`,
					);
					if (h.Address?.address) lines.push(`  ${h.Address.address}`);
				}
			}

			const transports = normalizeArray(data.TransportObject);
			if (transports.length) {
				lines.push("");
				lines.push("Transport:");
				for (const t of transports) {
					const seg = normalizeArray(t.Segment)[0];
					const date = seg?.StartDateTime?.date || "";
					const dep = seg?.StartDateTime?.time?.slice(0, 5) || "";
					const arr = seg?.EndDateTime?.time?.slice(0, 5) || "";
					lines.push(`  ${t.display_name}  ${date} ${dep}-${arr}`);
				}
			}

			const activities = normalizeArray(data.ActivityObject);
			if (activities.length) {
				lines.push("");
				lines.push("Activities:");
				for (const a of activities) {
					const date = a.StartDateTime?.date || "";
					const time = a.StartDateTime?.time?.slice(0, 5) || "";
					lines.push(`  ${a.display_name}  ${date} ${time}`);
				}
			}

			return lines.join("\n");
		});
	});

trips
	.command("create")
	.description("Create a new trip")
	.requiredOption("--name <name>", "Trip name")
	.option("--start <date>", "Start date (YYYY-MM-DD)")
	.option("--end <date>", "End date (YYYY-MM-DD)")
	.option("--location <location>", "Primary location")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (options) => {
		const today = new Date().toISOString().slice(0, 10);
		const client = createClient();
		await client.authenticate();
		const result = await client.createTrip({
			displayName: options.name,
			startDate: options.start || today,
			endDate: options.end || options.start || today,
			primaryLocation: options.location,
		});
		output(result, options.output, (data) => {
			const trip = data.Trip;
			return `Created: ${trip.display_name}  ${trip.start_date} - ${trip.end_date}  ${trip.primary_location || ""}\nUUID: ${trip.uuid}`;
		});
	});

trips
	.command("update")
	.description("Update a trip")
	.argument("<id>", "Trip ID or UUID")
	.option("--name <name>", "Trip name")
	.option("--start <date>", "Start date (YYYY-MM-DD)")
	.option("--end <date>", "End date (YYYY-MM-DD)")
	.option("--location <location>", "Primary location")
	.option("--description <description>", "Description")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.updateTrip({
			id,
			displayName: options.name,
			startDate: options.start,
			endDate: options.end,
			primaryLocation: options.location,
			description: options.description,
		});
		output(result, options.output, (data) => {
			const trip = data.Trip;
			return `Updated: ${trip.display_name}  ${trip.start_date} - ${trip.end_date}  ${trip.primary_location || ""}\nUUID: ${trip.uuid}`;
		});
	});

trips
	.command("delete")
	.description("Delete a trip")
	.argument("<id>", "Trip ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.deleteTrip(id);
		output(result, options.output, (data) =>
			formatDeleteResult("trip", id, data),
		);
	});

program.addCommand(trips);

// === Hotels ===

const hotels = configureHelpOnError(
	new Command("hotels").description("Manage hotel bookings"),
);

hotels
	.command("get")
	.description("Get hotel by ID")
	.argument("<id>", "Hotel ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.getHotel(id);
		output(result, options.output, (data) => {
			const h = data.LodgingObject;
			const lines = [
				`${h.display_name || h.supplier_name}`,
				`${h.StartDateTime?.date || ""} ${h.StartDateTime?.time?.slice(0, 5) || ""} - ${h.EndDateTime?.date || ""} ${h.EndDateTime?.time?.slice(0, 5) || ""}`,
				`UUID: ${h.uuid}`,
			];
			if (h.Address?.address) lines.push(`Address: ${h.Address.address}`);
			if (h.notes) lines.push(`Notes: ${h.notes}`);
			return lines.join("\n");
		});
	});

hotels
	.command("create")
	.description("Add a hotel to a trip")
	.requiredOption("--trip <uuid>", "Trip UUID")
	.requiredOption("--name <name>", "Hotel name")
	.requiredOption("--checkin <date>", "Check-in date (YYYY-MM-DD)")
	.requiredOption("--checkout <date>", "Check-out date (YYYY-MM-DD)")
	.option("--checkin-time <time>", "Check-in time (HH:MM)", "15:00")
	.option("--checkout-time <time>", "Check-out time (HH:MM)", "11:00")
	.option("--timezone <tz>", "Timezone", "UTC")
	.requiredOption("--address <address>", "Street address")
	.requiredOption("--city <city>", "City")
	.requiredOption("--country <country>", "Country code (e.g. JP, US)")
	.option("--state <state>", "State/province")
	.option("--zip <zip>", "Postal code")
	.option("--confirmation <num>", "Confirmation number")
	.option("--rate <rate>", "Booking rate")
	.option("--notes <notes>", "Notes")
	.option("--cost <cost>", "Total cost")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.createHotel({
			tripId: options.trip,
			hotelName: options.name,
			checkInDate: options.checkin,
			checkInTime: options.checkinTime,
			checkOutDate: options.checkout,
			checkOutTime: options.checkoutTime,
			timezone: options.timezone,
			street: options.address,
			city: options.city,
			country: options.country,
			state: options.state,
			zip: options.zip,
			supplierConfNum: options.confirmation,
			bookingRate: options.rate,
			notes: options.notes,
			totalCost: options.cost,
		});
		output(result, options.output, (data) => {
			const h = data.LodgingObject;
			return `Created: ${h.supplier_name}  ${h.StartDateTime?.date} - ${h.EndDateTime?.date}\nUUID: ${h.uuid}`;
		});
	});

hotels
	.command("update")
	.description("Update a hotel")
	.argument("<id>", "Hotel ID or UUID")
	.option("--trip <uuid>", "Trip UUID")
	.option("--name <name>", "Hotel name")
	.option("--checkin <date>", "Check-in date (YYYY-MM-DD)")
	.option("--checkout <date>", "Check-out date (YYYY-MM-DD)")
	.option("--checkin-time <time>", "Check-in time (HH:MM)")
	.option("--checkout-time <time>", "Check-out time (HH:MM)")
	.option("--timezone <tz>", "Timezone")
	.option("--address <address>", "Street address")
	.option("--city <city>", "City")
	.option("--country <country>", "Country code (e.g. JP, US)")
	.option("--state <state>", "State/province")
	.option("--zip <zip>", "Postal code")
	.option("--confirmation <num>", "Confirmation number")
	.option("--rate <rate>", "Booking rate")
	.option("--notes <notes>", "Notes")
	.option("--cost <cost>", "Total cost")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.updateHotel({
			id,
			tripId: options.trip,
			hotelName: options.name,
			checkInDate: options.checkin,
			checkInTime: options.checkinTime,
			checkOutDate: options.checkout,
			checkOutTime: options.checkoutTime,
			timezone: options.timezone,
			street: options.address,
			city: options.city,
			country: options.country,
			state: options.state,
			zip: options.zip,
			supplierConfNum: options.confirmation,
			bookingRate: options.rate,
			notes: options.notes,
			totalCost: options.cost,
		});
		output(result, options.output, (data) => {
			const h = data.LodgingObject;
			return `Updated: ${h.supplier_name}  ${h.StartDateTime?.date} - ${h.EndDateTime?.date}\nUUID: ${h.uuid}`;
		});
	});

hotels
	.command("delete")
	.description("Delete a hotel")
	.argument("<id>", "Hotel ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.deleteHotel(id);
		output(result, options.output, (data) =>
			formatDeleteResult("hotel", id, data),
		);
	});

hotels
	.command("attach-document")
	.description("Attach a document to a hotel reservation")
	.argument("<id>", "Hotel ID or UUID")
	.requiredOption("--file <path>", "Path to file")
	.option("--name <name>", "Document name/caption")
	.option("--mime-type <mime>", "Override MIME type")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.attachDocument({
			objectType: "lodging",
			objectId: id,
			filePath: options.file,
			caption: options.name,
			mimeType: options.mimeType,
		});
		output(result, options.output, (data) => {
			const h = data.LodgingObject;
			return `Attached document to hotel: ${h.display_name || h.supplier_name}\nUUID: ${h.uuid}`;
		});
	});

hotels
	.command("remove-document")
	.description("Remove a document from a hotel reservation")
	.argument("<id>", "Hotel ID or UUID")
	.option("--uuid <uuid>", "Attachment UUID to remove")
	.option("--image-uuid <uuid>", "Deprecated alias for --uuid")
	.option("--url <url>", "Document URL to remove")
	.option("--caption <caption>", "Remove first document with matching caption")
	.option("--index <number>", "1-based document index to remove")
	.option("--all", "Remove all documents", false)
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const uuid = options.uuid ?? options.imageUuid;
		const selectorCount = [
			Boolean(uuid),
			Boolean(options.url),
			Boolean(options.caption),
			options.index !== undefined,
			Boolean(options.all),
		].filter(Boolean).length;
		if (selectorCount !== 1) {
			throw new Error(
				"Provide exactly one selector: --uuid, --url, --caption, --index, or --all",
			);
		}

		const client = createClient();
		await client.authenticate();
		const parsedIndex =
			options.index !== undefined
				? Number.parseInt(options.index, 10)
				: undefined;
		if (
			parsedIndex !== undefined &&
			(!Number.isFinite(parsedIndex) || parsedIndex < 1)
		) {
			throw new Error("--index must be a positive integer");
		}
		const result = await client.removeDocument({
			objectType: "lodging",
			objectId: id,
			imageUuid: uuid,
			imageUrl: options.url,
			caption: options.caption,
			index: parsedIndex,
			removeAll: options.all,
		});
		output(result, options.output, (data) => {
			const h = data.LodgingObject;
			const images = normalizeArray(h.Image);
			return `Removed document(s) from hotel: ${h.display_name || h.supplier_name}\nUUID: ${h.uuid}\nRemaining documents: ${images.length}`;
		});
	});

program.addCommand(hotels);

// === Flights ===

const flights = configureHelpOnError(
	new Command("flights").description("Manage flights"),
);

flights
	.command("get")
	.description("Get flight by ID")
	.argument("<id>", "Flight ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.getFlight(id);
		output(result, options.output, (data) => {
			const f = data.AirObject;
			const seg = normalizeArray(f.Segment)[0];
			const from = `${seg?.start_city_name || ""} (${seg?.start_airport_code || ""})`;
			const to = `${seg?.end_city_name || ""} (${seg?.end_airport_code || ""})`;
			return [
				`${f.display_name || "Flight"}`,
				`${from} -> ${to}`,
				`${seg?.StartDateTime?.date || ""} ${seg?.StartDateTime?.time?.slice(0, 5) || ""} - ${seg?.EndDateTime?.time?.slice(0, 5) || ""}`,
				`UUID: ${f.uuid}`,
			].join("\n");
		});
	});

flights
	.command("create")
	.description("Add a flight to a trip")
	.requiredOption("--trip <uuid>", "Trip UUID")
	.requiredOption("--name <name>", "Display name")
	.requiredOption("--airline <name>", "Airline name")
	.requiredOption("--from <city>", "Departure city")
	.requiredOption("--from-code <code>", "Departure country code")
	.requiredOption("--to <city>", "Arrival city")
	.requiredOption("--to-code <code>", "Arrival country code")
	.requiredOption("--airline-code <code>", "Airline code (e.g. NH, JL)")
	.requiredOption("--flight-num <num>", "Flight number")
	.requiredOption("--depart-date <date>", "Departure date (YYYY-MM-DD)")
	.requiredOption("--depart-time <time>", "Departure time (HH:MM)")
	.requiredOption("--depart-tz <tz>", "Departure timezone")
	.requiredOption("--arrive-date <date>", "Arrival date (YYYY-MM-DD)")
	.requiredOption("--arrive-time <time>", "Arrival time (HH:MM)")
	.requiredOption("--arrive-tz <tz>", "Arrival timezone")
	.option("--aircraft <type>", "Aircraft type")
	.option("--class <class>", "Service class")
	.option("--confirmation <num>", "Confirmation number")
	.option("--notes <notes>", "Notes")
	.option("--cost <cost>", "Total cost")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.createFlight({
			tripId: options.trip,
			displayName: options.name,
			supplierName: options.airline,
			supplierConfNum: options.confirmation,
			notes: options.notes,
			totalCost: options.cost,
			segments: [
				{
					startDate: options.departDate,
					startTime: options.departTime,
					startTimezone: options.departTz,
					endDate: options.arriveDate,
					endTime: options.arriveTime,
					endTimezone: options.arriveTz,
					startCityName: options.from,
					startCountryCode: options.fromCode,
					endCityName: options.to,
					endCountryCode: options.toCode,
					marketingAirline: options.airlineCode,
					marketingFlightNumber: options.flightNum,
					aircraft: options.aircraft,
					serviceClass: options.class,
				},
			],
		});
		output(result, options.output, (data) => {
			const f = data.AirObject;
			const seg = normalizeArray(f.Segment)[0];
			return `Created: ${f.display_name}  ${seg?.start_city_name} -> ${seg?.end_city_name}\nUUID: ${f.uuid}`;
		});
	});

flights
	.command("update")
	.description("Update a flight")
	.argument("<id>", "Flight ID or UUID")
	.option("--trip <uuid>", "Trip UUID")
	.option("--name <name>", "Display name")
	.option("--airline <name>", "Airline name")
	.option("--from <city>", "Departure city")
	.option("--from-code <code>", "Departure country code")
	.option("--to <city>", "Arrival city")
	.option("--to-code <code>", "Arrival country code")
	.option("--airline-code <code>", "Airline code (e.g. NH, JL)")
	.option("--flight-num <num>", "Flight number")
	.option("--depart-date <date>", "Departure date (YYYY-MM-DD)")
	.option("--depart-time <time>", "Departure time (HH:MM)")
	.option("--depart-tz <tz>", "Departure timezone")
	.option("--arrive-date <date>", "Arrival date (YYYY-MM-DD)")
	.option("--arrive-time <time>", "Arrival time (HH:MM)")
	.option("--arrive-tz <tz>", "Arrival timezone")
	.option("--aircraft <type>", "Aircraft type")
	.option("--class <class>", "Service class")
	.option("--confirmation <num>", "Confirmation number")
	.option("--notes <notes>", "Notes")
	.option("--cost <cost>", "Total cost")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.updateFlight({
			id,
			tripId: options.trip,
			displayName: options.name,
			supplierName: options.airline,
			supplierConfNum: options.confirmation,
			notes: options.notes,
			totalCost: options.cost,
			segment: {
				startDate: options.departDate,
				startTime: options.departTime,
				startTimezone: options.departTz,
				endDate: options.arriveDate,
				endTime: options.arriveTime,
				endTimezone: options.arriveTz,
				startCityName: options.from,
				startCountryCode: options.fromCode,
				endCityName: options.to,
				endCountryCode: options.toCode,
				marketingAirline: options.airlineCode,
				marketingFlightNumber: options.flightNum,
				aircraft: options.aircraft,
				serviceClass: options.class,
			},
		});
		output(result, options.output, (data) => {
			const f = data.AirObject;
			const seg = normalizeArray(f.Segment)[0];
			return `Updated: ${f.display_name}  ${seg?.start_city_name} -> ${seg?.end_city_name}\nUUID: ${f.uuid}`;
		});
	});

flights
	.command("delete")
	.description("Delete a flight")
	.argument("<id>", "Flight ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.deleteFlight(id);
		output(result, options.output, (data) =>
			formatDeleteResult("flight", id, data),
		);
	});

program.addCommand(flights);

// === Transport ===

const transport = configureHelpOnError(
	new Command("transport").description("Manage transport"),
);

transport
	.command("get")
	.description("Get transport by ID")
	.argument("<id>", "Transport ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.getTransport(id);
		output(result, options.output, (data) => {
			const t = data.TransportObject;
			const seg = normalizeArray(t.Segment)[0];
			return [
				`${t.display_name || "Transport"}`,
				`${seg?.StartDateTime?.date || ""} ${seg?.StartDateTime?.time?.slice(0, 5) || ""} - ${seg?.EndDateTime?.time?.slice(0, 5) || ""}`,
				`From: ${seg?.StartLocationAddress?.address || ""}`,
				`To: ${seg?.EndLocationAddress?.address || ""}`,
				`UUID: ${t.uuid}`,
			].join("\n");
		});
	});

transport
	.command("create")
	.description("Add transport to a trip")
	.requiredOption("--trip <uuid>", "Trip UUID")
	.requiredOption("--from <address>", "Start address")
	.requiredOption("--to <address>", "End address")
	.requiredOption("--depart-date <date>", "Departure date (YYYY-MM-DD)")
	.requiredOption("--depart-time <time>", "Departure time (HH:MM)")
	.requiredOption("--arrive-date <date>", "Arrival date (YYYY-MM-DD)")
	.requiredOption("--arrive-time <time>", "Arrival time (HH:MM)")
	.requiredOption("--timezone <tz>", "Timezone")
	.option("--from-name <name>", "Start location name")
	.option("--to-name <name>", "End location name")
	.option("--name <name>", "Display name")
	.option("--vehicle <desc>", "Vehicle description")
	.option("--carrier <name>", "Carrier name")
	.option("--confirmation <num>", "Confirmation number")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.createTransport({
			tripId: options.trip,
			startAddress: options.from,
			endAddress: options.to,
			startDate: options.departDate,
			startTime: options.departTime,
			endDate: options.arriveDate,
			endTime: options.arriveTime,
			timezone: options.timezone,
			startLocationName: options.fromName,
			endLocationName: options.toName,
			displayName: options.name,
			vehicleDescription: options.vehicle,
			carrierName: options.carrier,
			confirmationNum: options.confirmation,
		});
		output(result, options.output, (data) => {
			const t = data.TransportObject;
			return `Created: ${t.display_name}\nUUID: ${t.uuid}`;
		});
	});

transport
	.command("update")
	.description("Update transport")
	.argument("<id>", "Transport ID or UUID")
	.option("--trip <uuid>", "Trip UUID")
	.option("--from <address>", "Start address")
	.option("--to <address>", "End address")
	.option("--depart-date <date>", "Departure date (YYYY-MM-DD)")
	.option("--depart-time <time>", "Departure time (HH:MM)")
	.option("--arrive-date <date>", "Arrival date (YYYY-MM-DD)")
	.option("--arrive-time <time>", "Arrival time (HH:MM)")
	.option("--timezone <tz>", "Timezone")
	.option("--from-name <name>", "Start location name")
	.option("--to-name <name>", "End location name")
	.option("--name <name>", "Display name")
	.option("--vehicle <desc>", "Vehicle description")
	.option("--carrier <name>", "Carrier name")
	.option("--confirmation <num>", "Confirmation number")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.updateTransport({
			id,
			tripId: options.trip,
			startAddress: options.from,
			endAddress: options.to,
			startDate: options.departDate,
			startTime: options.departTime,
			endDate: options.arriveDate,
			endTime: options.arriveTime,
			timezone: options.timezone,
			startLocationName: options.fromName,
			endLocationName: options.toName,
			displayName: options.name,
			vehicleDescription: options.vehicle,
			carrierName: options.carrier,
			confirmationNum: options.confirmation,
		});
		output(result, options.output, (data) => {
			const t = data.TransportObject;
			return `Updated: ${t.display_name}\nUUID: ${t.uuid}`;
		});
	});

transport
	.command("delete")
	.description("Delete transport")
	.argument("<id>", "Transport ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.deleteTransport(id);
		output(result, options.output, (data) =>
			formatDeleteResult("transport", id, data),
		);
	});

program.addCommand(transport);

// === Activities ===

const activities = configureHelpOnError(
	new Command("activities").description("Manage activities"),
);

activities
	.command("get")
	.description("Get activity by ID")
	.argument("<id>", "Activity ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.getActivity(id);
		output(result, options.output, (data) => {
			const a = data.ActivityObject;
			return [
				`${a.display_name || "Activity"}`,
				`${a.StartDateTime?.date || ""} ${a.StartDateTime?.time?.slice(0, 5) || ""} - ${a.EndDateTime?.time?.slice(0, 5) || ""}`,
				`Location: ${a.location_name || ""}`,
				`Address: ${a.Address?.address || ""}`,
				`UUID: ${a.uuid}`,
			].join("\n");
		});
	});

activities
	.command("create")
	.description("Add an activity to a trip")
	.requiredOption("--trip <uuid>", "Trip UUID")
	.requiredOption("--name <name>", "Activity name")
	.requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
	.requiredOption("--start-time <time>", "Start time (HH:MM)")
	.requiredOption("--end-date <date>", "End date (YYYY-MM-DD)")
	.requiredOption("--end-time <time>", "End time (HH:MM)")
	.requiredOption("--timezone <tz>", "Timezone")
	.requiredOption("--address <address>", "Address")
	.requiredOption("--location-name <name>", "Location/venue name")
	.option("--city <city>", "City")
	.option("--state <state>", "State/province")
	.option("--zip <zip>", "Postal code")
	.option("--country <country>", "Country code")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.createActivity({
			tripId: options.trip,
			displayName: options.name,
			startDate: options.startDate,
			startTime: options.startTime,
			endDate: options.endDate,
			endTime: options.endTime,
			timezone: options.timezone,
			address: options.address,
			locationName: options.locationName,
			city: options.city,
			state: options.state,
			zip: options.zip,
			country: options.country,
		});
		output(result, options.output, (data) => {
			const a = data.ActivityObject;
			return `Created: ${a.display_name}  ${a.StartDateTime?.date} ${a.StartDateTime?.time?.slice(0, 5)}\nUUID: ${a.uuid}`;
		});
	});

activities
	.command("update")
	.description("Update an activity")
	.argument("<id>", "Activity ID or UUID")
	.option("--trip <uuid>", "Trip UUID")
	.option("--name <name>", "Activity name")
	.option("--start-date <date>", "Start date (YYYY-MM-DD)")
	.option("--start-time <time>", "Start time (HH:MM)")
	.option("--end-date <date>", "End date (YYYY-MM-DD)")
	.option("--end-time <time>", "End time (HH:MM)")
	.option("--timezone <tz>", "Timezone")
	.option("--address <address>", "Address")
	.option("--location-name <name>", "Location/venue name")
	.option("--city <city>", "City")
	.option("--state <state>", "State/province")
	.option("--zip <zip>", "Postal code")
	.option("--country <country>", "Country code")
	.option("--notes <notes>", "Notes")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.updateActivity({
			id,
			tripId: options.trip,
			displayName: options.name,
			startDate: options.startDate,
			startTime: options.startTime,
			endDate: options.endDate,
			endTime: options.endTime,
			timezone: options.timezone,
			address: options.address,
			locationName: options.locationName,
			city: options.city,
			state: options.state,
			zip: options.zip,
			country: options.country,
			notes: options.notes,
		});
		output(result, options.output, (data) => {
			const a = data.ActivityObject;
			return `Updated: ${a.display_name}  ${a.StartDateTime?.date} ${a.StartDateTime?.time?.slice(0, 5)}\nUUID: ${a.uuid}`;
		});
	});

activities
	.command("delete")
	.description("Delete an activity")
	.argument("<id>", "Activity ID or UUID")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		const client = createClient();
		await client.authenticate();
		const result = await client.deleteActivity(id);
		output(result, options.output, (data) =>
			formatDeleteResult("activity", id, data),
		);
	});

program.addCommand(activities);

// === Documents ===

const documents = configureHelpOnError(
	new Command("documents").description("Manage document attachments"),
);

const validTypes = ["lodging", "activity", "air", "transport"] as const;

documents
	.command("attach")
	.description("Attach a document to a trip object")
	.argument("<id>", "UUID of the object to attach to")
	.option(
		"--type <type>",
		"Object type (lodging, activity, air, transport) — auto-detected if omitted",
	)
	.requiredOption("--file <path>", "Path to file")
	.option("--caption <name>", "Document caption (defaults to filename)")
	.option("--mime-type <type>", "Override MIME type (auto-detected from file)")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		if (options.type && !validTypes.includes(options.type)) {
			console.error(
				`Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`,
			);
			process.exit(1);
		}
		const client = createClient();
		await client.authenticate();
		const result = await client.attachDocument({
			objectType: options.type,
			objectId: id,
			filePath: options.file,
			caption: options.caption,
			mimeType: options.mimeType,
		});
		const keyToType: Record<string, string> = {
			LodgingObject: "lodging",
			ActivityObject: "activity",
			AirObject: "air",
			TransportObject: "transport",
		};
		output(result, options.output, (data) => {
			const objKey = Object.keys(keyToType).find(
				(k) => data[k as keyof typeof data],
			);
			const detectedType = objKey
				? keyToType[objKey]
				: options.type || "object";
			const obj = objKey ? data[objKey as keyof typeof data] : undefined;
			const name =
				(obj as Record<string, string>)?.display_name ||
				(obj as Record<string, string>)?.supplier_name ||
				detectedType;
			return `Attached document to ${detectedType}: ${name}\nUUID: ${(obj as Record<string, string>)?.uuid || id}`;
		});
	});

documents
	.command("remove")
	.description("Remove a document from a trip object")
	.argument("<id>", "UUID of the object to remove the document from")
	.option(
		"--type <type>",
		"Object type (lodging, activity, air, transport) — auto-detected if omitted",
	)
	.option("--image-uuid <uuid>", "UUID of the image to remove")
	.option("--image-url <url>", "URL of the image to remove")
	.option("--caption <caption>", "Caption of the image to remove")
	.option("--index <index>", "1-based index of the image to remove")
	.option("--all", "Remove all documents")
	.option("-o, --output <format>", "Output format (text or json)", "text")
	.action(async (id, options) => {
		if (options.type && !validTypes.includes(options.type)) {
			console.error(
				`Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`,
			);
			process.exit(1);
		}
		const selectors = [
			options.imageUuid,
			options.imageUrl,
			options.caption,
			options.index,
			options.all,
		].filter(Boolean).length;
		if (selectors !== 1) {
			console.error(
				"Provide exactly one selector: --image-uuid, --image-url, --caption, --index, or --all",
			);
			process.exit(1);
		}
		const client = createClient();
		await client.authenticate();
		const result = await client.removeDocument({
			objectType: options.type,
			objectId: id,
			imageUuid: options.imageUuid,
			imageUrl: options.imageUrl,
			caption: options.caption,
			index: options.index ? Number.parseInt(options.index, 10) : undefined,
			removeAll: options.all,
		});
		const keyToType: Record<string, string> = {
			LodgingObject: "lodging",
			ActivityObject: "activity",
			AirObject: "air",
			TransportObject: "transport",
		};
		output(result, options.output, (data) => {
			const objKey = Object.keys(keyToType).find(
				(k) => data[k as keyof typeof data],
			);
			const detectedType = objKey
				? keyToType[objKey]
				: options.type || "object";
			const obj = objKey ? data[objKey as keyof typeof data] : undefined;
			const name =
				(obj as Record<string, string>)?.display_name ||
				(obj as Record<string, string>)?.supplier_name ||
				detectedType;
			return `Removed document from ${detectedType}: ${name}\nUUID: ${(obj as Record<string, string>)?.uuid || id}`;
		});
	});

program.addCommand(documents);

program.parse();
