import { Map } from '@vis.gl/react-maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';
import { cameraForRect, type MapCamera } from './camera';
import type { WallRect } from './layout';
import { MapLayerPortal } from './stage';

// Dark basemap, per the DO guidance to avoid large bright areas. To be replaced by a
// self-hosted Protomaps style so the wall works offline (plan §6.6).
export const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

type WallMapProps = {
    // Wall-pixel rectangle the map fills; `camera` is centred on it.
    frame: WallRect;
    camera: MapCamera;
    mapStyle?: string;
};

/**
 * A map spanning any block of screens. Each screen draws only its own part, with a camera
 * derived from the shared one, so the pieces line up across bezels. Not interactive: the wall
 * is driven from the control tablets.
 */
export function WallMap({ frame, camera, mapStyle = DARK_MAP_STYLE }: WallMapProps) {
    return (
        <MapLayerPortal rect={frame}>
            {({ rect, scale }) => {
                const local = cameraForRect(camera, frame, rect, scale);
                return (
                    <Map
                        reuseMaps
                        interactive={false}
                        attributionControl={false}
                        mapStyle={mapStyle}
                        longitude={local.longitude}
                        latitude={local.latitude}
                        zoom={local.zoom}
                        bearing={local.bearing}
                        pitch={0}
                        style={{ width: '100%', height: '100%' }}
                    />
                );
            }}
        </MapLayerPortal>
    );
}
