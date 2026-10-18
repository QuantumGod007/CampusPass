export const categories = [
  "Technology",
  "Hackathons",
  "Workshops",
  "Cultural",
  "Sports",
  "Entrepreneurship",
  "Design",
] as const;
export type Category = (typeof categories)[number];
export const themes = [
  "build",
  "design",
  "ai",
  "startup",
  "coffee",
  "film",
  "robot",
  "photo",
  "source",
  "music",
  "product",
  "sport",
] as const;
export type PosterTheme = (typeof themes)[number];
export interface CampusEvent {
  id: string;
  title: string;
  category: Category;
  description: string;
  start: string;
  end: string;
  venue: string;
  organizer: string;
  capacity: number;
  initialReservations: number;
  theme: PosterTheme;
  createdLocally: boolean;
  agenda: { time: string; title: string }[];
}
export type OrganizerEvent = CampusEvent & { createdLocally: true };
export interface Registration {
  id: string;
  eventId: string;
  fullName: string;
  email: string;
  mobile: string;
  prn: string;
  department: string;
  year: string;
  note: string;
  consent: boolean;
  createdAt: string;
  status: "confirmed" | "cancelled";
}
export interface Bookmark {
  eventId: string;
}
export interface AppState {
  version: 1;
  events: CampusEvent[];
  registrations: Registration[];
  bookmarks: Bookmark[];
}
