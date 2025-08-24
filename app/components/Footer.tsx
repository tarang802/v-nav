"use client";

export default function Footer() {
  return (
    <footer
      className="
        w-full
        mt-16
        border-t border-gray-200 dark:border-neutral-800
        bg-white/80 dark:bg-neutral-900/80
        backdrop-blur-lg
        shadow-inner
        px-6 py-4
        flex flex-col sm:flex-row items-center justify-between
        text-sm text-gray-600 dark:text-gray-400
      "
    >
      {/* Left side */}
      <p className="mb-2 sm:mb-0">
        © {new Date().getFullYear()} Campus Map. All rights reserved.
      </p>

      {/* Right side */}
      <div className="flex gap-4">
        <a href="#" className="hover:text-gray-900 dark:hover:text-gray-200">
          Privacy Policy
        </a>
        <a href="#" className="hover:text-gray-900 dark:hover:text-gray-200">
          Terms of Service
        </a>
        <a href="#" className="hover:text-gray-900 dark:hover:text-gray-200">
          Contact
        </a>
      </div>
    </footer>
  );
}
