import { currentStaff } from "@/lib/auth/staff";
import { SignOutButton } from "@/components/sign-out-button";

/** Server component: who is signed in on this iPad, and a way out. */
export async function StaffBadge() {
  const staff = await currentStaff();
  if (!staff) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>
        <span className="font-medium">{staff.name}</span>
        <span className="ml-1 text-xs capitalize text-muted-foreground">{staff.role.replace("_", " ")}</span>
      </span>
      <SignOutButton />
    </div>
  );
}
