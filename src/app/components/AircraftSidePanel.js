export function AircraftSidePanel({ aircraft, onClose }) {
  if (!aircraft) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-2">No Aircraft Selected</h2>
        <p>Select an aircraft on the map to view details.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold mb-2">Aircraft Details</h2>

        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm opacity-70 hover:opacity-100"
            aria-label="Close panel"
          >
            ✕
          </button>
        )}
      </div>

      <p>Callsign: {aircraft.flightCallsign || "N/A"}</p>
      <p>ICAO24: {aircraft.aircraftIcao24 || "N/A"}</p>
      <p>Altitude (meters): {aircraft.altitudeMeters ?? "N/A"}</p>
      <p>Altitude AGL (meters): {aircraft.altitudeAglMeters ?? "N/A"}</p>
      <p>Velocity (m/s): {aircraft.velocityMetersPerSecond ?? "N/A"}</p>
      <p>Heading (deg): {aircraft.headingDegrees ?? "N/A"}</p>
      <p>On ground: {String(aircraft.isOnGround ?? "N/A")}</p>
      <p>
        Lat/Lng:{" "}
        {aircraft.latitude != null && aircraft.longitude != null
          ? `${aircraft.latitude.toFixed(4)}, ${aircraft.longitude.toFixed(4)}`
          : "N/A"}
      </p>
    </div>
  );
}
