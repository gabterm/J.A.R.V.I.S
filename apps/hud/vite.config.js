import { defineConfig } from 'vite';

// No dev, /ws vai para o servidor local; no app, VITE_SERVER_URL aponta para o servidor hospedado.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
});
