import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const eventDate = (date: string) => format(new Date(date), "EEE, MMM d");
export const eventTime = (date: string) => format(new Date(date), "h:mm a");
export const readableDate = (date: string) =>
  format(new Date(date), "d MMMM yyyy");
export function localDateInput(date: string) {
  return format(new Date(date), "yyyy-MM-dd'T'HH:mm");
}
