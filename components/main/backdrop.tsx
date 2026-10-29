/* The page background: charcoal with two faint lime glows, painted once and fixed in place. Pure CSS gradients (no blur
   filters and no animation), so it costs nothing while scrolling. */
export function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-page bg-[radial-gradient(40%_36%_at_92%_4%,rgb(196_242_90/0.09),transparent_70%),radial-gradient(36%_34%_at_4%_96%,rgb(95_227_122/0.07),transparent_70%)]"
    />
  );
}
