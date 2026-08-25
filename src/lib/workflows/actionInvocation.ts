import type { Action } from '$lib/types';

type ActionIdentifier = Pick<Action, 'slug' | 'action_type'>;
type ActionInvocation = Pick<Action, 'name' | 'slug' | 'action_type'>;
type ActionParameter = readonly [name: string, value: unknown];

export function getActionCallableIdentifier(action: ActionIdentifier): string {
	return action.slug ? action.slug.replaceAll('-', '_') : action.action_type;
}

export function formatRunActionCall(
	action: ActionInvocation,
	parameters: readonly ActionParameter[] = []
): string {
	const parameterList = parameters.map(([name, value]) => `${name}="${value}"`).join(' ');
	const callable = getActionCallableIdentifier(action);

	return `run_action "${action.name}" ${callable}${parameterList ? ` ${parameterList}` : ''}`;
}
