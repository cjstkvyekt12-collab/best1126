import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useAutocompleteSuggestions } from '../hooks/useAutocompleteSuggestions';
import { normalizePlaceToItem } from '../hooks/useGeumsanPlaces';
import { checkAndDispatchQuotaError } from '../constants/geumsan';
import type { YouthPlaceItem } from '../types/youthMap';

interface AutocompleteSearchProps {
  placeholder?: string;
  onSelectPlace: (place: YouthPlaceItem) => void;
  onSubmitKeyword?: (keyword: string) => void;
  compact?: boolean;
}

export function AutocompleteSearch({
  placeholder = '금산군 시설, 도서관, 학교, 공원 검색',
  onSelectPlace,
  onSubmitKeyword,
  compact = false,
}: AutocompleteSearchProps) {
  const placesLib = useMapsLibrary('places');
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { suggestions, isLoading, resetSession } =
    useAutocompleteSuggestions(inputValue);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSuggestionSelect = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      setIsResolving(true);
      setIsOpen(false);

      try {
        const place = suggestion.placePrediction.toPlace();
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
            if (typeof openResult === 'boolean') openState = openResult;
          }
        } catch {
          openState = null;
        }

        const item = normalizePlaceToItem(place, 'all', true, openState);
        resetSession();
        if (item) {
          setInputValue(item.displayName);
          onSelectPlace(item);
        }
      } catch (err) {
        checkAndDispatchQuotaError(err);
        console.error('Autocomplete place fetchFields failed:', err);
      } finally {
        setIsResolving(false);
      }
    },
    [placesLib, onSelectPlace, resetSession]
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setIsOpen(false);
    if (onSubmitKeyword) {
      onSubmitKeyword(trimmed);
    } else if (suggestions.length > 0) {
      void handleSuggestionSelect(suggestions[0]);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <Search
          aria-hidden="true"
          className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
        />
        <input
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          aria-label="금산 청소년 활동 공간 검색"
          className={`w-full bg-white border border-slate-200 rounded-lg pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 transition-colors ${
            compact ? 'py-2' : 'py-2.5'
          }`}
        />

        {(isLoading || isResolving) && (
          <Loader2
            aria-label="검색 중"
            className="w-4 h-4 text-teal-700 animate-spin absolute right-3"
          />
        )}

        {!isLoading && !isResolving && inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              resetSession();
              setIsOpen(false);
            }}
            aria-label="검색어 지우기"
            className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-40 max-h-72 overflow-y-auto panel-scroll"
        >
          {suggestions.map((suggestion, idx) => {
            const pred = suggestion.placePrediction;
            if (!pred) return null;
            const mainText = pred.mainText?.text || pred.text.text;
            const secondaryText = pred.secondaryText?.text || '';

            return (
              <li key={pred.placeId || idx}>
                <button
                  type="button"
                  onClick={() => void handleSuggestionSelect(suggestion)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition-colors flex items-start gap-2.5 border-b border-slate-100 last:border-b-0 cursor-pointer"
                >
                  <MapPin
                    aria-hidden="true"
                    className="w-4 h-4 text-teal-700 shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {mainText}
                    </div>
                    {secondaryText && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {secondaryText}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
