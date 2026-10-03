import { normalizeTime } from "./reservation-payloads";
import type { CarFields, UpdateCarParams } from "./types";

type Obj = Record<string, unknown>;

const patchTime = (time: string | null | undefined) =>
	time === null ? null : normalizeTime(time);

export function carChanges(
	params: CarFields | UpdateCarParams,
	fillTimezones: boolean,
): Obj {
	if (params.tripId === null) throw new Error("tripId cannot be cleared");

	let pickupTz =
		params.pickupTimezone !== undefined
			? params.pickupTimezone
			: params.timezone;
	let dropoffTz =
		params.dropoffTimezone !== undefined
			? params.dropoffTimezone
			: params.timezone;
	if (fillTimezones) {
		// A new rental with one timezone given uses it at both ends.
		pickupTz = pickupTz ?? dropoffTz;
		dropoffTz = dropoffTz ?? pickupTz;
	}

	const changes: Obj = {
		display_name: params.displayName,
		Image: "Image" in params ? params.Image : undefined,
		supplier_name: params.supplierName,
		supplier_conf_num: params.supplierConfNum,
		total_cost: params.totalCost,
		notes: params.notes,
		StartDateTime: {
			date: params.pickupDate,
			time: patchTime(params.pickupTime),
			timezone: pickupTz,
		},
		EndDateTime: {
			date: params.dropoffDate,
			time: patchTime(params.dropoffTime),
			timezone: dropoffTz,
		},
		StartLocationAddress: {
			address: params.pickupAddress,
			city: params.pickupCity,
			state: params.pickupState,
			zip: params.pickupZip,
			country: params.pickupCountry,
		},
		EndLocationAddress: {
			address: params.dropoffAddress,
			city: params.dropoffCity,
			state: params.dropoffState,
			zip: params.dropoffZip,
			country: params.dropoffCountry,
		},
		start_location_name: params.pickupLocationName,
		end_location_name: params.dropoffLocationName,
		car_type: params.carType,
		car_description: params.carDescription,
	};

	if (params.tripId) {
		const key = params.tripId.includes("-") ? "trip_uuid" : "trip_id";
		changes[key] = params.tripId;
		changes[key === "trip_uuid" ? "trip_id" : "trip_uuid"] = null;
	}

	return changes;
}
