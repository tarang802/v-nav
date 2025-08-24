"use client";

import React, { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// VIT campus center
const VIT_CENTER: [number, number] = [80.15345, 12.84068];

export default function MapboxMap() {
  const mapNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapNode.current) return;

    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: VIT_CENTER,
      zoom: 16.5,
      pitch: 35,
      bearing: 8,
    });

    // Add zoom/rotate controls
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Custom reset button
    const resetButton = document.createElement("button");
    resetButton.innerHTML = "📍"; // pin icon
    resetButton.title = "Reset to Campus";

    // Styling for round blue background
    resetButton.style.fontSize = "22px";
    resetButton.style.width = "40px";
    resetButton.style.height = "40px";
    resetButton.style.borderRadius = "50%";
    resetButton.style.border = "none";
    resetButton.style.cursor = "pointer";
    resetButton.style.background = "#3b82f6"; // Tailwind blue-500
    resetButton.style.color = "red"; // pin in red
    resetButton.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";

    resetButton.onclick = () => {
      map.flyTo({ center: VIT_CENTER, zoom: 16.5, pitch: 35, bearing: 8 });
    };

    // Wrap inside a control div
    const resetControl = document.createElement("div");
    resetControl.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    resetControl.style.margin = "10px"; // spacing from edges
    resetControl.style.border = "none";
    resetControl.style.background = "transparent";
    resetControl.appendChild(resetButton);

    // Add to bottom-right corner
    map.addControl(
      {
        onAdd: () => resetControl,
        onRemove: () => resetControl.parentNode?.removeChild(resetControl),
      },
      "bottom-right"
    );

    return () => map.remove();
  }, []);

  return (
    <div
      ref={mapNode}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "1rem",
        overflow: "hidden",
      }}
    />
  );
}
