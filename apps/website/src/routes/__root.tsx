import {
    createRootRouteWithContext,
    HeadContent,
    ScriptOnce,
    Scripts
} from '@tanstack/react-router';

import { withBase } from '../lib/base-path';
import { ThemeProvider } from '../lib/theme-provider';

import appCss from '../style.css?url';

export const Route = createRootRouteWithContext()({
    head: () => ({
        meta: [
            {
                charSet: 'utf-8'
            },
            {
                name: 'viewport',
                content: 'width=device-width, initial-scale=1'
            },
            {
                title: 'Mind the Step'
            },
            {
                name: 'description',
                content: 'Mind the Step: a Data Observatory demo on step-free access in London'
            }
        ],
        links: [
            {
                rel: 'icon',
                href: withBase('/favicon.svg'),
                type: 'image/svg+xml'
            },
            { rel: 'stylesheet', href: appCss }
        ]
    }),
    // The document is a shell: prerendered as-is in the static demo (SPA mode), with the
    // route rendered into it on the client; server-rendered together otherwise.
    shellComponent: RootDocument
});

function RootDocument({ children }: { readonly children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                {/*
                  Hydration strategy:
                  - We set the `dark` class before React hydrates so the initial server HTML and
                    first painted client frame use the same color theme.
                  - Without this early script, React would hydrate into a different class state
                    and users would see a flash of incorrect theme (FOUC).
                  - `ScriptOnce` guarantees this bootstrap script only executes once per document,
                    even as routes change.
                */}
                <ScriptOnce>
                    {`(function () {
              var stored = null;
              // Sandboxed iframes without allow-same-origin throw on any localStorage access.
              try { stored = localStorage.getItem('theme'); } catch (e) {}
              document.documentElement.classList.toggle(
                'dark',
                stored === 'dark' || (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
              );
          })();`}
                </ScriptOnce>
                {/* ThemeProvider keeps theme state in sync across routes, tabs, and iframes. */}
                <ThemeProvider>{children}</ThemeProvider>
                <Scripts />
            </body>
        </html>
    );
}
