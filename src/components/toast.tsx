import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { Check, CircleAlert, X } from "lucide-react";
interface Toast {
  id: number;
  message: string;
  error: boolean;
}
const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const notify = (message: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, message, error }]);
    timers.current.push(
      setTimeout(
        () => setToasts((current) => current.filter((t) => t.id !== id)),
        4500,
      ),
    );
  };
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            className={`toast ${toast.error ? "toast-error" : ""}`}
            key={toast.id}
            role="status"
          >
            {toast.error ? <CircleAlert size={18} /> : <Check size={18} />}
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              className="icon-button"
              onClick={() =>
                setToasts((t) => t.filter((item) => item.id !== toast.id))
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  return useContext(ToastContext);
}
