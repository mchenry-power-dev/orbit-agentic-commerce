import type { CSSProperties } from "react";
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  const paths: Record<string, string> = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    layers: "m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5",
    clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    arrow: "M5 12h14M13 6l6 6-6 6",
    check: "m5 12 4 4L19 6",
    plus: "M12 5v14M5 12h14",
    download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
    image: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01",
    copy: "M9 9h12v12H9zM15 9V3H3v12h6",
    close: "m6 6 12 12M6 18 18 6",
    refresh: "M20 7v5h-5M4 17v-5h5M20 12a8 8 0 0 0-14-5M4 12a8 8 0 0 0 14 5",
    file: "M14 2H4v20h16V8l-6-6ZM14 2v6h6M8 13h8M8 17h6",
    alert: "m12 3 10 18H2L12 3ZM12 9v5M12 17h.01",
    spark: "m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z",
  };
  if (name === "orbit")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        style={style}
      >
        <circle cx="18" cy="18" r="8" stroke="currentColor" strokeWidth="1.8" />
        <ellipse
          cx="18"
          cy="18"
          rx="17"
          ry="6.5"
          transform="rotate(-32 18 18)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="29" cy="9" r="2.6" fill="currentColor" />
      </svg>
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.file} />
    </svg>
  );
}
