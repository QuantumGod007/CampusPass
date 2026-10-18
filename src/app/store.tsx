import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState } from "../types";
import { createSeed } from "../data/seed";
import {
  cancelRegistration,
  makeRegistration,
  saveOrganizerEvent,
} from "../lib/domain";
import { loadStorage, parseStoredState, STORAGE_KEY } from "../lib/storage";
interface Store {
  state: AppState;
  now: number;
  notice: string;
  register: (eventId: string, values: unknown) => string;
  cancel: (id: string) => void;
  toggleBookmark: (id: string) => boolean;
  saveEvent: (values: unknown, id?: string) => string;
  reset: () => void;
  dismissNotice: () => void;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadStorage);
  const [state, dispatch] = useReducer(
    (_state: AppState, next: AppState) => next,
    initial.state,
  );
  const current = useRef(initial.state);
  const [notice, setNotice] = useState(initial.notice);
  const [now, setNow] = useState(Date.now);
  function commit(next: AppState) {
    current.current = next;
    dispatch(next);
  }
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Surface a failed browser-storage write; this runs only when data changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice(
        "Browser storage is unavailable or full. Changes will last only for this session.",
      );
    }
  }, [state]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      // A null key is the browser's signal that another tab called clear().
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      try {
        if (e.storageArea && e.storageArea !== window.localStorage) return;
        commit(e.newValue ? parseStoredState(e.newValue) : createSeed());
      } catch {
        setNotice(
          "Another tab wrote invalid demo data. Your current session has been preserved.",
        );
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    const timer = window.setInterval(updateTime, 15000);
    window.addEventListener("focus", updateTime);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateTime);
    };
  }, []);
  const store: Store = {
    state,
    now,
    notice,
    dismissNotice: () => setNotice(""),
    register: (eventId, values) => {
      const result = makeRegistration(current.current, eventId, values);
      commit(result.state);
      return result.registration.id;
    },
    cancel: (id) => commit(cancelRegistration(current.current, id)),
    toggleBookmark: (id) => {
      if (!current.current.events.some((e) => e.id === id)) return false;
      const saved = current.current.bookmarks.some((b) => b.eventId === id);
      commit({
        ...current.current,
        bookmarks: saved
          ? current.current.bookmarks.filter((b) => b.eventId !== id)
          : [...current.current.bookmarks, { eventId: id }],
      });
      return !saved;
    },
    saveEvent: (values, id) => {
      const result = saveOrganizerEvent(current.current, values, id);
      commit(result.state);
      return result.event.id;
    },
    reset: () => {
      commit(createSeed());
      setNotice("");
    },
  };
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useStore() {
  const context = useContext(Context);
  if (!context) throw new Error("StoreProvider is missing");
  return context;
}
