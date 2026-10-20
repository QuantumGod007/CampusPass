import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Code2,
  Compass,
  MapPin,
  Palette,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { isWithinInterval, endOfDay, addDays } from "date-fns";
import { motion } from "motion/react";
import { useStore } from "../../app/store";
import { categories, type Category } from "../../types";
import { EventCard, Poster, BookmarkButton } from "./event-card";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { eventDate } from "../../lib/utils";
import { seatsLeft } from "../../lib/domain";
const icons = [Code2, Zap, Users, Sparkles, Trophy, ArrowUpRight, Palette];
export function Discover() {
  const { state, now } = useStore();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Category[]>([]);
  const [date, setDate] = useState("all");
  const [sort, setSort] = useState("soonest");
  const [available, setAvailable] = useState(false);
  const featured =
    state.events.find(
      (e) => e.id === "buildfest" && Date.parse(e.start) > now,
    ) || state.events.find((e) => Date.parse(e.start) > now);
  const filtered = useMemo(
    () =>
      state.events
        .filter((e) => {
          const matchesSearch =
            `${e.title} ${e.category} ${e.venue} ${e.organizer}`
              .toLowerCase()
              .includes(query.trim().toLowerCase());
          const matchesCategory =
            selected.length === 0 || selected.includes(e.category);
          const start = new Date(e.start);
          const matchesDate =
            date === "all" ||
            (date === "past"
              ? start.getTime() <= now
              : start.getTime() > now &&
                isWithinInterval(start, {
                  start: new Date(now),
                  end: endOfDay(
                    addDays(new Date(now), date === "week" ? 7 : 30),
                  ),
                }));
          return (
            matchesSearch &&
            matchesCategory &&
            matchesDate &&
            (!available ||
              (seatsLeft(e, state.registrations) > 0 &&
                Date.parse(e.start) > now))
          );
        })
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "availability"
              ? seatsLeft(b, state.registrations) -
                seatsLeft(a, state.registrations)
              : Date.parse(a.start) - Date.parse(b.start),
        ),
    [state, now, query, selected, date, sort, available],
  );
  const hasFilters =
    !!query || selected.length > 0 || date !== "all" || available;
  function clearFilters() {
    setQuery("");
    setSelected([]);
    setDate("all");
    setAvailable(false);
    setSort("soonest");
  }
  return (
    <div className="container discover-page">
      <section className="hero" aria-labelledby="hero-title">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <p className="eyebrow">
            <span className="tiny-star">✳</span> LIFE BEYOND THE LECTURE HALL
          </p>
          <h1 id="hero-title">
            Make room for
            <br />
            the <em>unexpected.</em>
          </h1>
          <p className="hero-description">
            The late-night builds. The front-row moments.
            <br className="desktop-break" /> The people you haven’t met yet.
            Find your next thing.
          </p>
          <Button asChild className="hero-cta">
            <a href="#explore">
              Explore what’s on <ArrowDown size={17} />
            </a>
          </Button>
          <div className="hero-note">
            <span className="mini-art mini-blue">
              <Code2 size={19} />
            </span>
            <span className="mini-art mini-coral">
              <Palette size={19} />
            </span>
            <span className="mini-art mini-lime">
              <Sparkles size={18} />
            </span>
            <span>A campus full of possibilities.</span>
          </div>
        </motion.div>
        {featured && (
          <motion.article
            className="featured-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            <div className="feature-image">
              <Link
                to={`/events/${featured.id}`}
                aria-label={`Explore ${featured.title}`}
              >
                <Poster event={featured} />
              </Link>
              <span className="featured-label">
                <span />
                IN THE SPOTLIGHT
              </span>
              <BookmarkButton event={featured} />
            </div>
            <div className="feature-info">
              <div>
                <p className="eyebrow feature-date">
                  {eventDate(featured.start)} <span>·</span> {featured.category}
                </p>
                <h2>
                  <Link to={`/events/${featured.id}`}>{featured.title}</Link>
                </h2>
                <p>
                  <MapPin size={14} />
                  {featured.venue}
                </p>
              </div>
              <Link
                className="feature-arrow"
                to={`/events/${featured.id}`}
                aria-label={`View ${featured.title} details`}
              >
                <ArrowUpRight size={24} />
              </Link>
            </div>
          </motion.article>
        )}
      </section>
      <div className="campus-strip">
        <span>
          <span className="status-dot" /> YOUR CAMPUS, IN MOTION
        </span>
        <p>
          Find your people. Try something new. <span>Just show up.</span>
        </p>
        <Compass size={19} strokeWidth={1.5} />
      </div>
      <section
        id="explore"
        className="explore-section"
        aria-labelledby="explore-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow muted">THE CAMPUS EDIT</p>
            <h2 id="explore-title">
              Find your next thing<span className="blue-dot">.</span>
            </h2>
          </div>
          <span className="event-count">
            {state.events.length} experiences. Plenty of possibilities.
          </span>
        </div>
        <div className="search-row">
          <div className="search-box">
            <Search size={19} />
            <label className="sr-only" htmlFor="event-search">
              Search events
            </label>
            <input
              id="event-search"
              ref={searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, interests, or a little inspiration…"
            />
            {query && (
              <button
                className="icon-button"
                onClick={() => {
                  setQuery("");
                  searchInput.current?.focus();
                }}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            <span className="search-shortcut">Explore</span>
          </div>
          <div className="date-filter">
            <CalendarDays size={17} />
            <label className="sr-only" htmlFor="date-filter">
              Filter by date
            </label>
            <select
              id="date-filter"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              <option value="all">Any date</option>
              <option value="week">Next 7 days</option>
              <option value="month">Next 30 days</option>
              <option value="past">Past events</option>
            </select>
          </div>
        </div>
        <div className="category-filters" aria-label="Filter by category">
          <button
            className={`filter-chip ${selected.length === 0 ? "active" : ""}`}
            onClick={() => setSelected([])}
            aria-pressed={selected.length === 0}
          >
            <Compass size={15} />
            All events
          </button>
          {categories.map((category, i) => {
            const Icon = icons[i];
            return (
              <button
                key={category}
                className={`filter-chip ${selected.includes(category) ? "active" : ""}`}
                aria-pressed={selected.includes(category)}
                onClick={() =>
                  setSelected((current) =>
                    current.includes(category)
                      ? current.filter((c) => c !== category)
                      : [...current, category],
                  )
                }
              >
                <Icon size={15} />
                {category}
              </button>
            );
          })}
        </div>
        <div className="results-toolbar">
          <div className="results-info">
            <span>
              {filtered.length} {filtered.length === 1 ? "event" : "events"} to
              explore
            </span>
            {hasFilters && (
              <button className="text-button" onClick={clearFilters}>
                Clear filters <X size={12} />
              </button>
            )}
          </div>
          <div className="sort-controls">
            <label className="availability-filter">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
              />
              Spots available
            </label>
            <span className="sort-divider" />
            <SlidersHorizontal size={14} />
            <label className="sr-only" htmlFor="sort">
              Sort events
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="soonest">Soonest first</option>
              <option value="title">Title A–Z</option>
              <option value="availability">Most spots</option>
            </select>
          </div>
        </div>
        {filtered.length > 0 ? (
          <div className="events-grid">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="A little too specific?"
            description="No events match these filters. Try another interest or give your search a little more room."
            onAction={clearFilters}
          />
        )}
      </section>
      <section className="organizer-banner">
        <span className="banner-icon">
          <Sparkles size={26} strokeWidth={1.4} />
        </span>
        <div>
          <p className="eyebrow">FOR THE ONES WHO MAKE IT HAPPEN</p>
          <h2>Got an idea? Make it an event.</h2>
          <p>Bring your club, your community, or your wildest idea together.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/organizer">
            Open organizer studio <ArrowRight size={16} />
          </Link>
        </Button>
      </section>
    </div>
  );
}
