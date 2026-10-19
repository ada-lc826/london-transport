import { useScreenStore } from '../lib/realtime/stores/screen-store';
import { wallRect } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import { WallMap } from '../wall/wall-map';
import type { SceneProps } from './registry';

// One map across the whole wall, driven by the tablets' city and zoom controls (the starter's
// demo). Use it to check that the map lines up across bezels on the real wall.

export function MapCheckScene(_props: SceneProps) {
    const { layout } = useWallStage();
    const camera = useScreenStore((state) => state.mapView);
    return (
        <>
            <WallMap frame={wallRect(layout)} camera={camera} />
            <ScreenText
                col={0}
                row={layout.rows - 1}
                level="h2"
                align="left"
                className="text-white/70"
            >
                © OpenStreetMap · CARTO
            </ScreenText>
        </>
    );
}
