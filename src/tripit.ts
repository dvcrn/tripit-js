import fetch from "node-fetch";
import { authenticate } from "./auth";
import {
	ACTIVITY_FIELD_ORDER,
	ADDRESS_FIELD_ORDER,
	AIR_FIELD_ORDER,
	AIR_SEGMENT_FIELD_ORDER,
	IMAGE_FIELD_ORDER,
	LODGING_FIELD_ORDER,
	TRANSPORT_FIELD_ORDER,
	TRANSPORT_SEGMENT_FIELD_ORDER,
	TRIP_UPDATE_FIELD_ORDER,
} from "./constants";
import type {
	ActivityResponse,
	AirResponse,
	AirSegment,
	DeleteResponse,
	LodgingResponse,
	OneOrMany,
	TransportResponse,
	TransportSegment,
	TripGetResponse,
	TripImage,
	TripItConfig,
	TripListResponse,
	TripMutationResponse,
} from "./types";
import {
	clean,
	normalizeArray,
	normalizeTime,
	orderObjectByKeys,
	toBoolean,
} from "./utils";

export class TripIt {
	private config: TripItConfig;
	private accessToken: string | null = null;

	constructor(config: TripItConfig) {
		this.config = config;
	}

	async authenticate(): Promise<string> {
		this.accessToken = await authenticate(this.config);
		return this.accessToken;
	}

	getAccessToken(): string {
		if (!this.accessToken) {
			throw new Error("Not authenticated. Call authenticate() first.");
		}
		return this.accessToken;
	}

	// === API Helper ===

	private endpoint(version: "v1" | "v2", path: string): string {
		return `https://api.tripit.com/${version}/${path}/format/json`;
	}

	private identifierEndpoint(
		action: string,
		resource: string,
		id: string,
	): string {
		const isUuid = id.includes("-");
		return isUuid
			? this.endpoint("v2", `${action}/${resource}/uuid/${id}`)
			: this.endpoint("v1", `${action}/${resource}/id/${id}`);
	}

	private async apiGet<TResponse>(path: string): Promise<TResponse> {
		const token = this.getAccessToken();
		const res = await fetch(path, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const text = await res.text();
		if (!res.ok) throw new Error(`API error (${res.status}): ${text}`);
		return JSON.parse(text) as TResponse;
	}

	private async apiPost<TResponse>(
		path: string,
		payload: Record<string, unknown>,
	): Promise<TResponse> {
		const token = this.getAccessToken();
		const res = await fetch(path, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ json: JSON.stringify(payload) }).toString(),
		});
		const text = await res.text();
		if (!res.ok) throw new Error(`API error (${res.status}): ${text}`);
		return JSON.parse(text) as TResponse;
	}

	// === Trips ===

	async listTrips(
		pageSize = 100,
		pageNum = 1,
		past = false,
	): Promise<TripListResponse> {
		const past_ = past ? "&past=true" : "";
		const url = `https://api.tripit.com/v2/list/trip?format=json&page_size=${pageSize}&page_num=${pageNum}${past_}`;
		return this.apiGet<TripListResponse>(url);
	}

	async getTrip(id: string): Promise<TripGetResponse> {
		const url = this.identifierEndpoint("get", "trip", id).replace(
			"/format/json",
			"/include_objects/true/format/json",
		);
		const data = await this.apiGet<TripGetResponse & { Profile?: unknown }>(
			url,
		);
		if (data.Profile) delete data.Profile;
		return data;
	}

	async createTrip(params: {
		displayName: string;
		startDate: string;
		endDate: string;
		primaryLocation?: string;
	}): Promise<TripMutationResponse> {
		return this.apiPost<TripMutationResponse>(
			this.endpoint("v2", "create/trip"),
			{
				Trip: clean({
					display_name: params.displayName,
					start_date: params.startDate,
					end_date: params.endDate,
					primary_location: params.primaryLocation,
				}),
			},
		);
	}

	async updateTrip(params: {
		id?: string;
		uuid?: string;
		displayName?: string;
		startDate?: string;
		endDate?: string;
		primaryLocation?: string;
		description?: string;
		isPrivate?: boolean;
		isExpensible?: boolean;
		tripPurpose?: string;
	}): Promise<TripMutationResponse> {
		const identifier = params.uuid || params.id;
		if (!identifier) {
			throw new Error("Either uuid or id parameter is required");
		}

		const existingTripResponse = await this.apiGet<TripMutationResponse>(
			this.identifierEndpoint("get", "trip", identifier),
		);
		const existingTrip = existingTripResponse.Trip;
		if (!existingTrip?.uuid) {
			throw new Error(`Trip with identifier ${identifier} not found`);
		}

		const tripData: Record<string, unknown> = {
			primary_location: params.primaryLocation ?? existingTrip.primary_location,
			is_private:
				params.isPrivate !== undefined
					? params.isPrivate
					: toBoolean(existingTrip.is_private),
			start_date: params.startDate ?? existingTrip.start_date,
			display_name: params.displayName ?? existingTrip.display_name,
			is_expensible:
				params.isExpensible !== undefined
					? params.isExpensible
					: toBoolean(existingTrip.is_expensible),
			end_date: params.endDate ?? existingTrip.end_date,
		};

		const purposeTypeCode =
			params.tripPurpose ?? existingTrip.TripPurposes?.purpose_type_code;
		if (purposeTypeCode) {
			tripData.TripPurposes = { purpose_type_code: purposeTypeCode };
		}

		const description = params.description ?? existingTrip.description;
		if (description) {
			tripData.description = description;
		}

		const orderedTripData = orderObjectByKeys(
			clean(tripData),
			TRIP_UPDATE_FIELD_ORDER,
		);

		return this.apiPost(
			this.endpoint("v2", `replace/trip/uuid/${existingTrip.uuid}`),
			{
				Trip: orderedTripData,
			},
		);
	}

	async deleteTrip(id: string): Promise<DeleteResponse> {
		return this.apiGet<DeleteResponse>(
			this.identifierEndpoint("delete", "trip", id),
		);
	}

	private async buildImageAttachment(params: {
		filePath: string;
		caption?: string;
		mimeType?: string;
	}): Promise<TripImage> {
		const file = Bun.file(params.filePath);
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`File not found: ${params.filePath}`);
		}

		const buffer = await file.arrayBuffer();
		const base64Content = Buffer.from(buffer).toString("base64");
		const mimeType = params.mimeType || file.type || "application/octet-stream";
		const caption =
			params.caption || params.filePath.split("/").pop() || "document";

		return orderObjectByKeys(
			{
				caption,
				ImageData: {
					content: base64Content,
					mime_type: mimeType,
				},
			},
			IMAGE_FIELD_ORDER,
		) as unknown as TripImage;
	}

	private mergeImages(
		existing: OneOrMany<TripImage> | undefined,
		newImage: TripImage,
	): OneOrMany<TripImage> {
		const existingImages = normalizeArray(existing) as TripImage[];
		return existingImages.length > 0 ? [...existingImages, newImage] : newImage;
	}

	private setSegmentUuidIfNeeded(
		images: OneOrMany<TripImage>,
		segmentUuid: string | undefined,
	): OneOrMany<TripImage> {
		if (!segmentUuid) return images;
		const mapImage = (img: TripImage): TripImage => {
			if (!img.ImageData || img.segment_uuid) return img;
			return orderObjectByKeys(
				{
					...img,
					segment_uuid: segmentUuid,
				},
				IMAGE_FIELD_ORDER,
			) as unknown as TripImage;
		};

		return Array.isArray(images) ? images.map(mapImage) : mapImage(images);
	}

	async detectObjectType(
		id: string,
	): Promise<"lodging" | "activity" | "air" | "transport"> {
		const types = ["lodging", "activity", "air", "transport"] as const;
		const getters: Record<string, (id: string) => Promise<unknown>> = {
			lodging: (id) => this.getHotel(id),
			activity: (id) => this.getActivity(id),
			air: (id) => this.getFlight(id),
			transport: (id) => this.getTransport(id),
		};
		for (const type of types) {
			try {
				await getters[type]!(id);
				return type;
			} catch {}
		}
		throw new Error(
			`Could not find object with identifier ${id} as any supported type`,
		);
	}

	async attachDocument(params: {
		objectType?: "lodging" | "activity" | "air" | "transport";
		objectId: string;
		filePath: string;
		caption?: string;
		mimeType?: string;
	}): Promise<
		LodgingResponse | ActivityResponse | AirResponse | TransportResponse
	> {
		const objectType =
			params.objectType || (await this.detectObjectType(params.objectId));

		const newImage = await this.buildImageAttachment({
			filePath: params.filePath,
			caption: params.caption,
			mimeType: params.mimeType,
		});

		if (objectType === "lodging") {
			const existingHotelResponse = await this.getHotel(params.objectId);
			const existingHotel = existingHotelResponse.LodgingObject;
			if (!existingHotel?.uuid) {
				throw new Error(`Hotel with identifier ${params.objectId} not found`);
			}

			return this.updateHotel({
				uuid: existingHotel.uuid,
				Image: this.mergeImages(existingHotel.Image, newImage),
			});
		}

		if (objectType === "activity") {
			const existingActivityResponse = await this.getActivity(params.objectId);
			const existingActivity = existingActivityResponse.ActivityObject;
			if (!existingActivity?.uuid) {
				throw new Error(
					`Activity with identifier ${params.objectId} not found`,
				);
			}

			return this.updateActivity({
				uuid: existingActivity.uuid,
				Image: this.mergeImages(existingActivity.Image, newImage),
			});
		}

		if (objectType === "air") {
			const existingFlightResponse = await this.getFlight(params.objectId);
			const existingFlight = existingFlightResponse.AirObject;
			if (!existingFlight?.uuid) {
				throw new Error(`Flight with identifier ${params.objectId} not found`);
			}

			const segment = (
				normalizeArray(existingFlight.Segment) as AirSegment[]
			)[0];
			const imageField = this.setSegmentUuidIfNeeded(
				this.mergeImages(existingFlight.Image, newImage),
				segment?.uuid,
			);

			return this.updateFlight({
				uuid: existingFlight.uuid,
				Image: imageField,
			});
		}

		const existingTransportResponse = await this.getTransport(params.objectId);
		const existingTransport = existingTransportResponse.TransportObject;
		if (!existingTransport?.uuid) {
			throw new Error(`Transport with identifier ${params.objectId} not found`);
		}

		const segment = (
			normalizeArray(existingTransport.Segment) as TransportSegment[]
		)[0];
		const imageField = this.setSegmentUuidIfNeeded(
			this.mergeImages(existingTransport.Image, newImage),
			segment?.uuid,
		);

		return this.updateTransport({
			uuid: existingTransport.uuid,
			Image: imageField,
		});
	}

	async removeDocument(params: {
		objectType?: "lodging" | "activity" | "air" | "transport";
		objectId: string;
		imageUuid?: string;
		imageUrl?: string;
		caption?: string;
		index?: number;
		removeAll?: boolean;
	}): Promise<
		LodgingResponse | ActivityResponse | AirResponse | TransportResponse
	> {
		const objectType =
			params.objectType || (await this.detectObjectType(params.objectId));

		const selectors = [
			Boolean(params.imageUuid),
			Boolean(params.imageUrl),
			Boolean(params.caption),
			params.index !== undefined,
			Boolean(params.removeAll),
		].filter(Boolean).length;
		if (selectors !== 1) {
			throw new Error(
				"Provide exactly one selector: imageUuid, imageUrl, caption, index, or removeAll",
			);
		}

		const selectRemainingImages = (
			currentImages: OneOrMany<TripImage> | undefined,
		): TripImage[] => {
			const images = normalizeArray(currentImages) as TripImage[];
			if (images.length === 0) {
				throw new Error(
					`No documents found on ${objectType} ${params.objectId}`,
				);
			}

			if (params.removeAll) {
				return [];
			}

			if (params.imageUuid) {
				const remaining = images.filter(
					(image) => image.uuid !== params.imageUuid,
				);
				if (remaining.length === images.length) {
					throw new Error(
						`No document found with UUID ${params.imageUuid} on ${objectType} ${params.objectId}`,
					);
				}
				return remaining;
			}

			if (params.imageUrl) {
				const remaining = images.filter(
					(image) => image.url !== params.imageUrl,
				);
				if (remaining.length === images.length) {
					throw new Error(
						`No document found with URL ${params.imageUrl} on ${objectType} ${params.objectId}`,
					);
				}
				return remaining;
			}

			if (params.caption) {
				const removeIndex = images.findIndex(
					(image) => image.caption === params.caption,
				);
				if (removeIndex < 0) {
					throw new Error(
						`No document found with caption '${params.caption}' on ${objectType} ${params.objectId}`,
					);
				}
				return images.filter((_, index) => index !== removeIndex);
			}

			const index = (params.index ?? 1) - 1;
			if (index < 0 || index >= images.length) {
				throw new Error(
					`Document index out of range. Expected 1-${images.length}, got ${params.index}`,
				);
			}
			return images.filter((_, i) => i !== index);
		};

		const toImageField = (
			remainingImages: TripImage[],
		): OneOrMany<TripImage> | undefined => {
			if (remainingImages.length === 0) return undefined;
			return remainingImages.length === 1
				? remainingImages[0]
				: remainingImages;
		};

		if (objectType === "lodging") {
			const existingHotelResponse = await this.getHotel(params.objectId);
			const existingHotel = existingHotelResponse.LodgingObject;
			if (!existingHotel?.uuid) {
				throw new Error(`Hotel with identifier ${params.objectId} not found`);
			}
			const remainingImages = selectRemainingImages(existingHotel.Image);
			const imageField = toImageField(remainingImages);
			return this.updateHotel(
				imageField
					? { uuid: existingHotel.uuid, Image: imageField }
					: { uuid: existingHotel.uuid },
			);
		}

		if (objectType === "activity") {
			const existingActivityResponse = await this.getActivity(params.objectId);
			const existingActivity = existingActivityResponse.ActivityObject;
			if (!existingActivity?.uuid) {
				throw new Error(
					`Activity with identifier ${params.objectId} not found`,
				);
			}
			const remainingImages = selectRemainingImages(existingActivity.Image);
			const imageField = toImageField(remainingImages);
			return this.updateActivity(
				imageField
					? { uuid: existingActivity.uuid, Image: imageField }
					: { uuid: existingActivity.uuid },
			);
		}

		if (objectType === "air") {
			const existingFlightResponse = await this.getFlight(params.objectId);
			const existingFlight = existingFlightResponse.AirObject;
			if (!existingFlight?.uuid) {
				throw new Error(`Flight with identifier ${params.objectId} not found`);
			}
			const remainingImages = selectRemainingImages(existingFlight.Image);
			const imageField = toImageField(remainingImages);
			return this.updateFlight(
				imageField
					? { uuid: existingFlight.uuid, Image: imageField }
					: { uuid: existingFlight.uuid },
			);
		}

		const existingTransportResponse = await this.getTransport(params.objectId);
		const existingTransport = existingTransportResponse.TransportObject;
		if (!existingTransport?.uuid) {
			throw new Error(`Transport with identifier ${params.objectId} not found`);
		}
		const remainingImages = selectRemainingImages(existingTransport.Image);
		const imageField = toImageField(remainingImages);
		return this.updateTransport(
			imageField
				? { uuid: existingTransport.uuid, Image: imageField }
				: { uuid: existingTransport.uuid },
		);
	}

	// === Hotels (Lodging) ===

	async getHotel(id: string): Promise<LodgingResponse> {
		return this.apiGet<LodgingResponse>(
			this.identifierEndpoint("get", "lodging", id),
		);
	}

	async deleteHotel(id: string): Promise<DeleteResponse> {
		return this.apiGet<DeleteResponse>(
			this.identifierEndpoint("delete", "lodging", id),
		);
	}

	async createHotel(params: {
		tripId: string;
		hotelName: string;
		checkInDate: string;
		checkInTime: string;
		checkOutDate: string;
		checkOutTime: string;
		timezone: string;
		street: string;
		city: string;
		country: string;
		state?: string;
		zip?: string;
		supplierConfNum?: string;
		bookingRate?: string;
		notes?: string;
		totalCost?: string;
	}): Promise<LodgingResponse> {
		const tripKey = params.tripId.includes("-") ? "trip_uuid" : "trip_id";
		return this.apiPost<LodgingResponse>(
			this.endpoint("v2", "create/lodging"),
			{
				LodgingObject: clean({
					[tripKey]: params.tripId,
					supplier_name: params.hotelName,
					supplier_conf_num: params.supplierConfNum,
					booking_rate: params.bookingRate,
					notes: params.notes,
					total_cost: params.totalCost,
					StartDateTime: {
						date: params.checkInDate,
						time: normalizeTime(params.checkInTime),
						timezone: params.timezone,
					},
					EndDateTime: {
						date: params.checkOutDate,
						time: normalizeTime(params.checkOutTime),
						timezone: params.timezone,
					},
					Address: clean({
						address: params.street,
						city: params.city,
						state: params.state,
						zip: params.zip,
						country: params.country,
					}),
				}),
			},
		);
	}

	async updateHotel(params: {
		id?: string;
		uuid?: string;
		tripId?: string;
		hotelName?: string;
		checkInDate?: string;
		checkInTime?: string;
		checkOutDate?: string;
		checkOutTime?: string;
		timezone?: string;
		street?: string;
		city?: string;
		state?: string;
		zip?: string;
		country?: string;
		supplierConfNum?: string;
		bookingRate?: string;
		notes?: string;
		totalCost?: string;
		Image?: OneOrMany<TripImage>;
	}): Promise<LodgingResponse> {
		const identifier = params.uuid || params.id;
		if (!identifier) {
			throw new Error("Either uuid or id parameter is required");
		}

		const existingHotelResponse = await this.getHotel(identifier);
		const existingHotel = existingHotelResponse.LodgingObject;
		if (!existingHotel?.uuid) {
			throw new Error(`Hotel with identifier ${identifier} not found`);
		}

		const tripId =
			params.tripId || existingHotel.trip_uuid || existingHotel.trip_id;
		const tripKey = tripId
			? tripId.includes("-")
				? "trip_uuid"
				: "trip_id"
			: undefined;

		const startTimezone =
			params.timezone ||
			existingHotel.StartDateTime?.timezone ||
			existingHotel.EndDateTime?.timezone;
		const endTimezone =
			params.timezone ||
			existingHotel.EndDateTime?.timezone ||
			existingHotel.StartDateTime?.timezone;

		// XSD-strict replace payload: only send required identifiers, datetimes,
		// and fields the caller explicitly supplied. Round-tripping read-only or
		// extraneous fields (display_name, is_client_traveler, is_purchased,
		// Address when unchanged, etc.) causes the TripIt v2 replace API to
		// reject the request with a 400 XSD validation error.
		const addressOverride =
			params.street !== undefined ||
			params.city !== undefined ||
			params.state !== undefined ||
			params.zip !== undefined ||
			params.country !== undefined
				? orderObjectByKeys(
						clean({
							address: params.street ?? existingHotel.Address?.address,
							city: params.city ?? existingHotel.Address?.city,
							state: params.state ?? existingHotel.Address?.state,
							zip: params.zip ?? existingHotel.Address?.zip,
							country: params.country ?? existingHotel.Address?.country,
						}),
						ADDRESS_FIELD_ORDER,
					)
				: undefined;

		const lodgingObject: Record<string, unknown> = {
			uuid: existingHotel.uuid,
			supplier_name:
				params.hotelName ??
				existingHotel.supplier_name ??
				existingHotel.display_name,
			supplier_conf_num: params.supplierConfNum,
			booking_rate: params.bookingRate,
			notes: params.notes,
			total_cost: params.totalCost,
			StartDateTime: {
				date: params.checkInDate ?? existingHotel.StartDateTime?.date,
				time:
					normalizeTime(params.checkInTime || "") ??
					existingHotel.StartDateTime?.time,
				timezone: startTimezone,
			},
			EndDateTime: {
				date: params.checkOutDate ?? existingHotel.EndDateTime?.date,
				time:
					normalizeTime(params.checkOutTime || "") ??
					existingHotel.EndDateTime?.time,
				timezone: endTimezone,
			},
			Address: addressOverride,
		};

		if (tripKey) {
			lodgingObject[tripKey] = tripId;
		}

		if (params.Image) {
			if (Array.isArray(params.Image)) {
				lodgingObject.Image = params.Image.map((image) => {
					if (!image.ImageData) return image;
					return orderObjectByKeys(image, IMAGE_FIELD_ORDER);
				});
			} else {
				lodgingObject.Image = params.Image.ImageData
					? orderObjectByKeys(params.Image, IMAGE_FIELD_ORDER)
					: params.Image;
			}
		}

		return this.apiPost(
			this.endpoint("v2", `replace/lodging/uuid/${existingHotel.uuid}`),
			{
				LodgingObject: orderObjectByKeys(
					clean(lodgingObject),
					LODGING_FIELD_ORDER,
				),
			},
		);
	}

	// === Flights (Air) ===

	async getFlight(id: string): Promise<AirResponse> {
		return this.apiGet<AirResponse>(this.identifierEndpoint("get", "air", id));
	}

	async deleteFlight(id: string): Promise<DeleteResponse> {
		return this.apiGet<DeleteResponse>(
			this.identifierEndpoint("delete", "air", id),
		);
	}

	async createFlight(params: {
		tripId: string;
		displayName: string;
		supplierName: string;
		segments: Array<{
			startDate: string;
			startTime: string;
			startTimezone: string;
			endDate: string;
			endTime: string;
			endTimezone: string;
			startCityName: string;
			startCountryCode: string;
			endCityName: string;
			endCountryCode: string;
			marketingAirline: string;
			marketingFlightNumber: string;
			aircraft?: string;
			serviceClass?: string;
		}>;
		supplierConfNum?: string;
		notes?: string;
		totalCost?: string;
	}): Promise<AirResponse> {
		const segments = params.segments.map((s) =>
			clean({
				StartDateTime: {
					date: s.startDate,
					time: normalizeTime(s.startTime),
					timezone: s.startTimezone,
				},
				EndDateTime: {
					date: s.endDate,
					time: normalizeTime(s.endTime),
					timezone: s.endTimezone,
				},
				start_city_name: s.startCityName,
				start_country_code: s.startCountryCode,
				end_city_name: s.endCityName,
				end_country_code: s.endCountryCode,
				marketing_airline: s.marketingAirline,
				marketing_flight_number: s.marketingFlightNumber,
				aircraft: s.aircraft,
				service_class: s.serviceClass,
			}),
		);
		return this.apiPost<AirResponse>(this.endpoint("v2", "create/air"), {
			AirObject: clean({
				trip_uuid: params.tripId,
				display_name: params.displayName,
				supplier_name: params.supplierName,
				supplier_conf_num: params.supplierConfNum,
				notes: params.notes,
				total_cost: params.totalCost,
				Segment: segments,
			}),
		});
	}

	async updateFlight(params: {
		id?: string;
		uuid?: string;
		tripId?: string;
		displayName?: string;
		supplierName?: string;
		supplierConfNum?: string;
		notes?: string;
		totalCost?: string;
		Image?: OneOrMany<TripImage>;
		segment?: {
			startDate?: string;
			startTime?: string;
			startTimezone?: string;
			endDate?: string;
			endTime?: string;
			endTimezone?: string;
			startCityName?: string;
			startCountryCode?: string;
			endCityName?: string;
			endCountryCode?: string;
			marketingAirline?: string;
			marketingFlightNumber?: string;
			aircraft?: string;
			serviceClass?: string;
		};
	}): Promise<AirResponse> {
		const identifier = params.uuid || params.id;
		if (!identifier) {
			throw new Error("Either uuid or id parameter is required");
		}

		const existingFlightResponse = await this.getFlight(identifier);
		const existingFlight = existingFlightResponse.AirObject;
		if (!existingFlight?.uuid) {
			throw new Error(`Flight with identifier ${identifier} not found`);
		}

		const existingSegment = (
			normalizeArray(existingFlight.Segment) as AirSegment[]
		)[0];
		if (!existingSegment) {
			throw new Error(`Flight with identifier ${identifier} has no segment`);
		}

		const tripId =
			params.tripId || existingFlight.trip_uuid || existingFlight.trip_id;
		const tripKey = tripId
			? tripId.includes("-")
				? "trip_uuid"
				: "trip_id"
			: undefined;

		const segment = {
			uuid: existingSegment.uuid,
			StartDateTime: {
				date: params.segment?.startDate ?? existingSegment.StartDateTime?.date,
				time:
					normalizeTime(params.segment?.startTime || "") ??
					existingSegment.StartDateTime?.time,
				timezone:
					params.segment?.startTimezone ??
					existingSegment.StartDateTime?.timezone,
			},
			EndDateTime: {
				date: params.segment?.endDate ?? existingSegment.EndDateTime?.date,
				time:
					normalizeTime(params.segment?.endTime || "") ??
					existingSegment.EndDateTime?.time,
				timezone:
					params.segment?.endTimezone ?? existingSegment.EndDateTime?.timezone,
			},
			start_city_name:
				params.segment?.startCityName ?? existingSegment.start_city_name,
			start_country_code:
				params.segment?.startCountryCode ?? existingSegment.start_country_code,
			end_city_name:
				params.segment?.endCityName ?? existingSegment.end_city_name,
			end_country_code:
				params.segment?.endCountryCode ?? existingSegment.end_country_code,
			marketing_airline:
				params.segment?.marketingAirline ??
				existingSegment.marketing_airline_code ??
				existingSegment.marketing_airline,
			marketing_flight_number:
				params.segment?.marketingFlightNumber ??
				existingSegment.marketing_flight_number,
			aircraft: params.segment?.aircraft ?? existingSegment.aircraft,
			service_class:
				params.segment?.serviceClass ?? existingSegment.service_class,
		};

		// XSD-strict replace payload: drop round-tripped read-only fields
		// (is_client_traveler, is_purchased) — the API returns these as strings
		// and the response of toBoolean() is a native JSON boolean, which fails
		// the v2 replace XSD validator with a 400.
		const airObject: Record<string, unknown> = {
			uuid: existingFlight.uuid,
			display_name: params.displayName ?? existingFlight.display_name,
			supplier_name: params.supplierName ?? existingFlight.supplier_name,
			supplier_conf_num: params.supplierConfNum,
			notes: params.notes,
			total_cost: params.totalCost,
			Segment: [orderObjectByKeys(clean(segment), AIR_SEGMENT_FIELD_ORDER)],
		};

		if (tripKey) {
			airObject[tripKey] = tripId;
		}

		if (params.Image) {
			if (Array.isArray(params.Image)) {
				airObject.Image = params.Image.map((image) => {
					if (!image.ImageData) return image;
					return orderObjectByKeys(
						{
							...image,
							segment_uuid: image.segment_uuid ?? existingSegment.uuid,
						},
						IMAGE_FIELD_ORDER,
					);
				});
			} else {
				const image = params.Image;
				airObject.Image = image.ImageData
					? orderObjectByKeys(
							{
								...image,
								segment_uuid: image.segment_uuid ?? existingSegment.uuid,
							},
							IMAGE_FIELD_ORDER,
						)
					: image;
			}
		}

		return this.apiPost(
			this.endpoint("v2", `replace/air/uuid/${existingFlight.uuid}`),
			{
				AirObject: orderObjectByKeys(clean(airObject), AIR_FIELD_ORDER),
			},
		);
	}

	// === Transport ===

	async getTransport(id: string): Promise<TransportResponse> {
		return this.apiGet<TransportResponse>(
			this.identifierEndpoint("get", "transport", id),
		);
	}

	async deleteTransport(id: string): Promise<DeleteResponse> {
		return this.apiGet<DeleteResponse>(
			this.identifierEndpoint("delete", "transport", id),
		);
	}

	async createTransport(params: {
		tripId: string;
		startDate: string;
		startTime: string;
		endDate: string;
		endTime: string;
		timezone: string;
		startAddress: string;
		endAddress: string;
		startLocationName?: string;
		endLocationName?: string;
		vehicleDescription?: string;
		carrierName?: string;
		confirmationNum?: string;
		displayName?: string;
	}): Promise<TransportResponse> {
		const tripKey = params.tripId.includes("-") ? "trip_uuid" : "trip_id";
		const name =
			params.displayName ||
			[
				params.startLocationName || params.startAddress,
				params.endLocationName || params.endAddress,
			]
				.filter(Boolean)
				.join(" → ") ||
			"Transport";
		return this.apiPost<TransportResponse>(
			this.endpoint("v2", "create/transport"),
			{
				TransportObject: clean({
					[tripKey]: params.tripId,
					display_name: name,
					Segment: [
						clean({
							StartLocationAddress: { address: params.startAddress },
							StartDateTime: {
								date: params.startDate,
								time: normalizeTime(params.startTime),
								timezone: params.timezone,
							},
							EndLocationAddress: { address: params.endAddress },
							EndDateTime: {
								date: params.endDate,
								time: normalizeTime(params.endTime),
								timezone: params.timezone,
							},
							vehicle_description: params.vehicleDescription,
							start_location_name: params.startLocationName,
							end_location_name: params.endLocationName,
							confirmation_num: params.confirmationNum,
							carrier_name: params.carrierName,
						}),
					],
				}),
			},
		);
	}

	async updateTransport(params: {
		id?: string;
		uuid?: string;
		tripId?: string;
		startDate?: string;
		startTime?: string;
		endDate?: string;
		endTime?: string;
		timezone?: string;
		startAddress?: string;
		endAddress?: string;
		startLocationName?: string;
		endLocationName?: string;
		vehicleDescription?: string;
		carrierName?: string;
		confirmationNum?: string;
		displayName?: string;
		Image?: OneOrMany<TripImage>;
	}): Promise<TransportResponse> {
		const identifier = params.uuid || params.id;
		if (!identifier) {
			throw new Error("Either uuid or id parameter is required");
		}

		const existingTransportResponse = await this.getTransport(identifier);
		const existingTransport = existingTransportResponse.TransportObject;
		if (!existingTransport?.uuid) {
			throw new Error(`Transport with identifier ${identifier} not found`);
		}

		const existingSegment = (
			normalizeArray(existingTransport.Segment) as TransportSegment[]
		)[0];
		if (!existingSegment) {
			throw new Error(`Transport with identifier ${identifier} has no segment`);
		}

		const tripId =
			params.tripId || existingTransport.trip_uuid || existingTransport.trip_id;
		const tripKey = tripId
			? tripId.includes("-")
				? "trip_uuid"
				: "trip_id"
			: undefined;

		const segment = {
			uuid: existingSegment.uuid,
			StartLocationAddress: {
				address:
					params.startAddress ?? existingSegment.StartLocationAddress?.address,
			},
			StartDateTime: {
				date: params.startDate ?? existingSegment.StartDateTime?.date,
				time:
					normalizeTime(params.startTime || "") ??
					existingSegment.StartDateTime?.time,
				timezone: params.timezone ?? existingSegment.StartDateTime?.timezone,
			},
			EndLocationAddress: {
				address:
					params.endAddress ?? existingSegment.EndLocationAddress?.address,
			},
			EndDateTime: {
				date: params.endDate ?? existingSegment.EndDateTime?.date,
				time:
					normalizeTime(params.endTime || "") ??
					existingSegment.EndDateTime?.time,
				timezone: params.timezone ?? existingSegment.EndDateTime?.timezone,
			},
			vehicle_description:
				params.vehicleDescription ?? existingSegment.vehicle_description,
			start_location_name:
				params.startLocationName ?? existingSegment.start_location_name,
			end_location_name:
				params.endLocationName ?? existingSegment.end_location_name,
			confirmation_num:
				params.confirmationNum ?? existingSegment.confirmation_num,
			carrier_name: params.carrierName ?? existingSegment.carrier_name,
		};

		// XSD-strict replace payload: drop round-tripped read-only booleans
		// (is_client_traveler, is_purchased, is_tripit_booking,
		// has_possible_cancellation). The API returns these as strings; native
		// JSON booleans from toBoolean() fail the v2 replace XSD validator.
		const transportObject: Record<string, unknown> = {
			uuid: existingTransport.uuid,
			display_name: params.displayName ?? existingTransport.display_name,
			Segment: [
				orderObjectByKeys(clean(segment), TRANSPORT_SEGMENT_FIELD_ORDER),
			],
		};

		if (tripKey) {
			transportObject[tripKey] = tripId;
		}

		if (params.Image) {
			if (Array.isArray(params.Image)) {
				transportObject.Image = params.Image.map((image) => {
					if (!image.ImageData) return image;
					return orderObjectByKeys(
						{
							...image,
							segment_uuid: image.segment_uuid ?? existingSegment.uuid,
						},
						IMAGE_FIELD_ORDER,
					);
				});
			} else {
				const image = params.Image;
				transportObject.Image = image.ImageData
					? orderObjectByKeys(
							{
								...image,
								segment_uuid: image.segment_uuid ?? existingSegment.uuid,
							},
							IMAGE_FIELD_ORDER,
						)
					: image;
			}
		}

		return this.apiPost(
			this.endpoint("v2", `replace/transport/uuid/${existingTransport.uuid}`),
			{
				TransportObject: orderObjectByKeys(
					clean(transportObject),
					TRANSPORT_FIELD_ORDER,
				),
			},
		);
	}

	// === Activities ===

	async getActivity(id: string): Promise<ActivityResponse> {
		return this.apiGet<ActivityResponse>(
			this.identifierEndpoint("get", "activity", id),
		);
	}

	async deleteActivity(id: string): Promise<DeleteResponse> {
		return this.apiGet<DeleteResponse>(
			this.identifierEndpoint("delete", "activity", id),
		);
	}

	async createActivity(params: {
		tripId: string;
		displayName: string;
		startDate: string;
		startTime: string;
		endDate: string;
		endTime: string;
		timezone: string;
		address: string;
		locationName: string;
		city?: string;
		state?: string;
		zip?: string;
		country?: string;
	}): Promise<ActivityResponse> {
		const tripKey = params.tripId.includes("-") ? "trip_uuid" : "trip_id";
		return this.apiPost<ActivityResponse>(
			this.endpoint("v2", "create/activity"),
			{
				ActivityObject: clean({
					[tripKey]: params.tripId,
					display_name: params.displayName,
					StartDateTime: {
						date: params.startDate,
						time: normalizeTime(params.startTime),
						timezone: params.timezone,
					},
					EndDateTime: {
						date: params.endDate,
						time: normalizeTime(params.endTime),
						timezone: params.timezone,
					},
					Address: clean({
						address: params.address,
						city: params.city,
						state: params.state,
						zip: params.zip,
						country: params.country,
					}),
					location_name: params.locationName,
				}),
			},
		);
	}

	async updateActivity(params: {
		id?: string;
		uuid?: string;
		tripId?: string;
		displayName?: string;
		startDate?: string;
		startTime?: string;
		endDate?: string;
		endTime?: string;
		timezone?: string;
		address?: string;
		locationName?: string;
		city?: string;
		state?: string;
		zip?: string;
		country?: string;
		notes?: string;
		Image?: OneOrMany<TripImage>;
	}): Promise<ActivityResponse> {
		const identifier = params.uuid || params.id;
		if (!identifier) {
			throw new Error("Either uuid or id parameter is required");
		}

		const existingActivityResponse = await this.getActivity(identifier);
		const existingActivity = existingActivityResponse.ActivityObject;
		if (!existingActivity?.uuid) {
			throw new Error(`Activity with identifier ${identifier} not found`);
		}

		const tripId =
			params.tripId || existingActivity.trip_uuid || existingActivity.trip_id;
		const tripKey = tripId
			? tripId.includes("-")
				? "trip_uuid"
				: "trip_id"
			: undefined;

		// XSD-strict replace payload: drop round-tripped read-only booleans
		// (is_client_traveler, is_purchased). The API returns these as strings;
		// native JSON booleans from toBoolean() fail the v2 replace XSD
		// validator with a 400.
		const activityObject: Record<string, unknown> = {
			uuid: existingActivity.uuid,
			display_name: params.displayName ?? existingActivity.display_name,
			notes: params.notes,
			StartDateTime: {
				date: params.startDate ?? existingActivity.StartDateTime?.date,
				time:
					normalizeTime(params.startTime || "") ??
					existingActivity.StartDateTime?.time,
				timezone: params.timezone ?? existingActivity.StartDateTime?.timezone,
			},
			EndDateTime: {
				date: params.endDate ?? existingActivity.EndDateTime?.date,
				time:
					normalizeTime(params.endTime || "") ??
					existingActivity.EndDateTime?.time,
				timezone: params.timezone ?? existingActivity.EndDateTime?.timezone,
			},
			Address: orderObjectByKeys(
				clean({
					address: params.address ?? existingActivity.Address?.address,
					city: params.city ?? existingActivity.Address?.city,
					state: params.state ?? existingActivity.Address?.state,
					zip: params.zip ?? existingActivity.Address?.zip,
					country: params.country ?? existingActivity.Address?.country,
				}),
				ADDRESS_FIELD_ORDER,
			),
			location_name: params.locationName ?? existingActivity.location_name,
		};

		if (tripKey) {
			activityObject[tripKey] = tripId;
		}

		if (params.Image) {
			if (Array.isArray(params.Image)) {
				activityObject.Image = params.Image.map((image) => {
					if (!image.ImageData) return image;
					return orderObjectByKeys(image, IMAGE_FIELD_ORDER);
				});
			} else {
				activityObject.Image = params.Image.ImageData
					? orderObjectByKeys(params.Image, IMAGE_FIELD_ORDER)
					: params.Image;
			}
		}

		return this.apiPost(
			this.endpoint("v2", `replace/activity/uuid/${existingActivity.uuid}`),
			{
				ActivityObject: orderObjectByKeys(
					clean(activityObject),
					ACTIVITY_FIELD_ORDER,
				),
			},
		);
	}
}
