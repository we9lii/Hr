import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {

    server: {
      port: 3001,
      host: '0.0.0.0',
      proxy: {
        '/iclock': {
          target: 'https://hr-bnyq.onrender.com',
          changeOrigin: true,
          secure: false
        },
        '/personnel/api': {
          target: 'https://hr-bnyq.onrender.com',
          changeOrigin: true,
          secure: false
        },
        '/att/api': {
          target: 'https://hr-bnyq.onrender.com',
          changeOrigin: true,
          secure: false
        },
        '/jwt-api-token-auth': {
          target: 'https://hr-bnyq.onrender.com',
          changeOrigin: true,
          secure: false
        }
      }
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
