"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function Home() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  //initializes map only once
  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-114.0719, 51.0447], // Calgary Originally (Will get from API later for other options)
      zoom: 8,
    });
    mapRef.current.on("load", () => {
      mapRef.current.addSource("flights", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      mapRef.current.addLayer({
        id: "flights-layer",
        type: "symbol",
        source: "flights",
        layout: {
          "icon-image": "airport-15",
          "icon-size": 1.2,
          "icon-allow-overlap": true,
        },
      });
      async function fetchFlightData() {
        const response = await fetch("/api/flights?region=calgary");
        const data = await response.json();
        const aircraft = data.aircraft;
        const featureArray = aircraft.map((aircraft) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [aircraft.longitude, aircraft.latitude],
          },
          properties: {
            aircraftIcao24: aircraft.aircraftIcao24,
            callsign: aircraft.flightCallsign,
            altitudeMeters: aircraft.altitudeMeters,
            velocityMetersPerSecond: aircraft.velocityMetersPerSecond,
            headingDegrees: aircraft.headingDegrees,
            isOnGround: aircraft.isOnGround,
          },
        }));
        const featureCollection = {
          type: "FeatureCollection",
          features: featureArray,
        };
        mapRef.current.getSource("flights").setData(featureCollection);
      }
      fetchFlightData();
    });
  }, []);
  return (
    <div className="h-screen w-screen">
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
