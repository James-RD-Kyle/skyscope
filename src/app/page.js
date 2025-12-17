"use client";

import { SearchBar } from "./components/searchbar.js";
import { AircraftSidePanel } from "./components/aircraftsidepanel.js";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Image from "next/image";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function Home() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const latestAircraftRef = useRef([]);

  const [searchText, setSearchText] = useState("");
  const [selectedAircraft, setSelectedAircraft] = useState(null);

  // Initializes map only once
  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-114.0719, 51.0447], // Calgary Originally (Will get from API later for other options)
      zoom: 8,
    });

    let abortController = null;
    let fetchInterval = null;

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
              [
                "case",
                [">", ["length", ["coalesce", ["get", "callsign"], ""]], 0],
                ["get", "callsign"],
                "UNKNOWN",
              ],
              { "font-scale": 1.2 },
              "\n",
              {},
              [
                "concat",
                [
                  "to-string",
                  ["round", ["coalesce", ["get", "altitudeAglMeters"], 0]],
                ],
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

        //set React state (side panel) for plane information
        function showPlaneSidePanel(event) {
          const clickedFeature = event.features?.[0];
          if (!clickedFeature) return;

          const [longitude, latitude] = clickedFeature.geometry.coordinates;

          setSelectedAircraft({
            aircraftIcao24: clickedFeature.properties?.aircraftIcao24 ?? null,
            flightCallsign: clickedFeature.properties?.callsign ?? null,
            altitudeMeters: clickedFeature.properties?.altitudeMeters ?? null,
            altitudeAglMeters:
              clickedFeature.properties?.altitudeAglMeters ?? null,
            velocityMetersPerSecond:
              clickedFeature.properties?.velocityMetersPerSecond ?? null,
            headingDegrees: clickedFeature.properties?.headingDegrees ?? null,
            isOnGround: clickedFeature.properties?.isOnGround ?? null,
            longitude,
            latitude,
          });
        }

        mapRef.current.on("click", "flights-airplanes", showPlaneSidePanel);
        mapRef.current.on("click", "flights-dots", showPlaneSidePanel);

        // Pointer cursor on hover (both zoom modes)
        ["flights-airplanes", "flights-dots"].forEach((layerId) => {
          mapRef.current.on("mouseenter", layerId, () => {
            mapRef.current.getCanvas().style.cursor = "pointer";
          });
          mapRef.current.on("mouseleave", layerId, () => {
            mapRef.current.getCanvas().style.cursor = "";
          });
        });
        mapRef.current.on("click", (event) => {
          const features = mapRef.current.queryRenderedFeatures(event.point, {
            layers: ["flights-airplanes", "flights-dots"],
          });
          if (!features.length) setSelectedAircraft(null);
        });

        async function fetchFlightData() {
          try {
            if (abortController) abortController.abort();
            abortController = new AbortController();

            const response = await fetch("/api/flights?region=calgary", {
              signal: abortController.signal,
              cache: "no-store",
            });

            const data = await response.json();
            const aircraft = data.aircraft ?? [];
            latestAircraftRef.current = aircraft;

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
          } catch (error) {
            if (error?.name === "AbortError") return;
            console.error("Failed to fetch flight data:", error);
          }
        }

        fetchFlightData();
        // Fetch flight data every 30 seconds
        fetchInterval = setInterval(() => {
          if (document.visibilityState === "visible") {
            fetchFlightData();
          }
        }, 30000);
      });
    });

    // Cleanup UseEffect Function
    return () => {
      if (fetchInterval) clearInterval(fetchInterval);
      if (abortController) abortController.abort();
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);
  function handleSearch(searchValue) {
    const query = (searchValue ?? "").trim().toUpperCase();
    if (!query) return;

    const aircraftList = latestAircraftRef.current ?? [];

    // normalize callsign (OpenSky often has trailing spaces)
    const normalize = (text) => (text ?? "").trim().toUpperCase();

    const found =
      aircraftList.find((a) => normalize(a.flightCallsign) === query) ||
      aircraftList.find((a) => normalize(a.flightCallsign).includes(query));

    if (!found) {
      setSelectedAircraft(null);
      return;
    }
    //Setting the SideBar
    setSelectedAircraft(found);

    // Pan to the aircraft on the map
    mapRef.current?.flyTo({
      center: [found.longitude, found.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 10),
      essential: true,
    });
  }

  return (
    <div className="h-screen w-screen relative">
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <Image
          src="/SkyScope.png"
          alt="SkyScope"
          width={200}
          height={200}
          priority
        />
      </div>

      <SearchBar
        value={searchText}
        onChange={setSearchText}
        onSearch={handleSearch}
      />

      <div className="absolute right-4 top-16 z-20 w-80 rounded-xl bg-white/95 shadow-lg backdrop-blur dark:bg-zinc-900/95">
        <AircraftSidePanel
          aircraft={selectedAircraft}
          onClose={() => setSelectedAircraft(null)}
        />
      </div>

      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
