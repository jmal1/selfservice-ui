import workflow from '../../.github/workflows/ci.yaml?raw';
import { describe, expect, it } from 'vitest';

describe('CI workflow', () => {
	it('runs pull request builds without waiting for test and keeps push builds gated', () => {
		const lines = workflow.split(/\r?\n/);
		const prStart = lines.indexOf('  build-pr:');
		const pushStart = lines.indexOf('  build:');
		const prBuild = lines.slice(prStart, pushStart).join('\n');
		const pushBuild = lines.slice(pushStart).join('\n');

		expect(prBuild).toContain("if: github.event_name == 'pull_request'");
		expect(prBuild).not.toContain('needs: test');
		expect(pushBuild).toContain("if: github.event_name != 'pull_request'");
		expect(pushBuild).toContain('needs: test');
	});
});
