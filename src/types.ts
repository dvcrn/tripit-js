export interface CachedToken {
	access_token: string;
	expires_in: number;
	token_type: string;
	scope: string;
	expiresAt: number;
}

export interface TripItConfig {
	clientId?: string;
	clientSecret?: string;
	username: string;
	password: string;
}

export type OneOrMany<T> = T | T[];

export interface ApiMetadata {
	timestamp: string;
	num_bytes: string;
}

export interface DeleteResponse {
	timestamp: string;
	num_bytes: string;
}

export interface WarningMessage {
	description: string;
	entity_type: string;
	timestamp: string;
}

export interface WarningContainer {
	Warning?: OneOrMany<WarningMessage>;
}

export interface DateTimeValue {
	date: string;
	time: string;
	timezone: string;
	utc_offset?: string;
	is_timezone_manual?: string;
}

export interface AddressValue {
	address?: string;
	city?: string;
	state?: string;
	zip?: string;
	country?: string;
	latitude?: string;
	longitude?: string;
	risk_level?: string;
}

export interface TripInvitee {
	"@attributes"?: {
		profile_ref?: string;
	};
	is_read_only?: string;
	is_traveler?: string;
	is_owner?: string;
}

export interface TripPurposes {
	purpose_type_code?: string;
	is_auto_generated?: string;
}

export interface TripRecord {
	uuid: string;
	relative_url?: string;
	start_date?: string;
	end_date?: string;
	description?: string;
	display_name?: string;
	image_url?: string;
	is_private?: string;
	is_expensible?: string;
	primary_location?: string;
	PrimaryLocationAddress?: AddressValue;
	TripInvitees?: {
		Invitee?: OneOrMany<TripInvitee>;
	};
	TripPurposes?: TripPurposes;
	is_pro_enabled?: string;
	last_modified?: string;
	is_concur_linked?: string;
	public_guid?: string;
	is_trip_owner_inner_circle_sharer?: string;
}

export interface WeatherObject {
	trip_uuid?: string;
	is_client_traveler?: string;
	display_name?: string;
	is_display_name_auto_generated?: string;
	last_modified?: string;
	date?: string;
	location?: string;
	avg_high_temp_c?: string;
	avg_low_temp_c?: string;
	avg_wind_speed_kn?: string;
}

export interface ImageData {
	content: string;
	mime_type: string;
}

export interface TripImage {
	caption?: string;
	url?: string;
	id?: string;
	uuid?: string;
	segment_id?: string;
	segment_uuid?: string;
	thumbnail_url?: string;
	ImageData?: ImageData;
}

export interface TripListResponse extends ApiMetadata {
	Trip: OneOrMany<TripRecord>;
	Profile?: Record<string, unknown>;
	page_num?: string;
	page_size?: string;
	max_page?: string;
	total_items?: string;
}

export interface TripMutationResponse extends ApiMetadata {
	Trip: TripRecord;
	Profile?: Record<string, unknown>;
	WeatherObject?: OneOrMany<WeatherObject>;
}

export interface LodgingObject {
	uuid: string;
	trip_uuid?: string;
	trip_id?: string;
	is_client_traveler?: string;
	relative_url?: string;
	display_name?: string;
	Image?: OneOrMany<TripImage>;
	is_display_name_auto_generated?: string;
	last_modified?: string;
	supplier_name?: string;
	supplier_conf_num?: string;
	booking_rate?: string;
	is_purchased?: string;
	notes?: string;
	total_cost?: string;
	is_tripit_booking?: string;
	has_possible_cancellation?: string;
	is_concur_booked?: string;
	StartDateTime?: DateTimeValue;
	EndDateTime?: DateTimeValue;
	Address?: AddressValue;
}

export interface AirSegmentStatus {
	flight_status?: string;
	last_modified?: string;
}

export interface AirSegmentEmissions {
	co2?: string;
}

export interface AirSegment {
	uuid?: string;
	StartDateTime?: DateTimeValue;
	EndDateTime?: DateTimeValue;
	Status?: AirSegmentStatus;
	start_airport_code?: string;
	start_airport_name?: string;
	start_airport_latitude?: string;
	start_airport_longitude?: string;
	start_city_name?: string;
	start_country_code?: string;
	end_airport_code?: string;
	end_airport_name?: string;
	end_airport_latitude?: string;
	end_airport_longitude?: string;
	end_city_name?: string;
	end_country_code?: string;
	marketing_airline?: string;
	marketing_airline_code?: string;
	marketing_flight_number?: string;
	aircraft?: string;
	service_class?: string;
	is_eligible_seattracker?: string;
	is_eligible_airhelp?: string;
	is_hidden?: string;
	is_international?: string;
	does_cross_idl?: string;
	Emissions?: AirSegmentEmissions;
}

export interface AirObject {
	uuid: string;
	trip_uuid?: string;
	trip_id?: string;
	is_client_traveler?: string;
	relative_url?: string;
	display_name?: string;
	Image?: OneOrMany<TripImage>;
	is_display_name_auto_generated?: string;
	last_modified?: string;
	supplier_name?: string;
	supplier_conf_num?: string;
	is_purchased?: string;
	notes?: string;
	total_cost?: string;
	is_tripit_booking?: string;
	has_possible_cancellation?: string;
	is_concur_booked?: string;
	Segment?: OneOrMany<AirSegment>;
}

export interface TransportSegment {
	uuid?: string;
	StartLocationAddress?: AddressValue;
	StartDateTime?: DateTimeValue;
	EndLocationAddress?: AddressValue;
	EndDateTime?: DateTimeValue;
	vehicle_description?: string;
	start_location_name?: string;
	end_location_name?: string;
	confirmation_num?: string;
	carrier_name?: string;
}

export interface TransportObject {
	uuid: string;
	trip_uuid?: string;
	trip_id?: string;
	is_client_traveler?: string;
	relative_url?: string;
	display_name?: string;
	Image?: OneOrMany<TripImage>;
	is_display_name_auto_generated?: string;
	last_modified?: string;
	is_purchased?: string;
	is_tripit_booking?: string;
	has_possible_cancellation?: string;
	is_concur_booked?: string;
	Segment?: OneOrMany<TransportSegment>;
}

export interface ActivityObject {
	uuid: string;
	trip_uuid?: string;
	trip_id?: string;
	is_client_traveler?: string;
	relative_url?: string;
	display_name?: string;
	Image?: OneOrMany<TripImage>;
	is_display_name_auto_generated?: string;
	last_modified?: string;
	is_purchased?: string;
	notes?: string;
	is_tripit_booking?: string;
	is_concur_booked?: string;
	StartDateTime?: DateTimeValue;
	EndDateTime?: DateTimeValue;
	end_time?: string;
	Address?: AddressValue;
	location_name?: string;
}

export interface TripGetResponse extends ApiMetadata {
	Trip: TripRecord;
	WeatherObject?: OneOrMany<WeatherObject>;
	AirObject?: OneOrMany<AirObject>;
	LodgingObject?: OneOrMany<LodgingObject>;
	TransportObject?: OneOrMany<TransportObject>;
	ActivityObject?: OneOrMany<ActivityObject>;
}

export interface LodgingResponse extends ApiMetadata, WarningContainer {
	LodgingObject: LodgingObject;
}

export interface AirResponse extends ApiMetadata, WarningContainer {
	AirObject: AirObject;
}

export interface TransportResponse extends ApiMetadata, WarningContainer {
	TransportObject: TransportObject;
}

export interface ActivityResponse extends ApiMetadata, WarningContainer {
	ActivityObject: ActivityObject;
}
