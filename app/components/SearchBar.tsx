"use client";

import { useState, useEffect, useRef } from "react";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load saved history on first render
  useEffect(() => {
    const saved = localStorage.getItem("searchHistory");
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  // Save history whenever it changes
  useEffect(() => {
    localStorage.setItem("searchHistory", JSON.stringify(history));
  }, [history]);

  const handleSearch = (value: string, clearAfter = true) => {
    if (!value) return;

    // Update state immediately (no refresh needed)
    setHistory((prev) => {
      const newHistory = prev.includes(value)
        ? [value, ...prev.filter((h) => h !== value)] // move to top if exists
        : [value, ...prev].slice(0, 5); // max 5 items
      return newHistory;
    });

    setQuery(clearAfter ? "" : value); // clear only on Enter
    setShowDropdown(false);
  };

  // Hide dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSearch(query, true); // ✅ clears after Enter
          }
        }}
        placeholder="Find my friend..."
        className="w-full px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-700
                   bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-gray-200
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Dropdown */}
      {showDropdown && history.length > 0 && (
        <div className="absolute mt-1 w-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
          {history.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSearch(item, false)} // ✅ refill input
              className="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700"
            >
              {item}
            </button>
          ))}
          <button
            onClick={() => {
              setHistory([]);
              localStorage.removeItem("searchHistory");
            }}
            className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-100 dark:hover:bg-red-900"
          >
            Clear History
          </button>
        </div>
      )}
    </div>
  );
}
