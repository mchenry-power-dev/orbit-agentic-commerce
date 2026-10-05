import { lazy, Suspense } from "react";
import StudioApp from "./StudioApp";
const V1App = lazy(() => import("./V1App"));

export default function App() {
  return new URLSearchParams(location.search).get("legacy") === "1" ? (
    <Suspense fallback={<p role="status">Opening preserved V1 workspace…</p>}>
      <V1App />
    </Suspense>
  ) : (
    <StudioApp />
  );
}
