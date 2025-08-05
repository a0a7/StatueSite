import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		minify: 'esbuild',
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (id.includes('three')) {
						if (id.includes('loaders') || id.includes('controls')) {
							return 'three-loaders';
						}
						if (id.includes('postprocessing')) {
							return 'three-postprocessing';
						}
						if (id.includes('math')) {
							return 'three-math';
						}
						return 'three';
					}
				}
			}
		},
		chunkSizeWarningLimit: 1000,
		target: 'es2020'
	},
	server: {
		fs: {
			allow: ['..']
		}
	},
	optimizeDeps: {
		include: [
			'three', 
			'three/examples/jsm/controls/OrbitControls.js',
			'three/examples/jsm/loaders/GLTFLoader.js'
		]
	}
});
