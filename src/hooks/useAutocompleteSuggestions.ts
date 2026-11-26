import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  GEUMSAN_COUNTY_BOUNDS,
  checkAndDispatchQuotaError,
} from '../constants/geumsan';

export interface UseAutocompleteSuggestionsResult {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isLoading: boolean;
  resetSession: () => void;
}

/**
 * Modern Places API (New) programmatic autocomplete hook.
 * Uses AutocompleteSuggestion.fetchAutocompleteSuggestions with proper
 * AutocompleteSessionToken lifecycle management.
 */
export function useAutocompleteSuggestions(
  inputString: string
): UseAutocompleteSuggestionsResult {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  useEffect(() => {
    const trimmed = inputString.trim();
    if (!placesLib || trimmed.length < 1) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken();
      }

      setIsLoading(true);
      try {
        const request: google.maps.places.AutocompleteRequest = {
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          language: 'ko',
          region: 'kr',
          includedRegionCodes: ['kr'],
          locationBias: GEUMSAN_COUNTY_BOUNDS,
        };

        const response =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (!cancelled) {
          setSuggestions(response?.suggestions ?? []);
        }
      } catch (err) {
        checkAndDispatchQuotaError(err);
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, inputString]);

  return { suggestions, isLoading, resetSession };
}
