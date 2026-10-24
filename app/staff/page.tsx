import type { Metadata } from "next";
import StaffDashboard from "./StaffDashboard";

// Unlisted, not protected: it shows only data the public page already shows.
// Real staff auth is a stretch goal.
export const metadata: Metadata = {
  title: "Staff Dashboard · School Feedback",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return <StaffDashboard />;
}
