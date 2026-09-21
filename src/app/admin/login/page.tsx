import AuthShell from "../AuthShell";
import LoginForm from "./LoginForm";

export const metadata = { title: "Admin - Aalmaram" };
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
