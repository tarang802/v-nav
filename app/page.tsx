"use client";

import Footer from "./components/Footer";
import MapboxMap from "./components/MapboxMap";
import {
  Navbar,
  NavBody,
  NavItems,
  NavbarLogo,
  NavbarButton,
} from "./components/Navbar";
import AddEventPage from "./components/AddEvent";
import SearchBar from "./components/SearchBar";
import AccountToggle from "./components/AccountToggle";

const navItems = [{ name: "Find a Spot", link: "#" }];

export default function Home() {
  return (
    <>
      {/* Floating navbar */}
      <Navbar
        className="
          fixed
          top-5 left-1/2
          z-50
          w-[92vw] max-w-4xl
          -translate-x-1/2
          rounded-full
          border border-gray-100/60 dark:border-neutral-900/80
          shadow-xl
          bg-white/80 dark:bg-neutral-900/80
          backdrop-blur-lg
        "
      >
        <NavBody>
          <NavbarLogo />
          <NavItems items={navItems} />

          {/* ✅ upgraded search bar */}
          <SearchBar />

          {/* ✅ account toggle instead of hardcoded buttons */}
          <div className="hidden md:flex gap-2">
            <AccountToggle />
            <NavbarButton variant="primary">Profile</NavbarButton>
          </div>
        </NavBody>
      </Navbar>

      <main
        className="
          min-h-screen flex flex-col items-center
          bg-gray-100 dark:bg-neutral-950
          pt-32 px-4 sm:px-6 lg:px-8
          transition-colors
          space-y-12
          w-full
        "
      >
        <h1 className="text-center text-3xl font-semibold text-gray-900 dark:text-white">
          Campus Map
        </h1>

        <div className="w-full max-w-5xl h-[600px] rounded-lg shadow-lg overflow-hidden">
          <MapboxMap />
        </div>

        <div className="w-full max-w-5xl">
          <AddEventPage />
        </div>
      </main>

      <Footer />
    </>
  );
}
