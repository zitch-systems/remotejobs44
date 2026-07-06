import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog — Remote Work & Job Search Guides for African Professionals',
  description: 'Guides and tips for finding remote jobs, landing interviews, and building a remote career from Nigeria, Kenya, South Africa and across Africa.',
  // Self-canonical. Without this the page inherited the root metadataBase
  // and (previously) the homepage canonical, telling Google /blog was a
  // duplicate of /. Now it points at itself.
  alternates: { canonical: 'https://remotejobs44.com/blog' },
  openGraph: {
    title: 'RemoteJobs44 Blog — Remote Work & Job Search Guides for African Professionals',
    description: 'Guides and tips for finding remote jobs, landing interviews, and building a remote career from Nigeria, Kenya, South Africa and across Africa.',
    url: 'https://remotejobs44.com/blog',
    type: 'website',
  },
};

const POSTS = [
  {
    slug: 'how-to-find-remote-jobs-in-nigeria',
    title: 'How to Find Remote Jobs in Nigeria in 2026',
    excerpt: 'A complete guide to landing international remote work from Nigeria — including the best platforms, how to get paid, and which skills are most in demand.',
    date: '2026-01-15',
    readTime: '8 min read',
    category: 'Job Search',
  },
  {
    slug: 'remote-job-interview-tips',
    title: '12 Remote Job Interview Tips That Actually Work',
    excerpt: 'Video interviews are different from in-person ones. Here\'s how to prepare your setup, answer common remote-specific questions, and stand out.',
    date: '2026-01-10',
    readTime: '6 min read',
    category: 'Interviews',
  },
  {
    slug: 'best-remote-jobs-for-beginners',
    title: 'Best Remote Jobs for Beginners With No Experience',
    excerpt: 'You don\'t need years of experience to work remotely. These entry-level remote roles are hiring globally right now — and they pay well.',
    date: '2026-01-05',
    readTime: '5 min read',
    category: 'Career',
  },
];

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': 'https://remotejobs44.com/blog#blog',
  name: 'RemoteJobs44 Blog',
  url: 'https://remotejobs44.com/blog',
  description: 'Tips for finding remote jobs, landing interviews, and building a remote career from anywhere in the world.',
  publisher: { '@type': 'Organization', name: 'RemoteJobs44', url: 'https://remotejobs44.com' },
  blogPost: POSTS.map(p => ({
    '@type': 'BlogPosting',
    headline: p.title,
    url: `https://remotejobs44.com/blog/${p.slug}`,
    datePublished: p.date,
    articleSection: p.category,
  })),
};

export default function BlogPage() {
  return (
    <div className="max-w-[800px] mx-auto px-5 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD).replace(/</g, '\\u003c') }}
      />
      <div className="mb-12">
        <h1 className="font-display font-extrabold text-4xl text-stone-900 dark:text-stone-100 tracking-tight mb-3">
          Remote Work Blog
        </h1>
        <p className="text-stone-400 dark:text-stone-500 text-lg">
          Tips, guides, and resources for landing your remote career.
        </p>
      </div>

      <div className="space-y-8">
        {POSTS.map(post => (
          <article key={post.slug} className="card p-6 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold">
                {post.category}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500">{post.date}</span>
              <span className="text-xs text-stone-400 dark:text-stone-500">· {post.readTime}</span>
            </div>
            <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </h2>
            <p className="text-stone-500 dark:text-stone-400 leading-relaxed mb-4 text-sm">
              {post.excerpt}
            </p>
            <Link href={`/blog/${post.slug}`}
              className="text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline">
              Read article →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
