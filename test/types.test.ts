import { expect, test } from "bun:test";
import type { CarObject, LodgingObject, ReservationObject } from "../src/types";

test("public reservation types expose preserved common metadata", () => {
	const common = {
		uuid: "synthetic-1",
		booking_date: "2030-01-01",
		booking_site_conf_num: "CONF",
		booking_site_name: "Synthetic",
		booking_site_phone: "+1 202 555 0100",
		booking_site_email_address: "synthetic@example.com",
		booking_site_url: "https://example.com",
		record_locator: "RECORD",
		supplier_contact: "Synthetic",
		supplier_email_address: "synthetic@example.com",
		supplier_url: "https://example.com",
		restrictions: "Synthetic",
		CancellationDateTime: {
			date: "2030-01-01",
			time: "09:00:00",
			timezone: "Etc/UTC",
		},
	} satisfies ReservationObject;
	const car: CarObject = { ...common, Driver: { first_name: "Synthetic" } };
	const hotel: LodgingObject = {
		...common,
		Guest: { first_name: "Synthetic" },
		number_rooms: "1",
	};
	expect(car.booking_site_conf_num).toBe(hotel.booking_site_conf_num);
	expect(car.CancellationDateTime).toEqual(hotel.CancellationDateTime);
});

test("response datetimes support date-only and partial values", () => {
	const car: CarObject = {
		uuid: "synthetic",
		StartDateTime: { date: "2030-01-01" },
		EndDateTime: { date: "2030-01-02" },
		Agency: { agency_name: "Synthetic" },
	};
	const hotel: LodgingObject = {
		uuid: "synthetic",
		CancellationDateTime: { time: "09:00:00" },
	};
	expect(car.StartDateTime?.time).toBeUndefined();
	expect(car.EndDateTime?.timezone).toBeUndefined();
	expect(hotel.CancellationDateTime?.date).toBeUndefined();
});
