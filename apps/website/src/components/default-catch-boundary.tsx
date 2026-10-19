import {
    ErrorComponent,
    type ErrorComponentProps,
    Link,
    rootRouteId,
    useMatch,
    useRouter
} from '@tanstack/react-router';

import { Button } from './button';

export function DefaultCatchBoundary({ error }: Readonly<ErrorComponentProps>) {
    const router = useRouter();
    const isRoot = useMatch({
        strict: false,
        select: (state) => state.id === rootRouteId
    });

    // Preserve stack/context in console for developer debugging.
    console.error(error);

    return (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
            <ErrorComponent error={error} />
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    onClick={async () => {
                        // Retry path: invalidate loaders and re-resolve route data.
                        await router.invalidate();
                    }}
                >
                    Try Again
                </Button>
                {isRoot ? (
                    <Button render={<Link to="/" />} nativeButton={false}>
                        Home
                    </Button>
                ) : (
                    <Button
                        render={
                            <Link
                                to="/"
                                onClick={(e) => {
                                    e.preventDefault();
                                    window.history.back();
                                }}
                            />
                        }
                        nativeButton={false}
                    >
                        Go Back
                    </Button>
                )}
            </div>
        </div>
    );
}
