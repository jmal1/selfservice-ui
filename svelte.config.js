import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html'
		}),
		// Poll _app/version.json so a freshly deployed build is detected on the
		// client. When the hash changes, `updated.current` flips to true and the
		// root layout surfaces a "new version — reload" banner, and SvelteKit
		// turns the next client-side navigation into a full page load. This
		// self-heals stale JS bundles after a deploy (the class of bug where the
		// wizard's ISO-install branch appeared "stuck" on an old cached bundle).
		version: {
			pollInterval: 60000
		}
	}
};

export default config;
