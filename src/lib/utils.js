import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Safely parse one or multiple photo URLs from orders.photo_url
export function parsePhotoUrls(photoUrl) {
  if (!photoUrl) return [];
  if (Array.isArray(photoUrl)) return photoUrl;
  if (typeof photoUrl === 'string') {
    const trimmed = photoUrl.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {}
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}
