import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Admin sign in" };

export default function Page() {
  return <AuthForm mode="admin-login" />;
}
