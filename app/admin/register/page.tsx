import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Admin registration" };

export default function Page() {
  return <AuthForm mode="admin-register" />;
}
