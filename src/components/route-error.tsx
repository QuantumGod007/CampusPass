import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
export function RouteError() {
  return (
    <main className="container page">
      <div className="empty-state">
        <h1>Let’s try that page again.</h1>
        <p>
          A page could not be opened. Refresh to load the latest app, or return
          to Discovery. Your saved demo data stays in this browser.
        </p>
        <div className="pass-actions">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw size={16} />
            Refresh page
          </Button>
          <Button asChild variant="outline">
            <a href="/">
              Back to Discover
              <ArrowRight size={16} />
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}
