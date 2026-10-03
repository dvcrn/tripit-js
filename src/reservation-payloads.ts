// Adapted from John P White (diverdown1964), mcp-server-tripit#2.
// TripIt replaces whole reservations and validates fields in XSD order.
import { IMAGE_FIELD_ORDER } from "./constants";

type Obj = Record<string, unknown>;
export type Kind = "car" | "lodging";

// Writable reservation fields, in TripIt's XSD order (shared by every reservation type).
const RESERVATION_FIELDS = [
	"Image",
	"CancellationDateTime",
	"booking_date",
	"booking_rate",
	"booking_site_conf_num",
	"booking_site_name",
	"booking_site_phone",
	"booking_site_email_address",
	"booking_site_url",
	"record_locator",
	"supplier_conf_num",
	"supplier_contact",
	"supplier_email_address",
	"supplier_name",
	"supplier_phone",
	"supplier_url",
	"is_purchased",
	"notes",
	"restrictions",
	"total_cost",
	"Agency",
] as const;

export const CAR_FIELDS: readonly string[] = [
	"uuid",
	"trip_id",
	"trip_uuid",
	"is_client_traveler",
	"display_name",
	...RESERVATION_FIELDS,
	"StartDateTime",
	"EndDateTime",
	"StartLocationAddress",
	"EndLocationAddress",
	"Driver",
	"start_location_hours",
	"start_location_name",
	"start_location_phone",
	"end_location_hours",
	"end_location_name",
	"end_location_phone",
	"car_description",
	"car_type",
	"mileage_charges",
];

export const LODGING_FIELDS: readonly string[] = [
	"uuid",
	"trip_id",
	"trip_uuid",
	"is_client_traveler",
	"display_name",
	...RESERVATION_FIELDS,
	"StartDateTime",
	"EndDateTime",
	"Address",
	"Guest",
	"number_guests",
	"number_rooms",
	"room_type",
];

// What TripIt returns but never accepts back (sending them gets a 400) or computes itself.
// display_name is writable but only kept while custom (see mergeReplace).
const READ_ONLY_FIELDS = new Set([
	"id",
	"relative_url",
	"is_display_name_auto_generated",
	"last_modified",
	"is_tripit_booking",
	"has_possible_cancellation",
	"is_concur_booked",
	"EstimatedStartDateTime",
	"EstimatedEndDateTime",
	"ReservationHolder",
]);

const AGENCY_KEYS = [
	"agency_conf_num",
	"agency_name",
	"agency_client_name",
	"agency_phone",
	"agency_email_address",
	"agency_url",
	"agency_contact",
];
const DATETIME_KEYS = ["date", "time", "timezone"];
const ADDRESS_KEYS = [
	"address",
	"addr1",
	"addr2",
	"city",
	"state",
	"zip",
	"country",
];
const TRAVELER_KEYS = [
	"first_name",
	"middle_name",
	"last_name",
	"frequent_traveler_num",
	"frequent_traveler_supplier",
	"meal_preference",
	"seat_preference",
	"ticket_num",
];
const DATETIME_FIELDS = new Set([
	"StartDateTime",
	"EndDateTime",
	"CancellationDateTime",
]);
// Nested keys TripIt returns, writable or read-only (utc_offset and is_timezone_manual it computes;
// coordinates it geocodes). Any other nested key refuses the update, like an unknown top-level one.
const NESTED_KNOWN: Record<string, Set<string>> = {
	Agency: new Set([...AGENCY_KEYS, "partner_agency_id"]),
};
const ADDRESS_FIELDS = new Set([
	"Address",
	"StartLocationAddress",
	"EndLocationAddress",
]);
const TRAVELER_FIELDS = new Set(["Driver", "Guest"]);
for (const f of DATETIME_FIELDS)
	NESTED_KNOWN[f] = new Set([
		...DATETIME_KEYS,
		"utc_offset",
		"is_timezone_manual",
	]);
for (const f of ["Address", "StartLocationAddress", "EndLocationAddress"]) {
	NESTED_KNOWN[f] = new Set([
		...ADDRESS_KEYS,
		"latitude",
		"longitude",
		"risk_level",
	]); // risk_level: TripIt's rating
}
for (const f of TRAVELER_FIELDS) NESTED_KNOWN[f] = new Set(TRAVELER_KEYS);

function isPlain(v: unknown): v is Obj {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function present(v: unknown): boolean {
	return v !== undefined && v !== null && v !== "";
}

export function normalizeTime(time: string | undefined): string | undefined {
	if (!present(time)) return undefined;
	const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time).trim());
	if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59)
		throw new Error(`Time must be HH:MM or HH:MM:SS, got '${time}'`);
	return `${m[1]!.padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

function pick(
	obj: Obj,
	keys: string[],
	map?: (k: string, v: unknown) => unknown,
): Obj | undefined {
	const out: Obj = {};
	for (const k of keys) {
		const v = map ? map(k, obj[k]) : obj[k];
		if (present(v)) out[k] = v;
	}
	return Object.keys(out).length ? out : undefined;
}

function writableValue(field: string, value: unknown): unknown {
	if (field === "Agency" && isPlain(value)) return pick(value, AGENCY_KEYS);
	if (DATETIME_FIELDS.has(field) && isPlain(value)) {
		return pick(value, DATETIME_KEYS, (k, v) =>
			k === "time" ? normalizeTime(v as string | undefined) : v,
		);
	}
	if (ADDRESS_FIELDS.has(field) && isPlain(value))
		return pick(value, ADDRESS_KEYS);
	if (TRAVELER_FIELDS.has(field)) {
		if (Array.isArray(value)) {
			const list = value
				.filter(isPlain)
				.map((t) => pick(t, TRAVELER_KEYS))
				.filter(Boolean);
			return list.length ? list : undefined;
		}
		return isPlain(value) ? pick(value, TRAVELER_KEYS) : undefined;
	}
	if (field === "Image" && value) {
		const images = Array.isArray(value) ? value : [value];
		const ordered = images.map((image) =>
			isPlain(image) && image.ImageData
				? Object.fromEntries(
						IMAGE_FIELD_ORDER.filter((k) => image[k] !== undefined).map((k) => [
							k,
							image[k],
						]),
					)
				: image,
		);
		return Array.isArray(value) ? ordered : ordered[0];
	}
	return value;
}

export function writable(kind: Kind, obj: Obj): Obj {
	const fields = kind === "car" ? CAR_FIELDS : LODGING_FIELDS;
	const out: Obj = {};
	for (const field of fields) {
		const v = writableValue(field, obj[field]);
		if (present(v)) out[field] = v;
	}
	return out;
}

function deepMerge(existing: Obj, changes: Obj): Obj {
	const out: Obj = { ...existing };
	for (const [k, v] of Object.entries(changes)) {
		if (v === null) delete out[k];
		else if (v === undefined || v === "") continue;
		else if (k !== "Image" && isPlain(v) && isPlain(out[k]))
			out[k] = deepMerge(out[k] as Obj, v);
		else out[k] = v;
	}
	return out;
}

export function mergeReplace(kind: Kind, existing: Obj, changes: Obj): Obj {
	const fields = kind === "car" ? CAR_FIELDS : LODGING_FIELDS;
	const unknown = Object.keys(existing).filter(
		(k) => !fields.includes(k) && !READ_ONLY_FIELDS.has(k),
	);
	for (const [field, value] of Object.entries(existing)) {
		const known = NESTED_KNOWN[field];
		if (!known) continue;
		for (const item of Array.isArray(value) ? value : [value]) {
			if (!isPlain(item)) continue;
			for (const k of Object.keys(item))
				if (!known.has(k)) unknown.push(`${field}.${k}`);
		}
	}
	if (unknown.length) {
		throw new Error(
			`Not updated: this ${kind === "car" ? "car rental" : "hotel"} has field(s) this library does not know how ` +
				`to keep (${unknown.sort().join(", ")}), and an update would wipe them. Edit it in the TripIt app instead.`,
		);
	}
	const base: Obj = { ...existing };
	if (
		base.is_display_name_auto_generated !== "false" &&
		base.is_display_name_auto_generated !== false
	)
		delete base.display_name;
	return writable(kind, deepMerge(base, changes));
}

export type ImageSelector = {
	uuid?: string;
	url?: string;
	caption?: string;
	index?: number;
	all?: boolean;
};

export function remainingImages(
	images: unknown,
	sel: ImageSelector,
): unknown[] {
	const list: Obj[] =
		images === undefined || images === null
			? []
			: Array.isArray(images)
				? images
				: [images as Obj];
	if (list.length === 0) throw new Error("No documents found on this object");
	if (sel.all) return [];
	if (sel.uuid) {
		const rest = list.filter((i) => i.uuid !== sel.uuid);
		if (rest.length === list.length)
			throw new Error(`No document found with UUID ${sel.uuid}`);
		return rest;
	}
	if (sel.url) {
		const rest = list.filter((i) => i.url !== sel.url);
		if (rest.length === list.length)
			throw new Error(`No document found with URL ${sel.url}`);
		return rest;
	}
	if (sel.caption) {
		const at = list.findIndex((i) => i.caption === sel.caption);
		if (at < 0)
			throw new Error(`No document found with caption '${sel.caption}'`);
		return list.filter((_, n) => n !== at);
	}
	const at = (sel.index ?? 1) - 1;
	if (!Number.isInteger(at) || at < 0 || at >= list.length) {
		throw new Error(
			`Document index out of range. Expected 1-${list.length}, got ${sel.index}`,
		);
	}
	return list.filter((_, n) => n !== at);
}
