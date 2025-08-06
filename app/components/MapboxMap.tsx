"use client";

import React, { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapboxMap() {
  const mapNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapNode.current) return;

    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: "mapbox://styles/mapbox/streets-v11", // Original Mapbox style for light mode
      center: [80.15345, 12.84068], // VIT Chennai approximate center
      zoom: 16.5, // Close zoom on campus
      pitch: 35,  // flat view; adjust if you want tilt (e.g., 45)
      bearing: 8, // no rotation; change if desired
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      map.remove();
    };
  }, []);

  return (
    <div
      ref={mapNode}
      style={{
        width: "100%",
        height: "100%",        // Fill the parent container
        borderRadius: "1rem",  // Matches page container styling
        overflow: "hidden",
      }}
    />
  );
}
