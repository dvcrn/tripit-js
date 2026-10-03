import { normalizeTime } from "./reservation-payloads";
import type { CarFields, UpdateCarParams } from "./types";

type Obj = Record<string, unknown>;
const patchTime = (time: string | null | undefined) =>
	time === null ? null : normalizeTime(time);
function tripKey(trip: string) {
	return trip.includes("-") ? "trip_uuid" : "trip_id";
}
export function carChanges(
	a: CarFields | UpdateCarParams,
	fillTimezones: boolean,
): Obj {
	if (a.tripId === null) throw new Error("tripId cannot be cleared");
	let pickupTz = a.pickupTimezone !== undefined ? a.pickupTimezone : a.timezone;
	let dropoffTz =
		a.dropoffTimezone !== undefined ? a.dropoffTimezone : a.timezone;
	if (fillTimezones) {
		// A new rental with one timezone given uses it at both ends.
		pickupTz = pickupTz ?? dropoffTz;
		dropoffTz = dropoffTz ?? pickupTz;
	}
	const changes: Obj = {
		display_name: a.displayName,
		Image: "Image" in a ? a.Image : undefined,
		supplier_name: a.supplierName,
		supplier_conf_num: a.supplierConfNum,
		total_cost: a.totalCost,
		notes: a.notes,
		StartDateTime: {
			date: a.pickupDate,
			time: patchTime(a.pickupTime),
			timezone: pickupTz,
		},
		EndDateTime: {
			date: a.dropoffDate,
			time: patchTime(a.dropoffTime),
			timezone: dropoffTz,
		},
		StartLocationAddress: {
			address: a.pickupAddress,
			city: a.pickupCity,
			state: a.pickupState,
			zip: a.pickupZip,
			country: a.pickupCountry,
		},
		EndLocationAddress: {
			address: a.dropoffAddress,
			city: a.dropoffCity,
			state: a.dropoffState,
			zip: a.dropoffZip,
			country: a.dropoffCountry,
		},
		start_location_name: a.pickupLocationName,
		end_location_name: a.dropoffLocationName,
		car_type: a.carType,
		car_description: a.carDescription,
	};
	if (a.tripId) {
		// Moving to another trip: set the key that matches the identifier, drop the other.
		changes[tripKey(a.tripId)] = a.tripId;
		changes[tripKey(a.tripId) === "trip_uuid" ? "trip_id" : "trip_uuid"] = null;
	}
	return changes;
}
