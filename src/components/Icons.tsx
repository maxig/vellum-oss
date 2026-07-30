// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Icons — original lucide-inspired SVGs, ported from the prototype.
// Server-compatible (no client hooks).
import * as React from "react";

type Props = {
  size?: number;
  stroke?: number;
  fill?: string;
  className?: string;
  style?: React.CSSProperties;
};

const Svg: React.FC<Props & { children: React.ReactNode }> = ({
  size = 16,
  stroke = 1.6,
  fill = "none",
  className,
  style,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {children}
  </svg>
);

export const Icons = {
  Home: (p: Props) => (<Svg {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></Svg>),
  Pipeline: (p: Props) => (<Svg {...p}><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></Svg>),
  Board: (p: Props) => (<Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v16"/></Svg>),
  Comment: (p: Props) => (<Svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></Svg>),
  Users: (p: Props) => (<Svg {...p}><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3.2-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M21 19.5c-.3-2.2-1.6-3.8-3.5-4.4"/></Svg>),
  Briefcase: (p: Props) => (<Svg {...p}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></Svg>),
  Globe: (p: Props) => (<Svg {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 4 5.8 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.8-4-9s1.5-6.4 4-9Z"/></Svg>),
  Chart: (p: Props) => (<Svg {...p}><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-8"/><path d="M22 20H2"/></Svg>),
  Inbox: (p: Props) => (<Svg {...p}><path d="M3 13h4l2 3h6l2-3h4"/><path d="M3 13 5 5a2 2 0 0 1 2-1.5h10a2 2 0 0 1 2 1.5l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/></Svg>),
  Settings: (p: Props) => (<Svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Svg>),
  Search: (p: Props) => (<Svg {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Svg>),
  Bell: (p: Props) => (<Svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></Svg>),
  Plus: (p: Props) => (<Svg {...p}><path d="M12 5v14M5 12h14"/></Svg>),
  Menu: (p: Props) => (<Svg {...p}><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></Svg>),
  Sparkle: (p: Props) => (<Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></Svg>),
  Check: (p: Props) => (<Svg {...p}><path d="m4 12 5 5 11-12"/></Svg>),
  Circle: (p: Props) => (<Svg {...p}><circle cx="12" cy="12" r="9"/></Svg>),
  CheckCircle: (p: Props) => (<Svg {...p}><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.4 2.4 4.6-5.3"/></Svg>),
  ListChecks: (p: Props) => (<Svg {...p}><path d="m3 7 2 2 4-4"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></Svg>),
  ChevronDown: (p: Props) => (<Svg {...p}><path d="m6 9 6 6 6-6"/></Svg>),
  ChevronUp: (p: Props) => (<Svg {...p}><path d="m6 15 6-6 6 6"/></Svg>),
  ChevronRight: (p: Props) => (<Svg {...p}><path d="m9 6 6 6-6 6"/></Svg>),
  ChevronLeft: (p: Props) => (<Svg {...p}><path d="m15 6-6 6 6 6"/></Svg>),
  X: (p: Props) => (<Svg {...p}><path d="M18 6 6 18M6 6l12 12"/></Svg>),
  Filter: (p: Props) => (<Svg {...p}><path d="M3 5h18l-7 9v6l-4-2v-4Z"/></Svg>),
  Mail: (p: Props) => (<Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></Svg>),
  Phone: (p: Props) => (<Svg {...p}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5.5 5.5L14.5 13l5 2v3a2 2 0 0 1-2 2A14 14 0 0 1 4 7a2 2 0 0 1 1-3Z"/></Svg>),
  Calendar: (p: Props) => (<Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Svg>),
  Paperclip: (p: Props) => (<Svg {...p}><path d="M21 11 11.5 20.5a5 5 0 0 1-7-7l9.5-9.5a3.5 3.5 0 0 1 5 5L9 18.5a2 2 0 0 1-3-3l8-8"/></Svg>),
  MapPin: (p: Props) => (<Svg {...p}><path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></Svg>),
  ArrowRight: (p: Props) => (<Svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Svg>),
  ArrowUpRight: (p: Props) => (<Svg {...p}><path d="M7 17 17 7M9 7h8v8"/></Svg>),
  Send: (p: Props) => (<Svg {...p}><path d="M21 3 11 14"/><path d="m21 3-7 18-3-8-8-3 18-7Z"/></Svg>),
  Star: (p: Props) => (<Svg {...p}><path d="m12 3 2.7 5.5 6 .9-4.4 4.2 1 6.1L12 17l-5.3 2.7 1-6.1L3.3 9.4l6-.9L12 3Z"/></Svg>),
  MoreH: (p: Props) => (<Svg {...p}><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/></Svg>),
  Sun: (p: Props) => (<Svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6"/></Svg>),
  Moon: (p: Props) => (<Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></Svg>),
  FileText: (p: Props) => (<Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/></Svg>),
  Linkedin: (p: Props) => (<Svg {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.5M12 17v-4a2.5 2.5 0 0 1 5 0v4M12 13v-3"/></Svg>),
  Github: (p: Props) => (<Svg {...p}><path d="M9 19c-4 1-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.4 4.4 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.4 0C6 1.6 4.9 1.9 4.9 1.9a4.4 4.4 0 0 0-.1 3.2A4.7 4.7 0 0 0 3.5 8.3c0 4.7 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.2V21"/></Svg>),
  Drag: (p: Props) => (<Svg {...p}><circle cx="9" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="18" r="1.2"/></Svg>),
  Clock: (p: Props) => (<Svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Svg>),
  Heart: (p: Props) => (<Svg {...p}><path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11Z"/></Svg>),
  AtSign: (p: Props) => (<Svg {...p}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></Svg>),
  Logout: (p: Props) => (<Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></Svg>),
  Pencil: (p: Props) => (<Svg {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></Svg>),
  TrendUp: (p: Props) => (<Svg {...p}><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></Svg>),
  Eye: (p: Props) => (<Svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></Svg>),
  Trash: (p: Props) => (<Svg {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/><path d="M10 11v6M14 11v6"/></Svg>),
  Upload: (p: Props) => (<Svg {...p}><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 21h14"/></Svg>),
  Refresh: (p: Props) => (<Svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></Svg>),
  Lock: (p: Props) => (<Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></Svg>),
};

export type IconName = keyof typeof Icons;
