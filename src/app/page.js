"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function Home() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Initializes map only once
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

      mapRef.current.loadImage("/airplane.png", (error, image) => {
        if (error || !image) {
          console.error("Failed to load airplane icon:", error);
          return;
        }

        if (!mapRef.current.hasImage("airplane")) {
          mapRef.current.addImage("airplane", image, { sdf: true });
        }

        mapRef.current.addLayer({
          id: "flights-airplanes",
          type: "symbol",
          source: "flights",
          minzoom: 9,
          layout: {
            "icon-image": "airplane",
            "icon-size": 0.13,
            "icon-allow-overlap": true,
            "icon-rotate": ["coalesce", ["get", "headingDegrees"], 0],
            "icon-rotation-alignment": "map",
            "text-field": [
              "format",
              ["coalesce", ["get", "callsign"], "UNKNOWN"],
              { "font-scale": 1.2 },
              "\n",
              ["concat", ["to-string", ["round", ["get", "altitudeAglMeters"]]],
                " m",
              ],
              { "font-scale": 1.0 },
            ],
            "text-size": 11,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1,
            "icon-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "altitudeAglMeters"], 0],
              0,
              "#ff3b30",
              2000,
              "#ffcc00",
              6000,
              "#34c759",
              10000,
              "#0a84ff",
              12000,
              "#bf5af2",
            ],
          },
        });
        mapRef.current.addLayer({
          id: "flights-dots",
          type: "circle",
          source: "flights",
          maxzoom: 9,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2, 9, 4],
            "circle-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "altitudeMeters"], 0],
              0,
              "#ff3b30",
              2000,
              "#ffcc00",
              6000,
              "#34c759",
              10000,
              "#0a84ff",
              12000,
              "#bf5af2",
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#000",
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
              altitudeAglMeters: aircraft.altitudeAglMeters,
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
    });
  }, []);

  return (
    <div className="h-screen w-screen">
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
