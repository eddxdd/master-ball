import { ArrowRight, Bookmark, Layers, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/branding";
import { useAuthStore } from "@/store/authStore";

const PERKS = [
  { icon: Layers, label: "Save multiple named teams" },
  { icon: Bookmark, label: "Pick up where you left off" },
  { icon: Sparkles, label: "Full toolkit + Professor" },
] as const;

/** Full-bleed Master Ball parallax CTA — invites account signup (or sends
 * signed-in users to their account). Same `background-attachment: fixed`
 * trick as the old type-coverage banner; keep transforms off ancestors. */
export function AccountCTABanner() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="home-account-cta"
      ref={ref}
      className="relative mr-[calc(50%-50vw)] ml-[calc(50%-50vw)] w-screen overflow-hidden border-y border-border py-24 shadow-[0_-12px_40px_-8px_rgb(0_0_0_/_0.45),0_12px_40px_-8px_rgb(0_0_0_/_0.45)] sm:py-32"
      style={{
        background:
          "linear-gradient(rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.55)), " +
          "url('/images/masterball.png') center / cover no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div
        className={`relative mx-auto flex max-w-xl flex-col items-center gap-4 px-6 text-center transition-all duration-700 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl">Create a trainer profile</h2>
        <p className="text-balance text-white/80 sm:text-lg">
          Keep your place in {APP_NAME} — named teams, progress, and whatever we ship next. Sign up
          in under a minute.
        </p>

        <ul className="mt-1 flex flex-wrap justify-center gap-2">
          {PERKS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur"
            >
              <Icon className="size-3.5 text-[#f8d030]" aria-hidden />
              {label}
            </li>
          ))}
        </ul>

        {user ? (
          <Button render={<Link to="/account" />} variant="gradient" size="lg" className="mt-2">
            Open your account <ArrowRight />
          </Button>
        ) : (
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button render={<Link to="/signup" />} variant="gradient" size="lg">
              Sign up <ArrowRight />
            </Button>
            <Button
              render={<Link to="/login" />}
              variant="default"
              size="lg"
              className="!border-white/25 !bg-black/50 text-white hover:!bg-black/70"
            >
              Log in
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
