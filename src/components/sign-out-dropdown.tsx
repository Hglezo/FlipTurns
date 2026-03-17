"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "@/components/i18n-provider";

export function SignOutDropdown({
  trigger,
  align = "end",
  contentClassName,
}: {
  trigger: React.ReactNode;
  align?: "end" | "center";
  contentClassName?: string;
}) {
  const router = useRouter();
  const { t } = useTranslations();
  const { signOut } = useAuth();
  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={contentClassName}>
        <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("signOut.confirm")}</p>
        <DropdownMenuItem onClick={handleSignOut}>{t("signOut.yes")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
