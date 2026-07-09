export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
	id: string;
	type: ToastType;
	message: string;
	duration: number;
}

class ToastState {
	items = $state<ToastItem[]>([]);

	private add(type: ToastType, message: string, duration = 4000) {
		const id = crypto.randomUUID();
		this.items.push({ id, type, message, duration });
		setTimeout(() => this.dismiss(id), duration);
	}

	success(message: string) {
		this.add('success', message);
	}

	error(message: string) {
		this.add('error', message, 6000);
	}

	warning(message: string) {
		this.add('warning', message);
	}

	info(message: string) {
		this.add('info', message);
	}

	dismiss(id: string) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toast = new ToastState();
