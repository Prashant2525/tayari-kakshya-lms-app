import type { ReactNode } from 'react';

/** Centered card layout for sign-in and password screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-on-brand lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-white/10 text-sm font-bold">TK</span>
          <span className="text-lg font-bold">Tayari Kakshya</span>
        </div>
        <div className="max-w-md">
          <p className="text-[32px] font-bold leading-10">तयारी भविष्यको</p>
          <p className="mt-3 text-[17px] leading-7 text-white/75">
            Manage courses, questions, exams and students for Nepal&apos;s competitive exam preparation — all
            from one place.
          </p>
        </div>
        <p className="text-sm text-white/55">Authorised staff only. Activity is recorded in the audit log.</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-32 size-[420px] rounded-full bg-white/[0.04] ring-1 ring-white/10"
        />
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-md bg-brand text-sm font-bold text-on-brand">
              TK
            </span>
            <span className="text-[15px] font-bold">Tayari Kakshya Admin</span>
          </div>
          <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">{title}</h1>
          {subtitle ? <p className="mt-2 text-[15px] text-text-secondary">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
