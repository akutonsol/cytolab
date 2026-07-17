'use client';

import { LegalDoc, type LegalSection } from '@/components/landing/LegalDoc';

const SECTIONS: LegalSection[] = [
  { id: 'agreement', heading: 'Agreement to terms', body: [
    'These Terms of Service govern your access to and use of the CYTOLAB website and, where applicable, the CYTOLAB platform. By using our website you agree to these terms.',
    'Use of the CYTOLAB platform by a laboratory is governed by the separate master services agreement executed between CYTOLAB and your organization, which controls in the event of any conflict.',
  ] },
  { id: 'use', heading: 'Use of the service', body: [
    'You agree to use the website and services only for lawful purposes and in accordance with these terms. You may not attempt to disrupt, reverse engineer, or gain unauthorized access to any part of the service.',
  ] },
  { id: 'accounts', heading: 'Accounts & access', body: [
    'Access to the CYTOLAB platform is provisioned to authorized users of a subscribing laboratory. You are responsible for safeguarding your credentials and for activity under your account.',
  ] },
  { id: 'clinical', heading: 'Clinical use disclaimer', body: [
    'CYTOLAB is a laboratory information and workflow platform, including AI-assisted reporting tools intended to support — not replace — qualified professional judgment. Final diagnostic decisions remain the responsibility of licensed personnel.',
  ] },
  { id: 'ip', heading: 'Intellectual property', body: [
    'The website, platform, and all associated software, content, and trademarks are the property of CYTOLAB or its licensors and are protected by applicable law. No rights are granted except as expressly set out in your agreement.',
  ] },
  { id: 'liability', heading: 'Limitation of liability', body: [
    'To the maximum extent permitted by law, CYTOLAB is not liable for indirect, incidental, or consequential damages arising from use of the website. Liability relating to the platform is governed by your master services agreement.',
  ] },
  { id: 'changes', heading: 'Changes to these terms', body: [
    'We may update these terms from time to time. Material changes will be reflected by updating the “last updated” date above. Continued use after changes constitutes acceptance.',
  ] },
  { id: 'contact', heading: 'Contact', body: [
    'Questions about these terms can be directed to legal@cytolab.demo.',
  ] },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="July 2026"
      intro="The ground rules for using the CYTOLAB website and platform. For subscribing labs, your master services agreement governs platform use and controls where it differs from these terms."
      sections={SECTIONS}
    />
  );
}
