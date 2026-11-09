import React from "react";

export type IconName =
  | "archive"
  | "arrow-down"
  | "arrow-up"
  | "capture"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "copy"
  | "crop"
  | "download"
  | "edit"
  | "image"
  | "menu"
  | "more"
  | "pin"
  | "plus"
  | "prompt"
  | "refresh"
  | "search"
  | "settings"
  | "share"
  | "stop"
  | "trash"
  | "volume";

const paths: Record<IconName, React.ReactNode> = {
  archive: <><path d="M4 7.5h16v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-11Z" /><path d="M3 4h18v3.5H3zM9 11h6" /></>,
  "arrow-down": <><path d="M12 4v15m-6-6 6 6 6-6" /></>,
  "arrow-up": <><path d="M12 20V5m-6 6 6-6 6 6" /></>,
  capture: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4M7 8h3M7 8v3m10 2h-3m3 0v-3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  crop: <><path d="M6 3v15a2 2 0 0 0 2 2h13M3 6h15a2 2 0 0 1 2 2v13" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" /></>,
  edit: <><path d="m14.5 5.5 4 4M4 20l3.5-.7L19 7.8a1.4 1.4 0 0 0 0-2L17.2 4a1.4 1.4 0 0 0-2 0L4 15.5V20Z" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 2-2 5 5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  pin: <><path d="m9 4 6 0 1 6 3 3v1H5v-1l3-3 1-6Z" /><path d="M12 14v7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  prompt: <><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="m9 8-2 2 2 2m4 0h4" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M18.2 16a8 8 0 1 1 1.5-7L20 12" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5m-7.6 6.9 7.6 4.5" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4Zm-3 4 1 14h10l1-14M10 11v6m4-6v6" /></>,
  volume: <><path d="M5 10v4h3l4 4V6l-4 4H5Z" /><path d="M15 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" /></>,
};

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      className={"icon " + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
