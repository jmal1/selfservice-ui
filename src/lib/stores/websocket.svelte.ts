import type { WSEvent } from '$lib/types';
import { config } from '$lib/config';

type EventHandler = (event: WSEvent) => void;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_DELAY = 1_000;

class WebSocketStore {
	connected = $state(false);
	private ws: WebSocket | null = null;
	private handlers = new Map<string, Set<EventHandler>>();
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private intentionalClose = false;

	connect() {
		if (this.ws?.readyState === WebSocket.OPEN) return;
		this.intentionalClose = false;

		// Don't attempt WebSocket if URL is invalid or not configured
		if (!config.wsUrl) return;

		try {
			const url = new URL(config.wsUrl);

			this.ws = new WebSocket(url.toString());

			this.ws.onopen = () => {
				this.connected = true;
				this.reconnectAttempt = 0;
			};

			this.ws.onclose = () => {
				this.connected = false;
				this.ws = null;
				if (!this.intentionalClose && this.reconnectAttempt < 3) {
					this.scheduleReconnect();
				}
			};

			this.ws.onerror = () => {
				this.ws?.close();
			};

			this.ws.onmessage = (event: MessageEvent) => {
				try {
					const data = JSON.parse(event.data as string) as WSEvent;
					const typeHandlers = this.handlers.get(data.type);
					if (typeHandlers) {
						for (const handler of typeHandlers) {
							handler(data);
						}
					}
					const allHandlers = this.handlers.get('*');
					if (allHandlers) {
						for (const handler of allHandlers) {
							handler(data);
						}
					}
				} catch {
					// Ignore malformed messages
				}
			};
		} catch {
			// Invalid URL or WebSocket construction failed — skip silently
		}
	}

	disconnect() {
		this.intentionalClose = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ws?.close();
		this.ws = null;
		this.connected = false;
	}

	/** Subscribe to a specific event type (or '*' for all). Returns an unsubscribe function. */
	on(eventType: string, handler: EventHandler): () => void {
		if (!this.handlers.has(eventType)) {
			this.handlers.set(eventType, new Set());
		}
		this.handlers.get(eventType)!.add(handler);

		return () => {
			this.handlers.get(eventType)?.delete(handler);
		};
	}

	private scheduleReconnect() {
		const jitter = Math.random() * 500;
		const delay = Math.min(BASE_DELAY * Math.pow(2, this.reconnectAttempt) + jitter, MAX_RECONNECT_DELAY);
		this.reconnectAttempt++;

		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}
}

export const wsStore = new WebSocketStore();
