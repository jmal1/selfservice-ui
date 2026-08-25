import { PUBLIC_API_URL, PUBLIC_WS_URL, PUBLIC_OIDC_AUTHORITY, PUBLIC_OIDC_CLIENT_ID, PUBLIC_OIDC_REDIRECT_URI, PUBLIC_MOCK } from '$env/static/public';

export const config = {
	apiBaseUrl: PUBLIC_API_URL || '',
	// wsUrl is intentionally empty when PUBLIC_WS_URL is not set: the legacy
	// default derived `${origin}/ws` which produced a 404 because no such
	// handler is mounted on the API today. The two real websocket consumers
	// (console view, run progress) build their own URLs from their feature
	// configs and do NOT rely on this value. Live status updates fall back
	// to existing polling. Restore a default once a `/ws` event stream exists.
	wsUrl: PUBLIC_WS_URL || '',
	mock: PUBLIC_MOCK === 'true' || PUBLIC_MOCK === '1',
	oidc: {
		authority: PUBLIC_OIDC_AUTHORITY || '',
		clientId: PUBLIC_OIDC_CLIENT_ID || '',
		redirectUri: PUBLIC_OIDC_REDIRECT_URI || ''
	}
} as const;
