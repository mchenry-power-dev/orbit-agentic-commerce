import V1App from "./V1App";
import StudioApp from "./StudioApp";

export default function App() {
  return new URLSearchParams(location.search).get("legacy") === "1" ? <V1App /> : <StudioApp />;
}
