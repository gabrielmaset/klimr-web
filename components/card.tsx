import { cn } from "@/lib/utils";

/**
 * The canonical Klimr surface. Codifies the dominant pattern
 * (`rounded-2xl border border-rule bg-surface shadow-e1`, 188 occurrences) into one
 * primitive with consistent radius / padding / elevation / interaction.
 *
 *   <Card>…</Card>                          // resting card
 *   <Card interactive>…</Card>              // linked card that lifts on hover
 *   <Card elevated radius="xl">…</Card>     // raised feature card
 *
 * `cardClasses` mirrors `buttonVariants` so existing markup can adopt the
 * styling without being wrapped.
 */

type Pad = "none" | "sm" | "md" | "lg";
type Radius = "md" | "lg" | "xl";

const pads: Record<Pad, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

// lg (rounded-2xl) is the house default — the 188× dominant pattern.
const radii: Record<Radius, string> = {
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
};

export function cardClasses({
  pad = "md",
  radius = "lg",
  interactive = false,
  elevated = false,
  className,
}: {
  pad?: Pad;
  radius?: Radius;
  interactive?: boolean;
  elevated?: boolean;
  className?: string;
} = {}) {
  return cn(
    "border border-rule bg-surface shadow-e1",
    radii[radius],
    pads[pad],
    elevated && "shadow-e2",
    interactive && "lift cursor-pointer",
    className,
  );
}

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  pad?: Pad;
  radius?: Radius;
  interactive?: boolean;
  elevated?: boolean;
};

export function Card({
  pad,
  radius,
  interactive,
  elevated,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cardClasses({ pad, radius, interactive, elevated, className })}
      {...props}
    />
  );
}
