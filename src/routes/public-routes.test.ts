import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiPage from './ai/+page.svelte';
import DeployPage from './deploy/+page.svelte';
import TemplatesPage from './templates/+page.svelte';
import WikiPage from './wiki/+page.svelte';

const navigation = vi.hoisted(() => ({ goto: vi.fn() }));
const client = vi.hoisted(() => ({
	getTemplates: vi.fn(),
	wikiGetIndex: vi.fn(),
	wikiGetPage: vi.fn()
}));
const auth = vi.hoisted(() => ({
	state: { isInstructor: false }
}));
const provisioning = vi.hoisted(() => ({
	state: { canProvision: true, message: 'Provisioning is available.' }
}));

vi.mock('$app/navigation', () => navigation);
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return new URL(window.location.href);
		}
	}
}));
vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: {
		get isInstructor() {
			return auth.state.isInstructor;
		}
	}
}));
vi.mock('$lib/stores/provisioning.svelte', () => ({
	provisioningStore: {
		get canProvision() {
			return provisioning.state.canProvision;
		},
		get message() {
			return provisioning.state.message;
		}
	}
}));
vi.mock('$lib/api/client', () => ({
	getTemplates: client.getTemplates,
	wikiGetIndex: client.wikiGetIndex,
	wikiGetPage: client.wikiGetPage,
	wikiZipURL: () => '/api/v1/wiki/bundle.zip',
	wikiPageDownloadURL: (path: string) => `/api/v1/wiki/page/${path}?download=1`
}));

const template = {
	id: 'ubuntu-24',
	name: 'Ubuntu 24.04',
	vcenter_template: 'ubuntu-24',
	os_type: 'Ubuntu Linux',
	default_vcpus: 2,
	default_ram_mb: 4096,
	default_disk_gb: 40,
	min_vcpus: 1,
	min_ram_mb: 2048,
	description: 'General-purpose Linux workstation',
	icon_url: '',
	default_username: 'student',
	default_password: '',
	kind: 'vm',
	assign_ip: true,
	is_active: true,
	pinned: true
};

describe('public route components', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		auth.state.isInstructor = false;
		provisioning.state.canProvision = true;
		provisioning.state.message = 'Provisioning is available.';
		window.history.replaceState({}, '', '/');
	});

	it('renders the unauthenticated AI authoring guide without an API request', () => {
		render(AiPage);

		expect(screen.getByRole('heading', { name: 'Crucible AI Authoring' })).not.toBeNull();
		expect(screen.getAllByRole('link', { name: 'AGENTS.md' })[0].getAttribute('href')).toBe(
			'https://github.com/jmal1/selfservice-api/blob/main/AGENTS.md'
		);
		expect(client.getTemplates).not.toHaveBeenCalled();
		expect(client.wikiGetIndex).not.toHaveBeenCalled();
	});

	it('redirects the legacy deploy route to the pod creation flow', async () => {
		render(DeployPage);

		expect(screen.getByText('Redirecting…')).not.toBeNull();
		await waitFor(() =>
			expect(navigation.goto).toHaveBeenCalledWith('/pods/new', { replaceState: true })
		);
	});

	it('renders template API results and reflects the provisioning gate', async () => {
		provisioning.state.canProvision = false;
		provisioning.state.message = 'Maintenance in progress.';
		client.getTemplates.mockResolvedValue([template]);

		render(TemplatesPage);

		expect(await screen.findByRole('heading', { name: 'Ubuntu 24.04' })).not.toBeNull();
		expect(client.getTemplates).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('link', { name: 'Deploy VM' }).getAttribute('aria-disabled')).toBe(
			'true'
		);
		expect(screen.getByRole('link', { name: 'Deploy VM' }).getAttribute('title')).toBe(
			'Maintenance in progress.'
		);
	});

	it('surfaces a stable template error when the API request fails', async () => {
		client.getTemplates.mockRejectedValue(new Error('internal detail'));

		render(TemplatesPage);

		expect(await screen.findByText('Failed to load templates')).not.toBeNull();
	});

	it('denies student wiki access without crossing the instructor API boundary', () => {
		render(WikiPage);

		expect(screen.getByText('Wiki is restricted to instructors and admins.')).not.toBeNull();
		expect(client.wikiGetIndex).not.toHaveBeenCalled();
		expect(client.wikiGetPage).not.toHaveBeenCalled();
	});

	it('loads the wiki index for instructors and renders API failures', async () => {
		auth.state.isInstructor = true;
		client.wikiGetIndex.mockRejectedValue(new Error('internal detail'));

		render(WikiPage);

		expect(await screen.findByText('Failed to load wiki index')).not.toBeNull();
		expect(client.wikiGetIndex).toHaveBeenCalledTimes(1);
		expect(client.wikiGetPage).not.toHaveBeenCalled();
	});
});
