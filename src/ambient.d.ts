// Ambient module declarations for entry points that ship JS but no .d.ts.
// This file must NOT have a top-level `import`/`export` so that the
// `declare module` statements register as global ambient declarations
// rather than module augmentations.

declare module 'monaco-editor/esm/vs/editor/editor.main';
declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
	export default class EditorWorker {
		constructor();
	}
}
declare module 'sh-syntax/main.wasm?url' {
	const url: string;
	export default url;
}
declare module 'sh-syntax/vendors/wasm_exec';
