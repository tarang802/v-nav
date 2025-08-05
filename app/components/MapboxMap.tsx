"use client";
import React, { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapboxMap() {
  const mapNode = useRef(null);

  useEffect(() => {
    if (!mapNode.current) return;
    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [80.220977, 12.840575], // Example: VIT Chennai coordinates
      zoom: 15,
    });

    // Optional: add zoom and rotation controls.
    map.addControl(new mapboxgl.NavigationControl());

    return () => map.remove();
  }, []);

  return (
    <div
      ref={mapNode}
      style={{ width: "100%", height: "500px", borderRadius: "1rem", overflow: "hidden" }}
    />
  );
}
