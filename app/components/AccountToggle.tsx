"use client";

import { useState, useEffect, useRef } from "react";

export default function AccountToggle() {
  const [active, setActive] = useState<boolean>(true); // default → Active
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-800 transition"
      >
        {active ? "Active" : "Deactivated"}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-md bg-white dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 shadow-lg z-20">
          <button
            onClick={() => {
              setActive(true);
              setOpen(false);
              console.log("✅ Location sharing activated");
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-neutral-700"
          >
            Activate (Share Location)
          </button>
          <button
            onClick={() => {
              setActive(false);
              setOpen(false);
              console.log("❌ Location sharing deactivated");
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-neutral-700"
          >
            Deactivate (Hide Location)
          </button>
        </div>
      )}
    </div>
  );
}
