/** Terms, Privacy, Refunds — plain-language DRAFTS. They must be reviewed by a lawyer before launch. */
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Banner } from '@/ui/misc';
import { PublicFrame } from '@/ui/publicFrame';

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: 'Terms of use',
    sections: [
      ['Who we are', 'Bodhin (thebodhin.com) is a platform where educators run online academies and learners take their courses. Each academy is run by its own educator, who is responsible for its content and teaching.'],
      ['Accounts', 'Keep your login private. One account per person. We may suspend accounts that share paid content, harass others or break the law.'],
      ['Buying a course', 'Courses bought directly from an academy are sold by that academy. Courses sold through the Bodhin marketplace are sold by Bodhin on the educator’s behalf. Your invoice shows who the seller is.'],
      ['Educators', 'Educators keep ownership of their content and give Bodhin a licence to host and stream it. Public listings are reviewed. Subscription plans, limits and the marketplace commission are shown on the Pricing page before purchase.'],
      ['Acceptable use', 'No downloading or re-sharing of videos outside the app, no cheating tools in assessments, and no spam or phone numbers posted in communities.'],
      ['Liability', 'We work to keep Bodhin available, but we can’t guarantee uninterrupted service. To the extent the law allows, our liability is limited to the amount you paid in the last 3 months.'],
      ['Changes', 'We will give 30 days’ notice of material changes by email or in-app notification.'],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    sections: [
      ['What we collect', 'Name, email, mobile number, purchases, learning progress and the device information needed to run the app. Payment card details are handled by the payment gateway, never stored by Bodhin.'],
      ['Why', 'To run your courses, send receipts and class reminders, prevent fraud and improve Bodhin. We send offers only if you turn them on (Profile → Notifications).'],
      ['Who sees it', 'The academy you learn with sees your name, contact details, progress and payments for its courses. Bodhin staff see only what they need for support and payouts. We do not sell personal data.'],
      ['Your rights', 'Under India’s Digital Personal Data Protection Act you can access, correct or delete your data, and withdraw consent. Write to privacy@thebodhin.com.'],
      ['Storage', 'Data is stored with our cloud providers, encrypted in transit and at rest. We keep invoices as long as tax law requires.'],
      ['Cookies & tracking', 'Academy websites load analytics or ads pixels only after you accept the cookie banner.'],
    ],
  },
  refunds: {
    title: 'Refund policy',
    sections: [
      ['Courses', 'You can request a refund within 7 days of purchase if you have watched less than 20% of the course. Request it from Payments in your Profile.'],
      ['Who refunds', 'For direct purchases, the academy processes the refund. For Bodhin marketplace purchases, Bodhin does. Refunds go back to the original payment method within 5–7 working days.'],
      ['EMI', 'If you cancel an EMI plan, instalments already paid follow the same 7-day rule. Later instalments stop, and access ends when the paid period is used up.'],
      ['Webinars, 1:1 sessions, digital products', 'Cancelled webinars and sessions are refunded in full. Digital products can’t be refunded once they are downloaded.'],
      ['Educator subscriptions', 'Monthly plans can be cancelled at any time and stay active until the end of the period. Annual plans are refundable within 7 days of the first payment.'],
    ],
  },
};

export default function Legal() {
  const { c } = useTheme();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = DOCS[doc] ?? DOCS.terms;
  return (
    <PublicFrame seo={{ title: `${d.title} | Bodhin`, description: d.sections[0][1] }}>
      <View style={{ gap: 14, maxWidth: 760 }}>
        <Txt variant="display">{d.title}</Txt>
        <Banner tone="info" text="Draft for review — confirm with a lawyer and your GST/legal entity details before launch." />
        {d.sections.map(([h, t]) => <View key={h} style={{ gap: 4 }}><Txt variant="heading">{h}</Txt><Txt color={c.inkSoft}>{t}</Txt></View>)}
        <Txt variant="caption" color={c.muted}>Last updated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Txt>
      </View>
    </PublicFrame>
  );
}
