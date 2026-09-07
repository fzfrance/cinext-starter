"use client";

import { useAppLanguageBoot } from "@/lib/languages";

/** Applies stored App Language to <html lang> after hydration. */
export default function AppLanguageBoot() {
  useAppLanguageBoot();
  return null;
}
