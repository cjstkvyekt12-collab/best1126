import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Bus,
  Car,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  Footprints,
  Layers,
  Loader2,
  LocateFixed,
  Maximize2,
  RefreshCw,
  Route as RouteIcon,
  Share2,
  Star,
  X,
} from 'lucide-react';
import {
  CATEGORY_MAP,
  GEUMSAN_VIEWPORT_CENTER,
  GMP_ATTRIBUTION_ID,
  checkAndDispatchQuotaError,
  computeHaversineMeters,
  formatDistance,
  formatDuration,
} from '../constants/geumsan';
import type {
  CourseStop,
  RouteLegSummary,
  RouteSummary,
  TravelModeOption,
  YouthPlaceItem,
} from '../types/youthMap';

const MODE_META: Record<
  TravelModeOption,
  { label: string; color: string; activeColor: string; icon: typeof Bus }
> = {
  TRANSIT: {
    label: '대중교통',
    color: '#0F766E',
    activeColor: '#0D9488',
    icon: Bus,
  },
  DRIVING: {
    label: '자동차',
    color: '#1D4ED8',
    activeColor: '#2563EB',
    icon: Car,
  },
  WALKING: {
    label: '도보',
    color: '#D97706',
    activeColor: '#EA580C',
    icon: Footprints,
  },
};

function toLatLngLiteral(
  pt:
    | google.maps.LatLng
    | google.maps.LatLngAltitude
    | google.maps.LatLngLiteral
): google.maps.LatLngLiteral {
  const anyPt = pt as unknown as {
    lat: number | (() => number);
    lng: number | (() => number);
  };
  return {
    lat: typeof anyPt.lat === 'function' ? anyPt.lat() : anyPt.lat,
    lng: typeof anyPt.lng === 'function' ? anyPt.lng() : anyPt.lng,
  };
}

function extractPathLiterals(
  rawPath?: Array<
    google.maps.LatLng | google.maps.LatLngAltitude | google.maps.LatLngLiteral
  > | null
): google.maps.LatLngLiteral[] {
  if (!rawPath || rawPath.length === 0) return [];
  const out: google.maps.LatLngLiteral[] = [];
  for (const pt of rawPath) {
    const lit = toLatLngLiteral(pt);
    if (Number.isFinite(lit.lat) && Number.isFinite(lit.lng)) {
      out.push(lit);
    }
  }
  return out;
}

function computePathMidpoint(
  path: google.maps.LatLngLiteral[],
  fallbackStart: google.maps.LatLngLiteral,
  fallbackEnd: google.maps.LatLngLiteral
): google.maps.LatLngLiteral {
  if (path.length === 0) {
    return {
      lat: (fallbackStart.lat + fallbackEnd.lat) / 2,
      lng: (fallbackStart.lng + fallbackEnd.lng) / 2,
    };
  }
  if (path.length === 1) return path[0];

  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += computeHaversineMeters(path[i - 1], path[i]);
    cumulative.push(total);
  }

  if (total <= 1) {
    return path[Math.floor(path.length / 2)];
  }

  const half = total / 2;
  for (let i = 1; i < cumulative.length; i++) {
    if (cumulative[i] >= half) {
      const segLen = cumulative[i] - cumulative[i - 1];
      const t = segLen > 0 ? (half - cumulative[i - 1]) / segLen : 0;
      return {
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t,
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t,
      };
    }
  }

  return path[Math.floor(path.length / 2)];
}

function slicePathByWaypoints(
  fullPath: google.maps.LatLngLiteral[],
  stops: CourseStop[]
): google.maps.LatLngLiteral[][] {
  const legCount = Math.max(0, stops.length - 1);
  if (legCount === 0) return [];
  if (fullPath.length < 2) {
    return Array.from({ length: legCount }, (_, i) => [
      stops[i].location,
      stops[i + 1].location,
    ]);
  }
  if (legCount === 1) return [fullPath];

  const splitIndices: number[] = [0];
  let searchStart = 0;

  for (let s = 1; s < stops.length - 1; s++) {
    let bestIdx = searchStart;
    let bestDist = Number.POSITIVE_INFINITY;
    const maxEnd = fullPath.length - 1;
    for (let i = searchStart; i <= maxEnd; i++) {
      const d = computeHaversineMeters(fullPath[i], stops[s].location);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    splitIndices.push(bestIdx);
    searchStart = bestIdx;
  }
  splitIndices.push(fullPath.length - 1);

  const slices: google.maps.LatLngLiteral[][] = [];
  for (let i = 0; i < legCount; i++) {
    const startIdx = splitIndices[i];
    const endIdx = splitIndices[i + 1];
    if (endIdx > startIdx) {
      slices.push(fullPath.slice(startIdx, endIdx + 1));
    } else {
      slices.push([stops[i].location, stops[i + 1].location]);
    }
  }
  return slices;
}

function estimateFallbackDurationMillis(
  straightMeters: number,
  mode: TravelModeOption
): number {
  const effectiveMeters = straightMeters * 1.25;
  if (mode === 'WALKING') {
    // ~4.2 km/h (70 m/min)
    return Math.max(60_000, Math.round((effectiveMeters / 70) * 60_000));
  }
  if (mode === 'TRANSIT') {
    // ~24 km/h (400 m/min) + 5 min transfer/wait overhead
    return Math.max(
      300_000,
      Math.round((effectiveMeters / 400) * 60_000) + 300_000
    );
  }
  // DRIVING: ~38 km/h (633 m/min) on local county roads
  return Math.max(60_000, Math.round((effectiveMeters / 633) * 60_000));
}

interface FacilityMarkerProps {
  place: YouthPlaceItem;
  index: number;
  isSelected: boolean;
  courseOrder: number | null;
  onSelect: (place: YouthPlaceItem) => void;
}

function FacilityMarker({
  place,
  index,
  isSelected,
  courseOrder,
  onSelect,
}: FacilityMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const categoryCfg = CATEGORY_MAP[place.categoryId] ?? CATEGORY_MAP.youth_culture;
  const pinColor = courseOrder !== null ? '#D97706' : categoryCfg.color;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={place.location}
        title={place.displayName}
        zIndex={isSelected ? 55 : courseOrder !== null ? 42 : 10}
        onClick={() => onSelect(place)}
      >
        <div
          className={`flex items-center gap-1.5 transition-transform duration-150 ${
            isSelected ? 'scale-110' : 'hover:scale-105'
          }`}
        >
          <div
            className={`min-w-7 h-7 px-1.5 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-white tabular-nums ${
              isSelected ? 'ring-2 ring-teal-700/40' : ''
            }`}
            style={{ backgroundColor: pinColor }}
          >
            {courseOrder !== null ? courseOrder : index + 1}
          </div>
          {isSelected && (
            <div className="bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md shadow-md max-w-[180px] truncate">
              {place.displayName}
            </div>
          )}
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={260}
          pixelOffset={[0, -6]}
          headerDisabled
        >
          <div className="p-1 font-sans">
            <div
              className="text-[11px] font-semibold mb-0.5"
              style={{ color: categoryCfg.textColor }}
            >
              {categoryCfg.label}
              {typeof place.rating === 'number' && (
                <span className="text-slate-600 font-normal ml-1.5 inline-flex items-center gap-0.5 tabular-nums">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500 inline" />
                  {place.rating.toFixed(1)}
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-slate-900 leading-snug">
              {place.displayName}
            </div>
            <div className="text-xs text-slate-500 mt-1 line-clamp-2">
              {place.formattedAddress}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface LegPolylineBundle {
  legIndex: number;
  casing: google.maps.Polyline;
  main: google.maps.Polyline;
  isFallback: boolean;
  path: google.maps.LatLngLiteral[];
}

interface RouteOverlayProps {
  stops: CourseStop[];
  travelMode: TravelModeOption;
  computeTrigger: number;
  selectedLegIndex: number | null;
  fitRouteTrigger: number;
  onSelectLeg: (legIndex: number | null) => void;
  onRouteComputed: (summary: RouteSummary | null, errorMsg: string | null) => void;
  onRouteLoadingChange: (loading: boolean) => void;
}

function RouteOverlay({
  stops,
  travelMode,
  computeTrigger,
  selectedLegIndex,
  fitRouteTrigger,
  onSelectLeg,
  onRouteComputed,
  onRouteLoadingChange,
}: RouteOverlayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const bundlesRef = useRef<LegPolylineBundle[]>([]);
  const routeBoundsRef = useRef<google.maps.LatLngBounds | null>(null);

  const clearPolylines = useCallback(() => {
    bundlesRef.current.forEach((b) => {
      google.maps.event.clearInstanceListeners(b.main);
      b.casing.setMap(null);
      b.main.setMap(null);
    });
    bundlesRef.current = [];
    routeBoundsRef.current = null;
  }, []);

  const buildLegBundle = useCallback(
    (
      legIndex: number,
      path: google.maps.LatLngLiteral[],
      isFallback: boolean,
      mode: TravelModeOption,
      targetMap: google.maps.Map
    ): LegPolylineBundle => {
      const modeColor = MODE_META[mode].color;
      const casing = new google.maps.Polyline({
        path,
        geodesic: isFallback,
        strokeColor: '#FFFFFF',
        strokeWeight: isFallback ? 7 : 9,
        strokeOpacity: 0.92,
        zIndex: 12,
        clickable: false,
        map: targetMap,
      });

      const arrowIcon: google.maps.IconSequence = {
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 2.6,
          strokeColor: '#FFFFFF',
          strokeWeight: 1,
          fillColor: modeColor,
          fillOpacity: 1,
        },
        offset: '50%',
        repeat: '110px',
      };

      const main = new google.maps.Polyline({
        path,
        geodesic: isFallback,
        strokeColor: modeColor,
        strokeWeight: 5,
        strokeOpacity: isFallback ? 0 : 0.92,
        icons: isFallback
          ? [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeColor: modeColor,
                  strokeOpacity: 0.85,
                  strokeWeight: 3.5,
                  scale: 3,
                },
                offset: '0',
                repeat: '14px',
              },
              arrowIcon,
            ]
          : [arrowIcon],
        zIndex: 15,
        clickable: true,
        map: targetMap,
      });

      main.addListener('click', () => {
        onSelectLeg(legIndex);
      });

      return { legIndex, casing, main, isFallback, path };
    },
    [onSelectLeg]
  );

  // Sync visual highlight + focus camera when selectedLegIndex changes
  useEffect(() => {
    if (!map || bundlesRef.current.length === 0) return;

    const modeMeta = MODE_META[travelMode];
    bundlesRef.current.forEach((bundle) => {
      const hasSelection = selectedLegIndex !== null;
      const isSelected = selectedLegIndex === bundle.legIndex;
      const strokeColor = isSelected ? '#EA580C' : modeMeta.color;
      const opacity = hasSelection ? (isSelected ? 1 : 0.35) : 0.92;
      const weight = isSelected ? 6.5 : 5;

      bundle.casing.setOptions({
        strokeWeight: isSelected ? 11 : bundle.isFallback ? 7 : 9,
        strokeOpacity: hasSelection ? (isSelected ? 0.98 : 0.45) : 0.92,
        zIndex: isSelected ? 24 : 12,
      });

      const arrowIcon: google.maps.IconSequence = {
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: isSelected ? 3.1 : 2.5,
          strokeColor: '#FFFFFF',
          strokeWeight: 1,
          fillColor: strokeColor,
          fillOpacity: hasSelection ? (isSelected ? 1 : 0.45) : 1,
        },
        offset: '50%',
        repeat: '110px',
      };

      bundle.main.setOptions({
        strokeColor,
        strokeWeight: weight,
        strokeOpacity: bundle.isFallback ? 0 : opacity,
        icons: bundle.isFallback
          ? [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeColor,
                  strokeOpacity: hasSelection ? (isSelected ? 0.95 : 0.35) : 0.85,
                  strokeWeight: isSelected ? 4.5 : 3.5,
                  scale: 3,
                },
                offset: '0',
                repeat: '14px',
              },
              arrowIcon,
            ]
          : [arrowIcon],
        zIndex: isSelected ? 26 : 15,
      });
    });

    if (selectedLegIndex !== null) {
      const targetBundle = bundlesRef.current.find(
        (b) => b.legIndex === selectedLegIndex
      );
      if (targetBundle && targetBundle.path.length >= 2) {
        const legBounds = new google.maps.LatLngBounds();
        targetBundle.path.forEach((pt) => legBounds.extend(pt));
        map.fitBounds(legBounds, 96);
      }
    }
  }, [map, selectedLegIndex, travelMode]);

  // Fit entire route bounds when explicitly requested
  useEffect(() => {
    if (!map || fitRouteTrigger === 0 || !routeBoundsRef.current) return;
    map.fitBounds(routeBoundsRef.current, 80);
  }, [map, fitRouteTrigger]);

  useEffect(() => {
    clearPolylines();

    if (!map || !routesLib || stops.length < 2) {
      onRouteComputed(null, null);
      onRouteLoadingChange(false);
      return;
    }

    let cancelled = false;
    onRouteLoadingChange(true);

    const drawFallbackReferenceLine = (reason: string) => {
      if (cancelled || !map) return;
      const bounds = new google.maps.LatLngBounds();
      stops.forEach((s) => bounds.extend(s.location));

      const legs: RouteLegSummary[] = [];
      const createdBundles: LegPolylineBundle[] = [];
      let totalStraightMeters = 0;
      let totalEstimatedMillis = 0;

      for (let i = 0; i < stops.length - 1; i++) {
        const segPath = [stops[i].location, stops[i + 1].location];
        const dist = computeHaversineMeters(
          stops[i].location,
          stops[i + 1].location
        );
        const estDur = estimateFallbackDurationMillis(dist, travelMode);
        totalStraightMeters += dist;
        totalEstimatedMillis += estDur;

        createdBundles.push(buildLegBundle(i, segPath, true, travelMode, map));
        legs.push({
          legIndex: i,
          startLabel: stops[i].label,
          endLabel: stops[i + 1].label,
          startLocation: stops[i].location,
          endLocation: stops[i + 1].location,
          distanceMeters: dist,
          durationMillis: estDur,
          isEstimatedFallback: true,
          midpoint: computePathMidpoint(
            segPath,
            stops[i].location,
            stops[i + 1].location
          ),
          path: segPath,
        });
      }

      bundlesRef.current = createdBundles;
      routeBoundsRef.current = bounds;
      map.fitBounds(bounds, 84);

      onRouteComputed(
        {
          distanceMeters: totalStraightMeters,
          durationMillis: totalEstimatedMillis,
          travelMode,
          legs,
          isFallbackLine: true,
          warnings: [reason],
        },
        reason
      );
    };

    const runRoute = async () => {
      try {
        const RouteClass = routesLib.Route;

        // TRANSIT does not support intermediate waypoints in a single request;
        // compute consecutive pairs so multi-stop courses still render leg-by-leg.
        if (travelMode === 'TRANSIT' && stops.length > 2) {
          const createdBundles: LegPolylineBundle[] = [];
          const legs: RouteLegSummary[] = [];
          const bounds = new google.maps.LatLngBounds();
          let totalDist = 0;
          let totalDur = 0;

          for (let i = 0; i < stops.length - 1; i++) {
            const segReq: google.maps.routes.ComputeRoutesRequest = {
              origin: stops[i].location,
              destination: stops[i + 1].location,
              travelMode: 'TRANSIT',
              language: 'ko',
              fields: [
                'path',
                'distanceMeters',
                'durationMillis',
                'viewport',
                'legs',
              ],
              internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
            };

            const res = await RouteClass.computeRoutes(segReq);
            if (cancelled) return;
            const route = res?.routes?.[0];
            if (!route) {
              createdBundles.forEach((b) => {
                b.casing.setMap(null);
                b.main.setMap(null);
              });
              drawFallbackReferenceLine(
                '일부 구간의 대중교통 실시간 경로가 제공되지 않아 직선 동선과 참고 예상 시간으로 표시했습니다.'
              );
              return;
            }

            let segPath = extractPathLiterals(route.legs?.[0]?.path);
            if (segPath.length < 2) {
              segPath = extractPathLiterals(route.path);
            }
            if (segPath.length < 2) {
              const tempPls = route.createPolylines();
              const merged: google.maps.LatLngLiteral[] = [];
              tempPls.forEach((pl) => {
                pl.getPath()
                  .getArray()
                  .forEach((pt) => merged.push(toLatLngLiteral(pt)));
              });
              segPath = merged;
            }
            if (segPath.length < 2) {
              segPath = [stops[i].location, stops[i + 1].location];
            }

            createdBundles.push(
              buildLegBundle(i, segPath, false, travelMode, map)
            );

            if (route.viewport) {
              bounds.union(route.viewport);
            } else {
              segPath.forEach((pt) => bounds.extend(pt));
            }

            const dist = route.distanceMeters ?? 0;
            const dur = route.durationMillis ?? 0;
            totalDist += dist;
            totalDur += dur;

            legs.push({
              legIndex: i,
              startLabel: stops[i].label,
              endLabel: stops[i + 1].label,
              startLocation: stops[i].location,
              endLocation: stops[i + 1].location,
              distanceMeters: dist,
              durationMillis: dur,
              isEstimatedFallback: false,
              midpoint: computePathMidpoint(
                segPath,
                stops[i].location,
                stops[i + 1].location
              ),
              path: segPath,
            });
          }

          if (cancelled) {
            createdBundles.forEach((b) => {
              b.casing.setMap(null);
              b.main.setMap(null);
            });
            return;
          }

          bundlesRef.current = createdBundles;
          routeBoundsRef.current = bounds;
          map.fitBounds(bounds, 84);
          onRouteComputed(
            {
              distanceMeters: totalDist,
              durationMillis: totalDur,
              travelMode,
              legs,
              isFallbackLine: false,
            },
            null
          );
          return;
        }

        // Standard single request (2 stops for any mode, or multi-stop for DRIVING/WALKING)
        const request: google.maps.routes.ComputeRoutesRequest = {
          origin: stops[0].location,
          destination: stops[stops.length - 1].location,
          travelMode,
          language: 'ko',
          fields: [
            'path',
            'distanceMeters',
            'durationMillis',
            'viewport',
            'legs',
            'warnings',
          ],
          internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
        };

        if (stops.length > 2) {
          request.intermediates = stops.slice(1, -1).map((stop) => ({
            location: stop.location,
          }));
        }

        const response = await RouteClass.computeRoutes(request);
        if (cancelled) return;

        const primaryRoute = response?.routes?.[0];
        if (!primaryRoute) {
          drawFallbackReferenceLine(
            '선택한 이동 수단의 상세 도로 경로가 지원되지 않는 구간입니다. 직선 동선과 참고 예상 시간으로 표시했습니다.'
          );
          return;
        }

        // Extract overall fallback path in case individual leg.path is empty
        let fullRoutePath = extractPathLiterals(primaryRoute.path);
        if (fullRoutePath.length < 2) {
          const tempPls = primaryRoute.createPolylines();
          const merged: google.maps.LatLngLiteral[] = [];
          tempPls.forEach((pl) => {
            pl.getPath()
              .getArray()
              .forEach((pt) => merged.push(toLatLngLiteral(pt)));
          });
          fullRoutePath = merged;
        }
        const slicedFallbackPaths = slicePathByWaypoints(fullRoutePath, stops);

        const apiLegs = primaryRoute.legs ?? [];
        const legCount = Math.max(1, stops.length - 1);
        const createdBundles: LegPolylineBundle[] = [];
        const legs: RouteLegSummary[] = [];
        const bounds = new google.maps.LatLngBounds();

        for (let idx = 0; idx < legCount; idx++) {
          const apiLeg = apiLegs[idx];
          const startStop = stops[idx];
          const endStop = stops[idx + 1] ?? stops[stops.length - 1];

          let legPath = extractPathLiterals(apiLeg?.path);
          if (legPath.length < 2) {
            legPath =
              slicedFallbackPaths[idx] && slicedFallbackPaths[idx].length >= 2
                ? slicedFallbackPaths[idx]
                : [startStop.location, endStop.location];
          }

          legPath.forEach((pt) => bounds.extend(pt));
          createdBundles.push(
            buildLegBundle(idx, legPath, false, travelMode, map)
          );

          const distanceMeters =
            apiLeg?.distanceMeters ??
            (legCount === 1
              ? primaryRoute.distanceMeters ??
                computeHaversineMeters(startStop.location, endStop.location)
              : computeHaversineMeters(startStop.location, endStop.location));

          const durationMillis =
            apiLeg?.durationMillis ??
            (legCount === 1 ? primaryRoute.durationMillis ?? 0 : 0);

          legs.push({
            legIndex: idx,
            startLabel: startStop.label,
            endLabel: endStop.label,
            startLocation: startStop.location,
            endLocation: endStop.location,
            distanceMeters,
            durationMillis,
            isEstimatedFallback: false,
            midpoint: computePathMidpoint(
              legPath,
              startStop.location,
              endStop.location
            ),
            path: legPath,
          });
        }

        if (primaryRoute.viewport) {
          bounds.union(primaryRoute.viewport);
        }

        bundlesRef.current = createdBundles;
        routeBoundsRef.current = bounds;
        map.fitBounds(bounds, 84);

        onRouteComputed(
          {
            distanceMeters:
              primaryRoute.distanceMeters ??
              legs.reduce((sum, l) => sum + l.distanceMeters, 0),
            durationMillis:
              primaryRoute.durationMillis ??
              legs.reduce((sum, l) => sum + l.durationMillis, 0),
            travelMode,
            legs,
            isFallbackLine: false,
            warnings: primaryRoute.warnings,
          },
          null
        );
      } catch (err) {
        if (cancelled) return;
        const isQuota = checkAndDispatchQuotaError(err);
        console.error('Route.computeRoutes failed:', err);
        if (isQuota) {
          onRouteComputed(
            null,
            'Google Maps API 할당량 제한으로 경로를 계산할 수 없습니다.'
          );
        } else {
          drawFallbackReferenceLine(
            '현재 이동 수단의 자동 경로를 계산할 수 없어 직선 동선과 참고 예상 시간으로 표시했습니다.'
          );
        }
      } finally {
        if (!cancelled) {
          onRouteLoadingChange(false);
        }
      }
    };

    void runRoute();

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [
    map,
    routesLib,
    stops,
    travelMode,
    computeTrigger,
    clearPolylines,
    buildLegBundle,
    onRouteComputed,
    onRouteLoadingChange,
  ]);

  return null;
}

interface LegMidpointOverlayProps {
  leg: RouteLegSummary;
  travelMode: TravelModeOption;
  isSelected: boolean;
  onSelect: (legIndex: number | null) => void;
}

function LegMidpointOverlay({
  leg,
  travelMode,
  isSelected,
  onSelect,
}: LegMidpointOverlayProps) {
  const modeInfo = MODE_META[travelMode];
  const ModeIcon = modeInfo.icon;

  return (
    <AdvancedMarker
      position={leg.midpoint}
      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
      zIndex={isSelected ? 65 : 48}
      title={`${leg.legIndex + 1}→${leg.legIndex + 2} 구간: ${formatDistance(leg.distanceMeters)}`}
    >
      <div
        className="flex flex-col items-center select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onSelect(isSelected ? null : leg.legIndex)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium shadow-md transition-transform duration-150 cursor-pointer whitespace-nowrap ${
            isSelected
              ? 'bg-slate-900 text-white border-slate-900 scale-105'
              : 'bg-white/95 text-slate-900 border-slate-300 hover:border-teal-600 hover:scale-105'
          }`}
        >
          <span
            className={`px-1 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums leading-none ${
              isSelected
                ? 'bg-amber-500 text-slate-950'
                : 'bg-teal-50 text-teal-800'
            }`}
          >
            {leg.legIndex + 1}→{leg.legIndex + 2}
          </span>
          <ModeIcon
            className={`w-3 h-3 shrink-0 ${
              isSelected ? 'text-amber-300' : 'text-teal-700'
            }`}
          />
          <span className="font-mono font-bold tabular-nums">
            {formatDistance(leg.distanceMeters)}
          </span>
          <span
            aria-hidden="true"
            className={isSelected ? 'text-slate-500' : 'text-slate-300'}
          >
            ·
          </span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              isSelected ? 'text-teal-300' : 'text-teal-800'
            }`}
          >
            {leg.durationMillis > 0
              ? `${leg.isEstimatedFallback ? '약 ' : ''}${formatDuration(leg.durationMillis)}`
              : '확인 필요'}
          </span>
        </button>

        {/* Expanded detail popover anchored cleanly beneath active leg badge */}
        {isSelected && (
          <div className="mt-1.5 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-semibold text-teal-800">
                구간 {leg.legIndex + 1} · {modeInfo.label}
                {leg.isEstimatedFallback ? ' (직선 참고)' : ''}
              </div>
              <button
                type="button"
                onClick={() => onSelect(null)}
                aria-label="구간 정보 닫기"
                className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="text-xs font-bold text-slate-900 mt-1 leading-snug">
              {leg.startLabel} → {leg.endLabel}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="text-slate-600">
                거리 <strong className="text-slate-900">{formatDistance(leg.distanceMeters)}</strong>
              </span>
              <span className="text-slate-600">
                소요{' '}
                <strong className="text-teal-800">
                  {leg.durationMillis > 0
                    ? `${leg.isEstimatedFallback ? '약 ' : ''}${formatDuration(leg.durationMillis)}`
                    : '-'}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </AdvancedMarker>
  );
}

interface MapCameraSyncProps {
  places: YouthPlaceItem[];
  selectedPlace: YouthPlaceItem | null;
  fitTrigger: number;
  userLocation: google.maps.LatLngLiteral | null;
  panToUserTrigger: number;
  hasActiveCourseRoute: boolean;
  onMapBoundsActionReady: (
    getBoundsFn: () => google.maps.LatLngBounds | null
  ) => void;
}

function MapCameraSync({
  places,
  selectedPlace,
  fitTrigger,
  userLocation,
  panToUserTrigger,
  hasActiveCourseRoute,
  onMapBoundsActionReady,
}: MapCameraSyncProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    onMapBoundsActionReady(() => map.getBounds() ?? null);
  }, [map, onMapBoundsActionReady]);

  // Pan smoothly to newly selected place
  useEffect(() => {
    if (!map || !selectedPlace) return;
    map.panTo(selectedPlace.location);
    const currentZoom = map.getZoom() ?? 12;
    if (currentZoom < 14) {
      map.setZoom(15);
    }
  }, [map, selectedPlace]);

  // Fit bounds to all visible places when triggered (skip auto-override if a course route is actively framed)
  useEffect(() => {
    if (!map || places.length === 0) return;
    if (hasActiveCourseRoute && fitTrigger === 0) return;
    if (places.length === 1) {
      map.panTo(places[0].location);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    places.forEach((p) => bounds.extend(p.location));
    map.fitBounds(bounds, 56);
  }, [map, places, fitTrigger, hasActiveCourseRoute]);

  // Pan to user location when explicitly requested
  useEffect(() => {
    if (!map || !userLocation || panToUserTrigger === 0) return;
    map.panTo(userLocation);
    map.setZoom(14);
  }, [map, userLocation, panToUserTrigger]);

  return null;
}

interface GeumsanMapCanvasProps {
  places: YouthPlaceItem[];
  selectedPlace: YouthPlaceItem | null;
  courseStops: CourseStop[];
  travelMode: TravelModeOption;
  routeSummary: RouteSummary | null;
  isComputingRoute: boolean;
  routeComputeTrigger: number;
  selectedLegIndex: number | null;
  userLocation: google.maps.LatLngLiteral | null;
  panToUserTrigger: number;
  isSearchingPlaces: boolean;
  onSelectPlace: (place: YouthPlaceItem) => void;
  onSelectLeg: (legIndex: number | null) => void;
  onChangeTravelMode: (mode: TravelModeOption) => void;
  onShareCourse: () => void;
  onSearchInBounds: (bounds: google.maps.LatLngBounds) => void;
  onRequestUserLocation: () => void;
  onRouteComputed: (summary: RouteSummary | null, errorMsg: string | null) => void;
  onRouteLoadingChange: (loading: boolean) => void;
}

export function GeumsanMapCanvas({
  places,
  selectedPlace,
  courseStops,
  travelMode,
  routeSummary,
  isComputingRoute,
  routeComputeTrigger,
  selectedLegIndex,
  userLocation,
  panToUserTrigger,
  isSearchingPlaces,
  onSelectPlace,
  onSelectLeg,
  onChangeTravelMode,
  onShareCourse,
  onSearchInBounds,
  onRequestUserLocation,
  onRouteComputed,
  onRouteLoadingChange,
}: GeumsanMapCanvasProps) {
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [fitTrigger, setFitTrigger] = useState(0);
  const [fitRouteTrigger, setFitRouteTrigger] = useState(0);
  const [showReSearchButton, setShowReSearchButton] = useState(false);
  const [showLegOverlays, setShowLegOverlays] = useState(true);
  const [hudExpanded, setHudExpanded] = useState(true);

  const getBoundsRef = useRef<(() => google.maps.LatLngBounds | null) | null>(
    null
  );

  const handleMapBoundsActionReady = useCallback(
    (fn: () => google.maps.LatLngBounds | null) => {
      getBoundsRef.current = fn;
    },
    []
  );

  const handleSearchCurrentArea = () => {
    const bounds = getBoundsRef.current?.();
    if (bounds) {
      setShowReSearchButton(false);
      onSearchInBounds(bounds);
    }
  };

  // Lookup course order by placeId (plain object dictionary)
  const courseOrderByPlaceId = useMemo(() => {
    const dict: Record<string, number> = {};
    courseStops.forEach((stop, idx) => {
      if (stop.placeId) {
        dict[stop.placeId] = idx + 1;
      }
    });
    return dict;
  }, [courseStops]);

  // Standalone course stops not currently in the visible places list
  const extraCourseStops = useMemo(() => {
    const placeIdsInList: Record<string, boolean> = {};
    places.forEach((p) => {
      placeIdsInList[p.id] = true;
    });
    return courseStops.filter(
      (stop) =>
        !stop.isCurrentLocation &&
        (!stop.placeId || !placeIdsInList[stop.placeId])
    );
  }, [places, courseStops]);

  const hasCourseRoute = courseStops.length >= 2;

  return (
    <div className="relative w-full h-full bg-slate-100">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={GEUMSAN_VIEWPORT_CENTER}
        defaultZoom={12}
        mapTypeId={mapTypeId}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={true}
        onDragend={() => setShowReSearchButton(true)}
        onClick={() => {
          if (selectedLegIndex !== null) {
            onSelectLeg(null);
          }
        }}
        internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
        style={{ width: '100%', height: '100%' }}
      >
        <MapCameraSync
          places={places}
          selectedPlace={selectedPlace}
          fitTrigger={fitTrigger}
          userLocation={userLocation}
          panToUserTrigger={panToUserTrigger}
          hasActiveCourseRoute={hasCourseRoute}
          onMapBoundsActionReady={handleMapBoundsActionReady}
        />

        <RouteOverlay
          stops={courseStops}
          travelMode={travelMode}
          computeTrigger={routeComputeTrigger}
          selectedLegIndex={selectedLegIndex}
          fitRouteTrigger={fitRouteTrigger}
          onSelectLeg={onSelectLeg}
          onRouteComputed={onRouteComputed}
          onRouteLoadingChange={onRouteLoadingChange}
        />

        {/* Per-leg Distance & Estimated Travel Time Visual Overlays along the Polyline */}
        {showLegOverlays &&
          !isComputingRoute &&
          routeSummary?.legs.map((leg) => (
            <LegMidpointOverlay
              key={`${leg.legIndex}-${leg.startLabel}-${leg.endLabel}`}
              leg={leg}
              travelMode={routeSummary.travelMode}
              isSelected={selectedLegIndex === leg.legIndex}
              onSelect={onSelectLeg}
            />
          ))}

        {/* Live Google Places facility markers */}
        {places.map((place, index) => (
          <FacilityMarker
            key={place.id}
            place={place}
            index={index}
            isSelected={selectedPlace?.id === place.id}
            courseOrder={
              courseOrderByPlaceId[place.id] !== undefined
                ? courseOrderByPlaceId[place.id]
                : null
            }
            onSelect={onSelectPlace}
          />
        ))}

        {/* Extra course stops not in current filter list */}
        {extraCourseStops.map((stop) => {
          const order = courseStops.findIndex((s) => s.id === stop.id) + 1;
          return (
            <AdvancedMarker
              key={stop.id}
              position={stop.location}
              title={stop.label}
              zIndex={44}
            >
              <div className="flex items-center gap-1">
                <div className="w-7 h-7 rounded-full bg-amber-600 border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-white tabular-nums">
                  {order}
                </div>
                <span className="bg-amber-950/90 text-white text-[11px] font-medium px-2 py-0.5 rounded shadow">
                  {stop.label}
                </span>
              </div>
            </AdvancedMarker>
          );
        })}

        {/* User current location marker (only when user explicitly granted consent) */}
        {userLocation && (
          <AdvancedMarker
            position={userLocation}
            title="현재 내 위치"
            zIndex={46}
          >
            <div className="flex items-center justify-center">
              <div className="w-5 h-5 rounded-full bg-blue-600 border-[3px] border-white shadow-md ring-4 ring-blue-600/20" />
            </div>
          </AdvancedMarker>
        )}
      </GoogleMap>

      {/* Floating Top-Left Course Route Summary Visual Overlay (active when 2+ stops selected) */}
      {hasCourseRoute && (
        <div className="absolute top-4 left-4 z-20 w-[260px] sm:w-[300px] bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-md overflow-hidden">
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 min-w-0">
              <RouteIcon className="w-4 h-4 text-teal-700 shrink-0" />
              <span className="text-xs font-bold text-slate-900 truncate">
                코스 경로 ({courseStops.length}개 지점)
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onShareCourse}
                title="활동 코스 공유 링크 생성"
                className="p-1.5 rounded-md text-teal-700 hover:text-teal-900 hover:bg-teal-50 transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowLegOverlays((prev) => !prev)}
                title={
                  showLegOverlays
                    ? '지도 위 구간 배지 숨기기'
                    : '지도 위 구간 배지 표시'
                }
                aria-pressed={showLegOverlays}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  showLegOverlays
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {showLegOverlays ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectLeg(null);
                  setFitRouteTrigger((c) => c + 1);
                }}
                title="전체 경로에 맞추기"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setHudExpanded((prev) => !prev)}
                aria-label={hudExpanded ? '경로 오버레이 접기' : '경로 오버레이 펼치기'}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {hudExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {hudExpanded && (
            <div className="p-3 space-y-2.5">
              {/* Compact Travel Mode Switcher */}
              <div
                role="group"
                aria-label="경로 이동 수단"
                className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-lg"
              >
                {(['TRANSIT', 'DRIVING', 'WALKING'] as TravelModeOption[]).map(
                  (mode) => {
                    const meta = MODE_META[mode];
                    const Icon = meta.icon;
                    const active = travelMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onChangeTravelMode(mode)}
                        className={`flex items-center justify-center gap-1 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        {meta.label}
                      </button>
                    );
                  }
                )}
              </div>

              {isComputingRoute ? (
                <div className="flex items-center gap-2 py-2 text-xs text-slate-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                  경로 및 구간 소요 시간 계산 중...
                </div>
              ) : routeSummary ? (
                <>
                  {/* Aggregate Distance & Time */}
                  <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <div className="text-[11px] text-slate-500">
                        {routeSummary.isFallbackLine
                          ? '직선 기준 총 거리'
                          : '총 이동 거리'}
                      </div>
                      <div className="text-base font-bold text-slate-900 font-mono tabular-nums">
                        {formatDistance(routeSummary.distanceMeters)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500">
                        {routeSummary.isFallbackLine
                          ? '참고 예상 시간'
                          : '총 예상 시간'}
                      </div>
                      <div className="text-base font-bold text-teal-800 font-mono tabular-nums">
                        {routeSummary.durationMillis > 0
                          ? `${routeSummary.isFallbackLine ? '약 ' : ''}${formatDuration(routeSummary.durationMillis)}`
                          : '지도 확인'}
                      </div>
                    </div>
                  </div>

                  {/* Clickable Per-Leg Distance & Time List */}
                  <div className="max-h-36 overflow-y-auto panel-scroll space-y-1">
                    {routeSummary.legs.map((leg) => {
                      const active = selectedLegIndex === leg.legIndex;
                      return (
                        <button
                          key={leg.legIndex}
                          type="button"
                          onClick={() =>
                            onSelectLeg(active ? null : leg.legIndex)
                          }
                          className={`w-full px-2 py-1.5 rounded-md flex items-center justify-between gap-2 text-left text-[11px] transition-colors cursor-pointer ${
                            active
                              ? 'bg-slate-900 text-white'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <span className="truncate font-medium">
                            <span className="font-mono font-bold tabular-nums mr-1.5">
                              {leg.legIndex + 1}→{leg.legIndex + 2}
                            </span>
                            {leg.startLabel} → {leg.endLabel}
                          </span>
                          <span
                            className={`font-mono tabular-nums shrink-0 font-semibold ${
                              active ? 'text-teal-300' : 'text-slate-900'
                            }`}
                          >
                            {formatDistance(leg.distanceMeters)}
                            {leg.durationMillis > 0
                              ? ` · ${leg.isEstimatedFallback ? '약 ' : ''}${formatDuration(leg.durationMillis)}`
                              : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Floating top-center re-search button after map drag */}
      {showReSearchButton && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={handleSearchCurrentArea}
            disabled={isSearchingPlaces}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-slate-900 text-xs font-semibold border border-slate-200 rounded-lg shadow-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-teal-700 ${
                isSearchingPlaces ? 'animate-spin' : ''
              }`}
            />
            이 지도 영역에서 다시 검색
          </button>
        </div>
      )}

      {/* Floating top-right map utility controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={() =>
            setMapTypeId((prev) => (prev === 'roadmap' ? 'hybrid' : 'roadmap'))
          }
          title={mapTypeId === 'roadmap' ? '위성 지도 보기' : '일반 지도 보기'}
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-800 text-xs font-medium border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Layers className="w-3.5 h-3.5 text-slate-600" />
          {mapTypeId === 'roadmap' ? '위성 지도' : '일반 지도'}
        </button>

        <button
          type="button"
          onClick={onRequestUserLocation}
          title="내 위치로 이동"
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-800 text-xs font-medium border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LocateFixed className="w-3.5 h-3.5 text-teal-700" />
          내 위치
        </button>

        {places.length > 0 && (
          <button
            type="button"
            onClick={() => setFitTrigger((c) => c + 1)}
            title="검색된 활동 공간 전체 보기"
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-800 text-xs font-medium border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            전체 보기
          </button>
        )}
      </div>

      {/* Bottom-left compact map legend (unboxed text, clean hairline surface) */}
      <div className="hidden sm:flex items-center gap-3 absolute bottom-6 left-4 z-20 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-3.5 py-2 text-[11px] text-slate-700 shadow-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
          <Compass className="w-3.5 h-3.5 text-teal-700" />
          범례
        </span>
        <span className="text-slate-300">|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]" />
          수련·문화
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8]" />
          도서관
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#B45309]" />
          체육
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
          생태·체험
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
          활동 코스
        </span>
      </div>
    </div>
  );
}
