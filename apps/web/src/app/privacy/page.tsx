'use client';

import { LegalDoc, type LegalSection } from '@/components/landing/LegalDoc';

const SECTIONS: LegalSection[] = [
  { id: 'overview', heading: 'Overview', body: [
    'CYTOLAB provides a laboratory information platform for pathology labs. This Privacy Policy explains how we collect, use, and protect information when you use our website and services.',
    'We are committed to handling data — especially protected health information (PHI) — with the care that clinical diagnostics demands.',
  ] },
  { id: 'information-we-collect', heading: 'Information we collect', body: [
    'Website information: when you request a demo or contact us, we collect the details you provide, such as your name, work email, organization, and role.',
    'Platform data: when your lab uses CYTOLAB, the platform processes clinical and operational data on your behalf as a data processor, under the terms of your agreement with us.',
  ] },
  { id: 'how-we-use', heading: 'How we use information', body: [
    'We use website information to respond to inquiries, schedule demos, and provide the services you request. We use platform data solely to deliver, secure, and support the service.',
    'We do not sell personal information, and we do not use your patients’ data to train AI models.',
  ] },
  { id: 'phi', heading: 'Protected health information', body: [
    'When CYTOLAB processes PHI on behalf of a covered entity, we act as a business associate under HIPAA and operate under a Business Associate Agreement. PHI is redacted before AI processing where applicable, encrypted in transit and at rest, and access is restricted by role.',
  ] },
  { id: 'security', heading: 'Data security', body: [
    'We maintain administrative, technical, and physical safeguards including encryption, role-based access control, audit logging, and tenant isolation. See our Security page for details.',
  ] },
  { id: 'retention', heading: 'Data retention', body: [
    'We retain website inquiry data only as long as needed to respond and for legitimate business records. Platform data is retained according to your organization’s configuration and agreement.',
  ] },
  { id: 'your-rights', heading: 'Your rights', body: [
    'Depending on your jurisdiction, you may have rights to access, correct, or delete personal information we hold about you. To exercise these rights, contact us using the details below.',
  ] },
  { id: 'contact', heading: 'Contact', body: [
    'For privacy questions or requests, contact legal@cytolab.demo. For clinical data handling under your agreement, contact your account team.',
  ] },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="July 2026"
      intro="Your trust is the product. This policy describes what we collect, why, and the safeguards around it — with particular care for protected health information."
      sections={SECTIONS}
    />
  );
}
