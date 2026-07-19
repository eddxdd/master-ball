import { useMutation } from "@tanstack/react-query";
import { Camera, LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ProfileCosmeticsPicker } from "@/components/ProfileCosmeticsPicker";
import { Seo } from "@/components/Seo";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/config/branding";
import { ApiError } from "@/lib/api";
import { updateProfile } from "@/lib/authApi";
import { bannerSrc, type CosmeticChoice, type ProfileCosmeticKind } from "@/lib/profileCosmetics";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useProfileCosmeticsStore, useUserCosmetics } from "@/store/profileCosmeticsStore";

/** Discord-style partial mask: `ab******@domain.com`. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(6)}${domain}`;
}

function formatJoined(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

type EditingField = "displayName" | null;

/**
 * Discord-style account panel: clickable banner + overlapping avatar (picker
 * modal), labeled field rows, then password / session sections.
 */
export function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();

  const cosmetics = useUserCosmetics(user?.id);
  const setAvatar = useProfileCosmeticsStore((s) => s.setAvatar);
  const setBanner = useProfileCosmeticsStore((s) => s.setBanner);

  const [editing, setEditing] = useState<EditingField>(null);
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [pickerKind, setPickerKind] = useState<ProfileCosmeticKind | null>(null);

  const updateMutation = useMutation({
    mutationFn: () => updateProfile(displayName.trim()),
    onSuccess: (updatedUser) => {
      if (token) setAuth(token, updatedUser);
      setEditing(null);
    },
  });

  if (!user) return null;

  const joined = formatJoined(user.created_at);
  const canSaveDisplayName =
    displayName.trim().length > 0 &&
    displayName.trim() !== user.display_name &&
    !updateMutation.isPending;

  const bannerStyle = cosmetics.banner
    ? {
        backgroundImage:
          `linear-gradient(to top, rgb(0 0 0 / 0.4), rgb(0 0 0 / 0.15)), ` +
          `url(${bannerSrc(cosmetics.banner)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background:
          "linear-gradient(160deg, rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.65)), " +
          "url('/images/masterball.png') center / cover no-repeat",
      };

  const applyChoice = (choice: CosmeticChoice) => {
    if (pickerKind === "avatar") setAvatar(user.id, choice);
    if (pickerKind === "banner") setBanner(user.id, choice);
  };

  return (
    <div id="account-page" className="mx-auto w-full max-w-xl">
      <Seo title="My Account" description={`Manage your ${APP_NAME} account.`} noindex />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <button
          type="button"
          className="group relative h-[120px] w-full cursor-pointer"
          style={bannerStyle}
          onClick={() => setPickerKind("banner")}
          aria-label="Change banner"
        >
          {!cosmetics.banner && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm font-semibold tracking-wide text-white/30 transition group-hover:text-white/90">
              <Camera className="size-5 opacity-70" aria-hidden />
              Banner
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-white/70 text-white">
              <Camera className="size-6 drop-shadow" aria-hidden />
            </span>
          </span>
        </button>

        <div className="px-5 pb-6 sm:px-6">
          <div className="relative z-10 -mt-12 mb-4">
            <button
              type="button"
              className="group relative cursor-pointer rounded-full"
              onClick={() => setPickerKind("avatar")}
              aria-label="Change avatar"
            >
              <UserAvatar
                className={cn(
                  "size-24 border-[6px] border-card text-xl font-semibold text-white",
                  !cosmetics.avatar && "bg-[image:var(--gradient-brand)]",
                  "after:border-transparent *:data-[slot=avatar-fallback]:bg-transparent *:data-[slot=avatar-fallback]:text-xl *:data-[slot=avatar-fallback]:font-semibold *:data-[slot=avatar-fallback]:text-white",
                )}
              />
              <span className="pointer-events-none absolute inset-[6px] flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                <Camera className="size-6 text-white drop-shadow" aria-hidden />
              </span>
            </button>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">{user.display_name}</h1>
            {joined && <p className="mt-1 text-sm text-muted-foreground">Trainer since {joined}</p>}
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Display Name
              </p>
              {editing === "displayName" ? (
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSaveDisplayName) updateMutation.mutate();
                  }}
                >
                  <Input
                    id="account-display-name"
                    autoFocus
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="flex-1"
                  />
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="submit"
                      variant="gradient"
                      size="sm"
                      disabled={!canSaveDisplayName}
                    >
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDisplayName(user.display_name);
                        setEditing(null);
                        updateMutation.reset();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">{user.display_name}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setDisplayName(user.display_name);
                      setEditing("displayName");
                      updateMutation.reset();
                    }}
                  >
                    Edit
                  </Button>
                </div>
              )}
              {updateMutation.isError && (
                <p className="text-destructive text-sm">
                  {updateMutation.error instanceof ApiError
                    ? updateMutation.error.message
                    : "Couldn't update your profile."}
                </p>
              )}
              {updateMutation.isSuccess && editing === null && (
                <p className="text-success text-sm">Profile updated.</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Email
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">{maskEmail(user.email)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <h2 className="text-base font-semibold">Password and Authentication</h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Password reset by email isn't available yet. Use the password you chose at signup.
            </p>
            <Button type="button" variant="secondary" disabled>
              Change Password
            </Button>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <h2 className="text-base font-semibold">Session</h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Sign out on this device. You'll need your email and password to log back in.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              <LogOut />
              Log out
            </Button>
          </div>

          <div className="mt-8 border-t border-destructive/20 pt-6">
            <h2 className="text-base font-semibold">Account Removal</h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Account deletion isn't available yet. Contact support if you need a trainer profile
              removed.
            </p>
            <Button type="button" variant="destructive" disabled>
              Delete Account
            </Button>
          </div>
        </div>
      </section>

      {pickerKind && (
        <ProfileCosmeticsPicker
          kind={pickerKind}
          selected={pickerKind === "avatar" ? cosmetics.avatar : cosmetics.banner}
          onSelect={applyChoice}
          onClose={() => setPickerKind(null)}
        />
      )}
    </div>
  );
}
