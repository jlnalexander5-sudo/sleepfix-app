export const dynamic = "force-dynamic";
import ForgotPasswordForm from "@/components/forgot-password-form";

export default function Page() {
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Forgot password</h1>
      <ForgotPasswordForm />
    </div>
  );
}
