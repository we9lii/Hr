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
        },
        '/biometric_api': {
          target: 'https://qssun.solar/api',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/biometric_api/, '')
        },
        '/api': {
          target: 'https://qssun.solar/api',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/legacy_iclock': {
          target: 'http://qssun.dyndns.org:8085',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/legacy_iclock/, '/iclock')
        },
        '/legacy_personnel': {
          target: 'http://qssun.dyndns.org:8085',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/legacy_personnel/, '/personnel')
        },
        '/legacy_biometric': {
          target: 'http://qssun.dyndns.org:8085',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/legacy_biometric/, '/biometric')
        },
        '/legacy_auth': {
          target: 'http://qssun.dyndns.org:8085',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/legacy_auth/, '')
        },
        '/local_iclock': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/local_iclock/, '/iclock')
        },
        '/local_php': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/local_php/, '')
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
