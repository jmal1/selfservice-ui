<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminGetUsers, adminUpdateQuota } from '$lib/api/client';
	import type { User } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let users = $state<User[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let editValues = $state<{ max_vcpus: number; max_ram_mb: number; max_pods: number }>({
		max_vcpus: 0,
		max_ram_mb: 0,
		max_pods: 0
	});
	let saving = $state(false);

	onMount(async () => {
		if (!authStore.isAdmin) return;
		try {
			users = await adminGetUsers();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load users';
		} finally {
			loading = false;
		}
	});

	function startEdit(user: User) {
		editingId = user.id;
		editValues = {
			max_vcpus: user.max_vcpus,
			max_ram_mb: user.max_ram_mb,
			max_pods: user.max_pods
		};
	}

	function cancelEdit() {
		editingId = null;
	}

	async function saveQuota(userId: string) {
		saving = true;
		try {
			const updated = await adminUpdateQuota(userId, editValues);
			users = users.map((u) => (u.id === userId ? updated : u));
			editingId = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update quota';
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl space-y-6">
	<h1 class="text-2xl font-bold text-surface-900-100">User Management</h1>

	{#if !authStore.isAdmin}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{:else}
		<div class="overflow-hidden rounded-2xl border border-surface-200-800 bg-surface-100-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							<th class="px-5 py-3">Username</th>
							<th class="px-5 py-3">Email</th>
							<th class="px-5 py-3">Role</th>
							<th class="px-5 py-3">vCPUs</th>
							<th class="px-5 py-3">RAM (MB)</th>
							<th class="px-5 py-3">Pods</th>
							<th class="px-5 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(5) as _}
								<tr class="border-b border-surface-200-800">
									{#each Array(7) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else}
							{#each users as user (user.id)}
								<tr class="border-b border-surface-200-800 transition-colors hover:bg-surface-200-800/30">
									<td class="px-5 py-3 font-medium text-surface-900-100">{user.username}</td>
									<td class="px-5 py-3 text-surface-600-400">{user.email}</td>
									<td class="px-5 py-3">
										<span
											class="rounded-full px-2 py-0.5 text-xs font-medium
												{user.role === 'admin'
												? 'bg-primary-500/10 text-primary-500'
												: 'bg-surface-200-800 text-surface-500'}"
										>
											{user.role}
										</span>
									</td>

									{#if editingId === user.id}
										<td class="px-5 py-3">
											<input
												type="number"
												min="1"
												bind:value={editValues.max_vcpus}
												class="w-20 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none"
											/>
										</td>
										<td class="px-5 py-3">
											<input
												type="number"
												min="512"
												step="512"
												bind:value={editValues.max_ram_mb}
												class="w-24 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none"
											/>
										</td>
										<td class="px-5 py-3">
											<input
												type="number"
												min="1"
												bind:value={editValues.max_pods}
												class="w-16 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none"
											/>
										</td>
										<td class="px-5 py-3 text-right">
											<div class="flex items-center justify-end gap-1">
												<button
													class="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
													disabled={saving}
													onclick={() => saveQuota(user.id)}
												>
													{saving ? 'Saving…' : 'Save'}
												</button>
												<button
													class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200-800"
													onclick={cancelEdit}
												>
													Cancel
												</button>
											</div>
										</td>
									{:else}
										<td class="px-5 py-3 font-mono text-surface-600-400">{user.max_vcpus}</td>
										<td class="px-5 py-3 font-mono text-surface-600-400">{user.max_ram_mb}</td>
										<td class="px-5 py-3 font-mono text-surface-600-400">{user.max_pods}</td>
										<td class="px-5 py-3 text-right">
											<button
												class="text-xs text-primary-500 hover:text-primary-400"
												onclick={() => startEdit(user)}
											>
												Edit Quota
											</button>
										</td>
									{/if}
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
