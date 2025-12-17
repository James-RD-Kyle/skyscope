import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * Reference:
 * Matthias Schäfer, Martin Strohmeier, Vincent Lenders,
 * Ivan Martinovic and Matthias Wilhelm.
 * "Bringing Up OpenSky: A Large-scale ADS-B Sensor Network for Research".
 * In Proceedings of the 13th IEEE/ACM International Symposium on
 * Information Processing in Sensor Networks (IPSN), pages 83–94, April 2014.
 * The OpenSky Network, https://opensky-network.org
 */

/**
 * Preset geographic map boxes for supported regions.
 * These are used to limit OpenSky queries for performance and usability.
 */
const REGION_MAP_BOXES = {
  calgary: {
    label: "Calgary (Default)",
    minimumLatitude: 50.0,
    maximumLatitude: 52.3,
    minimumLongitude: -115.8,
    maximumLongitude: -112.6,
    mapCenterLongitude: -114.0719,
    mapCenterLatitude: 51.0447,
    mapZoom: 8,
  },
  alberta: {
    label: "Alberta",
    minimumLatitude: 48.8,
    maximumLatitude: 60.0,
    minimumLongitude: -120.0,
    maximumLongitude: -109.0,
    mapCenterLongitude: -114.5,
    mapCenterLatitude: 54.5,
    mapZoom: 5.2,
  },
  vancouver: {
    label: "Vancouver / Lower Mainland",
    minimumLatitude: 48.6,
    maximumLatitude: 50.6,
    minimumLongitude: -124.0,
    maximumLongitude: -121.0,
    mapCenterLongitude: -123.1207,
    mapCenterLatitude: 49.2827,
    mapZoom: 8,
  },
  toronto: {
    label: "Toronto / GTA",
    minimumLatitude: 43.0,
    maximumLatitude: 44.4,
    minimumLongitude: -80.4,
    maximumLongitude: -78.5,
    mapCenterLongitude: -79.3832,
    mapCenterLatitude: 43.6532,
    mapZoom: 8,
  },
};

// IMPORTANT: These are approximate average elevations for the regions, used for
// calculating relative altitude of aircraft
const REGION_ELEVATIONS_METERS = {
  calgary: 1084,
  alberta: 900,
  vancouver: 70,
  toronto: 76,
};

/**
 * OpenSky OAuth2 Client Credentials token.
 */
let cachedOpenSkyAccessToken = null;
let cachedOpenSkyAccessTokenExpiresAtMs = 0;

async function getOpenSkyAccessToken() {
  const openSkyClientId = process.env.OPENSKY_CLIENT_ID;
  const openSkyClientSecret = process.env.OPENSKY_CLIENT_SECRET;

  if (!openSkyClientId || !openSkyClientSecret) {
    throw new Error("Missing OPENSKY_CLIENT_ID or OPENSKY_CLIENT_SECRET");
  }

  const currentTimeMs = Date.now();

  // Reuse token if still valid (30s safety buffer)
  if (
    cachedOpenSkyAccessToken &&
    currentTimeMs < cachedOpenSkyAccessTokenExpiresAtMs - 30_000
  ) {
    return cachedOpenSkyAccessToken;
  }

  const tokenResponse = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: openSkyClientId,
        client_secret: openSkyClientSecret,
      }),
      cache: "no-store",
    }
  );

  if (!tokenResponse.ok) {
    const tokenErrorBodyText = await tokenResponse.text();
    throw new Error(
      `OpenSky token request failed: ${
        tokenResponse.status
      } ${tokenErrorBodyText.slice(0, 300)}`
    );
  }

  const tokenJson = await tokenResponse.json();

  cachedOpenSkyAccessToken = tokenJson.access_token ?? null;

  const expiresInSeconds = Number(tokenJson.expires_in ?? 1800);
  cachedOpenSkyAccessTokenExpiresAtMs =
    currentTimeMs + Math.max(0, expiresInSeconds) * 1000;

  if (!cachedOpenSkyAccessToken) {
    throw new Error("OpenSky token response missing access_token");
  }

  return cachedOpenSkyAccessToken;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const requestedRegionKey = (
    requestUrl.searchParams.get("region") || "calgary"
  ).toLowerCase();

  const selectedRegion =
    REGION_MAP_BOXES[requestedRegionKey] || REGION_MAP_BOXES.calgary;

  const regionReferenceElevationMeters =
    REGION_ELEVATIONS_METERS[requestedRegionKey] ??
    REGION_ELEVATIONS_METERS.calgary;

  const openSkyApiUrl =
    `https://opensky-network.org/api/states/all` +
    `?lamin=${selectedRegion.minimumLatitude}` +
    `&lamax=${selectedRegion.maximumLatitude}` +
    `&lomin=${selectedRegion.minimumLongitude}` +
    `&lomax=${selectedRegion.maximumLongitude}`;

  try {
    const openSkyAccessToken = await getOpenSkyAccessToken();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    const openSkyResponse = await fetch(openSkyApiUrl, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${openSkyAccessToken}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log("OpenSky status:", openSkyResponse.status);

    if (!openSkyResponse.ok) {
      const upstreamBodyText = await openSkyResponse.text();
      console.log("OpenSky error body:", upstreamBodyText.slice(0, 300));

      return NextResponse.json(
        { aircraft: [], error: "Failed to fetch data from OpenSky Network" },
        { status: openSkyResponse.status }
      );
    }

    const openSkyData = await openSkyResponse.json();

    const aircraft = (openSkyData.states || [])
      .map((aircraftState) => {
        const longitude = aircraftState?.[5];
        const latitude = aircraftState?.[6];

        if (typeof longitude !== "number" || typeof latitude !== "number") {
          return null;
        }

        const altitudeMeters = aircraftState?.[13] ?? aircraftState?.[7] ?? null;

        const altitudeAglMeters =
          typeof altitudeMeters === "number"
            ? Math.max(
                0,
                Math.round(altitudeMeters - regionReferenceElevationMeters)
              )
            : null;

        return {
          aircraftIcao24: aircraftState?.[0],
          flightCallsign: aircraftState?.[1]?.trim() || null,
          originCountry: aircraftState?.[2] || null,
          longitude: longitude,
          latitude: latitude,
          altitudeMeters: altitudeMeters,
          altitudeAglMeters: altitudeAglMeters,
          isOnGround: Boolean(aircraftState?.[8]),
          velocityMetersPerSecond: aircraftState?.[9] ?? null,
          headingDegrees: aircraftState?.[10] ?? 0,
          verticalRateMetersPerSecond: aircraftState?.[11] ?? null,
          lastContactTimestamp: aircraftState?.[4] ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      regionKey: requestedRegionKey,
      region: selectedRegion,
      aircraft,
      dataTimestamp: openSkyData.time ?? null,
    });
  } catch (error) {
    console.error("OpenSky fetch threw:", error);

    return NextResponse.json(
      { aircraft: [], error: "Unexpected error while fetching aircraft data" },
      { status: 500 }
    );
  }
}
