import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/((?!login|api/auth|api/health/ingest|manifest.webmanifest|icons|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
