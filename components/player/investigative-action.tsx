import type { ButtonHTMLAttributes, ReactNode } from "react";

type InvestigativeActionProps = {
  children?: ReactNode;
  className?: string;
  "data-guide"?: string;
  href?: string;
  intent?: "primary" | "secondary";
  label?: string;
  rel?: string;
  target?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

/**
 * Project-owned action surface. Its four dots and dashed drawing order come
 * from the verified ThreeUI dot-border-button source; the player stylesheet
 * supplies the surface, type, and colors.
 */
export function InvestigativeAction({
  children,
  className = "",
  "data-guide": dataGuide,
  href,
  intent = "primary",
  label,
  rel,
  target,
  ...buttonProps
}: InvestigativeActionProps) {
  const content = <><span className="investigative-action__label">{children ?? label}</span><span aria-hidden="true" className="investigative-action__line investigative-action__line--top" /><span aria-hidden="true" className="investigative-action__line investigative-action__line--right" /><span aria-hidden="true" className="investigative-action__line investigative-action__line--bottom" /><span aria-hidden="true" className="investigative-action__line investigative-action__line--left" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--top-left" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--top-right" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--bottom-right" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--bottom-left" /></>;
  const classes = `investigative-action investigative-action--${intent} ${className}`.trim();

  return href ? <a className={classes} data-guide={dataGuide} href={href} rel={rel} target={target}>{content}</a> : <button className={classes} data-guide={dataGuide} type="button" {...buttonProps}>{content}</button>;
}

/** For a decision label inside an existing card link; it shares the same mechanics without nested controls. */
export function InvestigativeActionMarker({ children, className = "", intent = "primary" }: Pick<InvestigativeActionProps, "children" | "className" | "intent">) {
  return <span className={`investigative-action investigative-action--${intent} ${className}`.trim()}>{children}<span aria-hidden="true" className="investigative-action__line investigative-action__line--top" /><span aria-hidden="true" className="investigative-action__line investigative-action__line--right" /><span aria-hidden="true" className="investigative-action__line investigative-action__line--bottom" /><span aria-hidden="true" className="investigative-action__line investigative-action__line--left" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--top-left" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--top-right" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--bottom-right" /><span aria-hidden="true" className="investigative-action__dot investigative-action__dot--bottom-left" /></span>;
}
