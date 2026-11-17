import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary";

interface StyleProps {
  variant?: Variant;
  small?: boolean;
}

function classes({ variant = "primary", small }: StyleProps, className?: string) {
  return cn("btn", `btn--${variant}`, small && "btn--small", className);
}

export function ButtonLink({
  variant,
  small,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={classes({ variant, small }, className)} {...props} />;
}

export function Button({
  variant,
  small,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps) {
  return <button type={type} className={classes({ variant, small }, className)} {...props} />;
}
