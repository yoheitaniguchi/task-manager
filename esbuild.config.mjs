import esbuild from 'esbuild';
import process from 'process';
import fs from 'fs';
import builtins from 'builtin-modules';
import esbuildSvelte from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';

/**
 * 未変換の rune がバンドルに残っていないか検査する。
 *
 * esbuild-svelte は .svelte しかコンパイルしないため、.svelte.ts に
 * モジュールレベルの $state() を書くと素通りし、実行時に
 * "ReferenceError: $state is not defined" でプラグインごと起動に失敗する。
 * 型検査も svelte-check も通ってしまうので、ここで落とす。
 */
function assertNoRawRunes(outfile) {
	const code = fs.readFileSync(outfile, 'utf8');
	// 代入・呼び出しの形だけを見る（Svelte 本体のエラーメッセージ文字列に誤反応しないため）
	const patterns = [/[=(,]\$state\(/, /[=(,]\$derived\(/, /[=(,]\$props\(\)/, /[;{}]\$effect\(/];

	const hit = patterns.find((re) => re.test(code));
	if (hit) {
		console.error(
			`\n[build] 未変換の rune がバンドルに残っています (${hit}).\n` +
				'  rune はコンパイル対象の .svelte 内でのみ使えます。\n' +
				'  モジュール側で状態を共有したい場合は svelte/store を使ってください（src/ui/state.ts 参照）。\n',
		);
		process.exit(1);
	}
}

const banner = `/*
このファイルは自動生成されています。編集する場合は src/ 側を編集してください。
*/
`;

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ['src/main.ts'],
	bundle: true,
	plugins: [
		esbuildSvelte({
			compilerOptions: { css: 'injected', dev: !prod },
			preprocess: sveltePreprocess(),
		}),
	],
	external: [
		'obsidian',
		'electron',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		...builtins,
	],
	format: 'cjs',
	target: 'es2018',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	minify: prod,
});

if (prod) {
	await context.rebuild();
	assertNoRawRunes('main.js');
	process.exit(0);
} else {
	await context.watch();
}
