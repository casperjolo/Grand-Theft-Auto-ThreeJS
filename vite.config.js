import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      host: 'localhost'
    },
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    // @ts-ignore - allow all preview hosts for E2B
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 5173
  }
});
