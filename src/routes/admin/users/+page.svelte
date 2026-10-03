<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError } from '$lib/errors/friendly';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminGetUsers, adminUpdateAccess, adminUpdateQuota } from '$lib/api/client';
	import { accessPatch, studentAccessEditable } from '$lib/labs/access';
	import {
		filterUsers,
		nextSort,
		rolePillClass,
		sortUsers,
		staffRole,
		type SortDirection,
		type UserColumn
	} from '$lib/admin/userTable';
	import type { User } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let users = $state<User[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let editValues = $state<{
		max_vcpus: number;
		max_ram_mb: number;
		max_pods: number;
		labs_enabled: boolean;
		max_single_vms: number;
	}>({
		max_vcpus: 0,
		max_ram_mb: 0,
		max_pods: 0,
		labs_enabled: false,
		max_single_vms: 1
	});
	let saving = $state(false);
	let query = $state('');
	let sortColumn = $state<UserColumn>('username');
	let sortDirection = $state<SortDirection>('asc');

	const visibleUsers = $derived(sortUsers(filterUsers(users, query), sortColumn, sortDirection));

	const columns: { key: UserColumn; label: string; width: string }[] = [
		{ key: 'username', label: 'Username', width: 'w-[15%]' },
		{ key: 'email', label: 'Email', width: 'w-[20%]' },
		{ key: 'role', label: 'Role', width: 'w-[10%]' },
		{ key: 'max_vcpus', label: 'vCPUs', width: 'w-[8%]' },
		{ key: 'max_ram_mb', label: 'RAM (MB)', width: 'w-[10%]' },
		{ key: 'max_pods', label: 'Pods', width: 'w-[7%]' },
		{ key: 'labs', label: 'Labs', width: 'w-[8%]' },
		{ key: 'single_vms', label: 'Single VMs', width: 'w-[11%]' }
	];

	function sortBy(column: UserColumn) {
		const next = nextSort(sortColumn, sortDirection, column);
		sortColumn = next.column;
		sortDirection = next.direction;
	}

	async function loadUsers() {
		try {
			users = await adminGetUsers();
		} catch (e) {
			error = friendlyError(e, 'Failed to load users');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!authStore.isInstructor) return;
		loadUsers();

		const interval = setInterval(() => {
			if (!document.hidden) loadUsers();
		}, 15000);

		return () => clearInterval(interval);
	});

	function startEdit(user: User) {
		editingId = user.id;
		editValues = {
			max_vcpus: user.max_vcpus,
			max_ram_mb: user.max_ram_mb,
			max_pods: user.max_pods,
			labs_enabled: user.labs_enabled === true,
			max_single_vms: user.max_single_vms ?? 1
		};
	}

	function cancelEdit() {
		editingId = null;
	}

	async function saveQuota(user: User) {
		saving = true;
		error = null;
		try {
			let updated = user;
			if (studentAccessEditable(user.role)) {
				const patch = accessPatch(editValues.labs_enabled, Number(editValues.max_single_vms));
				if (!patch.ok) {
					error = patch.error;
					return;
				}
				updated = await adminUpdateAccess(user.id, patch);
				users = users.map((u) => (u.id === user.id ? { ...u, ...updated } : u));
			}
			updated = await adminUpdateQuota(user.id, {
				max_vcpus: editValues.max_vcpus,
				max_ram_mb: editValues.max_ram_mb,
				max_pods: editValues.max_pods
			});
			users = users.map((u) => (u.id === user.id ? { ...u, ...updated } : u));
			editingId = null;
		} catch (e) {
			error = friendlyError(e, 'Failed to update quota');
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl space-y-6">
	<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">User Management</h1>

	{#if !authStore.isInstructor}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{:else}
		<label class="block max-w-sm">
			<span class="text-xs font-medium text-surface-500">Filter</span>
			<input
				bind:value={query}
				placeholder="Any column"
				class="mt-1 w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-2 text-sm"
			/>
		</label>
		<div class="overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full table-fixed text-left text-sm">
					<caption class="sr-only">User accounts and quota management</caption>
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							{#each columns as column (column.key)}
								<th scope="col" class="px-3 py-3 {column.width}">
									<button type="button" class="hover:text-surface-900 dark:hover:text-surface-100" onclick={() => sortBy(column.key)}>
										{column.label}{sortColumn === column.key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
									</button>
								</th>
							{/each}
							<th scope="col" class="w-[11%] px-3 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(5) as _}
								<tr class="border-b border-surface-200 dark:border-surface-800">
									{#each Array(9) as _cell}
										<td class="px-3 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else}
							{#each visibleUsers as user (user.id)}
								<tr
									class="border-b border-surface-200 dark:border-surface-800 transition-colors {editingId === user.id
										? 'bg-primary-500/5'
										: 'hover:bg-surface-200 dark:hover:bg-surface-800/30'}"
								>
									<td class="max-w-0 px-3 py-3 font-medium text-surface-900 dark:text-surface-100">
										<span class="block truncate" title={user.username}>{user.username}</span>
									</td>
									<td class="max-w-0 px-3 py-3 text-surface-600 dark:text-surface-400">
										<span class="block truncate" title={user.email}>{user.email}</span>
									</td>
									<td class="px-3 py-3">
										<span class="rounded-full px-2 py-0.5 text-xs font-medium {rolePillClass(user.role)}">
											{user.role}
										</span>
									</td>
									<td class="px-3 py-3 font-mono text-surface-600 dark:text-surface-400">{user.max_vcpus}</td>
									<td class="px-3 py-3 font-mono text-surface-600 dark:text-surface-400">{user.max_ram_mb}</td>
									<td class="px-3 py-3 font-mono text-surface-600 dark:text-surface-400">{user.max_pods}</td>
									<td class="px-3 py-3 text-surface-600 dark:text-surface-400">
										{studentAccessEditable(user.role) ? (user.labs_enabled ? 'Yes' : 'No') : '—'}
									</td>
									<td class="px-3 py-3 font-mono text-surface-600 dark:text-surface-400">
										{staffRole(user.role) ? 'Unlimited' : (user.max_single_vms ?? 1)}
									</td>
									<td class="px-3 py-3 text-right">
										<button
											class="text-xs text-primary-500 hover:text-primary-400"
											onclick={() => startEdit(user)}
										>
											Edit Quota
										</button>
									</td>
								</tr>
								{#if editingId === user.id}
									<tr class="border-b border-surface-200 dark:border-surface-800 bg-primary-500/5">
										<td colspan="9" class="px-3 py-3">
											<div class="flex min-w-0 flex-wrap items-end gap-3">
												<label class="flex flex-col gap-1 text-xs font-medium text-surface-500">
													vCPUs
													<input
														type="number"
														min="1"
														bind:value={editValues.max_vcpus}
														aria-label="Maximum vCPUs for {user.username}"
														class="w-20 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
													/>
												</label>
												<label class="flex flex-col gap-1 text-xs font-medium text-surface-500">
													RAM (MB)
													<input
														type="number"
														min="512"
														step="512"
														bind:value={editValues.max_ram_mb}
														aria-label="Maximum RAM in MB for {user.username}"
														class="w-24 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
													/>
												</label>
												<label class="flex flex-col gap-1 text-xs font-medium text-surface-500">
													Pods
													<input
														type="number"
														min="1"
														bind:value={editValues.max_pods}
														aria-label="Maximum pods for {user.username}"
														class="w-16 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
													/>
												</label>
												{#if studentAccessEditable(user.role)}
													<label class="flex items-center gap-2 pb-1.5 text-xs font-medium text-surface-500">
														<input
															type="checkbox"
															bind:checked={editValues.labs_enabled}
															aria-label="Labs and blueprints for {user.username}"
															class="accent-primary-500"
														/>
														Labs
													</label>
													<label class="flex flex-col gap-1 text-xs font-medium text-surface-500">
														Single VMs
														<input
															type="number"
															min="0"
															max="3"
															bind:value={editValues.max_single_vms}
															aria-label="Single VM limit for {user.username}"
															class="w-16 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
														/>
													</label>
												{/if}
												<div class="flex items-center gap-1">
													<button
														class="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
														disabled={saving}
														onclick={() => saveQuota(user)}
													>
														{saving ? 'Saving…' : 'Save'}
													</button>
													<button
														class="rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
														onclick={cancelEdit}
													>
														Cancel
													</button>
												</div>
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
