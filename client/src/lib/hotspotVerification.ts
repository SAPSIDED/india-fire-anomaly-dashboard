export type HotspotVerificationTarget = {
  id: string;
  location: { lat: number; lng: number };
};

/** Preserves the selected stored FIRMS hotspot identity and coordinate for the existing corroboration procedure. */
export function buildHotspotVerificationInput(target: HotspotVerificationTarget) {
  return {
    detectionId: target.id,
    lat: target.location.lat,
    lng: target.location.lng,
  };
}

/** Represents the frontend-only result of selecting a map marker before the existing mutation is called. */
export function selectHotspotForVerification<T extends HotspotVerificationTarget>(target: T) {
  return { selectedTarget: target, verificationInput: buildHotspotVerificationInput(target) };
}

export type HotspotVerificationState = "ready" | "loading" | "error" | "complete";

/** Frontend presentation state for one marker-bound invocation of the existing corroboration procedure. */
export type HotspotVerificationPresentation<T> = {
  requestId: number;
  targetId: string | null;
  state: HotspotVerificationState;
  result?: T;
};

export const initialHotspotVerificationPresentation: HotspotVerificationPresentation<never> = {
  requestId: 0,
  targetId: null,
  state: "ready",
};

/** Begins a marker-bound request and clears only the previous marker's rendered evidence. */
export function beginHotspotVerification<T>(targetId: string, requestId: number): HotspotVerificationPresentation<T> {
  return { requestId, targetId, state: "loading" };
}

/** Applies a response only when it belongs to the currently selected marker invocation. */
export function completeHotspotVerification<T>(current: HotspotVerificationPresentation<T>, targetId: string, requestId: number, result: T): HotspotVerificationPresentation<T> {
  if (current.targetId !== targetId || current.requestId !== requestId) return current;
  return { requestId, targetId, state: "complete", result };
}

/** Keeps the marker selected but withholds a conclusion when its active request fails. */
export function failHotspotVerification<T>(current: HotspotVerificationPresentation<T>, targetId: string, requestId: number): HotspotVerificationPresentation<T> {
  if (current.targetId !== targetId || current.requestId !== requestId) return current;
  return { requestId, targetId, state: "error" };
}

/** Converts the existing mutation lifecycle into a presentation state without changing the verification contract. */
export function getHotspotVerificationState(input: { isPending: boolean; isError: boolean; hasResult: boolean }): HotspotVerificationState {
  if (input.isPending) return "loading";
  if (input.isError) return "error";
  if (input.hasResult) return "complete";
  return "ready";
}
