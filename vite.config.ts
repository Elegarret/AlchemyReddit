import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
	plugins: [react(), tailwind(), devvit()],
	define: {
		__BUILD_NUMBER__: JSON.stringify(new Date().toISOString().slice(0, 10).replace(/-/g, '.')),
	},
});
