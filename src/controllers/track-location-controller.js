import { createState as defaultCreateState } from "../state/app-state.js";

/**
 * @typedef {import("../state/app-state.js").AppState} AppState
 * @typedef {import("../core/route-types.js").RouteSource} RouteSource
 * @typedef {NonNullable<AppState["trackLocation"]>} TrackLocation
 */

/**
 * @param {object} options
 * @param {() => AppState} options.getState
 * @param {(state: AppState) => void} options.setState
 * @param {() => void} options.renderApp
 * @param {(parsed: RouteSource, options: { language: string }) => Promise<TrackLocation | null>} options.reverseGeocodeTrackLocation
 * @param {(sourceRequestToken: number) => boolean} options.isCurrentSourceRequest
 * @param {() => number} options.getCurrentSourceRequestToken
 * @param {() => boolean} options.isPosterOutputActive
 * @param {(overrides?: Partial<AppState>) => AppState} [options.createState]
 */
export function createTrackLocationController({
  getState,
  setState,
  renderApp,
  reverseGeocodeTrackLocation,
  isCurrentSourceRequest,
  getCurrentSourceRequestToken,
  isPosterOutputActive,
  createState = defaultCreateState
}) {
  let requestToken = 0;
  let pendingRenderAfterPosterOutput = false;

  function invalidate() {
    requestToken += 1;
    pendingRenderAfterPosterOutput = false;
  }

  /**
   * @param {RouteSource} parsed
   * @param {string} language
   * @param {number} [sourceRequestToken]
   */
  async function request(parsed, language, sourceRequestToken = getCurrentSourceRequestToken()) {
    requestToken += 1;
    const currentRequestToken = requestToken;
    const trackLocation = await reverseGeocodeTrackLocation(parsed, { language });
    const state = getState();

    if (
      !trackLocation ||
      currentRequestToken !== requestToken ||
      !isCurrentSourceRequest(sourceRequestToken) ||
      !state.parsed ||
      state.language !== language
    ) {
      return;
    }

    setState(
      createState({
        ...state,
        trackLocation
      })
    );

    if (isPosterOutputActive()) {
      pendingRenderAfterPosterOutput = true;
      return;
    }

    renderApp();
  }

  function renderPendingAfterPosterOutput() {
    if (isPosterOutputActive() || !pendingRenderAfterPosterOutput) {
      return;
    }

    pendingRenderAfterPosterOutput = false;
    const state = getState();

    if (!state.parsed || !state.analysis || !state.trackLocation) {
      return;
    }

    renderApp();
  }

  return {
    invalidate,
    request,
    renderPendingAfterPosterOutput
  };
}
