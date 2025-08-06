"use client";

import React, { useState, useRef, useEffect } from "react";
import mapboxgl, { Map, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Set your Mapbox access token in .env.local as NEXT_PUBLIC_MAPBOX_TOKEN
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

type Visibility = "everyone" | "friends";
const defaultCenter: [number, number] = [80.15345, 12.84068]; // VIT Chennai center

export default function AddEventPage() {
  const [eventName, setEventName] = useState("");
  const [eventAbout, setEventAbout] = useState("");
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("everyone");

  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapNode.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: defaultCenter,
      zoom: 16,
      pitch: 35,
      bearing: 8,
      interactive: true,
    });

    mapRef.current.on("click", (e) => {
      const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setLocation(coords);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update marker position on map when location changes
  useEffect(() => {
    if (!mapRef.current || !location) return;

    if (markerRef.current) markerRef.current.remove();

    markerRef.current = new mapboxgl.Marker({ color: "#0074D9" })
      .setLngLat(location)
      .addTo(mapRef.current);

    mapRef.current.flyTo({ center: location });
  }, [location]);

  // Handle form submission
  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventName || !eventAbout || !location) {
      alert("Please fill all fields and select a location on the map.");
      return;
    }

    const newEvent = {
      name: eventName,
      about: eventAbout,
      location,
      visibility,
    };

    // TODO: Replace alert with API call to save event to backend
    alert("Event added!\n" + JSON.stringify(newEvent, null, 2));

    // Reset form
    setEventName("");
    setEventAbout("");
    setLocation(null);
    setVisibility("everyone");
    if (markerRef.current) markerRef.current.remove();
  };

  // Handler to recenter the map
  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: defaultCenter, zoom: 16, bearing: 8, pitch: 35 });
    }
  };

  return (
    <div className="max-w-5xl mx-auto mt-16 p-6 bg-white dark:bg-neutral-900 rounded-xl shadow-md">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
        Add an Event
      </h2>
      <form onSubmit={handleAddEvent} className="flex flex-col gap-6">
        <div>
          <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
            Event Name
          </label>
          <input
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="w-full px-3 py-2 rounded border bg-gray-100 dark:bg-neutral-800 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
            About Event
          </label>
          <textarea
            value={eventAbout}
            rows={3}
            onChange={(e) => setEventAbout(e.target.value)}
            className="w-full px-3 py-2 rounded border bg-gray-100 dark:bg-neutral-800 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
            Location (click map to set)
          </label>
          <div className="w-full rounded-lg border-2 border-gray-200 dark:border-neutral-700 relative" style={{ height: 400 }}>
            <div ref={mapNode} className="w-full h-full rounded-lg" />
            {/* Locate Button */}
            <button
              type="button"
              onClick={handleRecenter}
              className="absolute bottom-4 right-4 z-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-md p-3 transition"
              aria-label="Recenter map to VIT Chennai"
            >
              📍
            </button>
          </div>
          {location && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
              Selected: {location[1].toFixed(5)}, {location[0].toFixed(5)}
            </p>
          )}
        </div>

        <div>
          <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
            Whom to show:
          </label>
          <div className="flex gap-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="visibility"
                value="everyone"
                checked={visibility === "everyone"}
                onChange={() => setVisibility("everyone")}
                className="accent-blue-600"
              />
              <span className="ml-2">Everyone</span>
            </label>

            <label className="inline-flex items-center">
              <input
                type="radio"
                name="visibility"
                value="friends"
                checked={visibility === "friends"}
                onChange={() => setVisibility("friends")}
                className="accent-blue-600"
              />
              <span className="ml-2">Your Friends</span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition"
        >
          Add Event
        </button>
      </form>
    </div>
  );
}
