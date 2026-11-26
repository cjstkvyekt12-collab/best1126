import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  CATEGORY_MAP,
  GEUMSAN_COUNTY_BOUNDS,
  GEUMSAN_TOWNS,
  GMP_ATTRIBUTION_ID,
  checkAndDispatchQuotaError,
  inferCategoryFromPlace,
} from '../constants/geumsan';
import type {
  ActivityCategoryId,
  GeumsanTownId,
  YouthPlaceItem,
} from '../types/youthMap';

function extractLatLng(
  loc: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined
): google.maps.LatLngLiteral | null {
  if (!loc) return null;
  if (typeof (loc as google.maps.LatLng).lat === 'function') {
    const ll = loc as google.maps.LatLng;
    return { lat: ll.lat(), lng: ll.lng() };
  }
  const literal = loc as google.maps.LatLngLiteral;
  if (typeof literal.lat === 'number' && typeof literal.lng === 'number') {
    return { lat: literal.lat, lng: literal.lng };
  }
  return null;
}

function getPhotoUriSafe(
  place: google.maps.places.Place,
  maxWidth = 800,
  maxHeight = 500
): string | null {
  try {
    const firstPhoto = place.photos?.[0];
    if (!firstPhoto) return null;
    return firstPhoto.getURI({ maxWidth, maxHeight });
  } catch {
    return null;
  }
}

export function normalizePlaceToItem(
  place: google.maps.places.Place,
  fallbackCategory: ActivityCategoryId,
  detailsLoaded = false,
  isOpenNow?: boolean | null
): YouthPlaceItem | null {
  const location = extractLatLng(place.location);
  if (!place.id || !location) return null;

  const displayName = place.displayName || '이름 미표시 장소';
  const categoryId = inferCategoryFromPlace(
    displayName,
    place.types ?? [],
    fallbackCategory
  );

  return {
    id: place.id,
    displayName,
    formattedAddress: place.formattedAddress || '충청남도 금산군',
    location,
    categoryId,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    businessStatus: place.businessStatus ?? null,
    types: place.types ?? [],
    photoUrl: getPhotoUriSafe(place),
    weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions ?? [],
    nationalPhoneNumber: place.nationalPhoneNumber ?? null,
    websiteURI: place.websiteURI ?? null,
    googleMapsURI: place.googleMapsURI ?? null,
    editorialSummary: place.editorialSummary ?? null,
    isOpenNow: isOpenNow ?? null,
    detailsLoaded,
  };
}

interface UseGeumsanPlacesOptions {
  category: ActivityCategoryId;
  town: GeumsanTownId;
  openNowOnly: boolean;
}

export function useGeumsanPlaces({
  category,
  town,
  openNowOnly,
}: UseGeumsanPlacesOptions) {
  const placesLib = useMapsLibrary('places');

  const [places, setPlaces] = useState<YouthPlaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQueryLabel, setLastQueryLabel] = useState<string>('');
  const requestSeqRef = useRef(0);

  const executeTextSearch = useCallback(
    async (
      textQuery: string,
      targetCategory: ActivityCategoryId,
      options?: {
        locationBounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;
        openNow?: boolean;
        label?: string;
      }
    ): Promise<YouthPlaceItem[]> => {
      if (!placesLib) return [];

      const seq = ++requestSeqRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const request: google.maps.places.SearchByTextRequest & {
          internalUsageAttributionIds?: string[];
        } = {
          textQuery,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'businessStatus',
            'types',
            'photos',
            'regularOpeningHours',
          ],
          locationBias: options?.locationBounds ?? GEUMSAN_COUNTY_BOUNDS,
          language: 'ko',
          region: 'kr',
          maxResultCount: 16,
          internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
        };

        if (options?.openNow) {
          request.isOpenNow = true;
        }

        const response = await placesLib.Place.searchByText(request);
        if (seq !== requestSeqRef.current) return [];

        const rawPlaces = response?.places ?? [];
        const deduped: Record<string, YouthPlaceItem> = {};

        for (const p of rawPlaces) {
          const item = normalizePlaceToItem(p, targetCategory, false);
          if (item && !deduped[item.id]) {
            deduped[item.id] = item;
          }
        }

        const normalized = Object.values(deduped);
        setPlaces(normalized);
        if (options?.label) {
          setLastQueryLabel(options.label);
        }
        return normalized;
      } catch (err) {
        if (seq !== requestSeqRef.current) return [];
        const isQuota = checkAndDispatchQuotaError(err);
        console.error('Places searchByText failed:', err);
        setError(
          isQuota
            ? 'Google Maps API 할당량 제한으로 공간 정보를 불러오지 못했습니다.'
            : '공간 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return [];
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [placesLib]
  );

  // Trigger live Places search whenever category, town, or openNow filter changes
  useEffect(() => {
    if (!placesLib) return;

    const categoryCfg = CATEGORY_MAP[category];
    const townCfg = GEUMSAN_TOWNS.find((t) => t.id === town) ?? GEUMSAN_TOWNS[0];
    const textQuery = `${townCfg.queryPrefix} ${categoryCfg.query}`;

    void executeTextSearch(textQuery, category, {
      locationBounds: GEUMSAN_COUNTY_BOUNDS,
      openNow: openNowOnly,
      label: `${townCfg.label} · ${categoryCfg.label}`,
    });
  }, [placesLib, category, town, openNowOnly, executeTextSearch]);

  const searchInBounds = useCallback(
    async (bounds: google.maps.LatLngBounds) => {
      const categoryCfg = CATEGORY_MAP[category];
      const textQuery = `충청남도 금산군 ${categoryCfg.query}`;
      return executeTextSearch(textQuery, category, {
        locationBounds: bounds,
        openNow: openNowOnly,
        label: `현재 지도 영역 · ${categoryCfg.label}`,
      });
    },
    [category, openNowOnly, executeTextSearch]
  );

  const searchCustomKeyword = useCallback(
    async (keyword: string) => {
      const cleaned = keyword.trim();
      if (!cleaned) return [];
      const textQuery = cleaned.includes('금산')
        ? cleaned
        : `충청남도 금산군 ${cleaned}`;
      return executeTextSearch(textQuery, 'all', {
        locationBounds: GEUMSAN_COUNTY_BOUNDS,
        openNow: openNowOnly,
        label: `"${cleaned}" 검색 결과`,
      });
    },
    [openNowOnly, executeTextSearch]
  );

  const fetchPlaceDetails = useCallback(
    async (
      placeId: string,
      fallbackCategory: ActivityCategoryId = 'all'
    ): Promise<YouthPlaceItem | null> => {
      if (!placesLib || !placeId) return null;

      try {
        const place = new placesLib.Place({
          id: placeId,
          requestedLanguage: 'ko',
          requestedRegion: 'kr',
        });

        await place.fetchFields({
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'businessStatus',
            'types',
            'regularOpeningHours',
            'nationalPhoneNumber',
            'websiteURI',
            'googleMapsURI',
            'editorialSummary',
            'photos',
          ],
        });

        let openState: boolean | null = null;
        try {
          if (typeof place.isOpen === 'function') {
            const openResult = await place.isOpen();
            if (typeof openResult === 'boolean') {
              openState = openResult;
            }
          }
        } catch {
          openState = null;
        }

        const detailed = normalizePlaceToItem(
          place,
          fallbackCategory,
          true,
          openState
        );

        if (detailed) {
          setPlaces((prev) => {
            const exists = prev.some((item) => item.id === detailed.id);
            if (!exists) return prev;
            return prev.map((item) =>
              item.id === detailed.id
                ? { ...detailed, categoryId: item.categoryId }
                : item
            );
          });
        }
        return detailed;
      } catch (err) {
        checkAndDispatchQuotaError(err);
        console.error('fetchPlaceDetails failed:', err);
        return null;
      }
    },
    [placesLib]
  );

  const addOrSelectExternalPlace = useCallback((item: YouthPlaceItem) => {
    setPlaces((prev) => {
      const exists = prev.some((p) => p.id === item.id);
      if (exists) {
        return prev.map((p) => (p.id === item.id ? item : p));
      }
      return [item, ...prev];
    });
  }, []);

  return {
    places,
    isLoading,
    error,
    lastQueryLabel,
    searchInBounds,
    searchCustomKeyword,
    fetchPlaceDetails,
    addOrSelectExternalPlace,
  };
}
