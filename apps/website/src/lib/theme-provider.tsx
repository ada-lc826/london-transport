import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';
const MEDIA = '(prefers-color-scheme: dark)';

const isTheme = (value: unknown): value is Theme =>
    value === 'dark' || value === 'light' || value === 'system';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
    theme: 'system',
    setTheme: () => null
};

// Context is intentionally tiny: current mode + setter.
const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

// references:
// https://ui.shadcn.com/docs/dark-mode/vite
// https://github.com/pacocoursey/next-themes/blob/main/next-themes/src/index.tsx
export function ThemeProvider({
    children,
    defaultTheme = 'system',
    storageKey = 'theme',
    ...props
}: ThemeProviderProps) {
    // Read persisted theme on first client render so route transitions preserve user preference.
    // On the server we intentionally fall back to `defaultTheme`; the root-level ScriptOnce
    // handles pre-hydration class setup to avoid mismatches/flashes.
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window === 'undefined') return defaultTheme;
        const stored = localStorage.getItem(storageKey);
        return isTheme(stored) ? stored : defaultTheme;
    });

    const handleMediaQuery = useCallback(
        (e: MediaQueryListEvent | MediaQueryList) => {
            if (theme !== 'system') return;
            const root = window.document.documentElement;
            const targetTheme = e.matches ? 'dark' : 'light';
            if (!root.classList.contains(targetTheme)) {
                root.classList.remove('light', 'dark');
                root.classList.add(targetTheme);
            }
        },
        [theme]
    );

    // Listen for system preference changes
    useEffect(() => {
        const media = window.matchMedia(MEDIA);

        media.addEventListener('change', handleMediaQuery);
        handleMediaQuery(media);

        return () => media.removeEventListener('change', handleMediaQuery);
    }, [handleMediaQuery]);

    useEffect(() => {
        const root = window.document.documentElement;

        let targetTheme: string;

        if (theme === 'system') {
            localStorage.removeItem(storageKey);
            targetTheme = window.matchMedia(MEDIA).matches ? 'dark' : 'light';
        } else {
            localStorage.setItem(storageKey, theme);
            targetTheme = theme;
        }

        // Keep DOM writes minimal; classList operations can trigger style recalculation.
        // Only update if the target theme is not already applied
        if (!root.classList.contains(targetTheme)) {
            root.classList.remove('light', 'dark');
            root.classList.add(targetTheme);
        }
    }, [theme, storageKey]);

    // Sync theme across tabs/windows/iframes when localStorage changes externally.
    useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== storageKey) return;
            const nextTheme = isTheme(event.newValue) ? event.newValue : 'system';
            setTheme((current) => (current === nextTheme ? current : nextTheme));
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [storageKey]);

    const value = useMemo(
        () => ({
            theme,
            setTheme
        }),
        [theme]
    );

    return (
        <ThemeProviderContext {...props} value={value}>
            {children}
        </ThemeProviderContext>
    );
}

export const useTheme = () => {
    const context = use(ThemeProviderContext);

    if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

    return context;
};
