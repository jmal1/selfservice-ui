import { PUBLIC_API_URL, PUBLIC_WS_URL, PUBLIC_OIDC_AUTHORITY, PUBLIC_OIDC_CLIENT_ID, PUBLIC_OIDC_REDIRECT_URI, PUBLIC_MOCK } from '$env/static/public';

export const config = {
	apiBaseUrl: PUBLIC_API_URL || '',
	wsUrl: PUBLIC_WS_URL || `${typeof window !== 'undefined' ? window.location.origin.replace(/^http/, 'ws') : ''}/ws`,
	mock: PUBLIC_MOCK === 'true' || PUBLIC_MOCK === '1',
	oidc: {
		authority: PUBLIC_OIDC_AUTHORITY || '',
		clientId: PUBLIC_OIDC_CLIENT_ID || '',
		redirectUri: PUBLIC_OIDC_REDIRECT_URI || ''
	}
} as const;
