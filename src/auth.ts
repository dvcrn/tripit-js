import crypto from "node:crypto";
import fs from "node:fs";
import * as cheerio from "cheerio";
import fetch from "node-fetch";
import {
	API_BASE_URL,
	BASE_URL,
	BROWSER_HEADERS,
	CACHE_DIR,
	DEFAULT_CLIENT_ID,
	REDIRECT_URI,
	SCOPES,
	TOKEN_CACHE_FILE,
} from "./constants";
import type { CachedToken, TripItConfig } from "./types";

export function loadCachedToken(): CachedToken | null {
	try {
		if (fs.existsSync(TOKEN_CACHE_FILE)) {
			return JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, "utf-8"));
		}
	} catch {
		// Ignore corrupt cache
	}
	return null;
}

export function cacheToken(tokenResponse: any): void {
	const cached: CachedToken = {
		access_token: tokenResponse.access_token,
		expires_in: tokenResponse.expires_in,
		token_type: tokenResponse.token_type,
		scope: tokenResponse.scope,
		expiresAt: Date.now() + (tokenResponse.expires_in - 30) * 1000,
	};

	fs.mkdirSync(CACHE_DIR, { recursive: true });
	fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cached, null, 2));
}

async function followRedirects(
	fetchFn: typeof fetch,
	url: string,
): Promise<{ html: string; formAction: string }> {
	let currentUrl = url;
	for (let i = 0; i < 5; i++) {
		const res = await (fetchFn as any)(currentUrl, {
			headers: BROWSER_HEADERS,
			redirect: "manual",
		});
		const body = await res.text();

		if (res.status === 302 || res.status === 303) {
			const location = res.headers.get("location");
			if (!location) throw new Error("Redirect without location header");
			currentUrl = new URL(location, currentUrl).href;
			continue;
		}

		const $ = cheerio.load(body);
		if (
			$('form input[name="username"]').length === 0 ||
			$('form input[name="password"]').length === 0
		) {
			throw new Error("Login form not found");
		}

		return { html: body, formAction: currentUrl };
	}
	throw new Error("Too many redirects while getting login form");
}

async function submitLogin(
	fetchFn: typeof fetch,
	config: TripItConfig,
	formHtml: string,
	formAction: string,
): Promise<string> {
	const $ = cheerio.load(formHtml);

	const submitData: Record<string, string> = {};
	$("form input").each((_, el) => {
		const name = $(el).attr("name");
		const value = $(el).attr("value") || "";
		if (name) submitData[name] = value;
	});
	submitData.username = config.username;
	submitData.password = config.password;

	const formActionUrl = $("form").attr("action");
	if (!formActionUrl) throw new Error("No form action URL found");

	const finalUrl = new URL(formActionUrl, formAction).href;

	const res = await (fetchFn as any)(finalUrl, {
		method: "POST",
		headers: {
			...BROWSER_HEADERS,
			"Content-Type": "application/x-www-form-urlencoded",
			"Sec-Fetch-Site": "same-origin",
			"Sec-Fetch-User": "?1",
			Origin: BASE_URL,
			Referer: formAction,
		},
		body: new URLSearchParams(submitData).toString(),
		redirect: "manual",
	});

	const responseText = await res.text();

	if (res.status === 403) {
		throw new Error("Login failed (403)");
	}

	if (res.status === 302 || res.status === 303) {
		const location = res.headers.get("location");
		if (!location) throw new Error("No redirect location after login");
		return location;
	}

	if (res.status === 200) {
		const $r = cheerio.load(responseText);

		const errorMsg = $r(".error-message").text() || $r(".alert-error").text();
		if (errorMsg) throw new Error(`Login failed: ${errorMsg}`);

		// Check meta refresh
		const meta = $r('meta[http-equiv="refresh"]').attr("content");
		if (meta) {
			const match = meta.match(/URL=(.+)$/);
			if (match?.[1]) return match[1];
		}

		// Check JS redirect
		const scripts = $r("script").text();
		const redirectMatch = scripts.match(
			/(?:window\.location|window\.location\.href)\s*=\s*["']([^"']+)["']/,
		);
		if (redirectMatch?.[1]) return redirectMatch[1];

		throw new Error("Could not find redirect URL in login response");
	}

	throw new Error(`Unexpected login response status: ${res.status}`);
}

async function exchangeCodeForToken(
	config: TripItConfig,
	code: string,
	codeVerifier: string,
): Promise<any> {
	const clientId = config.clientId ?? DEFAULT_CLIENT_ID;
	const params = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: REDIRECT_URI,
		client_id: clientId,
		code_verifier: codeVerifier,
	});

	const res = await fetch(`${API_BASE_URL}/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params.toString(),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Token exchange failed (${res.status}): ${body}`);
	}

	return res.json();
}

export async function authenticate(config: TripItConfig): Promise<string> {
	const clientId = config.clientId ?? DEFAULT_CLIENT_ID;
	const cached = loadCachedToken();
	if (cached && cached.expiresAt > Date.now()) {
		return cached.access_token;
	}

	const fetchCookie = (await import("fetch-cookie")).default;
	const { CookieJar } = await import("tough-cookie");
	const fetchWithCookie = fetchCookie(fetch, new CookieJar());

	// PKCE setup
	const codeVerifier = crypto.randomBytes(32).toString("hex");
	const codeChallenge = crypto
		.createHash("sha256")
		.update(codeVerifier)
		.digest()
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	const state = crypto.randomBytes(16).toString("hex");

	const authUrl =
		`${BASE_URL}/auth/oauth2/authorize?` +
		`client_id=${encodeURIComponent(clientId)}` +
		`&response_type=code` +
		`&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
		`&scope=${encodeURIComponent(SCOPES)}` +
		`&state=${encodeURIComponent(state)}` +
		`&code_challenge=${encodeURIComponent(codeChallenge)}` +
		`&code_challenge_method=S256` +
		`&response_mode=query` +
		`&action=sign_in`;

	// Follow redirects to login form
	const { html, formAction } = await followRedirects(fetchWithCookie, authUrl);

	// Submit login form
	const redirectUrl = await submitLogin(
		fetchWithCookie,
		config,
		html,
		formAction,
	);

	// Validate state and extract code
	const parsedUrl = new URL(redirectUrl, "http://localhost");
	const returnedState = parsedUrl.searchParams.get("state");
	if (returnedState !== state) {
		throw new Error("OAuth state mismatch");
	}

	const code = parsedUrl.searchParams.get("code");
	if (!code) {
		throw new Error("Authorization code not found in redirect");
	}

	// Exchange code for token
	const tokenResponse = await exchangeCodeForToken(config, code, codeVerifier);
	if (!tokenResponse.access_token) {
		throw new Error("No access_token in response");
	}

	cacheToken(tokenResponse);

	return tokenResponse.access_token;
}
