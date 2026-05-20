import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Simple unique ID generator
export function uid() {
  return Math.random().toString(36).substring(2, 9)
}
