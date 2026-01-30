import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    appType: 'mpa', // Multi-page app - don't use SPA fallback
    server: {
        port: 5173,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3001',
                ws: true
            }
        }
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                ventEditor: resolve(__dirname, 'vent-editor.html'),
                mapEditor: resolve(__dirname, 'map-editor.html'),
                taskBoxEditor: resolve(__dirname, 'task-box-editor.html')
            }
        }
    }
});
