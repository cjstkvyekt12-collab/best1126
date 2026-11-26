import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { AlertTriangle, List, Map as MapIcon } from 'lucide-react';
import { Header } from './components/Header';
import { ExploreSidebar } from './components/ExploreSidebar';
import { PlaceDetailSheet } from './components/PlaceDetailSheet';
import { GeumsanMapCanvas } from './components/GeumsanMapCanvas';
import { CoursePlannerPanel } from './components/CoursePlannerPanel';
import { SavedPlannerView } from './components/SavedPlannerView';
import { GuideModalView } from './components/GuideModalView';
import { LocationConsentModal } from './components/LocationConsentModal';
import { CourseShareModal } from './components/CourseShareModal';
import { RecommendationMatcherView } from './components/RecommendationMatcherView';
import { AIStudioView } from './components/AIStudioView';
import { GeumsanQuestGame } from './components/GeumsanQuestGame';
import { useGeumsanPlaces } from './hooks/useGeumsanPlaces';
import { resolveSharedCourseFromUrl } from './utils/courseShare';
import { DEFAULT_ACTIVITY_CHECKLIST } from './constants/geumsan';
import type {
  ActiveView,
  ActivityCategoryId,
  CourseStop,
  GeumsanTownId,
  RouteSummary,
  SavedPlaceRecord,
  TravelModeOption,
  YouthPlaceItem,
} from './types/youthMap';

const SAVED_STORAGE_KEY = 'geumsan-youth-map-saved-v1';
const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';

function loadSavedRecords(): SavedPlaceRecord[] {
  try {
    const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedPlaceRecord =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.placeId === 'string'
    );
  } catch {
    return [];
  }
}

function YouthMapWorkspace() {
  const apiStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');

  const [activeView, setActiveView] = useState<ActiveView>('map');
  const [mobileMapMode, setMobileMapMode] = useState<'list' | 'map'>('list');

  // Filter state
  const [category, setCategory] = useState<ActivityCategoryId>('all');
  const [town, setTown] = useState<GeumsanTownId>('all');
  const [openNowOnly, setOpenNowOnly] = useState(false);

  // Selected place & detail loading
  const [selectedPlace, setSelectedPlace] = useState<YouthPlaceItem | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Live Geumsan Places hook
  const {
    places,
    isLoading: isSearchingPlaces,
    error: placesError,
    lastQueryLabel,
    searchInBounds,
    searchCustomKeyword,
    fetchPlaceDetails,
    addOrSelectExternalPlace,
  } = useGeumsanPlaces({ category, town, openNowOnly });

  // Runtime cache of hydrated places (for Saved Planner view)
  const [hydratedPlaces, setHydratedPlaces] = useState<
    Record<string, YouthPlaceItem>
  >({});

  // Sync discovered places into runtime lookup dictionary
  useEffect(() => {
    if (places.length === 0) return;
    setHydratedPlaces((prev) => {
      const next = { ...prev };
      places.forEach((p) => {
        if (!next[p.id] || p.detailsLoaded) {
          next[p.id] = p;
        }
      });
      return next;
    });
  }, [places]);

  // Saved records (only placeId + user notes/checklist persisted in localStorage)
  const [savedRecords, setSavedRecords] = useState<SavedPlaceRecord[]>(() =>
    loadSavedRecords()
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SAVED_STORAGE_KEY,
        JSON.stringify(savedRecords)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [savedRecords]);

  // Activity Course & Routing state
  const [courseStops, setCourseStops] = useState<CourseStop[]>([]);
  const [travelMode, setTravelMode] = useState<TravelModeOption>('TRANSIT');
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isComputingRoute, setIsComputingRoute] = useState(false);
  const [routeComputeTrigger, setRouteComputeTrigger] = useState(0);
  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const sharedUrlHydratedRef = useRef(false);

  useEffect(() => {
    setSelectedLegIndex(null);
  }, [courseStops, travelMode]);

  // Explicit Geolocation Consent state
  const [userLocation, setUserLocation] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [locationConsentOpen, setLocationConsentOpen] = useState(false);
  const [pendingLocationAction, setPendingLocationAction] = useState<
    'center' | 'origin' | null
  >(null);
  const [panToUserTrigger, setPanToUserTrigger] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2800);
  }, []);

  // Hydrate shared course from URL query (?c=<code> or ?course=<encoded>) once Places API is ready
  useEffect(() => {
    if (!placesLib || sharedUrlHydratedRef.current) return;
    const search = window.location.search;
    if (!search.includes('c=') && !search.includes('course=')) return;

    sharedUrlHydratedRef.current = true;
    let cancelled = false;

    const loadShared = async () => {
      const shared = await resolveSharedCourseFromUrl(search);
      if (cancelled) return;
      if (!shared || shared.stops.length === 0) {
        showToast('공유된 활동 코스 링크를 찾을 수 없거나 만료되었습니다.');
        return;
      }

      const hydratedStops: CourseStop[] = [];
      for (let i = 0; i < shared.stops.length; i++) {
        const raw = shared.stops[i];
        if (raw.placeId) {
          const place = await fetchPlaceDetails(raw.placeId, 'youth_culture');
          if (cancelled) return;
          if (place) {
            setHydratedPlaces((prev) => ({ ...prev, [place.id]: place }));
            hydratedStops.push({
              id: `stop-${place.id}`,
              placeId: place.id,
              label: place.displayName,
              address: place.formattedAddress,
              location: place.location,
              categoryId: place.categoryId,
            });
          }
        } else if (
          typeof raw.lat === 'number' &&
          typeof raw.lng === 'number'
        ) {
          hydratedStops.push({
            id: raw.isCurrentLocation
              ? 'stop-shared-origin'
              : `stop-shared-${i}`,
            label: raw.label || '출발 지점',
            location: { lat: raw.lat, lng: raw.lng },
            isCurrentLocation: Boolean(raw.isCurrentLocation),
          });
        }
      }

      if (cancelled) return;
      if (hydratedStops.length > 0) {
        setTravelMode(shared.travelMode);
        setCourseStops(hydratedStops);
        setActiveView('course');
        showToast(
          `공유된 활동 코스(${hydratedStops.length}개 지점)를 불러왔습니다.`
        );
      } else {
        showToast('공유된 코스의 장소 정보를 불러오지 못했습니다.');
      }
    };

    void loadShared();

    return () => {
      cancelled = true;
    };
  }, [placesLib, fetchPlaceDetails, showToast]);

  // Select place & fetch rich details on demand
  const handleSelectPlace = useCallback(
    async (place: YouthPlaceItem) => {
      setSelectedPlace(place);
      setActiveView('map');
      if (place.detailsLoaded) return;

      setIsLoadingDetails(true);
      const detailed = await fetchPlaceDetails(place.id, place.categoryId);
      setIsLoadingDetails(false);

      if (detailed) {
        const merged = { ...detailed, categoryId: place.categoryId };
        setSelectedPlace((curr) => (curr?.id === merged.id ? merged : curr));
        setHydratedPlaces((prev) => ({ ...prev, [merged.id]: merged }));
      }
    },
    [fetchPlaceDetails]
  );

  const handleAutocompletePlace = useCallback(
    (place: YouthPlaceItem) => {
      addOrSelectExternalPlace(place);
      setHydratedPlaces((prev) => ({ ...prev, [place.id]: place }));
      setSelectedPlace(place);
      setActiveView('map');
    },
    [addOrSelectExternalPlace]
  );

  const handleToggleSave = useCallback(
    (place: YouthPlaceItem) => {
      setSavedRecords((prev) => {
        const exists = prev.some((r) => r.placeId === place.id);
        if (exists) {
          showToast(`'${place.displayName}'을(를) 보관함에서 제거했습니다.`);
          return prev.filter((r) => r.placeId !== place.id);
        }
        showToast(`'${place.displayName}'을(를) 내 보관함에 저장했습니다.`);
        return [
          {
            placeId: place.id,
            categoryId: place.categoryId,
            memo: '',
            plannedDate: '',
            checklist: DEFAULT_ACTIVITY_CHECKLIST.map((item, idx) => ({
              id: `chk-${Date.now()}-${idx}`,
              ...item,
            })),
            savedAt: new Date().toISOString(),
          },
          ...prev,
        ];
      });
      setHydratedPlaces((prev) => ({ ...prev, [place.id]: place }));
    },
    [showToast]
  );

  const handleUpdateSavedRecord = useCallback(
    (
      placeId: string,
      patch: Partial<Pick<SavedPlaceRecord, 'memo' | 'plannedDate' | 'checklist'>>
    ) => {
      setSavedRecords((prev) =>
        prev.map((rec) =>
          rec.placeId === placeId ? { ...rec, ...patch } : rec
        )
      );
    },
    []
  );

  const handleRemoveSaved = useCallback((placeId: string) => {
    setSavedRecords((prev) => prev.filter((rec) => rec.placeId !== placeId));
  }, []);

  const handleHydratePlace = useCallback(
    async (placeId: string, fallbackCat: ActivityCategoryId) => {
      const detailed = await fetchPlaceDetails(placeId, fallbackCat);
      if (detailed) {
        setHydratedPlaces((prev) => ({ ...prev, [detailed.id]: detailed }));
      }
      return detailed;
    },
    [fetchPlaceDetails]
  );

  const handleAddToCourse = useCallback(
    (place: YouthPlaceItem) => {
      setCourseStops((prev) => {
        if (prev.some((s) => s.placeId === place.id)) {
          showToast('이미 활동 코스에 포함되어 있는 장소입니다.');
          return prev;
        }
        if (prev.length >= 6) {
          showToast('활동 코스는 최대 6개 지점까지 추가할 수 있습니다.');
          return prev;
        }
        showToast(`'${place.displayName}'을(를) 활동 코스에 추가했습니다.`);
        return [
          ...prev,
          {
            id: `stop-${place.id}`,
            placeId: place.id,
            label: place.displayName,
            address: place.formattedAddress,
            location: place.location,
            categoryId: place.categoryId,
          },
        ];
      });
    },
    [showToast]
  );

  const handleQuickDirections = useCallback(
    (place: YouthPlaceItem) => {
      setCourseStops((prev) => {
        const destStop: CourseStop = {
          id: `stop-${place.id}`,
          placeId: place.id,
          label: place.displayName,
          address: place.formattedAddress,
          location: place.location,
          categoryId: place.categoryId,
        };

        if (userLocation) {
          const originStop: CourseStop = {
            id: 'stop-current-location',
            label: '현재 내 위치',
            location: userLocation,
            isCurrentLocation: true,
          };
          return [originStop, destStop];
        }

        const filtered = prev.filter((s) => s.placeId !== place.id);
        return [...filtered, destStop].slice(0, 6);
      });

      setActiveView('course');
      setMobileMapMode('list');
    },
    [userLocation]
  );

  const applyCurrentLocationAsOrigin = useCallback(
    (coords: google.maps.LatLngLiteral) => {
      setCourseStops((prev) => {
        const withoutOld = prev.filter((s) => !s.isCurrentLocation);
        return [
          {
            id: 'stop-current-location',
            label: '현재 내 위치',
            location: coords,
            isCurrentLocation: true,
          },
          ...withoutOld,
        ].slice(0, 6);
      });
      showToast('현재 내 위치를 코스 출발지로 설정했습니다.');
    },
    [showToast]
  );

  const requestUserLocationFlow = useCallback(
    (action: 'center' | 'origin') => {
      if (userLocation) {
        if (action === 'origin') {
          applyCurrentLocationAsOrigin(userLocation);
        } else {
          setPanToUserTrigger((c) => c + 1);
        }
        return;
      }
      setPendingLocationAction(action);
      setLocationConsentOpen(true);
    },
    [userLocation, applyCurrentLocationAsOrigin]
  );

  const handleConfirmLocationConsent = useCallback(() => {
    setLocationConsentOpen(false);
    if (!navigator.geolocation) {
      showToast('이 브라우저에서는 위치 정보 기능을 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: google.maps.LatLngLiteral = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(coords);
        if (pendingLocationAction === 'origin') {
          applyCurrentLocationAsOrigin(coords);
        } else {
          setPanToUserTrigger((c) => c + 1);
          showToast('현재 위치로 지도를 이동했습니다.');
        }
        setPendingLocationAction(null);
      },
      () => {
        showToast(
          '위치 권한이 거부되었거나 확인할 수 없습니다. 검색창에서 출발지를 직접 입력해 주세요.'
        );
        setPendingLocationAction(null);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [pendingLocationAction, applyCurrentLocationAsOrigin, showToast]);

  const handleMoveStop = useCallback(
    (index: number, direction: 'up' | 'down') => {
      setCourseStops((prev) => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;
        const copy = [...prev];
        const temp = copy[index];
        copy[index] = copy[targetIndex];
        copy[targetIndex] = temp;
        return copy;
      });
    },
    []
  );

  const handleRemoveStop = useCallback((id: string) => {
    setCourseStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleClearStops = useCallback(() => {
    setCourseStops([]);
    setRouteSummary(null);
    setRouteError(null);
  }, []);

  const handleRouteComputed = useCallback(
    (summary: RouteSummary | null, err: string | null) => {
      setRouteSummary(summary);
      setRouteError(err);
    },
    []
  );

  const savedPlaceIds = useMemo(() => {
    const dict: Record<string, boolean> = {};
    savedRecords.forEach((r) => {
      dict[r.placeId] = true;
    });
    return dict;
  }, [savedRecords]);

  const coursePlaceIds = useMemo(() => {
    const dict: Record<string, boolean> = {};
    courseStops.forEach((s) => {
      if (s.placeId) dict[s.placeId] = true;
    });
    return dict;
  }, [courseStops]);

  const isSplitMapView = activeView === 'map' || activeView === 'course';

  // Full-viewport Game Shell with zero website navbar/footer chrome
  if (activeView === 'game') {
    return <GeumsanQuestGame onExitGame={() => setActiveView('map')} />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Header
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          if (v === 'map' || v === 'course') {
            setMobileMapMode('list');
          }
        }}
        courseStopCount={courseStops.length}
        savedCount={savedRecords.length}
      />

      {/* Mobile compact navigation strip (strictly compact height) */}
      <nav
        aria-label="모바일 메뉴"
        className="flex md:hidden items-center justify-between border-b border-slate-200 bg-white px-2 h-10 shrink-0"
      >
        {(
          [
            { id: 'map', label: '지도' },
            { id: 'recommend', label: '맞춤추천' },
            { id: 'studio', label: 'AI' },
            { id: 'game', label: '게임' },
            { id: 'saved', label: '보관함' },
          ] as { id: ActiveView; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveView(item.id)}
            className={`flex-1 py-2 text-xs font-medium text-center whitespace-nowrap cursor-pointer ${
              activeView === item.id
                ? 'text-teal-800 font-semibold border-b-2 border-teal-700'
                : 'text-slate-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Maps API Auth/Load Error State */}
      {(apiStatus === APILoadingStatus.FAILED ||
        apiStatus === APILoadingStatus.AUTH_FAILURE) && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-900 flex items-center justify-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>
            Google Maps API 연결에 실패했습니다. 잠시 후 새로고침하거나 Maps
            설정을 확인해 주세요.
          </span>
        </div>
      )}

      {/* Main Content Area */}
      {isSplitMapView ? (
        <div className="flex-1 min-h-0 flex relative overflow-hidden">
          {/* Left Workspace Panel (Explore / Detail / Course Planner) */}
          <section
            className={`w-full md:w-[400px] lg:w-[430px] shrink-0 border-r border-slate-200 bg-white h-full overflow-hidden ${
              mobileMapMode === 'map' ? 'hidden md:block' : 'block'
            }`}
          >
            {activeView === 'course' ? (
              <CoursePlannerPanel
                stops={courseStops}
                travelMode={travelMode}
                routeSummary={routeSummary}
                routeError={routeError}
                isComputingRoute={isComputingRoute}
                hasUserLocation={Boolean(userLocation)}
                selectedLegIndex={selectedLegIndex}
                onSelectLeg={(legIdx) => {
                  setSelectedLegIndex(legIdx);
                  if (legIdx !== null) {
                    setMobileMapMode('map');
                  }
                }}
                onChangeTravelMode={setTravelMode}
                onAddPlaceStop={handleAddToCourse}
                onUseCurrentLocationAsOrigin={() =>
                  requestUserLocationFlow('origin')
                }
                onMoveStop={handleMoveStop}
                onRemoveStop={handleRemoveStop}
                onClearStops={handleClearStops}
                onRecomputeRoute={() => setRouteComputeTrigger((c) => c + 1)}
                onShareCourse={() => setShareModalOpen(true)}
              />
            ) : selectedPlace ? (
              <PlaceDetailSheet
                place={selectedPlace}
                isLoadingDetails={isLoadingDetails}
                isSaved={Boolean(savedPlaceIds[selectedPlace.id])}
                isInCourse={Boolean(coursePlaceIds[selectedPlace.id])}
                onClose={() => setSelectedPlace(null)}
                onToggleSave={handleToggleSave}
                onAddToCourse={handleAddToCourse}
                onQuickDirections={handleQuickDirections}
              />
            ) : (
              <ExploreSidebar
                places={places}
                isLoading={isSearchingPlaces}
                error={placesError}
                lastQueryLabel={lastQueryLabel}
                category={category}
                town={town}
                openNowOnly={openNowOnly}
                selectedPlaceId={null}
                savedPlaceIds={savedPlaceIds}
                coursePlaceIds={coursePlaceIds}
                onSelectCategory={(cat) => {
                  setCategory(cat);
                  setSelectedPlace(null);
                }}
                onSelectTown={(t) => {
                  setTown(t);
                  setSelectedPlace(null);
                }}
                onToggleOpenNow={() => setOpenNowOnly((prev) => !prev)}
                onSelectPlace={(p) => void handleSelectPlace(p)}
                onAutocompletePlace={handleAutocompletePlace}
                onSearchKeyword={(kw) => {
                  setSelectedPlace(null);
                  void searchCustomKeyword(kw);
                }}
                onToggleSave={handleToggleSave}
                onAddToCourse={handleAddToCourse}
                onResetFilters={() => {
                  setCategory('all');
                  setTown('all');
                  setOpenNowOnly(false);
                  setSelectedPlace(null);
                }}
                onOpenGuide={() => setActiveView('guide')}
              />
            )}
          </section>

          {/* Right Full-Height Interactive Map Canvas */}
          <main
            className={`flex-1 min-w-0 h-full relative ${
              mobileMapMode === 'list' ? 'hidden md:block' : 'block'
            }`}
          >
            <GeumsanMapCanvas
              places={places}
              selectedPlace={selectedPlace}
              courseStops={courseStops}
              travelMode={travelMode}
              routeSummary={routeSummary}
              isComputingRoute={isComputingRoute}
              routeComputeTrigger={routeComputeTrigger}
              selectedLegIndex={selectedLegIndex}
              userLocation={userLocation}
              panToUserTrigger={panToUserTrigger}
              isSearchingPlaces={isSearchingPlaces}
              onSelectPlace={(p) => void handleSelectPlace(p)}
              onSelectLeg={setSelectedLegIndex}
              onChangeTravelMode={setTravelMode}
              onShareCourse={() => setShareModalOpen(true)}
              onSearchInBounds={(b) => void searchInBounds(b)}
              onRequestUserLocation={() => requestUserLocationFlow('center')}
              onRouteComputed={handleRouteComputed}
              onRouteLoadingChange={setIsComputingRoute}
            />
          </main>

          {/* Mobile View Switcher (Map <-> List) */}
          <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
            <button
              type="button"
              onClick={() =>
                setMobileMapMode((prev) => (prev === 'list' ? 'map' : 'list'))
              }
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-full shadow-lg cursor-pointer whitespace-nowrap"
            >
              {mobileMapMode === 'list' ? (
                <>
                  <MapIcon className="w-3.5 h-3.5" />
                  지도 보기
                </>
              ) : (
                <>
                  <List className="w-3.5 h-3.5" />
                  {activeView === 'course' ? '코스 패널 보기' : '목록 보기'}
                </>
              )}
            </button>
          </div>
        </div>
      ) : activeView === 'recommend' ? (
        <RecommendationMatcherView
          places={places}
          isSearchingPlaces={isSearchingPlaces}
          userLocation={userLocation}
          savedPlaceIds={savedPlaceIds}
          coursePlaceIds={coursePlaceIds}
          onOpenOnMap={(place) => {
            addOrSelectExternalPlace(place);
            setSelectedPlace(place);
            setActiveView('map');
          }}
          onAddToCourse={(place) => {
            handleAddToCourse(place);
            setActiveView('course');
          }}
          onToggleSave={handleToggleSave}
        />
      ) : activeView === 'studio' ? (
        <AIStudioView userLocation={userLocation} />
      ) : activeView === 'saved' ? (
        <SavedPlannerView
          savedRecords={savedRecords}
          hydratedPlaces={hydratedPlaces}
          onHydratePlace={handleHydratePlace}
          onUpdateRecord={handleUpdateSavedRecord}
          onRemoveSaved={handleRemoveSaved}
          onOpenOnMap={(place) => {
            addOrSelectExternalPlace(place);
            setSelectedPlace(place);
            setActiveView('map');
          }}
          onAddToCourse={(place) => {
            handleAddToCourse(place);
            setActiveView('course');
          }}
          onGoToMap={() => setActiveView('map')}
        />
      ) : (
        <GuideModalView
          onStartExploring={() => setActiveView('map')}
          onStartCoursePlanner={() => setActiveView('course')}
        />
      )}

      {/* Explicit Location Consent Modal */}
      <LocationConsentModal
        isOpen={locationConsentOpen}
        onConfirm={handleConfirmLocationConsent}
        onCancel={() => {
          setLocationConsentOpen(false);
          setPendingLocationAction(null);
        }}
      />

      {/* Course Short-URL Share Modal */}
      <CourseShareModal
        isOpen={shareModalOpen}
        stops={courseStops}
        travelMode={travelMode}
        routeSummary={routeSummary}
        onClose={() => setShareModalOpen(false)}
        onNotify={showToast}
      />

      {/* Subtle Action Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-40 bg-slate-900 text-white text-xs md:text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-sm"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => {
      setQuotaExceeded(true);
    };
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50">
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm shrink-0">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {!MAPS_API_KEY ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <AlertTriangle className="w-9 h-9 text-amber-600" />
          <h1 className="text-lg font-bold text-slate-900">
            Google Maps API 키가 설정되지 않았습니다
          </h1>
          <p className="text-sm text-slate-600 max-w-md leading-relaxed">
            금산 청소년 활동 원스톱 지도를 실행하려면 Google Maps 설정에서 API
            키를 활성화해 주세요.
          </p>
        </div>
      ) : (
        <APIProvider
          apiKey={MAPS_API_KEY}
          language="ko"
          region="KR"
          libraries={['places', 'routes', 'marker']}
        >
          <YouthMapWorkspace />
        </APIProvider>
      )}
    </div>
  );
}
