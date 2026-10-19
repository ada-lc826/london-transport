import { Button as BaseButton, type ButtonProps } from '@base-ui/react/button';

type ButtonVariant = 'normal' | 'highlight';

type Props = ButtonProps & {
    variant?: ButtonVariant;
};

// Shared base style so every button variant keeps a consistent hit area and shape.
const BASE_CLASS =
    'cursor-pointer rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors';

// Visual variants used by the control interface to signal selected vs neutral actions.
const VARIANT_CLASS: Record<ButtonVariant, string> = {
    normal: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]',
    highlight:
        'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]'
};

export function Button(props: Props) {
    const { className, children, variant = 'normal', ...rest } = props;
    const variantClass = VARIANT_CLASS[variant];
    // Preserve caller flexibility by supporting state-aware class callbacks
    // in addition to static class strings.
    const resolvedClassName =
        typeof className === 'function'
            ? (state: unknown) =>
                  `${BASE_CLASS} ${variantClass} ${(className as (state: unknown) => string)(state)}`.trim()
            : `${BASE_CLASS} ${variantClass} ${className ?? ''}`.trim();

    return (
        <BaseButton className={resolvedClassName} {...rest}>
            {children}
        </BaseButton>
    );
}
