"use client";

import MapboxMap from "./components/MapboxMap";
import { Navbar, NavBody, NavItems, NavbarLogo, NavbarButton } from "./components/Navbar";

const navItems = [
  { name: "Home", link: "#" },
  { name: "Map", link: "#map" },
  { name: "Events", link: "#events" },
];

export default function Home() {
  return (
    <>
      {/* Floating navbar that inherits the page background (syncs with RootLayout) */}
      <Navbar
        className="
          fixed
          top-5 left-1/2
          z-50
          w-[92vw] max-w-4xl
          -translate-x-1/2
          rounded-full
          border border-black-100/60 dark:border-neutral-900/80
          shadow-xl
          bg-inherit
          backdrop-blur-lg
        "
      >
        <NavBody>
          <NavbarLogo />
          <NavItems items={navItems} />
          <div className="hidden md:flex gap-2">
            <NavbarButton variant="secondary">Login</NavbarButton>
            <NavbarButton variant="primary">Book a call</NavbarButton>
          </div>
        </NavBody>
      </Navbar>

      <main
        className="
          min-h-screen flex flex-col items-center
          bg-gray-100 dark:bg-neutral-950
          pt-32 px-4 sm:px-6 lg:px-8
          transition-colors
        "
      >
        <h1 className="mb-6 text-center text-3xl font-semibold text-gray-900 dark:text-white">
          Campus Map
        </h1>

        <div className="w-full max-w-5xl h-[600px] rounded-lg shadow-lg overflow-hidden">
          <MapboxMap />
        </div>
      </main>
    </>
  );
}
