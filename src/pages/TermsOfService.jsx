import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Scale } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
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
              <Scale size={32} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">Terms of Service</h1>
              <p className="text-slate-400 font-medium">Effective Date: May 5, 2026</p>
            </div>
          </div>

          <div className="px-8 py-10 sm:px-12 sm:py-14 prose prose-slate max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-blue-600 hover:prose-a:text-blue-500 pb-12">
            
            <p className="lead text-lg text-slate-600 font-medium mb-8">
              Welcome to Tricore Medical Supply. These Terms of Service ("Terms") constitute a legally binding agreement between you ("User," "you," or "your") and Tricore Medical Supply ("Tricore," "we," "our," or "us"). These Terms govern your access to and use of our digital medical supply platform, e-commerce storefront, account management portals, and related software systems (collectively, the "Platform").
            </p>
            <p>
              By registering for an account, accessing, or using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms.
            </p>

            <hr className="my-8 border-slate-100" />

            <h2 className="text-2xl text-slate-900 mt-8 mb-4">1. Account Eligibility and Structure</h2>
            <p>The Platform operates a dual-tier account system to serve different customer bases. By creating an account, you represent and warrant that you meet the eligibility criteria for your respective account type:</p>
            
            <ul className="list-none pl-0 space-y-4 mb-6">
              <li className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <strong className="text-slate-900 block mb-1">1.1 Retail Accounts:</strong> 
                Designed for individual consumers, home healthcare users, and small-scale buyers. To create a Retail Account, you must be a resident of the United States, at least 18 years of age, and possess the legal capacity to enter into a binding contract.
              </li>
              <li className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <strong className="text-slate-900 block mb-1">1.2 Healthcare Agency Accounts:</strong> 
                Designed exclusively for legitimate medium to large home care organizations, pharmacies, multi-location healthcare providers, and licensed medical supply buyers.
                <ul className="list-disc pl-5 mt-3 space-y-2 text-sm text-slate-600">
                  <li><strong>Authorization:</strong> If you are creating an Agency Account on behalf of an organization, you represent and warrant that you have the legal authority to bind that organization to these Terms.</li>
                  <li><strong>Privileges:</strong> Approved Agency Accounts may be granted access to specialized features, including role-based pricing configurations, bulk ordering capabilities, and managed purchasing histories. Tricore reserves the right to verify licenses and organizational credentials prior to granting Agency Account status.</li>
                </ul>
              </li>
            </ul>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">2. Acceptable Use Policy</h2>
            <p>You agree to use the Platform only for lawful purposes and in accordance with these Terms. You strictly agree not to engage in any of the following prohibited activities:</p>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              <li><strong>Fraud and Misrepresentation:</strong> Providing false, inaccurate, or misleading billing, shipping, or organizational information, or engaging in fraudulent transactions.</li>
              <li><strong>Pricing Misuse:</strong> Attempting to manipulate, bypass, or exploit the Platform's role-based pricing tiers, or using an Agency Account to purchase items for unauthorized personal use or resale outside of the organization's normal scope of business.</li>
              <li><strong>System Interference:</strong> Reverse engineering, decompiling, disassembling, or attempting to discover the source code or underlying algorithms of the Platform.</li>
              <li><strong>Data Scraping:</strong> Utilizing automated systems, bots, spiders, or unauthorized API calls to scrape, extract, or harvest catalog data, pricing information, or user data from the Platform or its underlying databases (e.g., Supabase).</li>
              <li><strong>Unauthorized Resale:</strong> Reselling or sublicensing access to the Platform or its proprietary data.</li>
            </ul>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">3. Orders, Pricing, and Payments</h2>
            <ul className="list-none pl-0 space-y-3 mb-6">
              <li><strong>3.1 Order Acceptance:</strong> All orders placed through the Platform constitute an offer to purchase. Tricore reserves the right, at its sole discretion, to refuse, limit, or cancel any order for reasons including, but not limited to, inventory shortages, errors in product or pricing information, or suspected fraud.</li>
              <li><strong>3.2 Retail Payments:</strong> Retail Account orders must be paid in full at the time of checkout. Payments are processed securely via our authorized third-party payment providers.</li>
              <li><strong>3.3 Agency Invoicing:</strong> Authorized Healthcare Agency Accounts may be approved for invoice-based purchasing. Unless otherwise stipulated in a separate written agreement, all invoices are due Net-30 days from the date of issuance. Failure to remit payment may result in account suspension and the revocation of role-based pricing privileges.</li>
            </ul>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">4. Shipping, Delivery, and Risk of Loss</h2>
            <ul className="list-none pl-0 space-y-3 mb-6">
              <li><strong>4.1 Delivery Estimates:</strong> Shipping and delivery dates provided on the Platform are estimates only and are not guaranteed. We utilize third-party logistics and routing services (including the Google Maps API) to optimize delivery, but we are not liable for delays caused by carriers, weather, or unforeseen circumstances.</li>
              <li><strong>4.2 Risk of Loss:</strong> All purchases made through the Platform are made pursuant to a shipment contract. This means that the risk of loss and title for such items pass to you upon Tricore's delivery of the items to the shipping carrier.</li>
            </ul>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">5. Intellectual Property Rights</h2>
            <p>The Platform, including its original content, software, catalog databases, user interfaces, branding, trademarks, and functionality, is owned entirely by Tricore Medical Supply and is protected by United States and international copyright, trademark, and other intellectual property laws. You acquire no ownership rights by using the Platform.</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4 uppercase">6. Disclaimer of Warranties</h2>
            <p className="font-bold text-slate-700 bg-slate-100 p-4 rounded-lg">
              THE PLATFORM AND ALL PRODUCTS OFFERED THROUGH IT ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. TRICORE MEDICAL SUPPLY MAKES NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, REGARDING THE OPERATION OF THE PLATFORM OR THE INFORMATION, CONTENT, OR MATERIALS INCLUDED THEREIN. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
            </p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4 uppercase">7. Limitation of Liability</h2>
            <p className="font-bold text-slate-700 bg-slate-100 p-4 rounded-lg">
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, TRICORE MEDICAL SUPPLY, ITS DIRECTORS, EMPLOYEES, AND AUTHORIZED THIRD-PARTY SERVICE PROVIDERS (INCLUDING HOSTING AND PAYMENT PARTNERS) SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM: (A) YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE PLATFORM; (B) ANY DELAYS IN DELIVERY OR DISPATCH; OR (C) ANY UNAUTHORIZED ACCESS TO OUR SERVERS AND/OR ANY PERSONAL INFORMATION STORED THEREIN.
            </p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">8. Suspension and Termination</h2>
            <p>Tricore Medical Supply reserves the right, without prior notice and at our sole discretion, to terminate or suspend your account and access to the Platform if we determine that you have violated these Terms, engaged in fraudulent activity, or posed a security risk to the platform infrastructure. Upon termination, your right to use the Platform will immediately cease.</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">9. Governing Law and Jurisdiction</h2>
            <p>These Terms and any dispute or claim arising out of or in connection with them or their subject matter shall be governed by and construed in accordance with the laws of the State of California, without giving effect to any choice or conflict of law provision or rule.</p>

            <h2 className="text-2xl text-slate-900 mt-10 mb-4">10. Dispute Resolution and Arbitration</h2>
            <p>Any dispute, controversy, or claim arising out of or relating to these Terms, including the formation, interpretation, breach, or termination thereof, shall be referred to and finally determined by binding arbitration in accordance with the rules of the American Arbitration Association (AAA). The arbitration shall take place exclusively in California, and the language of the arbitration shall be English. <strong className="uppercase">You agree that by entering into these terms, you and Tricore are each waiving the right to a trial by jury or to participate in a class action.</strong></p>

          </div>
        </div>
      </div>
    </div>
  );
}