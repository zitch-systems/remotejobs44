// components/home/HowItWorks.tsx — pure server component, zero deps
export function HowItWorks() {
  const steps = [
    {
      num: '01',
      emoji: '🔍',
      title: 'Browse jobs',
      desc: 'Search 50,000+ remote jobs. Filter by role, level, salary, and location. Free forever.',
    },
    {
      num: '02',
      emoji: '💳',
      title: 'Unlock access',
      desc: 'Start with a ₦1,000 Day Pass or go Pro at ₦8,999/month. Instantly unlock every apply link and email.',
    },
    {
      num: '03',
      emoji: '⚡',
      title: 'Apply & track',
      desc: 'One-click apply with your saved CV. Track every application from sent to offer in your dashboard.',
    },
  ];

  return (
    <section className="py-20 bg-white dark:bg-[#0D1F18]">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="text-center mb-14">
          <h2 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-3">
            How it works
          </h2>
          <p className="text-stone-400 dark:text-stone-500 max-w-sm mx-auto text-sm">
            From browsing to offer letter in three simple steps
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((s) => (
            <div key={s.num} className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 flex flex-col items-center justify-center mb-5">
                <span className="text-2xl">{s.emoji}</span>
                <span className="text-xs font-bold text-brand-600 dark:text-brand-400 mt-1">{s.num}</span>
              </div>
              <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">{s.title}</h3>
              <p className="text-sm text-stone-400 dark:text-stone-500 leading-relaxed max-w-xs">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
