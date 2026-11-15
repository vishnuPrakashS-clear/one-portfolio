/* The page background: the theme's page colour with two soft brand-green glows, like a gradient landing page. Pure CSS,
   painted once and fixed, so it costs nothing while scrolling. */
export function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-page"
      style={{
        backgroundImage:
          "radial-gradient(44% 38% at 92% 0%, color-mix(in srgb, var(--color-lime-2) 16%, transparent), transparent 70%)," +
          "radial-gradient(38% 34% at 2% 100%, color-mix(in srgb, var(--color-lime) 10%, transparent), transparent 70%)",
      }}
    />
  );
}
