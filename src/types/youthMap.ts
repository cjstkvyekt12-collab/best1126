export type ActivityCategoryId =
  | 'all'
  | 'youth_culture'
  | 'library_study'
  | 'sports'
  | 'eco_experience'
  | 'school_career';

export type GeumsanTownId =
  | 'all'
  | 'geumsaneup'
  | 'chubu'
  | 'jinsan'
  | 'boksu'
  | 'jewon'
  | 'buri';

export type ActiveView =
  | 'map'
  | 'recommend'
  | 'studio'
  | 'game'
  | 'saved'
  | 'course'
  | 'guide';

export type InterestDomainId =
  | 'art_culture'
  | 'sports_health'
  | 'volunteer_civic'
  | 'study_reading'
  | 'eco_science'
  | 'career_digital';

export type TimeSlotPreference = 'after_school' | 'weekend' | 'vacation';
export type GroupStylePreference = 'solo' | 'club' | 'family';

export interface YouthMatchingProfile {
  age: number;
  interests: InterestDomainId[];
  town: GeumsanTownId;
  timeSlot: TimeSlotPreference;
  groupStyle: GroupStylePreference;
}

export interface ScoreBreakdown {
  interestScore: number; // 0-100 (weight 0.40)
  ageScore: number; // 0-100 (weight 0.25)
  distanceScore: number; // 0-100 (weight 0.15)
  availabilityScore: number; // 0-100 (weight 0.10)
  qualityScore: number; // 0-100 (weight 0.10)
}

export interface ProgramTemplate {
  id: string;
  title: string;
  interest: InterestDomainId;
  targetCategory: ActivityCategoryId;
  minAge: number;
  maxAge: number;
  idealTimeSlots: TimeSlotPreference[];
  idealGroupStyles: GroupStylePreference[];
  summary: string;
  suggestedActivities: string[];
}

export interface MatchedRecommendation {
  place: YouthPlaceItem;
  totalScore: number;
  breakdown: ScoreBreakdown;
  matchedPrograms: ProgramTemplate[];
  reasons: string[];
  distanceKm: number | null;
}

export interface GroundingMapSource {
  title: string;
  uri: string;
  reviewSnippets: string[];
}

export type TravelModeOption = 'TRANSIT' | 'DRIVING' | 'WALKING';

export interface ActivityCategoryConfig {
  id: ActivityCategoryId;
  label: string;
  shortLabel: string;
  query: string;
  description: string;
  color: string;
  softBg: string;
  textColor: string;
}

export interface GeumsanTownConfig {
  id: GeumsanTownId;
  label: string;
  queryPrefix: string;
}

export interface YouthPlaceItem {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: google.maps.LatLngLiteral;
  categoryId: ActivityCategoryId;
  rating?: number | null;
  userRatingCount?: number | null;
  businessStatus?: string | null;
  types?: string[];
  photoUrl?: string | null;
  weekdayDescriptions?: string[];
  nationalPhoneNumber?: string | null;
  websiteURI?: string | null;
  googleMapsURI?: string | null;
  editorialSummary?: string | null;
  isOpenNow?: boolean | null;
  detailsLoaded?: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/**
 * Stored locally in browser storage.
 * Only persists placeId and user-authored notes/checklist to comply with
 * Google Maps Platform Terms of Service caching rules.
 */
export interface SavedPlaceRecord {
  placeId: string;
  categoryId: ActivityCategoryId;
  memo: string;
  plannedDate: string;
  checklist: ChecklistItem[];
  savedAt: string;
}

export interface CourseStop {
  id: string;
  label: string;
  address?: string;
  location: google.maps.LatLngLiteral;
  categoryId?: ActivityCategoryId;
  isCurrentLocation?: boolean;
  placeId?: string;
}

export interface RouteLegSummary {
  legIndex: number;
  startLabel: string;
  endLabel: string;
  startLocation: google.maps.LatLngLiteral;
  endLocation: google.maps.LatLngLiteral;
  distanceMeters: number;
  durationMillis: number;
  isEstimatedFallback?: boolean;
  midpoint: google.maps.LatLngLiteral;
  path: google.maps.LatLngLiteral[];
}

export interface RouteSummary {
  distanceMeters: number;
  durationMillis: number;
  travelMode: TravelModeOption;
  legs: RouteLegSummary[];
  isFallbackLine?: boolean;
  warnings?: string[];
}
