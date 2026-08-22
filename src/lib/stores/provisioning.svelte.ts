import { ApiError, getProvisioningStatus, type ProvisioningStatus } from '$lib/api/client';
import { friendlyError } from '$lib/errors/friendly';

export type ProvisioningAvailability = 'loading' | 'enabled' | 'disabled' | 'unavailable';

export const PROVISIONING_MAINTENANCE_FALLBACK =
	'Provisioning is temporarily unavailable for maintenance.';
export const PROVISIONING_STATUS_UNAVAILABLE =
	"We can't confirm whether provisioning is available right now, so new deployments are paused.";

const STATUS_TTL_MS = 60_000;

export class ProvisioningUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProvisioningUnavailableError';
	}
}

export class ProvisioningStore {
	availability = $state<ProvisioningAvailability>('loading');
	message = $state(PROVISIONING_STATUS_UNAVAILABLE);

	private loadedAt = 0;
	private inFlight: Promise<void> | null = null;
	private requestVersion = 0;

	constructor(
		private readonly fetchStatus: () => Promise<ProvisioningStatus> = getProvisioningStatus
	) {}

	get canProvision(): boolean {
		return this.availability === 'enabled';
	}

	async load({ force = false }: { force?: boolean } = {}): Promise<void> {
		if (!force && this.loadedAt > 0 && Date.now() - this.loadedAt < STATUS_TTL_MS) return;
		if (this.inFlight) return this.inFlight;

		this.availability = 'loading';
		this.message = PROVISIONING_STATUS_UNAVAILABLE;

		const requestVersion = ++this.requestVersion;
		const request = this.fetchStatus()
			.then((status) => {
				if (requestVersion !== this.requestVersion) return;
				this.availability = status.enabled ? 'enabled' : 'disabled';
				this.message =
					status.message.trim() ||
					(status.enabled
						? 'Provisioning is available.'
						: PROVISIONING_MAINTENANCE_FALLBACK);
			})
			.catch(() => {
				if (requestVersion !== this.requestVersion) return;
				this.availability = 'unavailable';
				this.message = PROVISIONING_STATUS_UNAVAILABLE;
			})
			.finally(() => {
				if (requestVersion !== this.requestVersion) return;
				this.loadedAt = Date.now();
				this.inFlight = null;
			});

		this.inFlight = request;
		return request;
	}

	recordMutationFailure(error: unknown): boolean {
		if (!(error instanceof ApiError) || error.status !== 503) return false;

		this.availability = 'disabled';
		this.message = friendlyError(error, PROVISIONING_MAINTENANCE_FALLBACK);
		this.loadedAt = Date.now();
		this.requestVersion++;
		this.inFlight = null;
		return true;
	}

	async runMutation<T>(mutation: () => Promise<T>): Promise<T> {
		if (!this.canProvision) {
			throw new ProvisioningUnavailableError(this.message);
		}

		try {
			return await mutation();
		} catch (error) {
			this.recordMutationFailure(error);
			throw error;
		}
	}

	reset(): void {
		this.availability = 'loading';
		this.message = PROVISIONING_STATUS_UNAVAILABLE;
		this.loadedAt = 0;
		this.inFlight = null;
		this.requestVersion++;
	}
}

export const provisioningStore = new ProvisioningStore();
