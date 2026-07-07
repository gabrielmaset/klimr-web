import { cn } from "@/lib/utils";

/**
 * The canonical Klimr button. Codifies the pattern already used across the app
 * (pill, `bg-brand text-white font-semibold`, `.press`) into one primitive so
 * every surface converges. Two ways to use it:
 *
 *   <Button variant="primary" size="md">Save</Button>
 *   <Link href="/x" className={buttonVariants({ variant: "secondary" })}>…</Link>
 *
 * `buttonVariants` exists so the ~147 files that render buttons as <Link> or <a>
 * can adopt the exact same styling without being wrapped.
 */

type Variant = "primary" | "dark" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const base =
  "press inline-flex items-center justify-center gap-2 rounded-full font-semibold " +
  "whitespace-nowrap select-none transition-colors " +
  "disabled:opacity-50 disabled:pointer-events-none " +
  "aria-disabled:opacity-50 aria-disabled:pointer-events-none";

const sizes: Record<Size, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-deep",
  dark: "bg-ink text-surface hover:bg-ink-soft",
  secondary: "border border-rule bg-surface text-ink hover:border-faint",
  ghost: "text-ink-soft hover:bg-black/[0.04]",
  danger: "bg-danger text-white hover:bg-danger-deep",
  soft: "bg-tint-brand text-brand-deep hover:bg-brand/15",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, sizes[size], variants[variant], className);
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant, size, className, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}
