import type { ReactNode } from "react";
import { ArrowLeft, Ticket } from "lucide-react";
import { Link } from "react-router-dom";
import "./auth.css";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="container auth-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} /> Back to campus
      </Link>
      <div className="auth-screen">
        <aside className="auth-visual" aria-label="Life beyond the classroom">
          <span className="auth-edition">
            <Ticket size={18} /> CAMPUSPASS / STUDENT ACCOUNTS
          </span>
          <h2>
            Make room for
            <br />
            <em>something good.</em>
          </h2>
          <p>
            The late-night ideas. The people you haven’t met. The plans that
            become your favorite stories.
          </p>
          <div className="auth-poster-stack" aria-hidden="true">
            <img src="/posters/build.svg" alt="" />
            <img src="/posters/music.svg" alt="" />
            <img src="/posters/design.svg" alt="" />
          </div>
          <div className="auth-visual-footer">
            <span>ONE CAMPUS. SO MANY POSSIBILITIES.</span>
            <span>01 / ∞</span>
          </div>
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow muted">YOUR NEXT CHAPTER</p>
          <h1 id="auth-title">
            {title}
            <span className="blue-dot">.</span>
          </h1>
          <p className="auth-description">{description}</p>
          {children}
        </section>
      </div>
    </div>
  );
}
