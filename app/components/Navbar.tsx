"use client";

import React, { useRef, useState } from "react";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { cn } from "../lib/utils";

interface NavbarProps {
  children: React.ReactNode;
  className?: string;
}

interface NavBodyProps {
  children: React.ReactNode;
  visible?: boolean;
  className?: string;
}

interface NavItemsProps {
  items: { name: string; link: string }[];
  className?: string;
  onItemClick?: () => void;
}

// --- MAIN NAVBAR ---
export const Navbar = ({ children, className }: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const [visible, setVisible] = useState<boolean>(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setVisible(latest > 40);
  });

  return (
    <motion.nav
      ref={ref}
      className={cn(
        "fixed top-5 left-1/2 z-50 w-[92vw] max-w-4xl -translate-x-1/2",
        "rounded-full border border-black/60 dark:border-neutral-900/80",
        "shadow-xl bg-inherit backdrop-blur-lg",
        className
      )}
      animate={{
        y: 0,
        boxShadow: visible
          ? "0px 12px 40px 0px rgba(34,42,53,0.11), 0 2px 8px rgba(34,42,53,0.10)"
          : "0 0 24px rgba(34,42,53,0.06), 0 1px 1px rgba(0,0,0,0.03)",
      }}
      transition={{ type: "spring", stiffness: 180, damping: 36, mass: 0.6 }}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ visible?: boolean }>, { visible })
          : child
      )}
    </motion.nav>
  );
};

// --- NAVBAR BODY ---
export const NavBody = ({ children, className }: NavBodyProps) => (
  <div
    className={cn(
      "flex flex-row items-center justify-between px-6 h-16",
      "w-full",
      className
    )}
  >
    {children}
  </div>
);

// --- NAV ITEMS ---
export const NavItems = ({ items, className, onItemClick }: NavItemsProps) => (
  <div
    className={cn(
      "hidden md:flex flex-row space-x-2 items-center text-[15px] font-medium",
      "text-gray-700 dark:text-gray-300",
      className
    )}
  >
    {items.map((item) => (
      <a
        key={item.name}
        href={item.link}
        onClick={onItemClick}
        className={cn(
          "px-4 py-2 rounded-full transition-colors duration-150",
          "hover:bg-gray-100/80 dark:hover:bg-neutral-800/60"
        )}
      >
        {item.name}
      </a>
    ))}
  </div>
);

// --- LOGO ---
export const NavbarLogo = () => (
  <a
    href="#"
    className="flex flex-row items-center gap-2 ml-2 text-[17px] font-bold text-neutral-900 dark:text-white select-none"
    style={{ letterSpacing: 0.1 }}
  >
    <img
      src="https://assets.aceternity.com/logo-dark.png"
      alt="logo"
      width={32}
      height={32}
      className="rounded"
    />
    <span>V-Nav</span>
  </a>
);

// --- BUTTON ---
export const NavbarButton = ({
  href,
  as: Tag = "a",
  children,
  className,
  variant = "primary",
  ...props
}: {
  href?: string;
  as?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "dark" | "gradient";
} & (
  | React.ComponentPropsWithoutRef<"a">
  | React.ComponentPropsWithoutRef<"button">
)) => {
  const base =
    "px-4 py-2 rounded-full text-[15px] font-bold relative cursor-pointer hover:-translate-y-0.5 transition duration-200 inline-block text-center";

  const variants = {
    primary: "bg-black text-white shadow hover:bg-gray-800",
    secondary:
      "bg-white text-black border border-gray-300 hover:bg-gray-100 dark:bg-neutral-900 dark:text-white dark:border-neutral-700 dark:hover:bg-neutral-800",
    dark: "bg-black text-white",
    gradient: "bg-gradient-to-bl from-blue-500 to-blue-800 text-white",
  };

  return (
    <Tag href={href} className={cn(base, variants[variant], className)} {...props}>
      {children}
    </Tag>
  );
};
