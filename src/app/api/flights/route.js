import { NextResponse } from "next/server";

/*
 * Reference:
 * Matthias Schäfer, Martin Strohmeier, Vincent Lenders,
 * Ivan Martinovic and Matthias Wilhelm.
 * "Bringing Up OpenSky: A Large-scale ADS-B Sensor Network for Research".
 * In Proceedings of the 13th IEEE/ACM International Symposium on
 * Information Processing in Sensor Networks (IPSN), pages 83–94, April 2014.
 * The OpenSky Network, https://opensky-network.org
 */

export const dynamic = "force-dynamic";

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

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const requestedRegionKey = (
    requestUrl.searchParams.get("region") || "calgary"
  ).toLowerCase();

  const selectedRegion =
    REGION_MAP_BOXES[requestedRegionKey] || REGION_MAP_BOXES.calgary;

  const openSkyApiUrl =
    `https://opensky-network.org/api/states/all` +
    `?lamin=${selectedRegion.minimumLatitude}` +
    `&lamax=${selectedRegion.maximumLatitude}` +
    `&lomin=${selectedRegion.minimumLongitude}` +
    `&lomax=${selectedRegion.maximumLongitude}`;

  try {
    const openSkyResponse = await fetch(openSkyApiUrl, {
      cache: "no-store",
    });

    if (!openSkyResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch data from OpenSky Network" },
        { status: 502 }
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

        return {
          aircraftIcao24: aircraftState?.[0],
          flightCallsign: aircraftState?.[1]?.trim() || null,
          originCountry: aircraftState?.[2] || null,
          longitude: longitude,
          latitude: latitude,
          altitudeMeters: aircraftState?.[13] ?? aircraftState?.[7] ?? null,
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
    return NextResponse.json(
      { error: "Unexpected error while fetching aircraft data" },
      { status: 500 }
    );
  }
}
