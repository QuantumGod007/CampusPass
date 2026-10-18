import { ArrowRight, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
export function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Compass size={30} strokeWidth={1.3} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onAction ? (
        <Button variant="outline" onClick={onAction}>
          {action || "Clear filters"}
          <ArrowRight size={16} />
        </Button>
      ) : (
        <Button asChild>
          <Link to="/">
            Explore events
            <ArrowRight size={16} />
          </Link>
        </Button>
      )}
    </div>
  );
}
