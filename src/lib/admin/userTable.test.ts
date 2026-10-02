import { describe, expect, it } from 'vitest';
import { filterUsers, nextSort, rolePillClass, sortUsers, type TableUser } from './userTable';

const users: TableUser[] = [
	{
		username: 'ada',
		email: 'ada@example.test',
		role: 'student',
		max_vcpus: 4,
		max_ram_mb: 4096,
		max_pods: 2,
		labs_enabled: false,
		max_single_vms: 1
	},
	{
		username: 'grace',
		email: 'grace@example.test',
		role: 'instructor',
		max_vcpus: 8,
		max_ram_mb: 16384,
		max_pods: 3
	},
	{
		username: 'linus',
		email: 'linus@example.test',
		role: 'admin',
		max_vcpus: 4,
		max_ram_mb: 4096,
		max_pods: 1
	}
];

describe('user table', () => {
	it('filters across text and numeric columns', () => {
		expect(filterUsers(users, '').map((user) => user.username)).toEqual(['ada', 'grace', 'linus']);
		expect(filterUsers(users, 'grace@').map((user) => user.username)).toEqual(['grace']);
		expect(filterUsers(users, 'instructor').map((user) => user.username)).toEqual(['grace']);
		expect(filterUsers(users, '16384').map((user) => user.username)).toEqual(['grace']);
		expect(filterUsers(users, 'no').map((user) => user.username)).toEqual(['ada']);
	});

	it('sorts each column in both directions', () => {
		expect(sortUsers(users, 'username', 'asc').map((user) => user.username)).toEqual([
			'ada',
			'grace',
			'linus'
		]);
		expect(sortUsers(users, 'username', 'desc').map((user) => user.username)).toEqual([
			'linus',
			'grace',
			'ada'
		]);
		expect(sortUsers(users, 'max_ram_mb', 'desc')[0].username).toBe('grace');
		expect(sortUsers(users, 'single_vms', 'desc')[0].role).not.toBe('student');
		expect(nextSort('username', 'asc', 'email')).toEqual({ column: 'email', direction: 'asc' });
		expect(nextSort('email', 'asc', 'email')).toEqual({ column: 'email', direction: 'desc' });
	});

	it('paints instructor differently from student and admin', () => {
		expect(rolePillClass('instructor')).not.toBe(rolePillClass('student'));
		expect(rolePillClass('instructor')).not.toBe(rolePillClass('admin'));
		expect(rolePillClass('student')).toContain('surface');
	});
});