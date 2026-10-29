import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[50vh] content-center justify-items-start gap-4">
      <h1 className="font-display text-[40px] font-bold">Page not found</h1>
      <p className="text-body">That page isn&apos;t part of One Portfolio.</p>
      <Link href="/" className="btn btn-primary">
        Back home
      </Link>
    </div>
  );
}
