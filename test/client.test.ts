import { expect, test } from "bun:test";
import { TripIt } from "../src/tripit";

const uuid = "abcdefab-2222-9000-0004-000000000001";
function fixture(kind: "car" | "lodging") {
	const client = new TripIt({ username: "offline", password: "offline" });
	const key = kind === "car" ? "CarObject" : "LodgingObject";
	let object: Record<string, any> = {
		uuid,
		trip_uuid: "trip-1",
		supplier_name: "Synthetic",
		supplier_conf_num: "CONF",
		notes: "keep",
		display_name: "Custom",
		is_display_name_auto_generated: false,
		StartDateTime: {
			date: "2030-01-01",
			time: "10:00:00",
			timezone: "Etc/UTC",
		},
		EndDateTime: { date: "2030-01-02", time: "10:00:00", timezone: "Etc/UTC" },
		Image: { uuid: "image-1", caption: "first" },
	};
	const paths: string[] = [];
	// Replace transport only: run the public methods, serialization and lock unchanged.
	Object.assign(client, {
		apiGet: async (path: string) => {
			paths.push(path);
			return { [key]: structuredClone(object) };
		},
		apiPost: async (path: string, payload: Record<string, any>) => {
			paths.push(path);
			object = {
				...structuredClone(payload[key]),
				is_display_name_auto_generated: payload[key].display_name
					? false
					: true,
			};
			return { [key]: structuredClone(object) };
		},
	});
	return {
		client,
		paths,
		get object() {
			return object;
		},
	};
}

for (const kind of ["car", "lodging"] as const) {
	test(`${kind}: concurrent edits by numeric ID and UUID preserve fields`, async () => {
		const f = fixture(kind);
		const update =
			kind === "car"
				? f.client.updateCar.bind(f.client)
				: f.client.updateHotel.bind(f.client);
		await Promise.all([
			update({ id: "123", notes: "edited" }),
			update({ uuid, supplierConfNum: "NEW" }),
		]);
		expect(f.object.notes).toBe("edited");
		expect(f.object.supplier_conf_num).toBe("NEW");
		expect(f.object.display_name).toBe("Custom");
		expect(f.object.Image).toEqual({ uuid: "image-1", caption: "first" });
		expect(
			f.paths
				.filter((p) => p.includes("/replace/"))
				.every((p) => p.includes(`/uuid/${uuid}/`)),
		).toBe(true);
	});
	test(`${kind}: undefined and empty preserve; null clears; removing last document preserves booking`, async () => {
		const f = fixture(kind);
		const update =
			kind === "car"
				? f.client.updateCar.bind(f.client)
				: f.client.updateHotel.bind(f.client);
		await update({ uuid, notes: undefined, supplierConfNum: "" });
		expect(f.object.notes).toBe("keep");
		expect(f.object.supplier_conf_num).toBe("CONF");
		await update({ uuid, notes: null });
		expect(f.object.notes).toBeUndefined();
		await f.client.removeDocument({
			objectType: kind,
			objectId: uuid,
			removeAll: true,
		});
		expect(f.object.Image).toBeUndefined();
		expect(f.object.supplier_conf_num).toBe("CONF");
		expect(f.object.display_name).toBe("Custom");
	});
	test(`${kind}: unknown fields abort without replace`, async () => {
		const f = fixture(kind);
		f.object.unknown_field = "must not lose";
		await expect(
			kind === "car"
				? f.client.updateCar({ uuid, notes: "new" })
				: f.client.updateHotel({ uuid, notes: "new" }),
		).rejects.toThrow("unknown_field");
		expect(f.paths.some((p) => p.includes("/replace/"))).toBe(false);
	});
	test(`${kind}: concurrent attachments and edit preserve both images`, async () => {
		const f = fixture(kind);
		Object.assign(f.client, {
			buildImageAttachment: async ({ caption }: { caption: string }) => ({
				caption,
				ImageData: { content: "AA==", mime_type: "image/png" },
			}),
		});
		await Promise.all([
			f.client.attachDocument({
				objectType: kind,
				objectId: uuid,
				filePath: "unused",
				caption: "second",
			}),
			f.client.attachDocument({
				objectType: kind,
				objectId: "123",
				filePath: "unused",
				caption: "third",
			}),
			kind === "car"
				? f.client.updateCar({ uuid, notes: "edited" })
				: f.client.updateHotel({ uuid, notes: "edited" }),
		]);
		expect(f.object.Image.map((i: any) => i.caption).sort()).toEqual([
			"first",
			"second",
			"third",
		]);
		expect(f.object.notes).toBe("edited");
	});
}

test("car create/get/delete use the correct endpoints and preserve timezone independence", async () => {
	const f = fixture("car");
	await f.client.createCar({
		tripId: "123",
		supplierName: "Synthetic",
		pickupDate: "2030-01-01",
		dropoffDate: "2030-01-02",
		pickupTime: "9:05",
		pickupTimezone: "Europe/London",
	});
	expect(f.object.StartDateTime.time).toBe("09:05:00");
	expect(f.object.EndDateTime.timezone).toBe("Europe/London");
	expect(f.object.trip_id).toBe("123");
	await f.client.getCar("123");
	await f.client.deleteCar(uuid);
	expect(f.paths).toEqual([
		"https://api.tripit.com/v2/create/car/format/json",
		"https://api.tripit.com/v1/get/car/id/123/format/json",
		`https://api.tripit.com/v2/delete/car/uuid/${uuid}/format/json`,
	]);
});

test("type detection propagates auth, generic 400 and server failures", async () => {
	for (const status of [400, 401, 403, 429, 500]) {
		const client = new TripIt({ username: "offline", password: "offline" });
		let calls = 0;
		Object.assign(client, {
			apiGet: async () => {
				calls++;
				throw new Error(`API error (${status}): failure`);
			},
		});
		await expect(client.detectObjectType(uuid)).rejects.toThrow(`(${status})`);
		expect(calls).toBe(1);
	}
});

test("trip association cannot be silently cleared", async () => {
	const { client } = fixture("car");
	await expect(client.updateCar({ uuid, tripId: null })).rejects.toThrow(
		"tripId cannot be cleared",
	);
	await expect(client.updateHotel({ uuid, tripId: null })).rejects.toThrow(
		"tripId cannot be cleared",
	);
});

test("type detection continues for recognized wrong-type and missing-object replies", async () => {
	for (const message of [
		"object is not a lodging object",
		"no lodging found",
		"invalid uuid",
		"object not found",
	]) {
		const client = new TripIt({ username: "offline", password: "offline" });
		Object.assign(client, {
			apiGet: async (path: string) => {
				if (path.includes("/lodging/"))
					throw new Error(`API error (400): ${message}`);
				return { CarObject: { uuid } };
			},
		});
		expect(await client.detectObjectType(uuid)).toBe("car");
	}
});

test("hotel updates pad single-digit hours and reject invalid times", async () => {
	const f = fixture("lodging");
	await f.client.updateHotel({ uuid, checkOutTime: "9:05" });
	expect(f.object.EndDateTime.time).toBe("09:05:00");
	await expect(
		f.client.updateHotel({ uuid, checkOutTime: "25:00" }),
	).rejects.toThrow("HH:MM");
});

for (const kind of ["car", "lodging"] as const) {
	test(`${kind}: UUID case variants share the canonical numeric-ID lock`, async () => {
		for (const second of [uuid, "123"]) {
			const f = fixture(kind);
			const update =
				kind === "car"
					? f.client.updateCar.bind(f.client)
					: f.client.updateHotel.bind(f.client);
			await Promise.all([
				update({ id: uuid.toUpperCase(), notes: "edited" }),
				update({ id: second, supplierConfNum: "NEW" }),
			]);
			expect(f.object.notes).toBe("edited");
			expect(f.object.supplier_conf_num).toBe("NEW");
		}
	});
}
