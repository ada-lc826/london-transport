import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite-plus';

// Unit tests exercise plain TS modules; the app plugins (Nitro in particular) need a real dev
// server and fail to start under the test runner.
const isTest = process.env.VITEST === 'true';

// `STATIC_DEMO=1` builds the static demo for GitHub Pages: a single-page app with no server,
// served from BASE_PATH (e.g. /london-transport/), using the in-browser bus
// (src/lib/realtime/local-bus.ts) instead of the WebSocket one.
const staticDemo = process.env.STATIC_DEMO === '1';
const base = staticDemo ? (process.env.BASE_PATH ?? '/') : '/';
if (staticDemo) process.env.VITE_LOCAL_BUS = '1';

export default defineConfig({
    base,
    resolve: {
        tsconfigPaths: true
    },
    server: {
        port: 5780,
        watch: {
            usePolling: true,
            interval: 100
        }
    },
    css: {
        transformer: 'lightningcss',
        lightningcss: {
            cssModules: true
        }
    },
    test: {
        include: ['src/**/*.test.ts']
    },
    plugins: isTest
        ? []
        : [
              devtools({
                  consolePiping: { enabled: false }
              }),
              tanstackStart(
                  staticDemo ? { spa: { enabled: true }, router: { basepath: base } } : undefined
              ),
              // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
              nitro({ features: { websocket: true } }),
              viteReact(),
              // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#react-compiler
              babel({
                  presets: [
                      reactCompilerPreset({
                          target: '19'
                      })
                  ]
              }),
              tailwindcss()
          ]
});
