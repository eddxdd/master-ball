import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarSrc } from "@/lib/profileCosmetics";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useUserCosmetics } from "@/store/profileCosmeticsStore";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

type UserAvatarProps = {
  className?: string;
  /** Fallback when no cosmetic avatar is set: initials (header) or icon (chat). */
  fallback?: "initials" | "icon";
};

/**
 * Signed-in trainer avatar from the profile cosmetics store — shared by the
 * header menu, Professor chat bubbles, etc. so a picker change shows everywhere.
 */
export function UserAvatar({ className, fallback = "initials" }: UserAvatarProps) {
  const user = useAuthStore((state) => state.user);
  const cosmetics = useUserCosmetics(user?.id);
  const src = cosmetics.avatar ? avatarSrc(cosmetics.avatar) : undefined;

  return (
    <Avatar className={cn("size-8 shrink-0", className)}>
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback
        className={cn(
          fallback === "icon" && "bg-secondary text-secondary-foreground",
          src && "bg-transparent",
        )}
      >
        {fallback === "icon" || !user ? (
          <User className="size-[55%]" aria-hidden />
        ) : (
          initials(user.display_name)
        )}
      </AvatarFallback>
    </Avatar>
  );
}
