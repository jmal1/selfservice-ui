export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	type: ToastType;
	title: string;
	message?: string;
	duration: number;
}

function createToastStore() {
	let toasts = $state<Toast[]>([]);

	function addToast(type: ToastType, title: string, message?: string, duration?: number) {
		const id = crypto.randomUUID();
		const defaultDuration = type === 'error' ? 10000 : 5000;
		const toast: Toast = { id, type, title, message, duration: duration ?? defaultDuration };
		toasts = [...toasts, toast];
		setTimeout(() => removeToast(id), toast.duration);
		return id;
	}

	function removeToast(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	return {
		get toasts() {
			return toasts;
		},
		addToast,
		removeToast,
		success: (title: string, message?: string) => addToast('success', title, message),
		error: (title: string, message?: string) => addToast('error', title, message, 10000),
		info: (title: string, message?: string) => addToast('info', title, message),
		warning: (title: string, message?: string) => addToast('warning', title, message)
	};
}

export const toastStore = createToastStore();
