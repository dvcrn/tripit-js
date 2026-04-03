import os from "node:os";
import path from "node:path";

export const CACHE_DIR = path.join(os.homedir(), ".config", "tripit");
export const TOKEN_CACHE_FILE = path.join(CACHE_DIR, "token.json");

export const BASE_URL = "https://www.tripit.com";
export const API_BASE_URL = "https://api.tripit.com";
export const REDIRECT_URI = "com.tripit://completeAuthorize";
export const SCOPES = "offline_access email";

// TripIt mobile app client ID (public, extracted from iOS/Android app)
export const DEFAULT_CLIENT_ID = "e400234a-f684-11e7-9d05-9cb654932688";

export const BROWSER_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0",
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,ja;q=0.7,en;q=0.3",
	"Accept-Encoding": "gzip, deflate, br, zstd",
	DNT: "1",
	"Sec-GPC": "1",
	Connection: "keep-alive",
	"Upgrade-Insecure-Requests": "1",
	"Sec-Fetch-Dest": "document",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-Site": "cross-site",
	Priority: "u=0, i",
	Pragma: "no-cache",
	"Cache-Control": "no-cache",
};

export const TRIP_UPDATE_FIELD_ORDER = [
	"primary_location",
	"TripPurposes",
	"is_private",
	"start_date",
	"display_name",
	"is_expensible",
	"end_date",
	"description",
] as const;

export const LODGING_FIELD_ORDER = [
	"uuid",
	"trip_uuid",
	"trip_id",
	"is_client_traveler",
	"display_name",
	"Image",
	"supplier_name",
	"supplier_conf_num",
	"booking_rate",
	"is_purchased",
	"notes",
	"total_cost",
	"StartDateTime",
	"EndDateTime",
	"Address",
] as const;

export const AIR_FIELD_ORDER = [
	"uuid",
	"trip_uuid",
	"trip_id",
	"is_client_traveler",
	"display_name",
	"Image",
	"supplier_name",
	"supplier_conf_num",
	"is_purchased",
	"notes",
	"total_cost",
	"Segment",
] as const;

export const AIR_SEGMENT_FIELD_ORDER = [
	"uuid",
	"StartDateTime",
	"EndDateTime",
	"start_city_name",
	"start_country_code",
	"end_city_name",
	"end_country_code",
	"marketing_airline",
	"marketing_flight_number",
	"aircraft",
	"service_class",
] as const;

export const TRANSPORT_FIELD_ORDER = [
	"uuid",
	"trip_uuid",
	"trip_id",
	"is_client_traveler",
	"display_name",
	"Image",
	"is_purchased",
	"is_tripit_booking",
	"has_possible_cancellation",
	"Segment",
] as const;

export const TRANSPORT_SEGMENT_FIELD_ORDER = [
	"uuid",
	"StartLocationAddress",
	"StartDateTime",
	"EndLocationAddress",
	"EndDateTime",
	"vehicle_description",
	"start_location_name",
	"end_location_name",
	"confirmation_num",
	"carrier_name",
] as const;

export const ACTIVITY_FIELD_ORDER = [
	"uuid",
	"trip_uuid",
	"trip_id",
	"is_client_traveler",
	"display_name",
	"Image",
	"is_purchased",
	"notes",
	"StartDateTime",
	"EndDateTime",
	"Address",
	"location_name",
] as const;

export const IMAGE_FIELD_ORDER = [
	"caption",
	"segment_uuid",
	"ImageData",
] as const;

export const ADDRESS_FIELD_ORDER = [
	"address",
	"city",
	"state",
	"zip",
	"country",
] as const;
