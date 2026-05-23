// components/home/HowItWorks.tsx
import { Search, CreditCard, Rocket } from 'lucide-react';

const steps = [
  {
    num: '01',
    icon: Search,
    iconBg: 'bg-blue-50 dark:bg-blue-950/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
    title: 'Browse jobs',
    desc: 'Search 50,000+ remote jobs. Filter by role, level, salary, and location. Free forever.',
  },
  {
    num: '02',
    icon: CreditCard,
    iconBg: 'bg-orange-50 dark:bg-orange-950/40',
    iconColor: 'text-orange-500 dark:text-orange-400',
    title: 'Unlock access',
    desc: 'Start with a ₦1,000 Day Pass or go Pro at ₦8,999/month. Instantly unlock every apply link and email.',
  },
  {
    num: '03',
    icon: Rocket,
    iconBg: 'bg-brand-50 dark:bg-brand-950/40',
    iconColor: 'text-brand-600 dark:text-brand-400',
    title: 'Apply & track',
    desc: 'One-click apply with your saved CV. Track every application from sent to offer in your dashboard.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-white dark:bg-[#0f1e38]">
      <div className="max-w-[1440px] mx-auto px-5">
        <div className="text-center mb-14">
          <h2 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-3">
            How it works
          </h2>
          <p className="text-stone-400 dark:text-stone-500 max-w-sm mx-auto text-sm">
            From browsing to offer letter in three simple steps
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.num} className="flex flex-col items-center text-center">
                <div className={`w-20 h-20 rounded-2xl ${s.iconBg} border border-stone-100 dark:border-[#1e3a5f] flex flex-col items-center justify-center mb-5 shadow-sm`}>
                  <Icon className={`w-7 h-7 ${s.iconColor}`} strokeWidth={1.75} />
                  <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 mt-1.5 tracking-widest">{s.num}</span>
                </div>
                <h3 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">{s.title}</h3>
                <p className="text-sm text-stone-400 dark:text-stone-500 leading-relaxed max-w-xs">{s.desc}</p>
              </div>
            );
        