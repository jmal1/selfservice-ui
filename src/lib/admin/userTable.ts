export type UserColumn =
	| 'username'
	| 'email'
	| 'role'
	| 'max_vcpus'
	| 'max_ram_mb'
	| 'max_pods'
	| 'labs'
	| 'single_vms';

export type SortDirection = 'asc' | 'desc';

export interface TableUser {
	username: string;
	email: string;
	role: string;
	max_vcpus: number;
	max_ram_mb: number;
	max_pods: number;
	labs_enabled?: boolean;
	max_single_vms?: number;
}

const numericColumns = new Set<UserColumn>(['max_vcpus', 'max_ram_mb', 'max_pods', 'single_vms']);

export function staffRole(role: string): boolean {
	return role === 'instructor' || role === 'admin';
}

export function rolePillClass(role: string): string {
	if (role === 'admin') return 'bg-primary-500/10 text-primary-500';
	if (role === 'instructor') return 'bg-secondary-500/10 text-secondary-500';
	return 'bg-surface-200 dark:bg-surface-800 text-surface-500';
}

export function userColumnValue(user: TableUser, column: UserColumn): string | number {
	switch (column) {
		case 'username':
			return user.username;
		case 'email':
			return user.email;
		case 'role':
			return user.role;
		case 'max_vcpus':
			return user.max_vcpus;
		case 'max_ram_mb':
			return user.max_ram_mb;
		case 'max_pods':
			return user.max_pods;
		case 'labs':
			if (staffRole(user.role)) return '';
			return user.labs_enabled ? 'yes' : 'no';
		case 'single_vms':
			if (staffRole(user.role)) return Number.POSITIVE_INFINITY;
			return user.max_single_vms ?? 1;
	}
}

export function filterUsers<T extends TableUser>(users: T[], query: string): T[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return users;
	const columns: UserColumn[] = [
		'username',
		'email',
		'role',
		'max_vcpus',
		'max_ram_mb',
		'max_pods',
		'labs',
		'single_vms'
	];
	return users.filter((user) =>
		columns.some((column) => String(userColumnValue(user, column)).toLowerCase().includes(needle))
	);
}

export function sortUsers<T extends TableUser>(
	users: T[],
	column: UserColumn,
	direction: SortDirection
): T[] {
	const copy = [...users];
	copy.sort((left, right) => {
		const a = userColumnValue(left, column);
		const b = userColumnValue(right, column);
		const cmp =
			typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
		return direction === 'asc' ? cmp : -cmp;
	});
	return copy;
}

export function nextSort(
	current: UserColumn,
	direction: SortDirection,
	clicked: UserColumn
): { column: UserColumn; direction: SortDirection } {
	if (current !== clicked) return { column: clicked, direction: 'asc' };
	return { column: clicked, direction: direction === 'asc' ? 'desc' : 'asc' };
}

export function isNumericColumn(column: UserColumn): boolean {
	return numericColumns.has(column);
}
