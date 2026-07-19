import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		// domain/ は Obsidian API 非依存なので、モックなしでそのまま動く。
		include: ['tests/**/*.test.ts'],
	},
});
