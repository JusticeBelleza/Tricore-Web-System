import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  // Scroll to top when the page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header navigation */}
        <div className="mb-8">
          <Link to="/">
            <Button variant="ghost" className="text-slate-500 hover:text-slate-900 -ml-4">
              <ChevronLeft size={20} className="mr-1" /> Back to Home
            </Button>
          </Link>
        </div>

        {/* Policy Content */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 px-8 py-10 sm:px-12 text-center sm:text-left flex flex-col sm:flex-row items-center gap-6">
            <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-blue-400/30">
              <ShieldCheck size={32} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">Privacy Policy</h1>
              <p className="text-slate-400 font-medium">Effective Date: May 5, 2026</p>
            </div>
          </div>

          <div className="px-8 py-10 sm:px-12 sm:py-14 prose prose-slate max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-blue-600 hover:prose-a:text-blue-500">
            
            <p className="lead text-lg text-slate-600 font-medium mb-8">
              <strong>Applicability:</strong> Retail Consumers and Healthcare Agency Customers (California Residents and General Users)
            </p>

            <p>
              This Privacy Policy ("Policy") explains how Tricore Medical Supply ("we," "our," or "us") collects, uses, discloses, and protects your information when you access our custom web-based medical supply platform, e-commerce storefront, and related account management systems.
            </p>
            <p>
              We are committed to protecting your privacy. This Policy is designed to comply fully with the California Consumer Privacy Act (CCPA), as amended by the California Privacy Rights Act (CPRA), and outlines our strict data handling practices for both our retail customers and healthcare agency partners.
            </p>

            <hr className="my-8 border-slate-100" />

            <h2 className="text-2xl text-slate-900 mt-8 mb-4">1. Categories of Personal and Business Data Collected</h2>
            <p>We collect information that identifies, relates to, describes, or is reasonably capable of being associated with you or your household ("Personal Information"). We differentiate data collection based on your account type:</p>
            
            <h3 className="text-lg text-slate-800 mt-6 mb-3">A. Data Collected from All Users (Retail & Agency)</h3>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              <li><strong>Identifiers:</strong> Full name, email address, phone number, billing address, shipping address, and account credentials.</li>
              <li><strong>Commercial Information:</strong> Order history, shopping cart contents, purchase records, and platform preferences.</li>
              <li><strong>Internet and Network Activity:</strong> IP address, device type, browser information, and platform interaction analytics (e.g., pages visited, session duration).</li>
              <li><strong>Financial Information:</strong> Payment details. (Note: Payment processing is handled securely by third-party processors; Tricore Medical Supply does not directly store full credit card numbers on our servers).</li>
              <li><strong>Geolocation Data:</strong> General location data derived from IP addresses or precise address data provided during checkout for delivery routing.</li>
            </ul>

            <h3 className="text-lg text-slate-800 mt-6 mb-3">B. Additional Data Collected from Healthcare Agency Accounts</h3>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              <li><strong>Professional/Business Information:</strong> Business name, facility locations, licensed medical supply buyer credentials, National Provider Identifier (NPI) or equivalent licensing, and tax-exempt status documentation.</li>
              <li><strong>Platform Role Data:</strong> Role-based pricing classifications, bulk ordering metrics, invoice histories, and multi-user account hierarchies associated with home care organizations or pharmacies.</li>
            </ul>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">2. Purpose of Data Collection</h2>
            <p>We utilize the collected data strictly for the following operational and business purposes:</p>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              <li><strong>Order Fulfillment & Logistics:</strong> Processing transactions, validating shipping addresses, coordinating warehouse dispatch, and managing delivery routes.</li>
              <li><strong>Account Management & Authentication:</strong> Verifying user identities, maintaining secure sessions, and administering specialized dashboards.</li>
              <li><strong>Pricing & Catalog Access:</strong> Enforcing role-based access control (RBAC) to ensure agency accounts receive correct contract pricing and bulk-ordering capabilities.</li>
              <li><strong>Security & Fraud Prevention:</strong> Detecting security incidents, protecting against malicious, deceptive, fraudulent, or illegal activity, and enforcing platform integrity.</li>
              <li><strong>Platform Improvement:</strong> Debugging and optimizing our web application, enhancing user experience, and resolving customer support inquiries.</li>
            </ul>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">3. Data Sharing and Service Providers</h2>
            <p>Tricore Medical Supply shares your Personal Information strictly to facilitate platform operations. We do not, and will not, sell or share your personal data to any third parties for cross-context behavioral advertising.</p>
            <p>We disclose necessary data to the following authorized third-party service providers who are contractually obligated to protect your information:</p>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              <li><strong>Vercel:</strong> Utilized for web hosting, frontend platform delivery, and secure edge network performance.</li>
              <li><strong>Supabase:</strong> Utilized for backend database management, user authentication, and encrypted cloud data storage.</li>
              <li><strong>Google Maps API:</strong> Utilized for address validation, dispatch routing, and precise delivery management for our logistics operations.</li>
              <li><strong>Payment Processors:</strong> Utilized to securely process retail and invoice-based transactions.</li>
            </ul>
            <p><strong>Legal Disclosures:</strong> We may also disclose information to law enforcement or regulatory bodies if required by law, subpoena, or to protect the rights and safety of Tricore Medical Supply and our users.</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">4. Consumer Rights (California Residents - CCPA/CPRA)</h2>
            <p>If you are a resident of California, the CCPA/CPRA grants you specific rights regarding your Personal Information:</p>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              <li><strong>Right to Know and Access:</strong> You have the right to request disclosure of the specific pieces and categories of Personal Information we have collected about you, the sources of that data, the business purpose for collection, and the categories of third parties with whom we shared it.</li>
              <li><strong>Right to Delete:</strong> You have the right to request the deletion of Personal Information we have collected from you, subject to certain exceptions (e.g., completing a transaction, detecting security incidents, or complying with legal obligations).</li>
              <li><strong>Right to Correct:</strong> You have the right to request the correction of inaccurate Personal Information that we maintain about you in our systems.</li>
              <li><strong>Right to Opt-Out of Sale or Sharing:</strong> You have the right to opt out of the sale or sharing of your Personal Information. Tricore Medical Supply explicitly does not sell or share user data.</li>
              <li><strong>Right to Limit Use of Sensitive Personal Information (SPI):</strong> You have the right to direct us to limit our use of any sensitive personal information to only what is strictly necessary to perform the services reasonably expected by an average consumer.</li>
              <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you (e.g., deny goods/services, charge different prices) for exercising any of your CCPA/CPRA rights.</li>
            </ul>
            <p><strong>How to Exercise Your Rights:</strong> To submit a verifiable consumer request regarding your rights, please contact us at <a href="mailto:admin@tricoremedsupply.com">admin@tricoremedsupply.com</a>. We will verify your request by matching the identifying information you provide with the information we maintain in our system.</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">5. Data Security and Infrastructure Alignment</h2>
            <p>We implement robust, industry-standard security measures tailored to our system architecture. Data is encrypted in transit (via TLS/SSL) and at rest. We utilize strict Row Level Security (RLS) policies within our database infrastructure to ensure that retail users and agency accounts can only access data explicitly authorized for their role.</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">6. Data Retention</h2>
            <p>We retain Personal Information only for as long as necessary to fulfill the purposes outlined in this Policy, including satisfying any legal, accounting, or reporting requirements. Once data is no longer necessary for operational fulfillment or compliance, it is securely deleted or anonymized.</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">7. Changes to this Privacy Policy</h2>
            <p>We may update this Privacy Policy periodically to reflect changes in our platform operations or legal obligations. We will notify you of any material changes by posting the updated Policy on this page and updating the "Effective Date."</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">8. Contact Information</h2>
            <p>If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact our Privacy Team at:</p>
            <p>Email: <a href="mailto:admin@tricoremedsupply.com" className="font-bold">admin@tricoremedsupply.com</a></p>

          </div>
        </div>
      </div>
    </div>
  );
}