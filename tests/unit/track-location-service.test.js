import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTrackLocationCacheKey,
  findRepresentativeTrackPoint,
  formatBigDataCloudTrackLocation,
  reverseGeocodeTrackLocation
} from "../../src/services/track-location-service.js";

const point = (latitude, longitude) => ({
  latitude,
  longitude,
  elevation: null,
  timestamp: null,
  segmentIndex: 0
});

const parsedTrack = (points) => ({
  fileName: "track.gpx",
  name: "Track",
  points,
  hasElevation: false,
  hasTime: false,
  elevationSource: "none"
});

const bigDataCloudResponse = (payload) => ({
  ok: true,
  json: async () => payload
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("findRepresentativeTrackPoint", () => {
  it("returns the middle finite coordinate without extra point fields", () => {
    const result = findRepresentativeTrackPoint([
      point(Number.NaN, 7.1),
      point(45.1, 7.1),
      { ...point(45.8, 7.8), longitude: "7.8" },
      point(46.2, 8.2),
      point(47.3, 9.3),
      point(48.4, Number.POSITIVE_INFINITY)
    ]);

    expect(result).toEqual({ latitude: 46.2, longitude: 8.2 });
  });

  it("returns null when no finite coordinates are available", () => {
    expect(findRepresentativeTrackPoint([])).toBeNull();
    expect(
      findRepresentativeTrackPoint([point(Number.NaN, 7.1), point(45.1, Infinity)])
    ).toBeNull();
  });
});

describe("createTrackLocationCacheKey", () => {
  it("rounds coordinates to 4 decimals and includes the language", () => {
    expect(createTrackLocationCacheKey({ latitude: 42.123456, longitude: -71.987654 }, "fr")).toBe(
      "fr:42.1235:-71.9877"
    );
  });
});

describe("formatBigDataCloudTrackLocation", () => {
  it("formats the principal subdivision with the country", () => {
    const result = formatBigDataCloudTrackLocation({
      countryName: "Georgia",
      city: "Stepantsminda",
      locality: "Kazbegi Municipality",
      principalSubdivision: "Mtskheta-Mtianeti"
    });

    expect(result).toEqual({
      region: "Mtskheta-Mtianeti",
      country: "Georgia",
      label: "Mtskheta-Mtianeti, Georgia"
    });
  });

  it("falls back through lower-priority locality fields", () => {
    const result = formatBigDataCloudTrackLocation({
      countryName: "Italy",
      city: "Bormio"
    });

    expect(result).toEqual({
      region: "Bormio",
      country: "Italy",
      label: "Bormio, Italy"
    });
  });

  it("uses locality when the city and principal subdivision are absent", () => {
    const result = formatBigDataCloudTrackLocation({
      countryName: "Slovenia",
      locality: "Dol pri Ljubljani"
    });

    expect(result).toEqual({
      region: "Dol pri Ljubljani",
      country: "Slovenia",
      label: "Dol pri Ljubljani, Slovenia"
    });
  });

  it("returns null unless both region and country are present", () => {
    expect(formatBigDataCloudTrackLocation({ locality: "Pass Road" })).toBeNull();
    expect(formatBigDataCloudTrackLocation({ countryName: "France" })).toBeNull();
    expect(formatBigDataCloudTrackLocation({ principalSubdivision: "Nowhere" })).toBeNull();
    expect(formatBigDataCloudTrackLocation(null)).toBeNull();
  });
});

describe("reverseGeocodeTrackLocation", () => {
  it("requests BigDataCloud for the representative point with a locality language", async () => {
    const fetcher = vi.fn(async () =>
      bigDataCloudResponse({
        countryName: "France",
        principalSubdivision: "Auvergne-Rhone-Alpes"
      })
    );

    const result = await reverseGeocodeTrackLocation(
      parsedTrack([
        point(44.111111, 6.111111),
        point(45.222222, 7.222222),
        point(46.333333, 8.333333)
      ]),
      {
        language: "fr",
        fetcher
      }
    );

    expect(result).toEqual({
      region: "Auvergne-Rhone-Alpes",
      country: "France",
      label: "Auvergne-Rhone-Alpes, France"
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, requestOptions] = getFetchCall(fetcher);
    const requestUrl = new URL(url);
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://api.bigdatacloud.net/data/reverse-geocode-client"
    );
    expect(requestUrl.searchParams.get("latitude")).toBe("45.222222");
    expect(requestUrl.searchParams.get("longitude")).toBe("7.222222");
    expect(requestUrl.searchParams.get("localityLanguage")).toBe("fr");
    expect(requestOptions).toEqual({
      headers: {
        Accept: "application/json"
      }
    });
  });

  it("uses global fetch and English by default", async () => {
    const fetcher = vi.fn(async () =>
      bigDataCloudResponse({
        countryName: "Spain",
        principalSubdivision: "Girona"
      })
    );
    vi.stubGlobal("fetch", fetcher);

    const result = await reverseGeocodeTrackLocation(parsedTrack([point(42.412345, 2.112345)]));

    expect(result?.label).toBe("Girona, Spain");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(getFetchCall(fetcher)[0]).searchParams.get("localityLanguage")).toBe("en");
  });

  it("does not request geocoding when no representative point is available", async () => {
    const fetcher = vi.fn();

    await expect(
      reverseGeocodeTrackLocation(parsedTrack([point(Number.NaN, 7.1)]), { fetcher })
    ).resolves.toBeNull();

    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [
      "non-ok response",
      async () => ({
        ok: false,
        status: 500,
        json: async () => ({})
      })
    ],
    [
      "invalid JSON",
      async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("bad json");
        }
      })
    ],
    [
      "network failure",
      async () => {
        throw new Error("offline");
      }
    ]
  ])("returns null for %s", async (_name, responseFactory) => {
    const fetcher = vi.fn(responseFactory);

    await expect(
      reverseGeocodeTrackLocation(parsedTrack([point(30.1001, 40.1001)]), {
        language: _name,
        fetcher
      })
    ).resolves.toBeNull();
  });

  it("caches successful results by rounded coordinate and language", async () => {
    const fetcher = vi.fn(async () =>
      bigDataCloudResponse({
        countryName: "Switzerland",
        city: "Zermatt"
      })
    );

    const first = await reverseGeocodeTrackLocation(parsedTrack([point(46.020012, 7.749982)]), {
      language: "de-CH",
      fetcher
    });
    const second = await reverseGeocodeTrackLocation(parsedTrack([point(46.020013, 7.749983)]), {
      language: "de-CH",
      fetcher
    });

    expect(first).toEqual({
      region: "Zermatt",
      country: "Switzerland",
      label: "Zermatt, Switzerland"
    });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps language-specific cache entries separate", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        bigDataCloudResponse({ countryName: "Norway", principalSubdivision: "Vestland" })
      )
      .mockResolvedValueOnce(
        bigDataCloudResponse({ countryName: "Norge", principalSubdivision: "Vestland" })
      );

    const english = await reverseGeocodeTrackLocation(parsedTrack([point(60.3913, 5.3221)]), {
      language: "en",
      fetcher
    });
    const norwegian = await reverseGeocodeTrackLocation(parsedTrack([point(60.3913, 5.3221)]), {
      language: "nb",
      fetcher
    });

    expect(english?.label).toBe("Vestland, Norway");
    expect(norwegian?.label).toBe("Vestland, Norge");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("caches null results to avoid repeated failed lookups", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    }));
    const parsed = parsedTrack([point(39.7392, -104.9903)]);

    await expect(
      reverseGeocodeTrackLocation(parsed, { language: "failure-cache", fetcher })
    ).resolves.toBeNull();
    await expect(
      reverseGeocodeTrackLocation(parsed, { language: "failure-cache", fetcher })
    ).resolves.toBeNull();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

/**
 * @param {ReturnType<typeof vi.fn>} fetcher
 * @returns {[string, { headers: Record<string, string> }]}
 */
function getFetchCall(fetcher) {
  const call = fetcher.mock.calls[0];

  if (!call) {
    throw new Error("Expected fetcher to have been called");
  }

  return /** @type {[string, { headers: Record<string, string> }]} */ (call);
}
