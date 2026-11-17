/** Page title, description and share-preview tags for public pages (web). On phones this renders nothing. */
import React from 'react';
import Head from 'expo-router/head';
import { useIsFocused } from 'expo-router';

export function Seo({ title, description, path, image }: { title: string; description: string; path: string; image?: string }) {
  // Stack screens stay mounted underneath the next page; only the focused one may own the tab title,
  // otherwise e.g. "Free video lessons…" from /watch sticks to the player, quiz and live room.
  const focused = useIsFocused();
  if (!focused) return null;
  const url = `https://thebodhin.com${path}`;
  const img = image ?? 'https://thebodhin.com/og/bodhin-share.png';
  const t = title.length > 60 ? `${title.slice(0, 57)}…` : title;
  const d = description.length > 160 ? `${description.slice(0, 157)}…` : description;
  return (
    <Head>
      <title>{t}</title>
      <meta name="description" content={d} />
      <link rel="canonical" href={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Bodhin" />
      <meta property="og:title" content={t} />
      <meta property="og:description" content={d} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={t} />
      <meta name="twitter:description" content={d} />
      <meta name="twitter:image" content={img} />
    </Head>
  );
}

/** One place for every public page's search text, so titles stay unique and within Google's limits. */
export const SEO = {
  '/welcome': ['Bodhin — learn from real educators, teach on your own platform', 'Courses, live classes and free lessons from Indian educators. Tutors and academies run their own branded web + mobile academy on Bodhin.'],
  '/watch': ['Free video lessons from educators | Bodhin', 'Watch real lessons from educators on Bodhin before you join a course. No sign-up needed.'],
  '/for-educators': ['Launch your own online academy | Bodhin for educators', 'Courses, live classes, CRM, EMI and your own website and app. Your students pay you directly. Free trial.'],
  '/features': ['All features: courses, live classes, CRM, EMI | Bodhin', 'Every tool on Bodhin, grouped by job, with the plan it starts on.'],
  '/pricing': ['Pricing — plans from ₹799/month | Bodhin', 'Flat monthly plans with clear limits. No commission on your own students. Find the plan that fits your academy.'],
  '/about': ['About Bodhin — built in Madurai for those who teach', 'Why Bodhin exists and the four rules we build by.'],
  '/contact': ['Contact Bodhin', 'Ask us anything about teaching or learning on Bodhin. We call you back.'],
} as const;
