interface ConnectorIconProps {
  name: string;
  size?: number;
  className?: string;
}

const CONNECTOR_COLORS: Record<string, { bg: string; fg: string }> = {
  slack: { bg: "#4A154B", fg: "#E01E5A" },
  notion: { bg: "#000000", fg: "#FFFFFF" },
  github: { bg: "#24292E", fg: "#FFFFFF" },
  linear: { bg: "#5E6AD2", fg: "#FFFFFF" },
  sentry: { bg: "#362D59", fg: "#FB4226" },
  asana: { bg: "#F06A6A", fg: "#FFFFFF" },
  amplitude: { bg: "#1B1F3B", fg: "#00BFFF" },
  intercom: { bg: "#1F8DED", fg: "#FFFFFF" },
  atlassian: { bg: "#0052CC", fg: "#FFFFFF" },
  jira: { bg: "#0052CC", fg: "#FFFFFF" },
  docx: { bg: "#2B579A", fg: "#FFFFFF" },
};

const CONNECTOR_LETTERS: Record<string, string> = {
  slack: "#",
  notion: "N",
  github: "GH",
  linear: "Li",
  sentry: "S",
  asana: "A",
  amplitude: "Am",
  intercom: "Ic",
  atlassian: "At",
  jira: "J",
  docx: "D",
};

export function ConnectorIcon({
  name,
  size = 20,
  className = "",
}: ConnectorIconProps) {
  const key = name.toLowerCase();
  const colors = CONNECTOR_COLORS[key] ?? { bg: "#374151", fg: "#9CA3AF" };
  const letter = CONNECTOR_LETTERS[key] ?? name[0]?.toUpperCase() ?? "?";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colors.bg,
        color: colors.fg,
        fontSize: size * 0.45,
        fontWeight: 700,
        lineHeight: 1,
        border: "1px solid rgba(255,255,255,0.1)",
      }}
      title={name}
    >
      {letter}
    </span>
  );
}
