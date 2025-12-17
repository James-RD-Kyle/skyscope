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

const REGION_MAP_BOXES = {
  calgary: {
    minimumLatitude: 50.0,
    maximumLatitude: 52.3,
    minimumLongitude: -115.8,
    maximumLongitude: -112.6,
  },
  alberta: {
    minimumLatitude: 48.8,
    maximumLatitude: 60.0,
    minimumLongitude: -120.0,
    maximumLongitude: -109.0,
  },
  vancouver: {
    minimumLatitude: 48.6,
    maximumLatitude: 50.6,
    minimumLongitude: -124.0,
    maximumLongitude: -121.0,
  },
  toronto: {
    minimumLatitude: 43.0,
    maximumLatitude: 44.4,
    minimumLongitude: -80.4,
    maximumLongitude: -78.5,
  },
};

const REGION_ELEVATIONS_METERS = {
  calgary: 1084,
  alberta: 900,
  vancouver: 70,
  toronto: 76,
};

/* ------------------ OpenSky OAuth ------------------ */

let cachedOpenSkyAccessToken = null;
let cachedOpenSkyAccessTokenExpiresAtMs = 0;

async function getOpenSkyAccessToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing OPENSKY_CLIENT_ID or OPENSKY_CLIENT_SECRET");
  }

  const now = Date.now();

  if (
    cachedOpenSkyAccessToken &&
    now < cachedOpenSkyAccessTokenExpiresAtMs - 30_000
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
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    }
  );

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Token request failed: ${tokenResponse.status} ${body}`);
  }

  const tokenJson = await tokenResponse.json();

  cachedOpenSkyAccessToken = tokenJson.access_token;
  cachedOpenSkyAccessTokenExpiresAtMs =
    now + Number(tokenJson.expires_in ?? 1800) * 1000;

  return cachedOpenSkyAccessToken;
}

/* ------------------ Fetch with timeout + retry ------------------ */

async function fetchWithTimeoutAndRetry(
  url,
  options,
  timeoutMs = 30_000,
  retries = 2
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  throw lastError;
}

/* ------------------ API Route ------------------ */

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const regionKey = (
      url.searchParams.get("region") || "calgary"
    ).toLowerCase();

    const region = REGION_MAP_BOXES[regionKey] || REGION_MAP_BOXES.calgary;
    const regionElevation =
      REGION_ELEVATIONS_METERS[regionKey] ?? REGION_ELEVATIONS_METERS.calgary;

    const openSkyApiUrl =
      `https://opensky-network.org/api/states/all` +
      `?lamin=${region.minimumLatitude}` +
      `&lamax=${region.maximumLatitude}` +
      `&lomin=${region.minimumLongitude}` +
      `&lomax=${region.maximumLongitude}`;

    const accessToken = await getOpenSkyAccessToken();

    const response = await fetchWithTimeoutAndRetry(
      openSkyApiUrl,
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      30_000,
      2
    );

    if (!response.ok) {
      return NextResponse.json(
        { aircraft: [], error: "OpenSky request failed" },
        { status: response.status }
      );
    }

    const data = await response.json();

    const aircraft = (data.states || [])
      .map((s) => {
        const lon = s?.[5];
        const lat = s?.[6];
        if (typeof lon !== "number" || typeof lat !== "number") return null;

        const altitude = s?.[13] ?? s?.[7] ?? null;

        return {
          aircraftIcao24: s?.[0],
          flightCallsign: s?.[1]?.trim() || null,
          originCountry: s?.[2] || null,
          longitude: lon,
          latitude: lat,
          altitudeMeters: altitude,
          altitudeAglMeters:
            typeof altitude === "number"
              ? Math.max(0, Math.round(altitude - regionElevation))
              : null,
          isOnGround: Boolean(s?.[8]),
          velocityMetersPerSecond: s?.[9] ?? null,
          headingDegrees: s?.[10] ?? 0,
          verticalRateMetersPerSecond: s?.[11] ?? null,
          lastContactTimestamp: s?.[4] ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      regionKey,
      aircraft,
      dataTimestamp: data.time ?? null,
    });
  } catch (error) {
    console.error("OpenSky API failed:", error);

    return NextResponse.json(
      {
        aircraft: [],
        error: "Unexpected error while fetching aircraft data",
        debug: String(error?.message || error),
        causeCode: error?.cause?.code ?? null,
      },
      { status: 500 }
    );
  }
}
